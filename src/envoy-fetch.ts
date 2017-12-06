import fetch, { RequestInit, Response } from "node-fetch";
import { parse as parseUrl } from "url";

import EnvoyContext from "./envoy-context";
import { HttpHeader } from "../types";

export default async function envoyFetch(
  envoyContext: EnvoyContext,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const { protocol, host, hostname, path } = parseUrl(url);
  if (!protocol || !host || !hostname || !path) {
    throw new Error("Cannot read the URL for envoy to fetch");
  }
  if (protocol !== "http:") {
    throw new Error("envoy fetch is designed only for http for now");
  }
  const refinedInit: RequestInit = { ...init };

  refinedInit.headers = {
    ...refinedInit.headers,
    ...envoyContext.assembleTracingHeader(),
    // we are likely to assign host (hostname + port) here
    // but envoy has a bug, if you specify a port number, it returns 404
    host: hostname
  };
  return fetch(`http://127.0.0.1:${envoyContext.envoyEgressPort}${path}`, refinedInit);
}
