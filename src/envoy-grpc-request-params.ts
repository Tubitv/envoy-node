import grpc from "grpc";

import EnvoyRequestParams, {
  X_ENVOY_MAX_RETRIES,
  X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS,
  X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS
} from "./envoy-request-params";
import EnvoyContext from "./envoy-context";
import { HttpHeader } from "./types";

export const X_ENVOY_RETRY_GRPC_ON = "x-envoy-retry-grpc-on";
export const HOST = "host";
export const AUTHORITY = "authority";

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

export interface EnvoyGrpcRequestInit {
  maxRetries?: number;
  retryOn?: GrpcRetryOn[];
  timeout?: number;
  perTryTimeout?: number;
}

export function httpHeader2Metadata(httpHeader: HttpHeader) {
  const metadata = new grpc.Metadata();
  for (const [key, value] of Object.entries(httpHeader)) {
    if (Array.isArray(value)) {
      value.forEach(v => metadata.add(key, v));
    } else {
      metadata.add(key, value);
    }
  }
  return metadata;
}

export default class EnvoyGrpcRequestParams extends EnvoyRequestParams {
  readonly retryOn: GrpcRetryOn[];

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
  constructor(context: EnvoyContext, params?: EnvoyGrpcRequestInit) {
    const { maxRetries, retryOn, timeout, perTryTimeout }: EnvoyGrpcRequestInit = {
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
   * assemble the request headers for setting retry.
   */
  assembleRequestMeta(): grpc.Metadata {
    const metadata = httpHeader2Metadata(this.context.assembleTracingHeader());

    if (this.maxRetries >= 0) {
      metadata.add(X_ENVOY_MAX_RETRIES, `${this.maxRetries}`);
    }

    if (this.maxRetries > 0) {
      metadata.add(X_ENVOY_RETRY_GRPC_ON, this.retryOn.join(","));
    }

    if (this.timeout > 0) {
      metadata.add(X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS, `${this.timeout}`);
    }

    if (this.perTryTimeout > 0) {
      metadata.add(X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS, `${this.perTryTimeout}`);
    }

    return metadata;
  }
}
