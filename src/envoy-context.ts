import { HttpHeader } from "./types";
import { Metadata } from "grpc";
import { isNumber } from "util";

const ENVOY_DEFAULT_EGRESS_PORT = 12345;
const ENVOY_DEFAULT_EGRESS_ADDR = "127.0.0.1";

const ENVOY_EGRESS_PORT = parseInt(
  process.env.ENVOY_EGRESS_PORT || `${ENVOY_DEFAULT_EGRESS_PORT}`,
  10
);
const ENVOY_EGRESS_ADDR = process.env.ENVOY_EGRESS_ADDR || ENVOY_DEFAULT_EGRESS_ADDR;

const X_B3_TRACEID = "x-b3-traceid";
const X_B3_SPANID = "x-b3-spanid";
const X_B3_PARENTSPANID = "x-b3-parentspanid";
const X_B3_SAMPLED = "x-b3-sampled";
const X_B3_FLAGS = "x-b3-flags";
const X_OT_SPAN_CONTEXT = "x-ot-span-context";
const X_REQUEST_ID = "x-request-id";
const X_CLIENT_TRACE_ID = "x-client-trace-id";

const X_ENVOY_EXPECTED_RQ_TIMEOUT_MS = "x-envoy-expected-rq-timeout-ms";

/**
 * the header returned by envoy telling upstream is overloaded
 * @internal
 */
export const X_ENVOY_OVERLOADED = "x-envoy-overloaded";
/**
 * the header returned by envoy telling upstream duration
 * @internal
 */
export const X_ENVOY_UPSTREAM_SERVICE_TIME = "x-envoy-upstream-service-time";

/**
 * the header set in envoy config for telling this library egress port
 */
export const X_TUBI_ENVOY_EGRESS_PORT = "x-tubi-envoy-egress-port";
/**
 * the header set in envoy config for telling this library egress address
 */
export const X_TUBI_ENVOY_EGRESS_ADDR = "x-tubi-envoy-egress-addr";

/**
 * read value of the key from meata
 * return undefined if not found or empty
 * return first one if multiple values
 * @param meta metadata
 * @param key key
 */
export function readMetaAsStringOrUndefined(meta: Metadata, key: string) {
  const value = meta.get(key);
  if (value.length > 0) {
    return value[0].toString();
  }
  return undefined;
}

/**
 * read value of the key from header
 * return undefined if not found or empty
 * return first one if multiple values
 * @param header the header
 * @param key the key
 */
