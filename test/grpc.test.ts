import grpc, { ServerUnaryCall, sendUnaryData, ServiceError } from "grpc";

import { EnvoyContext, EnvoyGrpcRequestParams } from "../src/envoy-node-boilerplate";
import GrpcTestServer, { Ping } from "./lib/grpc-test-server";

interface LooksGood {
  resolve?: (value?: boolean | PromiseLike<boolean>) => void;
  reject?: (value?: any) => void;
}

describe("GRPC Test", () => {
  it("boot the server", async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 99999999;
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string;
    let traceId: string;
    let innerParentId: string;

    // const wrapperLooksGoodHandle: LooksGood = {};
    // const wrapperLooksGood = new Promise<boolean>((resolve, reject) => {
    //   wrapperLooksGoodHandle.resolve = resolve;
    //   wrapperLooksGoodHandle.reject = reject;
    // });
    // const innerLooksGoodHandle: LooksGood = {};
    // const innerLooksGood = new Promise<boolean>((resolve, reject) => {
    //   innerLooksGoodHandle.resolve = resolve;
    //   innerLooksGoodHandle.reject = reject;
    // });

    const server = new class extends GrpcTestServer {
      constructor() {
        super();
      }

      wrapper(call: ServerUnaryCall, callback: sendUnaryData): void {
        try {
          const ctx = new EnvoyContext(call.metadata);
          expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
          requestId = ctx.requestId;
          traceId = ctx.traceId;
          innerParentId = ctx.spanId;
          const params = new EnvoyGrpcRequestParams(ctx, {
            host: `${GrpcTestServer.domainName}:${this.envoyIngressPort}`
          });
          const metadata = params.assembleRequestMeta();
          const innerClient = new Ping(
            `${GrpcTestServer.bindHost}:${this.envoyEgressPort}`,
            grpc.credentials.createInsecure()
          );
          innerClient.inner(
            { message: call.request.message },
            metadata,
            (err: ServiceError, response) => {
              if (err) {
                // TODO
                callback(err, undefined);
                // wrapperLooksGoodHandle.reject(err);
                return;
              }
              callback(undefined, { message: response.message });
              // wrapperLooksGoodHandle.resolve(true);
            }
          );
        } catch (e) {
          callback(e, undefined);
          // wrapperLooksGoodHandle.reject(e);
        }
      }

      inner(call: ServerUnaryCall, callback: sendUnaryData): void {
        try {
          const ctx = new EnvoyContext(call.metadata);
          expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
          expect(ctx.requestId).toBe(requestId);
          expect(ctx.traceId).toBe(traceId);
          expect(ctx.parentSpanId).toBe(innerParentId);
          callback(undefined, { message: "pong" });
          // innerLooksGoodHandle.resolve(true);
        } catch (e) {
          callback(e, undefined);
          // innerLooksGoodHandle.reject(e);
        }
      }
    }();

    await server.start();

    // wait for envoy is up
    await new Promise(resolve => {
      setTimeout(() => resolve(), 500);
    });

    const clientMetadata = new grpc.Metadata();
    clientMetadata.add("x-client-trace-id", CLIENT_TRACE_ID);
    const client = new Ping(
      `${GrpcTestServer.bindHost}:${server.envoyIngressPort}`,
      grpc.credentials.createInsecure()
    );

    const response = await new Promise((resolve, reject) => {
      client.wrapper({ message: "ping" }, clientMetadata, (err: ServiceError, response) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      });
    });

    // await wrapperLooksGood;
    // await innerLooksGood;

    await server.stop();
  });
});
