import { HttpHeader } from "./types";
import { Metadata } from "grpc";

export const ENVOY_DEFAULT_EGRESS_PORT = 12345;
export const ENVOY_DEFAULT_EGRESS_ADDR = "127.0.0.1";

export const ENVOY_EGRESS_PORT =
  parseInt(process.env.ENVOY_EGRESS_PORT || `${ENVOY_DEFAULT_EGRESS_PORT}`, 10) ||
  ENVOY_DEFAULT_EGRESS_PORT;
export const ENVOY_EGRESS_ADDR = process.env.ENVOY_EGRESS_ADDR || ENVOY_DEFAULT_EGRESS_ADDR;

export const X_B3_TRACEID = "x-b3-traceid";
export const X_B3_SPANID = "x-b3-spanid";
export const X_B3_PARENTSPANID = "x-b3-parentspanid";
export const X_B3_SAMPLED = "x-b3-sampled";
export const X_B3_FLAGS = "x-b3-flags";
export const X_OT_SPAN_CONTEXT = "x-ot-span-context";
export const X_REQUEST_ID = "x-request-id";
export const X_CLIENT_TRACE_ID = "x-client-trace-id";

export const X_ENVOY_EXPECTED_RQ_TIMEOUT_MS = "x-envoy-expected-rq-timeout-ms";

export const X_ENVOY_OVERLOADED = "x-envoy-overloaded";
export const X_ENVOY_UPSTREAM_SERVICE_TIME = "x-envoy-upstream-service-time";

export default class EnvoyContext {
  /**
   * the binded address of envoy egress
   */
  readonly envoyEgressAddr: string;

  /**
   * The port local Envoy listening on for egress traffic.
   * (So all the egress will be sent to that port)
   */
  readonly envoyEgressPort: number;

  /**
   * The x-b3-traceid HTTP header is used by the Zipkin tracer in Envoy. The TraceId
   * is 64-bit in length and indicates the overall ID of the trace. Every span in a
   * trace shares this ID.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly traceId: string;

  /**
   * The x-b3-spanid HTTP header is used by the Zipkin tracer in Envoy. The SpanId is
   * 64-bit in length and indicates the position of the current operation in the trace
   * tree. The value should not be interpreted: it may or may not be derived from the
   * value of the TraceId.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly spanId: string;

  /**
   * The x-b3-parentspanid HTTP header is used by the Zipkin tracer in Envoy. The
   * ParentSpanId is 64-bit in length and indicates the position of the parent operation
   * in the trace tree. When the span is the root of the trace tree, the ParentSpanId
   * is absent.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly parentSpanId: string;

  /**
   * The x-b3-sampled HTTP header is used by the Zipkin tracer in Envoy. When the Sampled
   * flag is 1, the soan will be reported to the tracing system. Once Sampled is set to
   * 0 or 1, the same value should be consistently sent downstream.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly sampled: string;

  /**
   * The x-b3-flags HTTP header is used by the Zipkin tracer in Envoy. The encode one or
   * more options. For example, Debug is encoded as X-B3-Flags: 1.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly flags: string;

  /**
   * The x-ot-span-context HTTP header is used by Envoy to establish proper parent-child
   * relationships between tracing spans. This header can be used with both LightStep and
   * Zipkin tracers. For example, an egress span is a child of an ingress span (if the
   * ingress span was present). Envoy injects the x-ot-span-context header on ingress
   * requests and forwards it to the local service. Envoy relies on the application to
   * propagate x-ot-span-context on the egress call to an upstream.
   * See more on tracing here <https://www.envoyproxy.io/docs/envoy/v1.5.0/intro/arch_overview/tracing.html#arch-overview-tracing>.
   */
  readonly otSpanContext: string;

