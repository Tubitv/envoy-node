import grpc, { ServerUnaryCall, sendUnaryData } from "grpc";
import { envoyFetch, EnvoyContext, EnvoyGrpcRequestParams } from "../../src/envoy-node-boilerplate";
import CommonTestServer from "./common-test-server";

const PROTO_PATH = __dirname + "/ping.proto";
const testProto: any = grpc.load(PROTO_PATH).test;

const response = { message: "pong" };

export default class GrpcTestServer extends CommonTestServer {
  readonly server: grpc.Server;

  constructor() {
    super("./envoy-grpc-config.yaml");
    this.server = new grpc.Server();
    this.server.addService(testProto.Ping.service, { wrapper: this.wrapper, inner: this.inner });
    this.server.bind(`localhost:${this.servicePort}`, grpc.ServerCredentials.createInsecure());
  }

  private wrapper(call: ServerUnaryCall, callback: sendUnaryData): void {
    const ctx = new EnvoyContext(call.metadata);
    const params = new EnvoyGrpcRequestParams(ctx, {
      retryOn: [],
      timeout: -1
    });
    params.assembleRequestMeta();
    // TODO
    callback(undefined, response);
  }

  private inner(call: ServerUnaryCall, callback: sendUnaryData): void {
    // TODO
    callback(undefined, response);
  }

  async start() {
    process.stdout.write("******");
    // start server
    await super.start();
    this.server.start();
  }

  async stop() {
    await super.stop();
    this.server.forceShutdown();
  }
}
