import grpc, { ServerUnaryCall, sendUnaryData, ServiceError } from "grpc";
import CommonTestServer from "./common-test-server";
import { envoyProtoDecorator } from "../../src/envoy-node-boilerplate";

const PROTO_PATH = __dirname + "/ping.proto";
const testProto: any = grpc.load(PROTO_PATH).test;
export const { Ping } = testProto;
// tslint:disable-next-line:variable-name
export const PingEnvoyClient = envoyProtoDecorator(Ping);

function wrapImpl(
  func: (call: ServerUnaryCall) => Promise<any>,
  call: ServerUnaryCall,
  callback: sendUnaryData
): void {
  func(call)
    .then(result => {
      callback(undefined, result);
    })
    .catch(reason => {
      callback(reason, undefined);
    });
}

export default abstract class GrpcTestServer extends CommonTestServer {
  readonly server: grpc.Server;

  constructor() {
    super("./envoy-grpc-config.yaml");
    this.server = new grpc.Server();
    this.server.addService(Ping.service, {
      wrapper: wrapImpl.bind(this, this.wrapper),
      inner: wrapImpl.bind(this, this.inner)
    });
    this.server.bind(
      `${GrpcTestServer.bindHost}:${this.servicePort}`,
      grpc.ServerCredentials.createInsecure()
    );
  }

  abstract async wrapper(call: ServerUnaryCall): Promise<any>;

  abstract async inner(call: ServerUnaryCall): Promise<any>;

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
