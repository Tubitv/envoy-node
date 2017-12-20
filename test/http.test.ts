import fetch from "node-fetch";
import HttpTestServer, { Request } from "./lib/http-test-server";
import { HttpHeader } from "../src/types";
import EnvoyContext from "../src/envoy-context";
import envoyFetch from "../src/envoy-fetch";
import EnvoyHttpRequestParams from "../src/envoy-http-request-params";
import EnvoyHttpClient from "../src/envoy-http-client";
import { sleep } from "./lib/utils";
import simplePost from "./lib/simple-post";

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
});
