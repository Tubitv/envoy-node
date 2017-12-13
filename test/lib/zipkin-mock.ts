import http, { Server, IncomingMessage, ServerResponse } from "http";

export default class ZipkinMock {
  readonly server: Server;

  constructor(port: number) {
    this.server = http.createServer(this.process_request);
  }

  private process_request(req: IncomingMessage, res: ServerResponse) {
    //
  }

  start() {
    this.server.listen(port);
  }

  stop() {
    this.server.close();
  }
}
