import fetch, { RequestInit, Response } from "node-fetch";
import { parse as parseUrl } from "url";

import EnvoyContext, { X_ENVOY_OVERLOADED, X_ENVOY_UPSTREAM_SERVICE_TIME } from "./envoy-context";
import { HttpHeader } from "./types";
import EnvoyHttpRequestParams from "./envoy-http-request-params";

export interface EnvoyResponse extends Response {
  /**
   * Envoy will set this header on the downstream response if a request was dropped due
   * to either maintenance mode or upstream circuit breaking.
   */
  overloaded: boolean;
  /**
   * Contains the time in milliseconds spent by the upstream host processing the request.
   * This is useful if the client wants to determine service time compared to network latency.
   * This header is set on responses.
   */
  upstreamServiceTime: number;
}

export default async function envoyFetch(
  envoyParams: EnvoyHttpRequestParams,
  url: string,
  init?: RequestInit
): Promise<EnvoyResponse> {
  const { protocol, host, path } = parseUrl(url);
  if (!protocol || !host || !path) {
    throw new Error("Cannot read the URL for envoy to fetch");
  }
  if (protocol !== "http:") {
    throw new Error("envoy fetch is designed only for http for now");
  }
  const refinedInit: RequestInit = { ...init };

  const oldHeaders: HttpHeader = {};
  Object.assign(oldHeaders, refinedInit.headers);

  refinedInit.headers = {
    ...oldHeaders,
    ...envoyParams.assembleRequestHeaders(),
    host
  };
  const response = await fetch(
    `http://${envoyParams.context.envoyEgressAddr}:${envoyParams.context.envoyEgressPort}${path}`,
    refinedInit
  );

  /* tslint:disable:prefer-object-spread */
  const envoyResponse: EnvoyResponse = Object.assign(response, {
    overloaded: response.headers.has(X_ENVOY_OVERLOADED),
    upstreamServiceTime: parseInt(response.headers.get(X_ENVOY_UPSTREAM_SERVICE_TIME), 10)
  });
  /* tslint:enable:prefer-object-spread */

  return envoyResponse;
}
