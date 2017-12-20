import { Metadata } from "grpc";
import { HttpHeader } from "./types";
import EnvoyHttpRequestParams, { EnvoyHttpRequestInit } from "./envoy-http-request-params";
import EnvoyContext from "./envoy-context";
import envoyFetch from "./envoy-fetch";
import { EnvoyResponse } from "./envoy-node-boilerplate";

export const APPLICATION_JSON = "application/json";

export default class EnvoyHttpClient {
  envoyContext: EnvoyContext;

  constructor(ctx: EnvoyContext | Metadata | HttpHeader) {
    if (ctx instanceof EnvoyContext) {
      this.envoyContext = ctx;
    } else {
      this.envoyContext = new EnvoyContext(ctx);
    }
  }

  async returnJsonOrError(response: EnvoyResponse): Promise<any> {
    // TODO considering return the following metadata:
    // response.overloaded
    // response.upstreamServiceTime
    const $statusCode = response.status;
    if ($statusCode === 204) {
      return undefined;
    }
    const contentType = response.headers.get("content-type");
    if (contentType !== "application/json") {
      const err = new Error(`Unexpected content type: ${contentType}, http status: ${$statusCode}`);
      const body = await response.text();
      Object.assign(err, { body });
      throw err;
    }
    const result = await response.json();
    if ($statusCode !== 200) {
      result.$statusCode = result.$statusCode || $statusCode;
      throw result;
    }
    return result;
  }

  async get(url: string, init?: EnvoyHttpRequestInit): Promise<any> {
    const param = new EnvoyHttpRequestParams(this.envoyContext, init);
    const res = await envoyFetch(param, url, {
      headers: {
        accept: APPLICATION_JSON
      }
    });
    return this.returnJsonOrError(res);
  }

  async post(url: string, body: any, init?: EnvoyHttpRequestInit): Promise<any> {
    const param = new EnvoyHttpRequestParams(this.envoyContext, init);
    const res = await envoyFetch(param, url, {
      method: "POST",
      headers: {
        "content-type": APPLICATION_JSON,
        accept: APPLICATION_JSON
      },
      body: JSON.stringify(body)
    });
    return this.returnJsonOrError(res);
  }

  // TODO more methods
}
