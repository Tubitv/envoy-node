import EnvoyContext from "./envoy-context";
import { HttpHeader } from "./types";

/**
 * header of envoy max retries setting
 * @internal
 */
export const X_ENVOY_MAX_RETRIES = "x-envoy-max-retries";
/**
 * header of envoy request timeout
 * @internal
 */
export const X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS = "x-envoy-upstream-rq-timeout-ms";
/**
 * header of envoy timeout per try
 * @internal
 */
export const X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS = "x-envoy-upstream-rq-per-try-timeout-ms";

/**
 * the Common signature of EnvoyRequestParams
 */
export default abstract class EnvoyRequestParams {
  /**
   * request context read from ingress traffic
   */
  readonly context: EnvoyContext;

  /**
   * If a retry policy is in place, Envoy will default to retrying one time unless
   * explicitly specified. The number of retries can be explicitly set in the route
   * retry config or by using this header. If a retry policy is not configured and
   * x-envoy-retry-on or x-envoy-retry-grpc-on headers are not specified, Envoy will
   * not retry a failed request.
   *
   * A few notes on how Envoy does retries:
   *
   * - The route timeout (set via x-envoy-upstream-rq-timeout-ms or the route
   * configuration) includes all retries. Thus if the request timeout is set to 3s,
   * and the first request attempt takes 2.7s, the retry (including backoff) has .3s
   * to complete. This is by design to avoid an exponential retry/timeout explosion.
   *
   * - Envoy uses a fully jittered exponential backoff algorithm for retries with a
   * base time of 25ms. The first retry will be delayed randomly between 0-24ms, the
   * 2nd between 0-74ms, the 3rd between 0-174ms and so on.
   *
   * - If max retries is set both by header as well as in the route configuration,
   * the maximum value is taken when determining the max retries to use for the
   * request.
   */
  readonly maxRetries: number;

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
   * extra customer headers to be set in the request
   */
  readonly customHeaders: HttpHeader;

  constructor(
    context: EnvoyContext,
    maxRetries: number,
    timeout: number,
    perTryTimeout: number,
    headers: HttpHeader = {}
  ) {
    this.context = context;
    this.maxRetries = maxRetries;
    this.timeout = timeout;
    this.perTryTimeout = perTryTimeout;
    this.customHeaders = headers;
  }
}
