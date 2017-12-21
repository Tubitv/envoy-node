import http from "http";
import EnvoyHttpClient from "../src/envoy-http-client";
import EnvoyContext from "../src/envoy-context";

let TEST_PORT = 12345;

describe("envoy http client status code test", () => {
  let contentType: string | undefined;
  let body: string | undefined;
  let statusCode: number;
  let testPort: number;

  const server = http.createServer((req, res) => {
    res.statusCode = statusCode;
    if (contentType) {
      res.setHeader("content-type", contentType);
    }
    if (body) {
      res.write(body);
    }
    res.end();
  });

  beforeEach(() => {
    contentType = undefined;
    body = undefined;
    statusCode = 200;
    testPort = TEST_PORT++;
    server.listen(testPort);
  });

  afterEach(() => {
    server.close();
  });

  it("should process 404 correctly (json)", async () => {
    contentType = "application/json";
    body = '{ "description": "NOT FOUND" }';
    statusCode = 404;

    const client = new EnvoyHttpClient(new EnvoyContext({}, testPort));

    let notFoundHappended = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(404);
      expect(e.description).toBe("NOT FOUND");
      notFoundHappended = true;
    }

    expect(notFoundHappended).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process 404 correctly (text/plain)", async () => {
    contentType = "text/plain";
    body = "NOT FOUND";
    statusCode = 404;

    const client = new EnvoyHttpClient(new EnvoyContext({}, testPort));

    let notFoundHappended = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(404);
      expect(e.message).toBe("NOT FOUND");
      notFoundHappended = true;
    }

    expect(notFoundHappended).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process 204 correctly", async () => {
    statusCode = 204;

    const client = new EnvoyHttpClient(new EnvoyContext({}, testPort));
    const response = await client.get("http://foo/bar");
    expect(response).toBe(undefined);
  });

  it("should process neithor json nor text correctly (no content-type)", async () => {
    statusCode = 200;
    body = "no content type is provided";

    const client = new EnvoyHttpClient(new EnvoyContext({}, testPort));

    let notFoundHappended = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(200);
      expect(e.message).toBe("Unexpected content type: null, http status: 200");
      notFoundHappended = true;
    }

    expect(notFoundHappended).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process neithor json nor text correctly (application/bin)", async () => {
    statusCode = 200;
    contentType = "application/bin";
    body = "i pretend i am bin";

    const client = new EnvoyHttpClient(new EnvoyContext({}, testPort));

    let notFoundHappended = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(200);
      expect(e.message).toBe("Unexpected content type: application/bin, http status: 200");
      notFoundHappended = true;
    }

    expect(notFoundHappended).toBeTruthy();
    expect(noException).toBeFalsy();
  });
});
