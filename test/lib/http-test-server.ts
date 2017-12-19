import http, { Server, IncomingMessage, ServerResponse } from "http";

import CommonTestServer from "./common-test-server";

export interface HttpError extends Error {
  statusCode?: number;
}

export interface Request extends IncomingMessage {
  body?: any;
}

export default abstract class HttpTestServer extends CommonTestServer {
  readonly server: Server;

  constructor() {
    super("./envoy-http-config.yaml");
    this.server = http.createServer(this.processRequest);
  }

  abstract async wrapper(request: Request): Promise<any>;
  abstract async inner(request: Request): Promise<any>;

  private callAsync(
    request: Request,
    asyncFunc: (request: any) => Promise<any>,
    res: ServerResponse
  ): void {
    asyncFunc(request)
      .then(response => {
        res.statusCode = 200;
        res.write(JSON.stringify(response));
        res.end();
      })
      .catch((err: HttpError) => {
        if (err.statusCode) {
          res.statusCode = err.statusCode;
          res.write(JSON.stringify(err));
          res.end();
        }
      });
  }

  private processRequest(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("close", () => {
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
      res.end();
    });
  }

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
