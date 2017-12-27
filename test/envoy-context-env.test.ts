describe("Envoy context env", () => {
  it("should read envoy addr / port from ENV", () => {
    process.env.ENVOY_EGRESS_ADDR = "127.0.0.2";
    process.env.ENVOY_EGRESS_PORT = "54321";
    const envoyContext = require("../src/envoy-context");
    const ctx = new envoyContext.default({});
    expect(ctx.envoyEgressAddr).toBe("127.0.0.2");
    expect(ctx.envoyEgressPort).toBe(54321);
  });
});