  /**
   * The x-request-id header is used by Envoy to uniquely identify a request as well as
   * perform stable access logging and tracing. Envoy will generate an x-request-id header
   * for all external origin requests (the header is sanitized). It will also generate an
   * x-request-id header for internal requests that do not already have one. This means that
   * x-request-id can and should be propagated between client applications in order to have
   * stable IDs across the entire mesh. Due to the out of process architecture of Envoy,
   * the header can not be automatically forwarded by Envoy itself. This is one of the few
   * areas where a thin client library is needed to perform this duty. How that is done is
   * out of scope for this documentation. If x-request-id is propagated across all hosts,
   * the following features are available:
   * - Stable access logging via the v1 API runtime filter or the v2 API runtime filter.
   * - Stable tracing when performing random sampling via the tracing.random_sampling runtime
   *   setting or via forced tracing using the x-envoy-force-trace and x-client-trace-id headers.
   */
  readonly requestId: string;

  /**
   * If an external client sets this header, Envoy will join the provided trace ID with
   * the internally generated x-request-id.
   */
  readonly clientTraceId: string;

  /**
   * This is the time in milliseconds the router expects the request to be completed. Envoy
   * sets this header so that the upstream host receiving the request can make decisions based
   * on the request timeout, e.g., early exit. This is set on internal requests and is either
   * taken from the x-envoy-upstream-rq-timeout-ms header or the route timeout, in that order.
   */
  readonly expectedRequestTimeout: number;

  constructor(
    meta: HttpHeader | Metadata,
    envoyEgressPort = ENVOY_EGRESS_PORT,
    envoyEgressAddr = ENVOY_EGRESS_ADDR
  ) {
    this.envoyEgressPort = envoyEgressPort;
    this.envoyEgressAddr = envoyEgressAddr;

    if (meta instanceof Metadata) {
      const metadata: Metadata = meta;
      this.traceId = metadata.get(X_B3_TRACEID).toString();
      this.spanId = metadata.get(X_B3_SPANID).toString();
      this.parentSpanId = metadata.get(X_B3_PARENTSPANID).toString();
      this.sampled = metadata.get(X_B3_SAMPLED).toString();
      this.flags = metadata.get(X_B3_FLAGS).toString();
      this.otSpanContext = metadata.get(X_OT_SPAN_CONTEXT).toString();
      this.requestId = metadata.get(X_REQUEST_ID).toString();
      this.clientTraceId = metadata.get(X_CLIENT_TRACE_ID).toString();
      this.expectedRequestTimeout = parseInt(
        metadata.get(X_ENVOY_EXPECTED_RQ_TIMEOUT_MS).toString(),
        10
      );
    } else {
      const httpHeader: HttpHeader = meta;
      this.traceId = httpHeader[X_B3_TRACEID];
      this.spanId = httpHeader[X_B3_SPANID];
      this.parentSpanId = httpHeader[X_B3_PARENTSPANID];
      this.sampled = httpHeader[X_B3_SAMPLED];
      this.flags = httpHeader[X_B3_FLAGS];
      this.otSpanContext = httpHeader[X_OT_SPAN_CONTEXT];
      this.requestId = httpHeader[X_REQUEST_ID];
      this.clientTraceId = httpHeader[X_CLIENT_TRACE_ID];
      this.expectedRequestTimeout = parseInt(httpHeader[X_ENVOY_EXPECTED_RQ_TIMEOUT_MS], 10);
    }
  }

  /**
   * Assemble the required tracing headers that required for propagation.
   * See more here <https://www.envoyproxy.io/docs/envoy/v1.5.0/intro/arch_overview/tracing.html#trace-context-propagation>
   */
  assembleTracingHeader(): HttpHeader {
    return {
      [X_B3_TRACEID]: this.traceId,
      [X_B3_SPANID]: this.spanId,
      [X_B3_PARENTSPANID]: this.parentSpanId,
      [X_B3_SAMPLED]: this.sampled,
      [X_B3_FLAGS]: this.flags,
      [X_OT_SPAN_CONTEXT]: this.otSpanContext,
      [X_REQUEST_ID]: this.requestId,
      [X_CLIENT_TRACE_ID]: this.clientTraceId
    };
  }
}
