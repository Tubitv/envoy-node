import grpc, { ServerUnaryCall, sendUnaryData, ServiceError } from "grpc";

import GrpcTestServer, { Ping, PingEnvoyClient } from "./lib/grpc-test-server";
import { sleep } from "./lib/utils";
import { RequestFunc, EnvoyClient } from "../src/types";
import EnvoyContext from "../src/envoy-context";
import { GrpcRetryOn } from "../src/envoy-node-boilerplate";

interface PingEnvoyClient extends EnvoyClient {
  inner: RequestFunc;
  wrapper: RequestFunc;
}

describe("GRPC Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends GrpcTestServer {
      constructor() {
        super(0);
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        ) as PingEnvoyClient;
        const ctx = innerClient.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        innerParentId = ctx.spanId;
        return innerClient.inner({ message: call.request.message });
      }

      async inner(call: ServerUnaryCall): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.parentSpanId).toBe(innerParentId);
        return { message: "pong" };
      }
    }();

    await server.start();

    // wait for envoy to up
    await sleep(100);

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

    const server = new class extends GrpcTestServer {
      constructor() {
        super(1);
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        ) as PingEnvoyClient;

        const startTime = Date.now();

        try {
          const firstResponse = await innerClient.inner(
            { message: call.request.message },
            { timeout: 10 }
          );
          // TODO maybe will arrive here? or should not?
        } catch (e) {
          // TODO check the error
        }

        const endTime = Date.now();

        // TODO it looks like this is a bug of envoy, which is not working now
        expect(endTime - startTime).toBeLessThan(WRAPPER_SLEEP_TIME);

        return { message: "" };
      }

      async inner(call: ServerUnaryCall): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        innerCalledCount++;
        if (innerCalledCount < 2) {
          await sleep(WRAPPER_SLEEP_TIME);
        }
        return { message: "pong" };
      }
    }();

    await server.start();

    // wait for envoy to up
    await sleep(100);

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

    const server = new class extends GrpcTestServer {
      constructor() {
        super(2);
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        ) as PingEnvoyClient;

        return innerClient.inner(
          { message: call.request.message },
          {
            maxRetries: 2,
            retryOn: [GrpcRetryOn.DEADLINE_EXCEEDED]
          }
        );
      }

      async inner(call: ServerUnaryCall): Promise<any> {
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
    }();

    await server.start();

    // wait for envoy to up
    await sleep(100);

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

  // TODO test perTryTimeout
});
