import EnvoyRequestParams, { X_ENVOY_MAX_RETRIES } from "./envoy-request-params";
import { HttpHeader } from "../types/index";

export const X_ENVOY_RETRY_ON = "x-envoy-retry-on";

/**
 * Setting this header on egress requests will cause Envoy to attempt to retry failed
 * requests (number of retries defaults to 1 and can be controlled by x-envoy-max-retries
 * header or the route config retry policy). The value to which the x-envoy-retry-on header
 * is set indicates the retry policy.
 */
export enum HttpRetryOn {
  /**
   * Envoy will attempt a retry if the upstream server responds with any 5xx response code,
   * or does not respond at all (disconnect/reset/read timeout). (Includes connect-failure
   * and refused-stream)
   *
   * NOTE: Envoy will not retry when a request exceeds x-envoy-upstream-rq-timeout-ms
   * (resulting in a 504 error code). Use x-envoy-upstream-rq-per-try-timeout-ms if you want
   * to retry when individual attempts take too long. x-envoy-upstream-rq-timeout-ms is an
   * outer time limit for a request, including any retries that take place.
   */
  HTTP_5XX = "5xx",

  /**
   * Envoy will attempt a retry if a request is failed because of a connection failure to the
   * upstream server (connect timeout, etc.). (Included in 5xx)
   *
   * NOTE: A connection failure/timeout is a the TCP level, not the request level. This does
   * not include upstream request timeouts specified via x-envoy-upstream-rq-timeout-ms or via
   * route configuration.
   */
  CONNECT_FAILURE = "connect-failure",

  /**
   * Envoy will attempt a retry if the upstream server responds with a retriable 4xx response
   * code. Currently, the only response code in this category is 409.
   *
   * NOTE: Be careful turning on this retry type. There are certain cases where a 409 can
   * indicate that an optimistic locking revision needs to be updated. Thus, the caller should
   * not retry and needs to read then attempt another write. If a retry happens in this type of
   * case it will always fail with another 409.
   */
  RETRIABLE_4XX = "retriable-4xx",

  /**
   * Envoy will attempt a retry if the upstream server resets the stream with a REFUSED_STREAM
   * error code. This reset type indicates that a request is safe to retry. (Included in 5xx)
   */
  REFUSED_STREAM = "refused-stream"
}

export default class EnvoyHttpRequestParams extends EnvoyRequestParams {
  readonly retryOn: HttpRetryOn[];

  /**
   * Setting the retry policies, if empty param is given will not generate any headers but using
   * the default setting in Envoy's config
   * @param maxRetries max retries, -1 means using default
   * @param retryOn in what situation(s) shall we retry
   */
  constructor(maxRetries = -1, retryOn: HttpRetryOn[] = []) {
    super(maxRetries);
    this.retryOn = retryOn;
  }

  /**
   * assemble the request headers for setting retry.. TODO circuit break
   */
  assembleRequestHeaders(): HttpHeader {
    if (this.maxRetries < 0) {
      return {};
    }
    return {
      [X_ENVOY_MAX_RETRIES]: `${this.maxRetries}`,
      [X_ENVOY_RETRY_ON]: this.retryOn.join(",")
    };
  }
}
