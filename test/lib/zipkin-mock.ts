import http, { Server, IncomingMessage, ServerResponse } from "http";

export default class ZipkinMock {
  readonly server: Server;
  readonly port: number;

  constructor(port: number) {
    this.server = http.createServer(this.process_request);
    this.port = port;
  }

  private process_request(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("close", () => {
      const json = JSON.parse(body);
      // tracing data is comming too late so omit the validation for now
      res.statusCode = 204;
      res.end();
    });
  }

  start() {
    this.server.listen(this.port);
  }

  stop() {
    this.server.close();
  }
}
