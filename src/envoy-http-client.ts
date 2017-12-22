import { Metadata } from "grpc";
import { HttpHeader } from "./types";
import EnvoyHttpRequestParams, { EnvoyHttpRequestInit } from "./envoy-http-request-params";
import EnvoyContext from "./envoy-context";
import envoyFetch, { EnvoyResponse } from "./envoy-fetch";

/**
 * json header
 * @internal
 */
export const APPLICATION_JSON = "application/json";

/**
 * a high level http client that will send traffic to Envoy:
 * 1. all HTTP GET / POST ... will be wrapped as async signature
 * 2. doing JSON RESET API common works: accepting object, return objects, only works with `application/json`
 * 3. none 2XX request will be throw as Error
 */
export default class EnvoyHttpClient {
  /**
   * the envoy context where you can read
   */
  envoyContext: EnvoyContext;

  /**
   * init the client
   * @param ctx context, you can give either EnvoyContext, Metadata or HTTP Header
   *  the last two will be convert to EnvoyContext
   */
  constructor(ctx: EnvoyContext | Metadata | HttpHeader) {
    if (ctx instanceof EnvoyContext) {
      this.envoyContext = ctx;
    } else {
      this.envoyContext = new EnvoyContext(ctx);
    }
  }

  /**
   * the common logic for json processing and error handling
   * @param response response from fetch
   */
  private async returnJsonOrError(response: EnvoyResponse): Promise<any> {
    // TODO considering return the following metadata:
    // response.overloaded
    // response.upstreamServiceTime
    const $statusCode = response.status;
    if ($statusCode === 204) {
      return undefined;
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || (contentType !== "application/json" && !contentType.startsWith("text/"))) {
      const err = new Error(`Unexpected content type: ${contentType}, http status: ${$statusCode}`);
      const body = await response.text();
      Object.assign(err, { $statusCode, body });
      throw err;
    }
    if (contentType === "application/json") {
      const result = await response.json();
      if ($statusCode >= 400) {
        result.$statusCode = result.$statusCode || $statusCode;
        throw result;
      }
      return result;
    }
    const text = await response.text();
    if ($statusCode !== 200) {
      const error = new Error(text);
      Object.assign(error, { $statusCode });
      throw error;
    }
    return text;
  }

  /**
   * send a GET request and expecting return json or empty
   * @param url the URL to get
   * @param init the params for the request, like retry, timeout
   * @throws Error for none 2XX request, a $statusCode will be available in the error object
   */
  async get(url: string, init?: EnvoyHttpRequestInit): Promise<any> {
    const param = new EnvoyHttpRequestParams(this.envoyContext, init);
    const res = await envoyFetch(param, url, {
      headers: {
        accept: APPLICATION_JSON
      }
    });
    return this.returnJsonOrError(res);
  }
  /**
   * send a POST request and expecting return json or empty
   * @param url the URL to get
   * @param body the request object, will be serialize to JSON when sending out
   * @param init the params for the request, like retry, timeout
   * @throws Error for none 2XX request, a $statusCode will be available in the error object
   */
  async post(url: string, body: any, init?: EnvoyHttpRequestInit): Promise<any> {
    const param = new EnvoyHttpRequestParams(this.envoyContext, init);
    const res = await envoyFetch(param, url, {
      method: "POST",
      headers: {
        "content-type": APPLICATION_JSON,
        // tslint:disable-next-line:object-literal-key-quotes
        accept: APPLICATION_JSON
      },
      body: JSON.stringify(body)
    });
    return this.returnJsonOrError(res);
  }

  // TODO more methods
}
