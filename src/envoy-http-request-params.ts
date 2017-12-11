import EnvoyRequestParams, {
  X_ENVOY_MAX_RETRIES,
  X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS,
  X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS
} from "./envoy-request-params";
import { HttpHeader } from "../types/index";
import EnvoyContext from "./envoy-context";

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

export interface ConstructorParams {
  maxRetries: number;
  retryOn: HttpRetryOn[];
  timeout: number;
  perTryTimeout: number;
}

export default class EnvoyHttpRequestParams extends EnvoyRequestParams {
  readonly retryOn: HttpRetryOn[];

  /**
   * Setting this header on egress requests will cause Envoy to override the route configuration.
   * The timeout must be specified in millisecond units.
   * Also see <perTryTimeout>
   */
  readonly timeout: number;

  /**
   * Setting this will cause Envoy to set a per try timeout on routed requests. This timeout must
   * be <= the global route timeout (see <timeout>) or it is ignored.
   * This allows a caller to set a tight per try timeout to allow for retries while maintaining a
   * reasonable overall timeout.
   */
  readonly perTryTimeout: number;

  /**
   * Setting the retry policies, if empty param is given will not generate any headers but using
   * the default setting in Envoy's config
   * @param params the params for initialize the request params
   */
  constructor(context: EnvoyContext, params?: ConstructorParams) {
    const { maxRetries, retryOn, timeout, perTryTimeout }: ConstructorParams = {
      maxRetries: -1,
      retryOn: [],
      timeout: -1,
      perTryTimeout: -1,
      ...params
    };
    super(context, maxRetries);
    this.retryOn = retryOn;
    this.timeout = timeout;
    this.perTryTimeout = perTryTimeout;
  }

  /**
   * assemble the request headers for setting retry.. TODO circuit break
   */
  assembleRequestHeaders(): HttpHeader {
    const header: HttpHeader = this.context.assembleTracingHeader();

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
