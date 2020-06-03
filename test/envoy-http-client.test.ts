import * as http from "http";
import EnvoyHttpClient from "../src/envoy-http-client";
import EnvoyContext, { EnvoyContextInit } from "../src/envoy-context";

let TEST_PORT = 50000;

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

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );

    for (const method of ["get", "delete", "post", "patch", "put"]) {
      let notFoundHappened = false;
      let noException = false;

      try {
        await (client as any)[method]("http://foo/bar");
        noException = true;
      } catch (e) {
        expect(e.$statusCode).toBe(404);
        expect(e.description).toBe("NOT FOUND");
        notFoundHappened = true;
      }

      expect(notFoundHappened).toBeTruthy();
      expect(noException).toBeFalsy();
    }
  });

  it("should process 404 correctly (text/plain)", async () => {
    contentType = "text/plain";
    body = "NOT FOUND";
    statusCode = 404;

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );

    let notFoundHappened = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(404);
      expect(e.message).toBe("NOT FOUND");
      notFoundHappened = true;
    }

    expect(notFoundHappened).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process 204 correctly", async () => {
    statusCode = 204;

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );
    const response = await client.get("http://foo/bar");
    expect(response).toBe(undefined);
  });

  it("should process neithor json nor text correctly (no content-type)", async () => {
    statusCode = 200;
    body = "no content type is provided";

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );

    let notFoundHappened = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(200);
      expect(e.message).toBe("Unexpected content type: null, http status: 200");
      notFoundHappened = true;
    }

    expect(notFoundHappened).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process neither json nor text correctly (application/bin)", async () => {
    statusCode = 200;
    contentType = "application/bin";
    body = "i pretend i am bin";

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );

    let notFoundHappened = false;
    let noException = false;

    try {
      await client.get("http://foo/bar");
      noException = true;
    } catch (e) {
      expect(e.$statusCode).toBe(200);
      expect(e.message).toBe("Unexpected content type: application/bin, http status: 200");
      notFoundHappened = true;
    }

    expect(notFoundHappened).toBeTruthy();
    expect(noException).toBeFalsy();
  });

  it("should process text correctly", async () => {
    statusCode = 200;
    contentType = "text/plain";
    body = "hello world!";

    const client = new EnvoyHttpClient(
      new EnvoyContext({
        meta: {},
        envoyEgressPort: testPort,
      } as EnvoyContextInit)
    );

    const text = await client.get("http://foo/bar");
    expect(text).toBe(body);
  });
});
