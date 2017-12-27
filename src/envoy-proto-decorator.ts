import {
  credentials,
  ServiceDefinition,
  Metadata,
  ServiceError,
  requestCallback,
  ClientWritableStream,
  ClientReadableStream,
  ClientDuplexStream
} from "grpc";
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

/**
 * this function is to assign new method to the decorated original client
 * by assigning new method, user can call the method easier with async signature
 * @param name the function name
 * @internal
 */
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
 * this is to wrap the original client stream func, to insert envoy metadata
 * @param name the name of the func
 */
function wrapClientStreamFunc(name: string) {
  return function(
    this: EnvoyClient,
    callback: requestCallback,
    options?: EnvoyGrpcRequestInit
  ): ClientWritableStream {
    const params = new EnvoyGrpcRequestParams(this.envoyContext, options);
    return Object.getPrototypeOf(Object.getPrototypeOf(this))[name].call(
      this,
      params.assembleRequestMeta(),
      {
        host: this.originalAddress
      },
      callback
    );
  };
}

/**
 * this is to wrap the original server stream func, to insert envoy metadata
 * @param name the name of the func
 */
function wrapServerStream(name: string) {
  return function(
    this: EnvoyClient,
    request: any,
    options?: EnvoyGrpcRequestInit
  ): ClientReadableStream {
    const params = new EnvoyGrpcRequestParams(this.envoyContext, options);
    return Object.getPrototypeOf(Object.getPrototypeOf(this))[name].call(
      this,
      request,
      params.assembleRequestMeta(),
      {
        host: this.originalAddress
      }
    );
  };
}

/**
 * this is to wrap the original bidirectional stream, to insert envoy metadata
 * @param name the func name
 */
function wrapBidiStream(name: string) {
  return function(this: EnvoyClient, options?: EnvoyGrpcRequestInit): ClientDuplexStream {
    const params = new EnvoyGrpcRequestParams(this.envoyContext, options);
    return Object.getPrototypeOf(Object.getPrototypeOf(this))[name].call(
      this,
      params.assembleRequestMeta(),
      {
        host: this.originalAddress
      }
    );
  };
}

/**
 * this method will decorate the client constructor to
 * 1. enable envoy context
 * 2. using async syntax for each call RPC
 *
 * Check `EnvoyClient` for more information
 *
 * TODO: optimize the typing if the typing of gRPC is updated
 * @param constructor Client constructor
 */
export default function envoyProtoDecorator<T extends EnvoyClient>(
  constructor: ClientConstructor
): EnvoyClientConstructor<T> {
  const constructorAlias: any = constructor;
  const { service }: { service: ServiceDefinition } = constructorAlias;
  const clazz = class extends constructor implements EnvoyClient {
    readonly originalAddress: string;
    readonly envoyContext: EnvoyContext;

    constructor(address: string, ctx: EnvoyContext | Metadata | HttpHeader) {
      let envoyContext: EnvoyContext;
      if (ctx instanceof EnvoyContext) {
        envoyContext = ctx;
      } else {
        envoyContext = new EnvoyContext(ctx);
      }
      const actualAddr = envoyContext.directMode
        ? address
        : `${envoyContext.envoyEgressAddr}:${envoyContext.envoyEgressPort}`;
      super(actualAddr, credentials.createInsecure());
      this.originalAddress = address;
      this.envoyContext = envoyContext;
    }
  } as EnvoyClientConstructor<T>;

  const prototype = clazz.prototype as EnvoyClientFuncEnabled;

  for (const name of Object.keys(service)) {
    const method: any = service[name];

    const { requestStream, responseStream } = method;

    if (!requestStream && !responseStream) {
      // tslint:disable-next-line:only-arrow-functions
      prototype[name] = makeAsyncFunc(name);
    } else if (method.requestStream && !method.responseStream) {
      prototype[name] = wrapClientStreamFunc(name);
    } else if (!method.requestStream && method.responseStream) {
      prototype[name] = wrapServerStream(name);
    } else {
      prototype[name] = wrapBidiStream(name);
    }

    const { originalName }: { originalName?: string } = method;
    if (originalName) {
      // should alway have
      prototype[originalName] = prototype[name];
    }
  }

  return clazz;
}
