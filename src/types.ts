import {
  ChannelCredentials,
  Client,
  Metadata,
  requestCallback,
  ClientWritableStream,
  ClientReadableStream,
  ClientDuplexStream
} from "grpc";
import EnvoyContext from "./envoy-context";
import { EnvoyGrpcRequestInit } from "./envoy-grpc-request-params";

/**
 * the HTTP header signature
 */
export interface HttpHeader {
  [s: string]: string | string[];
}

/**
 * original constructor of gRPC
 */
export interface ClientConstructor {
  new (address: string, credentials: ChannelCredentials, options?: object): Client;
}

/**
 * the API call
 * @param request the request body
 * @param options the option like timeout, retry, etc.
 */
export type RequestFunc = (request: any, options?: EnvoyGrpcRequestInit) => Promise<any>;

export type ClientStreamFunc = (
  callback: requestCallback<any>,
  options?: EnvoyGrpcRequestInit
) => ClientWritableStream<any>;

export type ServerStreamFunc = (
  request: any,
  options?: EnvoyGrpcRequestInit
) => ClientReadableStream<any>;

export type BidiStreamFunc = (options?: EnvoyGrpcRequestInit) => ClientDuplexStream<any, any>;

export interface EnvoyClientFuncEnabled {
  /**
   * the API signature, dynamic attached for each gRPC request
   */
  [methodName: string]: RequestFunc | ClientStreamFunc | ServerStreamFunc | BidiStreamFunc | any;
}

/**
 * the envoy client for gRPC
 */
export interface EnvoyClient extends Client, EnvoyClientFuncEnabled {
  /**
   * the original target remote address (hostname:port)
   */
  readonly originalAddress: string;
  /**
   * the envoy context of this client
   */
  readonly envoyContext: EnvoyContext;
}

/**
 * the wrapped class generator of EnvoyClient
 */
export interface EnvoyClientConstructor<T extends EnvoyClient> {
  /**
   * create a new instance of Envoy client
   * @param address the address of remote target server
   * @param ctx the context, you can either tell me EnvoyContext, grpc.Metadata, or HttpHeader.
   *  for the last two option, I will create EnvoyContext base of them.
   */
  new (address: string, ctx: EnvoyContext | Metadata | HttpHeader): T;
}
