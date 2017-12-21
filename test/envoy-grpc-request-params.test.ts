import { httpHeader2Metadata } from "../src/envoy-node-boilerplate";

describe("http header to metadata", () => {
  it("should convert header to metadata correctly", () => {
    const meta = httpHeader2Metadata({
      key: "value",
      doubleKey: ["value2", "value3"]
    });

    const [value] = meta.get("key");
    expect(value).toBe("value");

    const [value2, value3] = meta.get("doubleKey");
    expect(value2).toBe("value2");
    expect(value3).toBe("value3");
  });
});
