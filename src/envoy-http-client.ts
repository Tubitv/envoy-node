import { Metadata } from "grpc";
import { HttpHeader } from "./types";
import { EnvoyHttpRequestInit } from "./envoy-http-request-params";
import EnvoyContext from "./envoy-context";

export default class EnvoyHttpClient {
  envoyContext: EnvoyContext;

  constructor(ctx: EnvoyContext | Metadata | HttpHeader) {
    if (ctx instanceof EnvoyContext) {
      this.envoyContext = ctx;
    } else {
      this.envoyContext = new EnvoyContext(ctx);
    }
  }

  async get(url: string, init?: EnvoyHttpRequestInit): Promise<any> {
    //
  }

  async post(url: string, body: any, init?: EnvoyHttpRequestInit): Promise<any> {
    //
  }

  // TODO more methods
}
