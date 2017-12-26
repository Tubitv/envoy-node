import fetch, { RequestInit, Response } from "node-fetch";
import { parse as parseUrl } from "url";

import EnvoyContext, { X_ENVOY_OVERLOADED, X_ENVOY_UPSTREAM_SERVICE_TIME } from "./envoy-context";
import { HttpHeader } from "./types";
import EnvoyHttpRequestParams from "./envoy-http-request-params";

/**
 * EnvoyResponse is a little enhanced from the original Response of node-fetch
 */
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

/**
 * the fetch function share most of the signature of the original node-fetch
 * but helps you on setting up the request being send to envoy egress port
 * @param envoyParams the params of envoy context as well as request control params (timeout / retry, etc)
 * @param url the target url, the same as node-fetch's first param
 * @param init the init, the same as node-fetch's second param
 */
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
    throw new Error(`envoy fetch is designed only for http for now, current found: ${protocol}`);
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