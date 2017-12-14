import grpc, { ServerUnaryCall, sendUnaryData } from "grpc";
import CommonTestServer from "./common-test-server";

const PROTO_PATH = __dirname + "/ping.proto";
const testProto: any = grpc.load(PROTO_PATH).test;
export const { Ping } = testProto;

export default abstract class GrpcTestServer extends CommonTestServer {
  readonly server: grpc.Server;

  constructor() {
    super("./envoy-grpc-config.yaml");
    this.server = new grpc.Server();
    this.server.addService(Ping.service, {
      wrapper: this.wrapper.bind(this),
      inner: this.inner.bind(this)
    });
    this.server.bind(
      `${GrpcTestServer.bindHost}:${this.servicePort}`,
      grpc.ServerCredentials.createInsecure()
    );
  }

  abstract wrapper(call: ServerUnaryCall, callback: sendUnaryData): void;

  abstract inner(call: ServerUnaryCall, callback: sendUnaryData): void;

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
