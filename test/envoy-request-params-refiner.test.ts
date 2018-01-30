import { envoyRequestParamsRefiner } from "../src/envoy-node";
import EnvoyContext, { EnvoyContextInit } from "../src/envoy-context";
import { Options, OptionsWithUrl, OptionsWithUri } from "request";
import { parse, Url } from "url";

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
  });

  it("should refine the params (string url)", () => {
    const { uri, headers } = envoyRequestParamsRefiner("http://foo.bar:54321/path", {
      "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
    }) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect(uri).toBe("http://127.0.0.1:12345/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should refine the params (url field)", () => {
    const { uri, headers } = envoyRequestParamsRefiner(
      { url: "http://foo.bar:54321/path" },
      {
        "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
      }
    ) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect(uri).toBe("http://127.0.0.1:12345/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should refine the params (string uri field)", () => {
    const { uri, headers } = envoyRequestParamsRefiner(
      { uri: "http://foo.bar:54321/path" },
      {
        "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
      }
    ) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect(uri).toBe("http://127.0.0.1:12345/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should refine the params (object uri field)", () => {
    const { uri, headers } = envoyRequestParamsRefiner(
      { uri: parse("http://foo.bar:54321/path") },
      {
        "x-ot-span-context": "aaaaaaaa:bbbbbbbb:cccccccc"
      }
    ) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect(uri).toBe("http://127.0.0.1:12345/path");
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
    const { uri, headers } = envoyRequestParamsRefiner(
      "http://foo.bar:54321/path",
      new EnvoyContext(init)
    ) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect((uri as Url).href).toBe("http://foo.bar:54321/path");
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
    const { uri, headers } = envoyRequestParamsRefiner(
      "http://foo.bar:54321/path",
      new EnvoyContext(init)
    ) as OptionsWithUri;

    if (headers === undefined) {
      throw new Error();
    }

    expect((uri as Url).href).toBe("http://foo.bar:54321/path");
    expect(headers.host).toBe("foo.bar:54321");
    expect(headers["x-ot-span-context"]).toBe("aaaaaaaa:bbbbbbbb:cccccccc");
  });

  it("should return options directly if no context is supplied", () => {
    const url = "http://foo.service:12345/path";
    expect(envoyRequestParamsRefiner(url)).toEqual({ url });
    expect(envoyRequestParamsRefiner(url, undefined)).toEqual({ url });
    expect(envoyRequestParamsRefiner({ url })).toEqual({ url });
    expect(envoyRequestParamsRefiner({ url }, undefined)).toEqual({ url });
  });
});
