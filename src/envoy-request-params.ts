export const X_ENVOY_MAX_RETRIES = "x-envoy-max-retries";
export const X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS = "x-envoy-upstream-rq-timeout-ms";
export const X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS = "x-envoy-upstream-rq-timeout-ms";

export default abstract class EnvoyRequestParams {
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

  constructor(maxRetries: number) {
    this.maxRetries = maxRetries;
  }
}
