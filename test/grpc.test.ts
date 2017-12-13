import EnvoyContext from "../src/envoy-context";
import GrpcTestServer from "./lib/grpc-test-server";

describe("GRPC Test", () => {
  it("boot the server", async () => {
    const server = new GrpcTestServer();
    await server.start();
    await server.stop();
  });
});
