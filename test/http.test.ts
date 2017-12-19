import HttpTestServer, { Request } from "./lib/http-test-server";
import { HttpHeader } from "../src/types";
import EnvoyContext from "../src/envoy-context";
import envoyFetch from "../src/envoy-fetch";
import EnvoyHttpRequestParams from "../src/envoy-http-request-params";

describe("HTTP Test", () => {
  it("should propagate the tracing header correctly", async () => {
    const CLIENT_TRACE_ID = `client-id-${Math.floor(Math.random() * 65536)}`;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let innerParentId: string | undefined;

    const server = new class extends HttpTestServer {
      constructor() {
        super();
      }

      async wrapper(request: Request): Promise<any> {
        //
        const ctx = new EnvoyContext(request.headers as HttpHeader);
        expect(ctx.clientTraceId).toBe(CLIENT_TRACE_ID);
        requestId = ctx.requestId;
        traceId = ctx.traceId;
        innerParentId = ctx.spanId;
        const param = new EnvoyHttpRequestParams(ctx);
        envoyFetch(param, "");
      }

      async inner(request: Request): Promise<any> {
        //
      }
    }();
  });
});
