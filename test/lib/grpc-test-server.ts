import grpc, {
  ServerUnaryCall,
  sendUnaryData,
  ServiceError,
  ServerReadableStream,
  ServerWriteableStream,
  ServerDuplexStream
} from "grpc";
import CommonTestServer from "./common-test-server";
import envoyProtoDecorator from "../../src/envoy-proto-decorator";
import { EnvoyClientConstructor } from "../../src/types";

const PROTO_PATH = __dirname + "/ping.proto";
const testProto: any = grpc.load(PROTO_PATH).test;
export const { Ping } = testProto;
// tslint:disable-next-line:variable-name
export const PingEnvoyClient: EnvoyClientConstructor = envoyProtoDecorator(Ping);

function wrapImpl(func: (call: ServerUnaryCall) => Promise<any>) {
  return (call: ServerUnaryCall, callback: sendUnaryData) => {
    func(call)
      .then(result => {
        // tslint:disable-next-line:no-null-keyword
        callback(null, result);
      })
      .catch(reason => {
        callback(reason, undefined);
      });
  };
}

export default abstract class GrpcTestServer extends CommonTestServer {
  readonly server: grpc.Server;

  constructor(serverId: number) {
    super("./envoy-grpc-config.yaml", serverId);
    this.server = new grpc.Server();
    this.server.addService(Ping.service, {
      wrapper: wrapImpl(this.wrapper.bind(this)),
      inner: wrapImpl(this.inner.bind(this)),
      clientStream: this.clientStream.bind(this),
      serverStream: this.serverStream.bind(this),
      bidiStream: this.bidiStream.bind(this)
    });
    this.server.bind(
      `${GrpcTestServer.bindHost}:${this.servicePort}`,
      grpc.ServerCredentials.createInsecure()
    );
  }

  async wrapper(call: ServerUnaryCall): Promise<any> {
    console.log("client requested:", call.request);
    return { message: "pong" };
  }

  async inner(call: ServerUnaryCall): Promise<any> {
    console.log("client requested:", call.request);
    return { message: "pong" };
  }

  clientStream(call: ServerReadableStream, callback: sendUnaryData): void {
    call.on("data", data => {
      console.log("got data from client:", data);
    });
    call.on("error", err => {
      callback(err, undefined);
    });
    call.on("end", () => {
      callback(undefined, { message: "default client stream implementation." });
    });
  }

  serverStream(call: ServerWriteableStream): void {
    console.log("client requested:", call.request);
    call.write({ message: "server send a message" });
    call.on("end", () => {
      call.end();
    });
  }

  bidiStream(call: ServerDuplexStream): void {
    console.log("should have metadata?", call);
    call.write({ message: "server send a message" });
    call.on("data", data => {
      //
    });
    call.on("end", () => {
      call.end();
    });
  }

  async start() {
    this.server.start();
    // start server
    await super.start();
  }

  async stop() {
    await super.stop();
    this.server.forceShutdown();
  }
}
