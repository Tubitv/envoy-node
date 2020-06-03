import * as grpc from "grpc";
// tslint:disable-next-line:no-duplicate-imports
import { ServerUnaryCall, sendUnaryData, ServiceError } from "grpc";
import { sleep } from "./lib/utils";
import GrpcTestServer, { Ping, PingEnvoyClient } from "./lib/grpc-test-server";
import { RequestFunc, EnvoyClient } from "../src/types";
import { GrpcRetryOn, EnvoyContext } from "../src/envoy-node";
import { EnvoyContextInit } from "../src/envoy-context";

describe("GRPC Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(0);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        );
        const ctx = innerClient.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        innerParentId = ctx.spanId;
        return innerClient.inner({ message: call.request.message });
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.parentSpanId).toBe(innerParentId);
        return { message: "pong" };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      const response = await new Promise((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
    } finally {
      await server.stop();
    }
  });

  it("should handle timeout correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    const WRAPPER_SLEEP_TIME = 100;
    let innerCalledCount = 0;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(1);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        );

        const startTime = Date.now();

        let noException = false;

        try {
          await innerClient.inner({ message: call.request.message }, { timeout: 10 });
          noException = true;
        } catch (e) {
          expect(e.message).toBe("14 UNAVAILABLE: upstream request timeout");
        }

        expect(noException).toBeFalsy();

        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(WRAPPER_SLEEP_TIME);

        return { message: "" };
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        innerCalledCount++;
        if (innerCalledCount < 2) {
          await sleep(WRAPPER_SLEEP_TIME);
        }
        return { message: "pong" };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      const response = await new Promise((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
    } finally {
      await server.stop();
    }
  });

  it("should handle retry correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(2);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        );

        return innerClient.inner(
          { message: call.request.message },
          {
            maxRetries: 2,
            retryOn: [GrpcRetryOn.DEADLINE_EXCEEDED],
          }
        );
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        innerCalledCount++;
        if (innerCalledCount < 2) {
          const error = new Error("DEADLINE_EXCEEDED") as ServiceError;
          error.code = grpc.status.DEADLINE_EXCEEDED;
          error.metadata = call.metadata;
          throw error;
        }
        return { message: `pong ${innerCalledCount}` };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      const response = await new Promise<any>((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
      expect(innerCalledCount).toBe(2);
      expect(response.message).toBe("pong 2");
    } finally {
      await server.stop();
    }
  });

  it("should handle per retry timeout correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(3);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        ) as PingEnvoyClient;

        let errorHappened = false;

        try {
          await innerClient.inner(
            { message: call.request.message },
            {
              maxRetries: 3,
              retryOn: [GrpcRetryOn.DEADLINE_EXCEEDED],
              perTryTimeout: 100,
            }
          );
        } catch (e) {
          errorHappened = true;
          expect(e.message).toBe("14 UNAVAILABLE: upstream request timeout");
        }
        expect(errorHappened).toBeTruthy();
        expect(innerCalledCount).toBe(2);
        return { message: "" };
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        innerCalledCount++;
        if (innerCalledCount === 2) {
          await sleep(110);
        }
        if (innerCalledCount < 3) {
          const error = new Error("DEADLINE_EXCEEDED") as ServiceError;
          error.code = grpc.status.DEADLINE_EXCEEDED;
          error.metadata = call.metadata;
          throw error;
        }
        return { message: `pong ${innerCalledCount}` };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      await new Promise<any>((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
    } finally {
      await server.stop();
    }
  });

  it("should propagate the tracing header directly in direct mode", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(4);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const init: EnvoyContextInit = {
          meta: call.metadata,
          directMode: true,
        };
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.bindHost}:${this.envoyIngressPort}`,
          new EnvoyContext(init)
        );
        const ctx = innerClient.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        spanId = ctx.spanId;
        return innerClient.inner({ message: call.request.message });
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.spanId).toBe(spanId);
        return { message: "pong" };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      const response = await new Promise((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
    } finally {
      await server.stop();
    }
  });

  it("should propagate the tracing header directly if the host is not in managed host", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;

    const server = new (class extends GrpcTestServer {
      constructor() {
        super(5, true);
      }

      async wrapper(call: ServerUnaryCall<any>): Promise<any> {
        const init: EnvoyContextInit = {
          meta: call.metadata,
        };
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.bindHost}:${this.envoyIngressPort}`,
          new EnvoyContext(init)
        );
        const ctx = innerClient.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        spanId = ctx.spanId;
        return innerClient.inner({ message: call.request.message });
      }

      async inner(call: ServerUnaryCall<any>): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.spanId).toBe(spanId);
        return { message: "pong" };
      }
    })();

    await server.start();

    try {
      const clientMetadata = new grpc.Metadata();
      clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
      const client = new Ping(
        `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
        grpc.credentials.createInsecure()
      );
      const response = await new Promise((resolve, reject) => {
        client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });
    } finally {
      await server.stop();
    }
  });
});
