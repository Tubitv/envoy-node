import { ChannelCredentials, Client, Metadata } from "grpc";
import EnvoyContext from "./envoy-context";
import { EnvoyGrpcRequestInit } from "./envoy-grpc-request-params";

export interface HttpHeader {
  [s: string]: string;
}

export interface ClientConstructor {
  new (address: string, credentials: ChannelCredentials, options?: object): Client;
}

export type RequestFunc = (request: any, options?: EnvoyGrpcRequestInit) => Promise<any>;

export interface EnvoyClientFuncEnabled {
  [methodName: string]: RequestFunc | any;
}

export interface EnvoyClient extends Client, EnvoyClientFuncEnabled {
  readonly originalAddress: string;
  readonly envoyContext: EnvoyContext;
}

export interface EnvoyClientConstructor {
  new (address: string, ctx: EnvoyContext | Metadata | HttpHeader): EnvoyClient;
}
