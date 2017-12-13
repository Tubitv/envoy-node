import http, { Server, IncomingMessage, ServerResponse } from "http";

export default class ZipkinMock {
  readonly server: Server;

  constructor(port: number) {
    this.server = http.createServer(this.process_request);
    this.server.listen(port);
  }

  private process_request(req: IncomingMessage, res: ServerResponse) {
    //
  }

  stop() {
    this.server.close();
  }
}
