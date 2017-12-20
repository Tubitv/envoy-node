import fetch from "node-fetch";
import { APPLICATION_JSON } from "../../src/envoy-http-client";
import { HttpHeader } from "../../src/types";

export default async function simplePost(
  url: string,
  body: any,
  header?: HttpHeader
): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "content-type": APPLICATION_JSON,
      accept: APPLICATION_JSON,
      ...header
    },
    method: "POST",
    body: JSON.stringify(body)
  });

  const statusCode = response.status;
  const json = await response.json();
  if (statusCode !== 200) {
    json.$statusCode = statusCode;
    throw json;
  }
  return json;
}
