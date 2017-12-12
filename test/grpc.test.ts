import EnvoyContext from "../src/envoy-context";
import GrpcTestServer from "./lib/grpc-test-server";

/**
 * Dummy test
 */
describe("Dummy test", () => {
  it("works if true is truthy", () => {
    expect(true).toBeTruthy();
  });

  it("DummyClass is instantiable", () => {
    expect(new EnvoyContext({})).toBeInstanceOf(EnvoyContext);
    const server = new GrpcTestServer();
    server.stop();
  });
});