export function readHeaderOrUndefined(header: HttpHeader, key: string) {
  const value = header[key];
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * assign key value to header, skip empty value
 * @param header the http header
 * @param key the key
 * @param value the value
 */
export function assignHeader(
  header: HttpHeader,
  key: string,
  value: string | number | undefined | null
) {
  if (value === undefined || value === null) return;
  if (isNumber(value)) {
    if (isNaN(value)) {
      return;
    }
    header[key] = `${value}`;
  } else {
    header[key] = value;
  }
}

/**
 * EnvoyContext is where all information related to the current envoy environment.
 */
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
  readonly traceId?: string;

  /**
   * The x-b3-spanid HTTP header is used by the Zipkin tracer in Envoy. The SpanId is
   * 64-bit in length and indicates the position of the current operation in the trace
   * tree. The value should not be interpreted: it may or may not be derived from the
   * value of the TraceId.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly spanId?: string;

  /**
   * The x-b3-parentspanid HTTP header is used by the Zipkin tracer in Envoy. The
   * ParentSpanId is 64-bit in length and indicates the position of the parent operation
   * in the trace tree. When the span is the root of the trace tree, the ParentSpanId
   * is absent.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly parentSpanId?: string;

  /**
   * The x-b3-sampled HTTP header is used by the Zipkin tracer in Envoy. When the Sampled
   * flag is 1, the soan will be reported to the tracing system. Once Sampled is set to
   * 0 or 1, the same value should be consistently sent downstream.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly sampled?: string;

  /**
   * The x-b3-flags HTTP header is used by the Zipkin tracer in Envoy. The encode one or
   * more options. For example, Debug is encoded as X-B3-Flags: 1.
   * See more on zipkin tracing here <https://github.com/openzipkin/b3-propagation>.
   */
  readonly flags?: string;

  /**
   * The x-ot-span-context HTTP header is used by Envoy to establish proper parent-child
   * relationships between tracing spans. This header can be used with both LightStep and
   * Zipkin tracers. For example, an egress span is a child of an ingress span (if the
   * ingress span was present). Envoy injects the x-ot-span-context header on ingress
   * requests and forwards it to the local service. Envoy relies on the application to
   * propagate x-ot-span-context on the egress call to an upstream.
   * See more on tracing here <https://www.envoyproxy.io/docs/envoy/v1.5.0/intro/arch_overview/tracing.html#arch-overview-tracing>.
   */
  readonly otSpanContext?: string;

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
  readonly requestId?: string;

  /**
   * If an external client sets this header, Envoy will join the provided trace ID with
   * the internally generated x-request-id.
   */
  readonly clientTraceId?: string;

  /**
   * This is the time in milliseconds the router expects the request to be completed. Envoy
   * sets this header so that the upstream host receiving the request can make decisions based
   * on the request timeout, e.g., early exit. This is set on internal requests and is either
   * taken from the x-envoy-upstream-rq-timeout-ms header or the route timeout, in that order.
   */
  readonly expectedRequestTimeout?: number;

  /**
   * For dev or test environment, we usually don't have Envoy running. By setting directMode = true
   * will make all the traffic being sent directly.
   */
  readonly directMode: boolean;

  /**
   * initialize an EnvoyContext
   * @param meta you can either give HTTP header for grpc.Metadata, it will be converted accordingly.
   * @param envoyEgressPort optional egress port information
   *  if not specified, it will be read from meta / environment variable ENVOY_EGRESS_PORT / default value: 12345
   *  (one after another)
   * @param envoyEgressAddr optional egress address information
   *  if not specified, it will be read from meta / environment variable ENVOY_EGRESS_ADDR / default value: 127.0.0.1
   *  (one after another)
   * @param directMode setting this to true will make all traffic sending directly without envoy. if this field is
   *  not specified, it will read from environment variable ENVOY_DIRECT_MODE equal to either `true` or `1`
   */
  constructor(
    meta: HttpHeader | Metadata,
    envoyEgressPort: number | undefined = undefined,
    envoyEgressAddr: string | undefined = undefined,
    directMode: boolean | undefined = undefined
  ) {
    let expectedRequestTimeoutString: string | undefined;
    let envoyEgressAddrFromHeader: string | undefined;
    let envoyEgressPortStringFromHeader: string | undefined;

    if (meta instanceof Metadata) {
      const metadata: Metadata = meta;
      this.traceId = readMetaAsStringOrUndefined(metadata, X_B3_TRACEID);
      this.spanId = readMetaAsStringOrUndefined(metadata, X_B3_SPANID);
      this.parentSpanId = readMetaAsStringOrUndefined(metadata, X_B3_PARENTSPANID);
      this.sampled = readMetaAsStringOrUndefined(metadata, X_B3_SAMPLED);
      this.flags = readMetaAsStringOrUndefined(metadata, X_B3_FLAGS);
      this.otSpanContext = readMetaAsStringOrUndefined(metadata, X_OT_SPAN_CONTEXT);
      this.requestId = readMetaAsStringOrUndefined(metadata, X_REQUEST_ID);
      this.clientTraceId = readMetaAsStringOrUndefined(metadata, X_CLIENT_TRACE_ID);
      expectedRequestTimeoutString = readMetaAsStringOrUndefined(
        metadata,
        X_ENVOY_EXPECTED_RQ_TIMEOUT_MS
      );
      envoyEgressAddrFromHeader = readMetaAsStringOrUndefined(metadata, X_TUBI_ENVOY_EGRESS_ADDR);
      envoyEgressPortStringFromHeader = readMetaAsStringOrUndefined(
        metadata,
        X_TUBI_ENVOY_EGRESS_PORT
      );
    } else {
      const httpHeader: HttpHeader = meta;
      this.traceId = readHeaderOrUndefined(httpHeader, X_B3_TRACEID);
      this.spanId = readHeaderOrUndefined(httpHeader, X_B3_SPANID);
      this.parentSpanId = readHeaderOrUndefined(httpHeader, X_B3_PARENTSPANID);
      this.sampled = readHeaderOrUndefined(httpHeader, X_B3_SAMPLED);
      this.flags = readHeaderOrUndefined(httpHeader, X_B3_FLAGS);
      this.otSpanContext = readHeaderOrUndefined(httpHeader, X_OT_SPAN_CONTEXT);
      this.requestId = readHeaderOrUndefined(httpHeader, X_REQUEST_ID);
      this.clientTraceId = readHeaderOrUndefined(httpHeader, X_CLIENT_TRACE_ID);
      expectedRequestTimeoutString = readHeaderOrUndefined(
        httpHeader,
        X_ENVOY_EXPECTED_RQ_TIMEOUT_MS
      );
      envoyEgressAddrFromHeader = readHeaderOrUndefined(httpHeader, X_TUBI_ENVOY_EGRESS_ADDR);
      envoyEgressPortStringFromHeader = readHeaderOrUndefined(httpHeader, X_TUBI_ENVOY_EGRESS_PORT);
    }

    if (expectedRequestTimeoutString !== undefined && expectedRequestTimeoutString !== "") {
      this.expectedRequestTimeout = parseInt(expectedRequestTimeoutString, 10);
    }

    this.envoyEgressPort =
      envoyEgressPort ||
      (envoyEgressPortStringFromHeader && parseInt(envoyEgressPortStringFromHeader, 10)) ||
      ENVOY_EGRESS_PORT;
    this.envoyEgressAddr = envoyEgressAddr || envoyEgressAddrFromHeader || ENVOY_EGRESS_ADDR;
    if (directMode === undefined) {
      this.directMode =
        process.env.ENVOY_DIRECT_MODE === "true" || process.env.ENVOY_DIRECT_MODE === "1";
    } else {
      this.directMode = directMode;
    }
  }

  /**
   * Assemble the required tracing headers that required for propagation.
   * See more here <https://www.envoyproxy.io/docs/envoy/v1.5.0/intro/arch_overview/tracing.html#trace-context-propagation>
   */
  assembleTracingHeader(): HttpHeader {
    const header: HttpHeader = {};
    assignHeader(header, X_B3_TRACEID, this.traceId);
    assignHeader(header, X_B3_SPANID, this.spanId);
    assignHeader(header, X_B3_PARENTSPANID, this.parentSpanId);
    assignHeader(header, X_B3_SAMPLED, this.sampled);
    assignHeader(header, X_B3_FLAGS, this.flags);
    assignHeader(header, X_OT_SPAN_CONTEXT, this.otSpanContext);
    assignHeader(header, X_REQUEST_ID, this.requestId);
    assignHeader(header, X_CLIENT_TRACE_ID, this.clientTraceId);
    return header;
  }
}
