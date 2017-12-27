import grpc, { ServerUnaryCall, sendUnaryData, ServiceError, ServerDuplexStream } from "grpc";

import GrpcTestServer, { Ping, PingEnvoyClient } from "./lib/grpc-test-server";
import { sleep } from "./lib/utils";
import { RequestFunc, EnvoyClient } from "../src/types";
import { GrpcRetryOn, EnvoyContext } from "../src/envoy-node";

describe("GRPC bidi stream Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends GrpcTestServer {
      constructor() {
        super(30);
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
          const stream = innerClient.bidiStream();
          stream.write({ message: call.request.message });
          stream.on("error", error => {
            reject(error);
          });
          stream.on("data", (data: any) => {
            try {
              expect(data.message).toBe("pong");
            } catch (e) {
              reject(e);
            }
          });
          stream.on("end", () => {
            resolve();
          });
          stream.end();
        });
        return { message: "pong" };
      }

      bidiStream(call: ServerDuplexStream): void {
        const { metadata }: { metadata: grpc.Metadata } = call as any; // TODO gRPC library' typing is incorrect
        const ctx = new EnvoyContext(metadata);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.parentSpanId).toBe(innerParentId);
        call.write({ message: "pong" });
        call.on("data", (data: any) => {
          expect(data.message).toBe("ping");
        });
        call.on("end", () => {
          call.end();
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
  // I cannot test it as network timeout here, but operation time is hard to simulate

  // NOTE: retry is not testable, skip
  // I cannot test it as node gRPC does not have a method to let me throw gRPC error
});
