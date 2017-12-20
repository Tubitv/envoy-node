import fetch from "node-fetch";
import HttpTestServer, { Request } from "./lib/http-test-server";
import { HttpHeader, RequestFunc } from "../src/types";
import EnvoyContext from "../src/envoy-context";
import envoyFetch from "../src/envoy-fetch";
import EnvoyHttpRequestParams from "../src/envoy-http-request-params";
import EnvoyHttpClient from "../src/envoy-http-client";
import { sleep } from "./lib/utils";
import simplePost from "./lib/simple-post";
import { HttpRetryOn } from "../src/envoy-node-boilerplate";

describe("HTTP Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends HttpTestServer {
      constructor() {
        super(3);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        // asserts
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        innerParentId = ctx.spanId;
        // send request to inner
        return client.post(
          `http://${HttpTestServer.domainName}:${this.envoyIngressPort}/inner`,
          request.body
        );
      }

      async inner(request: Request): Promise<any> {
        expect(request.body.message).toBe("ping");
        const ctx = new EnvoyContext(request.headers as HttpHeader);
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
      const response = await simplePost(
        `http://${HttpTestServer.bindHost}:${server.envoyIngressPort}/wrapper`,
        { message: "ping" },
        { "x-client-trace-id": CLIENT_TRACE_ID }
      );
      expect(response.message).toBe("pong");
    } finally {
      await server.stop();
    }
  });

  it("should handle timeout correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    const WRAPPER_SLEEP_TIME = 100;
    let innerCalledCount = 0;

    const server = new class extends HttpTestServer {
      constructor() {
        super(4);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        const startTime = Date.now();
        // send request to inner
        try {
          const innerResponse = await client.post(
            `http://${HttpTestServer.domainName}:${this.envoyIngressPort}/inner`,
            request.body,
            {
              timeout: WRAPPER_SLEEP_TIME / 2
            }
          );
        } catch (e) {
          console.log(e);
          expect(e.$statusCode).toBe(504);
        }
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(WRAPPER_SLEEP_TIME);
        return { message: "pong" };
      }

      async inner(request: Request): Promise<any> {
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
      const response = await simplePost(
        `http://${HttpTestServer.bindHost}:${server.envoyIngressPort}/wrapper`,
        { message: "ping" },
        { "x-client-trace-id": CLIENT_TRACE_ID }
      );
      expect(innerCalledCount).toBe(1);
      expect(response.message).toBe("pong");
    } finally {
      await server.stop();
    }
  });

  it("should handle retry correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;
    let callTime: number;
    let lastTime: number;

    const server = new class extends HttpTestServer {
      constructor() {
        super(5);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        callTime = Date.now();
        // send request to inner
        const response = await client.post(
          `http://${HttpTestServer.domainName}:${this.envoyIngressPort}/inner`,
          request.body,
          {
            retryOn: [HttpRetryOn.RETRIABLE_4XX],
            maxRetries: 1
          }
        );
        console.log("done time", Date.now() - callTime);
        return response;
      }

      async inner(request: Request): Promise<any> {
        innerCalledCount++;
        console.log("inner call", Date.now() - callTime, request.headers);
        if (lastTime) {
          console.log("from last", Date.now() - lastTime);
        }
        lastTime = Date.now();
        if (innerCalledCount < 2) {
          const err = new Error("HTTP 409");
          Object.assign(err, { statusCode: 409 });
          throw err;
        }
        return { message: "pong" };
      }
    }();

    await server.start();

    // wait for envoy to up
    await sleep(100);

    try {
      const response = await simplePost(
        `http://${HttpTestServer.bindHost}:${server.envoyIngressPort}/wrapper`,
        { message: "ping" },
        { "x-client-trace-id": CLIENT_TRACE_ID }
      );
      expect(innerCalledCount).toBe(2);
      expect(response.message).toBe("pong");
    } finally {
      await server.stop();
    }
  });
});
