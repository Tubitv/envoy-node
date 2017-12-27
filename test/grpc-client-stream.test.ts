import grpc, { ServerUnaryCall, sendUnaryData, ServiceError, ServerReadableStream } from "grpc";

import GrpcTestServer, { Ping, PingEnvoyClient } from "./lib/grpc-test-server";
import { RequestFunc, EnvoyClient } from "../src/types";
import { GrpcRetryOn, EnvoyContext } from "../src/envoy-node";

describe("GRPC client stream Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends GrpcTestServer {
      constructor() {
        super(40);
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          new EnvoyContext(call.metadata)
        );
        const ctx = innerClient.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        innerParentId = ctx.spanId;
        await new Promise((resolve, reject) => {
          const stream = innerClient.clientStream((err, response) => {
            if (err) {
              reject(err);
            }
            expect(response.message).toBe("clientStream:pong");
            resolve();
          });
          stream.write({ message: call.request.message });
          stream.end();
        });
        return { message: "pong" };
      }

      clientStream(call: ServerReadableStream, callback: sendUnaryData): void {
        const ctx = new EnvoyContext(call.metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.parentSpanId).toBe(innerParentId);
        call.on("data", (data: any) => {
          expect(data.message).toBe("ping");
        });
        call.on("error", err => {
          callback(err, undefined);
        });
        call.on("end", () => {
          // tslint:disable-next-line:no-null-keyword
          callback(null, { message: "clientStream:pong" });
        });
      }
    }();

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

  // NOTE: Timeout is not testable, skip

  it("should handle retry correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;

    const server = new class extends GrpcTestServer {
      constructor() {
        super(41);
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        );

        await new Promise((resolve, reject) => {
          const stream = innerClient.clientStream(
            (err, response) => {
              if (err) {
                reject(err);
              }
              expect(response.message).toBe("clientStream:pong");
              resolve();
            },
            {
              maxRetries: 2,
              retryOn: [GrpcRetryOn.DEADLINE_EXCEEDED]
            }
          );
          stream.write({ message: call.request.message });
          stream.end();
        });

        return { message: "pong" };
      }

      clientStream(call: ServerReadableStream, callback: sendUnaryData): void {
        call.on("data", (data: any) => {
          expect(data.message).toBe("ping");
        });
        innerCalledCount++;
        if (innerCalledCount < 2) {
          const error = new Error("DEADLINE_EXCEEDED") as ServiceError;
          error.code = grpc.status.DEADLINE_EXCEEDED;
          error.metadata = call.metadata;
          callback(error, undefined);
          return;
        }
        call.on("error", err => {
          callback(err, undefined);
        });
        call.on("end", () => {
          // tslint:disable-next-line:no-null-keyword
          callback(null, { message: "clientStream:pong" });
        });
      }
    }();

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
      expect(response.message).toBe("pong");
    } finally {
      await server.stop();
    }
  });
});
