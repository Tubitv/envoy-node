import * as grpc from "@grpc/grpc-js";
// tslint:disable-next-line:no-duplicate-imports
import {
  ServerUnaryCall,
  sendUnaryData,
  ServiceError,
  ServerReadableStream,
  ServerWritableStream,
  ServerDuplexStream,
} from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import CommonTestServer from "./common-test-server";
import envoyProtoDecorator from "../../src/envoy-proto-decorator";
import {
  EnvoyClientConstructor,
  RequestFunc,
  EnvoyClient,
  ClientStreamFunc,
  ServerStreamFunc,
  BidiStreamFunc,
} from "../../src/types";

const PROTO_PATH = __dirname + "/ping.proto";
const testProto: any = grpc.loadPackageDefinition(protoLoader.loadSync(PROTO_PATH)).test;

export interface PingEnvoyClient extends EnvoyClient {
  inner: RequestFunc;
  wrapper: RequestFunc;
  clientStream: ClientStreamFunc;
  serverStream: ServerStreamFunc;
  bidiStream: BidiStreamFunc;
}

export const { Ping } = testProto;
// tslint:disable-next-line:variable-name
export const PingEnvoyClient = envoyProtoDecorator<PingEnvoyClient>(Ping);

function wrapImpl(func: (call: ServerUnaryCall<any, any>) => Promise<any>) {
  return (call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) => {
    func(call)
      .then((result) => {
        // tslint:disable-next-line:no-null-keyword
        callback(null, result);
      })
      .catch((reason) => {
        callback(reason, undefined);
      });
  };
}

export default abstract class GrpcTestServer extends CommonTestServer {
  readonly server: grpc.Server;

  constructor(serverId: number, useManagedHostHeader = false) {
    super("./envoy-grpc-config.yaml", serverId, useManagedHostHeader);
    this.server = new grpc.Server();
    this.server.addService(Ping.service, {
      wrapper: wrapImpl(this.wrapper.bind(this)),
      inner: wrapImpl(this.inner.bind(this)),
      clientStream: this.clientStream.bind(this),
      serverStream: this.serverStream.bind(this),
      bidiStream: this.bidiStream.bind(this),
    });
  }

  async wrapper(call: ServerUnaryCall<any, any>): Promise<any> {
    console.log("client requested:", call.request);
    return { message: "pong" };
  }

  async inner(call: ServerUnaryCall<any, any>): Promise<any> {
    console.log("client requested:", call.request);
    return { message: "pong" };
  }

  clientStream(call: ServerReadableStream<any, any>, callback: sendUnaryData<any>): void {
    call.on("data", (data) => {
      console.log("got data from client:", data);
    });
    call.on("error", (err) => {
      callback(err, undefined);
    });
    call.on("end", () => {
      // tslint:disable-next-line:no-null-keyword
      callback(null, { message: "default client stream implementation." });
    });
  }

  serverStream(call: ServerWritableStream<any, any>): void {
    console.log("client requested:", call.request);
    call.write({ message: "server send a message" });
    call.on("end", () => {
      call.end();
    });
  }

  bidiStream(call: ServerDuplexStream<any, any>): void {
    console.log("should have metadata?", call);
    call.write({ message: "server send a message" });
    call.on("data", (data) => {
      //
    });
    call.on("end", () => {
      call.end();
    });
  }

  async start(): Promise<undefined> {
    return new Promise((resolve) => {
      this.server.bindAsync(
        `${GrpcTestServer.bindHost}:${this.servicePort}`,
        grpc.ServerCredentials.createInsecure(),
        async () => {
          // start server
          this.server.start();
          await super.start();
          // @ts-ignore
          resolve();
        }
      );
    });
  }

  async stop() {
    await super.stop();
    this.server.forceShutdown();
  }
}
