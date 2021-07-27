import { Metadata } from "@grpc/grpc-js";

import EnvoyRequestParams, {
  X_ENVOY_MAX_RETRIES,
  X_ENVOY_UPSTREAM_RQ_TIMEOUT_MS,
  X_ENVOY_UPSTREAM_RQ_PER_TRY_TIMEOUT_MS,
} from "./envoy-request-params";
import EnvoyContext from "./envoy-context";
import { HttpHeader } from "./types";

const X_ENVOY_RETRY_GRPC_ON = "x-envoy-retry-grpc-on";

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
  RESOURCE_EXHAUSTED = "resource-exhausted",
}

/**
 * request params: timeout, retry, etc.
 */
export interface EnvoyGrpcRequestInit {
  maxRetries?: number;
  retryOn?: GrpcRetryOn[];
  timeout?: number;
  perTryTimeout?: number;
  headers?: HttpHeader;
}

/**
 * convert http header to grpc.Metadata
 * @param httpHeader the http header
 * @internal
 */
export function httpHeader2Metadata(httpHeader: HttpHeader) {
  const metadata = new Metadata();
  for (const [key, value] of Object.entries(httpHeader)) {
    if (Array.isArray(value)) {
      value.forEach((v) => metadata.add(key, v));
    } else {
      metadata.add(key, value);
    }
  }
  return metadata;
}

/**
 * the gRPC request params, mainly two parts:
 * 1. EnvoyContext, telling what the situation is
 * 2. request params, like timeout, retry, etc.
 */
export default class EnvoyGrpcRequestParams extends EnvoyRequestParams {
  /**
   * on what condition shall envoy retry
   */
  readonly retryOn: GrpcRetryOn[];

  /**
   * Setting the retry policies, if empty param is given will not generate any headers but using
   * the default setting in Envoy's config
   * @param params the params for initialize the request params
   */
  constructor(context: EnvoyContext, params?: EnvoyGrpcRequestInit) {
    const { maxRetries, retryOn, timeout, perTryTimeout, headers }: EnvoyGrpcRequestInit = {
      maxRetries: -1,
      retryOn: [],
      timeout: -1,
      perTryTimeout: -1,
      headers: {},
      ...params,
    };
    super(context, maxRetries, timeout, perTryTimeout, headers);
    this.retryOn = retryOn;
  }

  /**
   * assemble the request headers for setting retry.
   */
  assembleRequestMeta(): Metadata {
    const metadata = httpHeader2Metadata({
      ...this.context.assembleTracingHeader(),
      ...this.customHeaders,
    });

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
