import fetch from "node-fetch";
import HttpTestServer, { Request } from "./lib/http-test-server";
import { HttpHeader, RequestFunc } from "../src/types";
import { sleep } from "./lib/utils";
import simplePost from "./lib/simple-post";
import {
  EnvoyContext,
  HttpRetryOn,
  EnvoyHttpRequestParams,
  EnvoyHttpClient,
  envoyFetch
} from "../src/envoy-node";

describe("HTTP Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends HttpTestServer {
      constructor() {
        super(10);
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
    const WRAPPER_SLEEP_TIME = 200;
    let innerCalledCount = 0;

    const server = new class extends HttpTestServer {
      constructor() {
        super(11);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        const startTime = Date.now();
        let http504Happened = false;
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
          expect(e.$statusCode).toBe(504);
          http504Happened = true;
        }
        expect(http504Happened).toBeTruthy();
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

    const server = new class extends HttpTestServer {
      constructor() {
        super(12);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        // send request to inner
        const response = await client.post(
          `http://${HttpTestServer.domainName}:${this.envoyIngressPort}/inner`,
          request.body,
          {
            retryOn: [HttpRetryOn.RETRIABLE_4XX],
            maxRetries: 1
          }
        );
        return response;
      }

      async inner(request: Request): Promise<any> {
        innerCalledCount++;
        if (innerCalledCount < 2) {
          const err = new Error("HTTP 409");
          Object.assign(err, { statusCode: 409 });
          throw err;
        }
        return { message: "pong" };
      }
    }();

    await server.start();

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

  it("should handle per retry timeout correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let innerCalledCount = 0;
    const WRAPPER_SLEEP_TIME = 100;

    const server = new class extends HttpTestServer {
      constructor() {
        super(13);
      }

      async wrapper(request: Request): Promise<any> {
        const client = new EnvoyHttpClient(request.headers as HttpHeader);
        const ctx = client.envoyContext;
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);

        let errorHappened = false;

        // send request to inner
        try {
          await client.post(
            `http://${HttpTestServer.domainName}:${this.envoyIngressPort}/inner`,
            request.body,
            {
              retryOn: [HttpRetryOn.RETRIABLE_4XX],
              maxRetries: 3,
              perTryTimeout: WRAPPER_SLEEP_TIME
            }
          );
        } catch (e) {
          errorHappened = true;
          expect(e.$statusCode).toBe(504);
          expect(e.message).toBe("upstream request timeout");
        }

        expect(errorHappened).toBeTruthy();
        expect(innerCalledCount).toBe(2);

        return;
      }

      async inner(request: Request): Promise<any> {
        innerCalledCount++;
        if (innerCalledCount === 2) {
          await sleep(WRAPPER_SLEEP_TIME * 1.2);
        }
        if (innerCalledCount < 3) {
          const err = new Error("HTTP 409");
          Object.assign(err, { statusCode: 409 });
          throw err;
        }
        return { message: "pong" };
      }
    }();

    await server.start();

    try {
      await simplePost(
        `http://${HttpTestServer.bindHost}:${server.envoyIngressPort}/wrapper`,
        { message: "ping" },
        { "x-client-trace-id": CLIENT_TRACE_ID }
      );
    } finally {
      await server.stop();
    }
  });

  it("should propagate the tracing header directly in direct mode", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;

    const server = new class extends HttpTestServer {
      constructor() {
        super(10);
      }

      async wrapper(request: Request): Promise<any> {
        const ctx = new EnvoyContext(request.headers as HttpHeader, undefined, undefined, true);
        const client = new EnvoyHttpClient(ctx);
        // asserts
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        spanId = ctx.spanId;
        // send request to inner
        return client.post(
          `http://${HttpTestServer.bindHost}:${this.envoyIngressPort}/inner`,
          request.body
        );
      }

      async inner(request: Request): Promise<any> {
        expect(request.body.message).toBe("ping");
        const ctx = new EnvoyContext(request.headers as HttpHeader);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        expect(ctx.requestId).toBe(requestId);
        expect(ctx.traceId).toBe(traceId);
        expect(ctx.spanId).toBe(spanId);
        return { message: "pong" };
      }
    }();

    await server.start();

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
});
