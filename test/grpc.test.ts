import grpc, { ServerUnaryCall, sendUnaryData, ServiceError } from "grpc";

import GrpcTestServer, { Ping, PingEnvoyClient } from "./lib/grpc-test-server";
import { sleep } from "./lib/utils";
import { RequestFunc, EnvoyClient } from "../src/types";
import EnvoyContext from "../src/envoy-context";

interface PingEnvoyClient extends EnvoyClient {
  inner: RequestFunc;
  wrapper: RequestFunc;
}

describe("GRPC Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string;
    let traceId: string;
    let innerParentId: string;

    const server = new class extends GrpcTestServer {
      constructor() {
        super();
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

    await server.stop();
  });

  it("should timeout correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;

    const server = new class extends GrpcTestServer {
      constructor() {
        super();
      }

      async wrapper(call: ServerUnaryCall): Promise<any> {
        const innerClient = new PingEnvoyClient(
          `${GrpcTestServer.domainName}:${this.envoyIngressPort}`,
          call.metadata
        ) as PingEnvoyClient;
        try {
          const firstRequest = await innerClient.inner(
            { message: call.request.message },
            { timeout: 10 }
          );
          console.log(firstRequest);
        } catch (e) {
          expect(e).toBe(Error);
        }

        return { message: "" };
      }

      async inner(call: ServerUnaryCall): Promise<any> {
        const ctx = new EnvoyContext(call.metadata);
        innerCalledCount++;
        if (innerCalledCount < 2) {
          await sleep(100);
        }
        return { message: "pong" };
      }
    }();

    await server.start();

    // wait for envoy to up
    await sleep(100);

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

    await server.stop();
  });
});
