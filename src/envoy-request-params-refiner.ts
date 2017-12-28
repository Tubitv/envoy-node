import { Metadata } from "grpc";
import { parse as parseUrl } from "url";
import { HttpHeader } from "./types";
import EnvoyContext from "./envoy-context";
import EnvoyHttpRequestParams, { EnvoyHttpRequestInit } from "./envoy-http-request-params";

/**
 * this is the basic types of the init params of request library
 * only contains the fields we care about (we are going change)
 */
export interface RequestParams {
  url?: string;
  headers?: HttpHeader;
}

/**
 * to easier migrate from http request using request library, you can use this function
 * to refine the request params directly
 * @param params request params, can be url string or params object
 * @param ctx the context, can be EnvoyContext, grpc.Metadata or HttpHeader
 */
export default function envoyRequestParamsRefiner(
  params: string | RequestParams,
  ctx: EnvoyContext | Metadata | HttpHeader,
  init?: EnvoyHttpRequestInit
) {
  let envoyContext: EnvoyContext;
  if (ctx instanceof EnvoyContext) {
    envoyContext = ctx;
  } else {
    envoyContext = new EnvoyContext(ctx);
  }

  const envoyParams = new EnvoyHttpRequestParams(envoyContext, init);

  const refinedParams: RequestParams = {};
  if (typeof params === "string") {
    Object.assign(refinedParams, { url: params });
  } else {
    Object.assign(refinedParams, params);
  }

  if (!refinedParams.url) {
    throw new Error("Cannot read url from params");
  }

  const { protocol, host, path } = parseUrl(refinedParams.url);
  if (!protocol || !host || !path) {
    throw new Error("Cannot read the URL for envoy to fetch");
  }
  if (protocol !== "http:") {
    throw new Error(`envoy request is designed only for http for now, current found: ${protocol}`);
  }

  const oldHeaders: HttpHeader = {};
  Object.assign(oldHeaders, refinedParams.headers);

  refinedParams.headers = {
    ...oldHeaders,
    ...envoyParams.assembleRequestHeaders(),
    host
  };
  refinedParams.url = envoyParams.context.directMode
    ? refinedParams.url
    : `http://${envoyParams.context.envoyEgressAddr}:${envoyParams.context.envoyEgressPort}${path}`;

  return refinedParams;
}
