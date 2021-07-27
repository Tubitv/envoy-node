import { Metadata } from "@grpc/grpc-js";
import { parse as parseUrl } from "url";
import { HttpHeader } from "./types";
import EnvoyContext from "./envoy-context";
import EnvoyHttpRequestParams, { EnvoyHttpRequestInit } from "./envoy-http-request-params";
import { Options, OptionsWithUrl, OptionsWithUri } from "request";

/**
 * to easier migrate from http request using request library, you can use this function
 * to refine the request params directly
 * @param params request params, can be url string or params object
 * @param ctx the context, can be EnvoyContext, grpc.Metadata or HttpHeader
 * @param init the extra options for the request
 */
export default function envoyRequestParamsRefiner(
  params: string | Options,
  ctx?: EnvoyContext | Metadata | HttpHeader,
  init?: EnvoyHttpRequestInit
): Options {
  if (!ctx) {
    return typeof params === "string" ? { url: params } : params;
  }

  let envoyContext: EnvoyContext;
  if (ctx instanceof EnvoyContext) {
    envoyContext = ctx;
  } else {
    envoyContext = new EnvoyContext(ctx);
  }

  const envoyParams = new EnvoyHttpRequestParams(envoyContext, init);

  let refinedParams: Options;
  if (typeof params === "string") {
    refinedParams = { url: params };
  } else {
    refinedParams = { ...params };
  }

  const refinedParamsWithUrl = refinedParams as OptionsWithUrl;
  const refinedParamsWithUri = refinedParams as OptionsWithUri;
  if (Object.prototype.hasOwnProperty.call(refinedParams, "url")) {
    refinedParamsWithUri.uri = refinedParamsWithUrl.url;
    delete refinedParamsWithUrl.url;
  }

  if (!refinedParamsWithUri.uri) {
    throw new Error("Cannot read url from params");
  }

  if (typeof refinedParamsWithUri.uri === "string") {
    refinedParamsWithUri.uri = parseUrl(refinedParamsWithUri.uri);
  }

  const { protocol, host, path } = refinedParamsWithUri.uri;
  if (!protocol || !host || !path) {
    throw new Error("Cannot read the URL for envoy to fetch");
  }

  const callDirectly = envoyParams.context.shouldCallWithoutEnvoy(host);

  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(
      `envoy request is designed only for http / https for now, current found: ${protocol}`
    );
  }

  const oldHeaders: HttpHeader = {};
  Object.assign(oldHeaders, refinedParamsWithUri.headers);

  refinedParamsWithUri.headers = {
    ...oldHeaders,
    ...envoyParams.assembleRequestHeaders(),
    host,
  };

  if (!callDirectly) {
    refinedParamsWithUri.uri = `http://${envoyParams.context.envoyEgressAddr}:${envoyParams.context.envoyEgressPort}${path}`;
  }

  return refinedParams;
}
