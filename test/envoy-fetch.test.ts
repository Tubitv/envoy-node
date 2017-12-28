import envoyFetch from "../src/envoy-fetch";
import EnvoyHttpRequestParams from "../src/envoy-http-request-params";
import EnvoyContext from "../src/envoy-context";

describe("envoy-fetch test", () => {
  it("should throw Error for invalid url", () => {
    expect.assertions(1);
    const param = new EnvoyHttpRequestParams(new EnvoyContext({}));
    envoyFetch(param, "invalid url").catch((e: Error) => {
      expect(e.message).toBe("Cannot read the URL for envoy to fetch");
    });
  });

  it("should throw Error for http url", () => {
    expect.assertions(1);
    const param = new EnvoyHttpRequestParams(new EnvoyContext({}));
    envoyFetch(param, "https://foo/bar").catch((e: Error) => {
      expect(e.message).toBe(
        "envoy fetch is designed only for http for now, current found: https://foo/bar"
      );
    });
  });
});
