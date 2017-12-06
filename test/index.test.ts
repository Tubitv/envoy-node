import EnvoyContext from "../src/envoy-context";

/**
 * Dummy test
 */
describe("Dummy test", () => {
  it("works if true is truthy", () => {
    expect(true).toBeTruthy();
  });

  it("DummyClass is instantiable", () => {
    expect(new EnvoyContext({})).toBeInstanceOf(EnvoyContext);
  });
});
