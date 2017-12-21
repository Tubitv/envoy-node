import EnvoyContext, {
  readMetaAsStringOrUndefined,
  readHeaderOrUndefined,
  assignHeader
} from "../src/envoy-context";
import { Metadata } from "grpc";
import { HttpHeader } from "../src/types";

describe("Envoy context test", () => {
  it("should return the meta element if exist", () => {
    const meta = new Metadata();
    meta.add("key", "value");
    meta.add("key", "value2");
    expect(readMetaAsStringOrUndefined(meta, "key")).toBe("value");
    expect(readMetaAsStringOrUndefined(meta, "key-not-exist")).toBe(undefined);
  });

  it("should return the header element if exist", () => {
    const header: HttpHeader = {
      key: "value",
      doubleKey: ["value1", "value2"]
    };

    expect(readHeaderOrUndefined(header, "key")).toBe("value");
    expect(readHeaderOrUndefined(header, "doubleKey")).toBe("value1");
    expect(readHeaderOrUndefined(header, "not-ex-key")).toBe(undefined);
  });

  it("shoulud assign header correctly", () => {
    const header: HttpHeader = {};
    assignHeader(header, "string", "value");
    assignHeader(header, "number", 1);
    assignHeader(header, "zero", 0);
    assignHeader(header, "NaN", NaN);
    // tslint:disable-next-line:no-null-keyword
    assignHeader(header, "null", null);
    assignHeader(header, "undefined", undefined);
    expect(header.string).toBe("value");
    expect(header.number).toBe("1");
    expect(header.zero).toBe("0");
    expect(Object.hasOwnProperty.call(header, "NaN")).toBeFalsy();
    expect(Object.hasOwnProperty.call(header, "null")).toBeFalsy();
    expect(Object.hasOwnProperty.call(header, "undefined")).toBeFalsy();
  });

  it("should use envoy default config if no information is found", () => {
    const ctx = new EnvoyContext({});
    expect(ctx.envoyEgressAddr).toBe("127.0.0.1");
    expect(ctx.envoyEgressPort).toBe(12345);
  });
});
