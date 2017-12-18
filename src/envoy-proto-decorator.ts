import {
  credentials,
  ServiceDefinition,
  Metadata,
  ServiceError,
  ChannelCredentials,
  Client
} from "grpc";
import EnvoyContext from "./envoy-context";
import EnvoyGrpcRequestParams, { EnvoyGrpcRequestInit } from "./envoy-grpc-request-params";
import { debug } from "util";

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
  new (address: string, envoyContext: EnvoyContext): EnvoyClient;
}

/**
 * this method will decorate the client constructor to
 * 1. enable envoy context
 * 2. using async syntax
 *
 * TODO: optimize the typing if the typing of gRPC is updated
 * @param constructor Client constructor
 */
export default function envoyProtoDecorator(
  constructor: ClientConstructor
): EnvoyClientConstructor {
  const constructorAlias: any = constructor;
  const { service }: { service: ServiceDefinition } = constructorAlias;
  const clazz = class extends constructor {
    readonly originalAddress: string;
    readonly envoyContext: EnvoyContext;

    constructor(address: string, envoyContext: EnvoyContext) {
      super(
        `${envoyContext.envoyEgressAddr}:${envoyContext.envoyEgressPort}`,
        credentials.createInsecure()
      );
      this.originalAddress = address;
      this.envoyContext = envoyContext;
    }
  };

  const prototype = clazz.prototype as EnvoyClientFuncEnabled;

  for (const name in Object.keys(service)) {
    // tslint:disable-next-line:only-arrow-functions
    prototype[name] = async function(request: any, options?: EnvoyGrpcRequestInit) {
      const that = this as EnvoyClient;
      const params = new EnvoyGrpcRequestParams(that.envoyContext, options);
      return new Promise((resolve, reject) => {
        constructor.prototype[name].call(
          that,
          request,
          params.assembleRequestMeta(),
          {
            host: that.originalAddress
          },
          (error: ServiceError, response: any) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(response);
          }
        );
      });
    };

    const method: any = service[name];
    const { originalName }: { originalName?: string } = method;
    if (originalName) {
      prototype[originalName] = prototype[name];
    }
  }

  return clazz;
}
