import { credentials, ServiceDefinition, Metadata, ServiceError } from "grpc";
import EnvoyContext from "./envoy-context";
import EnvoyGrpcRequestParams, { EnvoyGrpcRequestInit } from "./envoy-grpc-request-params";
import {
  RequestFunc,
  EnvoyClient,
  ClientConstructor,
  EnvoyClientConstructor,
  EnvoyClientFuncEnabled,
  HttpHeader
} from "./types";

function makeAsyncFunc(name: string): RequestFunc {
  return async function(this: EnvoyClient, request: any, options?: EnvoyGrpcRequestInit) {
    const params = new EnvoyGrpcRequestParams(this.envoyContext, options);
    return new Promise((resolve, reject) => {
      Object.getPrototypeOf(Object.getPrototypeOf(this))[name].call(
        this,
        request,
        params.assembleRequestMeta(),
        {
          host: this.originalAddress
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

    constructor(address: string, ctx: EnvoyContext | Metadata | HttpHeader) {
      let envoyContext: EnvoyContext;
      if (ctx instanceof EnvoyContext) {
        envoyContext = ctx;
      } else {
        envoyContext = new EnvoyContext(ctx);
      }
      super(
        `${envoyContext.envoyEgressAddr}:${envoyContext.envoyEgressPort}`,
        credentials.createInsecure()
      );
      this.originalAddress = address;
      this.envoyContext = envoyContext;
    }
  };

  const prototype = clazz.prototype as EnvoyClientFuncEnabled;

  for (const name of Object.keys(service)) {
    // tslint:disable-next-line:only-arrow-functions
    prototype[name] = makeAsyncFunc(name);

    const method: any = service[name];
    const { originalName }: { originalName?: string } = method;
    if (originalName) {
      prototype[originalName] = prototype[name];
    }
  }

  return clazz;
}
