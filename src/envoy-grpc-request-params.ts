import grpc from "grpc";

import EnvoyRequestParams, { X_ENVOY_MAX_RETRIES } from "./envoy-request-params";

export const X_ENVOY_RETRY_GRPC_ON = "x-envoy-retry-grpc-on";

/**
 * Setting this header on egress requests will cause Envoy to attempt to retry
 * failed requests (number of retries defaults to 1, and can be controlled by
 * x-envoy-max-retries header or the route config retry policy). gRPC retries
 * are currently only supported for gRPC status codes in response headers. gRPC
 * status codes in trailers will not trigger retry logic.
 */
export enum GrpcRetryOn {
  /**
   * Envoy will attempt a retry if the gRPC status code in the response headers is
   * “cancelled” (1)
   */
  CANCELLED = "cancelled",

  /**
   * Envoy will attempt a retry if the gRPC status code in the response headers is
   * “deadline-exceeded” (4)
   */
  DEADLINE_EXCEEDED = "deadline-exceeded",

  /**
   * Envoy will attempt a retry if the gRPC status code in the response headers is
   * “resource-exhausted” (8)
   */
  RESOURCE_EXHAUSTED = "resource-exhausted"
}

export default class EnvoyGrpcRequestParams extends EnvoyRequestParams {
  readonly retryOn: GrpcRetryOn[];

  /**
   * Setting the retry policies, if empty param is given will not generate any headers but using
   * the default setting in Envoy's config
   * @param maxRetries max retries, -1 means using default
   * @param retryOn in what situation(s) shall we retry
   */
  constructor(maxRetries = -1, retryOn: GrpcRetryOn[] = []) {
    super(maxRetries);
    this.retryOn = retryOn;
  }

  /**
   * assemble the request headers for setting retry.. TODO circuit break
   */
  assembleRequestHeaders(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    if (this.maxRetries >= 0) {
      metadata.add(X_ENVOY_MAX_RETRIES, `${this.maxRetries}`);
      metadata.add(X_ENVOY_RETRY_GRPC_ON, this.retryOn.join(","));
    }
    return metadata;
  }
}
