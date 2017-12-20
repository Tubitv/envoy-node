import fs from "fs";
import util from "util";
import { spawn, ChildProcess } from "child_process";
import ZipkinMock from "./zipkin-mock";

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

export const TEST_PORT_START = 10000;

export default abstract class CommonTestServer {
  static bindHost = "127.0.0.1";
  static domainName = "ping.pong.test";

  envoy: ChildProcess;
  readonly zipkin: ZipkinMock;
  readonly servicePort: number;
  readonly envoyIngressPort: number;
  readonly envoyEgressPort: number;
  readonly envoyAdminPort: number;
  readonly envoyConfigTemplate: string;
  readonly envoyConfigFileName: string;

  constructor(envoyConfigTemplate: string, serverId: number) {
    let port = TEST_PORT_START + serverId * 10;
    this.servicePort = port++;
    this.envoyIngressPort = port++;
    this.envoyEgressPort = port++;
    this.envoyAdminPort = port++;
    const zipkinPort = port++;
    this.zipkin = new ZipkinMock(zipkinPort);
    this.envoyConfigTemplate = `${__dirname}/${envoyConfigTemplate}`;
    this.envoyConfigFileName = `/tmp/envoy-test-config-${this.servicePort}.yaml`;
  }

  async start() {
    const envoyConfig = (await readFile(this.envoyConfigTemplate))
      .toString()
      .replace(/INGRESS_PORT/g, `${this.envoyIngressPort}`)
      .replace(/EGRESS_PORT/g, `${this.envoyEgressPort}`)
      .replace(/ADMIN_PORT/g, `${this.envoyAdminPort}`)
      .replace(/ZIPKIN_PORT/g, `${this.zipkin.port}`)
      .replace(/BIND_HOST/g, `${CommonTestServer.bindHost}`)
      .replace(/DOMAIN_NAME/g, `${CommonTestServer.domainName}`)
      .replace(/SERVICE_PORT/g, `${this.servicePort}`);
    await writeFile(this.envoyConfigFileName, envoyConfig);
    this.envoy = spawn("envoy", [
      "-c",
      this.envoyConfigFileName,
      "--service-cluster",
      "test-server"
    ]);
    this.zipkin.start();
    this.envoy.once("exit", code => {
      if (code) {
        console.log(`Envoy exited abnormal: ${code}`);
      }
    });
  }

  async stop() {
    this.envoy.kill();
    this.zipkin.stop();
    // await unlink(this.envoyConfigFileName);
    // await unlink(`/tmp/envoy-test-${this.servicePort}.ingress.log`);
    // await unlink(`/tmp/envoy-test-${this.servicePort}.egress.log`);
  }
}
