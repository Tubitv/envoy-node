import http, { Server, IncomingMessage, ServerResponse } from "http";

export default class ZipkinMock {
  readonly server: Server;
  readonly port: number;

  constructor(port: number) {
    this.server = http.createServer(this.process_request);
    this.port = port;
  }

  private process_request(req: IncomingMessage, res: ServerResponse) {
    //
  }

  start() {
    this.server.listen(this.port);
  }

  stop() {
    this.server.close();
  }
}
