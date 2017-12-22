import { ChannelCredentials, Client, Metadata } from "grpc";
import EnvoyContext from "./envoy-context";
import { EnvoyGrpcRequestInit } from "./envoy-grpc-request-params";

/**
 * the HTTP header signature
 */
export interface HttpHeader {
  [s: string]: string | string[];
}

export interface ClientConstructor {
  new (address: string, credentials: ChannelCredentials, options?: object): Client;
}

/**
 * the API call
 * @param request the request body
 * @param options the option like timeout, retry, etc.
 */
export type RequestFunc = (request: any, options?: EnvoyGrpcRequestInit) => Promise<any>;

export interface EnvoyClientFuncEnabled {
  /**
   * the API signature, dynamic attached for each gRPC request
   */
  [methodName: string]: RequestFunc | any;
}

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

export interface EnvoyClientConstructor {
  /**
   * create a new instance of Envoy client
   * @param address the address of remote target server
   * @param ctx the context, you can either tell me EnvoyContext, grpc.Metadata, or HttpHeader.
   *  for the last two option, I will create EnvoyContext base of them.
   */
  new (address: string, ctx: EnvoyContext | Metadata | HttpHeader): EnvoyClient;
}
