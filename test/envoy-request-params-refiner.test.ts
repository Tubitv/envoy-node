import { envoyRequestParamsRefiner } from "../src/envoy-node";
import EnvoyContext, { EnvoyContextInit } from "../src/envoy-context";

describe("Envoy request params refiner test", () => {
  it("should throw exception for invalid params", () => {
    expect(() => {
      envoyRequestParamsRefiner("invalid url", {});
    }).toThrow();
    expect(() => {
      envoyRequestParamsRefiner("https://foo.bar/path", {});
    }).toThrow();
    expect(() => {
      envoyRequestParamsRefiner(
        {
          /* no url */
        },
        {}
      );
    }).toThrow();
    expect(() => {
      envoyRequestParamsRefiner({ url: "invalid url" }, {});
    }).toThrow();
    expect(() => {
      envoyRequestParamsRefiner({ url: "https://foo.bar/path" }, new EnvoyContext({}));
    }).toThrow();
  });

  it("should refine the params", () => {
    const { url, headers } = envoyRequestParamsRefiner("http://foo.bar:54321/path", {
      "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
    });

    if (headers === undefined) {
      throw new Error();
    }

    expect(url).toBe("http://127.0.0.1:12345/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should not change the url in direct mode", () => {
    const init: EnvoyContextInit = {
      meta: {
        "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
      },
      directMode: true
    };
    const { url, headers } = envoyRequestParamsRefiner(
      "http://foo.bar:54321/path",
      new EnvoyContext(init)
    );

    if (headers === undefined) {
      throw new Error();
    }

    expect(url).toBe("http://foo.bar:54321/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should not change the url in direct mode (base on managed host)", () => {
    const init: EnvoyContextInit = {
      meta: {
        "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
      },
      envoyManagedHosts: new Set<string>(["this.is.not.foo.bar:54321"])
    };
    const { url, headers } = envoyRequestParamsRefiner(
      "http://foo.bar:54321/path",
      new EnvoyContext(init)
    );

    if (headers === undefined) {
      throw new Error();
    }

    expect(url).toBe("http://foo.bar:54321/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });
});
