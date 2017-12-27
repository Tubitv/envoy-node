import EnvoyRequestParams, {
  X_ENVOY_MAX_RETRIES,
  X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS,
  X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS
} from "./envoy-request-params";
import { HttpHeader } from "./types";
import EnvoyContext from "./envoy-context";

const X_ENVOY_RETRY_ON = "x-envoy-retry-on";

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

/**
 * request params: timeout, retry, etc.
 */
export interface EnvoyHttpRequestInit {
  maxRetries?: number;
  retryOn?: HttpRetryOn[];
  timeout?: number;
  perTryTimeout?: number;
  headers?: HttpHeader;
}

/**
 * the HTTP request params, mainly two parts:
 * 1. EnvoyContext, telling what the situation is
 * 2. request params, like timeout, retry, etc.
 */
export default class EnvoyHttpRequestParams extends EnvoyRequestParams {
  /**
   * on what condition shall envoy retry
   */
  readonly retryOn: HttpRetryOn[];

  /**
   * Setting the retry policies, if empty param is given will not generate any headers but using
   * the default setting in Envoy's config
   * @param params the params for initialize the request params
   */
  constructor(context: EnvoyContext, params?: EnvoyHttpRequestInit) {
    const { maxRetries, retryOn, timeout, perTryTimeout, headers }: EnvoyHttpRequestInit = {
      maxRetries: -1,
      retryOn: [],
      timeout: -1,
      perTryTimeout: -1,
      headers: {},
      ...params
    };
    super(context, maxRetries, timeout, perTryTimeout, headers);
    this.retryOn = retryOn;
  }

  /**
   * assemble the request headers for setting retry.
   */
  assembleRequestHeaders(): HttpHeader {
    const header: HttpHeader = {
      ...this.context.assembleTracingHeader(),
      ...this.customHeaders
    };

    if (this.maxRetries >= 0) {
      header[X_ENVOY_MAX_RETRIES] = `${this.maxRetries}`;
    }

    if (this.maxRetries > 0) {
      header[X_ENVOY_RETRY_ON] = this.retryOn.join(",");
    }

    if (this.timeout > 0) {
      header[X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS] = `${this.timeout}`;
    }

    if (this.perTryTimeout > 0) {
      header[X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS] = `${this.perTryTimeout}`;
    }

    return header;
  }
}
