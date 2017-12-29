import http, { Server, IncomingMessage, ServerResponse } from "http";
import { APPLICATION_JSON } from "../../src/envoy-http-client";
import CommonTestServer from "./common-test-server";

export interface HttpError extends Error {
  statusCode?: number;
}

export interface Request extends IncomingMessage {
  body?: any;
}

function stringifyError(err: Error) {
  return JSON.stringify(err, Object.getOwnPropertyNames(err));
}

export default abstract class HttpTestServer extends CommonTestServer {
  readonly server: Server;

  constructor(serverId: number, useManagedHostHeader = false) {
    super("./envoy-http-config.yaml", serverId, useManagedHostHeader);
    this.server = http.createServer(this.processRequest);
  }

  abstract async wrapper(request: Request): Promise<any>;
  abstract async inner(request: Request): Promise<any>;

  private callAsync(
    request: Request,
    asyncFunc: (request: any) => Promise<any>,
    res: ServerResponse
  ): void {
    asyncFunc
      .call(this, request)
      .then((response: any) => {
        res.statusCode = 200;
        res.write(JSON.stringify(response));
        res.end();
      })
      .catch((err: HttpError) => {
        res.statusCode = err.statusCode || 500;
        res.write(stringifyError(err));
        res.end();
      });
  }

  private processRequest = (req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", APPLICATION_JSON);
      if (req.method === "POST") {
        const request = req as Request;
        request.body = JSON.parse(body);
        if (req.url === "/wrapper") {
          this.callAsync(request, this.wrapper, res);
          return;
        } else if (req.url === "/inner") {
          this.callAsync(request, this.inner, res);
          return;
        }
      }
      res.statusCode = 404;
      res.write(stringifyError(new Error("HTTP 404 NOT FOUND")));
      res.end();
    });
  };

  async start() {
    this.server.listen(this.servicePort);
    // start server
    await super.start();
  }

  async stop() {
    await super.stop();
    this.server.close();
  }
}
