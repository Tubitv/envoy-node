import { HttpHeader } from '../types/index'

export const ENVOY_DEFAULT_EGRESS_PORT = 12345

export const ENVOY_EGRESS_PORT =
  parseInt(
    process.env.ENVOY_EGRESS_PORT || `${ENVOY_DEFAULT_EGRESS_PORT}`,
    10
  ) || ENVOY_DEFAULT_EGRESS_PORT

export const X_B3_TRACEID = 'x-b3-traceid'
export const X_B3_SPANID = 'x-b3-spanid'
export const X_B3_PARENTSPANID = 'x-b3-parentspanid'
export const X_B3_SAMPLED = 'x-b3-sampled'
export const X_B3_FLAGS = 'x-b3-flags'
export const X_OT_SPAN_CONTEXT = 'x-ot-span-context'
export const X_REQUEST_ID = 'x-request-id'
export const X_CLIENT_TRACE_ID = 'x-client-trace-id'

export default class EnvoyContext {
  envoyEgressPort: number

  traceId: string
  spanId: string
  parentSpanId: string
  sampled: string // either 0 or 1
  flags: string
  otSpanContext: string
  requestId: string
  clientTraceId: string

  constructor(httpHeader: HttpHeader, envoyEgressPort = ENVOY_EGRESS_PORT) {
    this.envoyEgressPort = envoyEgressPort

    this.traceId = httpHeader[X_B3_TRACEID]
    this.spanId = httpHeader[X_B3_SPANID]
    this.parentSpanId = httpHeader[X_B3_PARENTSPANID]
    this.sampled = httpHeader[X_B3_SAMPLED]
    this.flags = httpHeader[X_B3_FLAGS]
    this.otSpanContext = httpHeader[X_OT_SPAN_CONTEXT]
    this.requestId = httpHeader[X_REQUEST_ID]
    this.clientTraceId = httpHeader[X_CLIENT_TRACE_ID]
  }

  assembleHeader(): HttpHeader {
    return {
      [X_B3_TRACEID]: this.traceId,
      [X_B3_SPANID]: this.spanId,
      [X_B3_PARENTSPANID]: this.parentSpanId,
      [X_B3_SAMPLED]: this.sampled,
      [X_B3_FLAGS]: this.flags,
      [X_OT_SPAN_CONTEXT]: this.otSpanContext,
      [X_REQUEST_ID]: this.requestId,
      [X_CLIENT_TRACE_ID]: this.clientTraceId
    }
  }
}
