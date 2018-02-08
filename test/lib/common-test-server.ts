import fs from "fs";
import util from "util";
import { spawn, ChildProcess } from "child_process";
import ZipkinMock from "./zipkin-mock";
import { sleep } from "./utils";

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
  readonly useManagedHostHeader: boolean;

  envoyStdout = "";
  envoyStderr = "";

  constructor(envoyConfigTemplate: string, serverId: number, useManagedHostHeader: boolean) {
    let port = TEST_PORT_START + serverId * 10;
    this.servicePort = port++;
    this.envoyIngressPort = port++;
    this.envoyEgressPort = port++;
    this.envoyAdminPort = port++;
    const zipkinPort = port++;
    this.zipkin = new ZipkinMock(zipkinPort);
    this.envoyConfigTemplate = `${__dirname}/${envoyConfigTemplate}`;
    this.envoyConfigFileName = `/tmp/envoy-test-config-${this.servicePort}.yaml`;
    this.useManagedHostHeader = useManagedHostHeader;
  }

  async start() {
    let envoyConfig = (await readFile(this.envoyConfigTemplate))
      .toString()
      .replace(/INGRESS_PORT/g, `${this.envoyIngressPort}`)
      .replace(/EGRESS_PORT/g, `${this.envoyEgressPort}`)
      .replace(/ADMIN_PORT/g, `${this.envoyAdminPort}`)
      .replace(/ZIPKIN_PORT/g, `${this.zipkin.port}`)
      .replace(/BIND_HOST/g, `${CommonTestServer.bindHost}`)
      .replace(/DOMAIN_NAME/g, `${CommonTestServer.domainName}`)
      .replace(/SERVICE_PORT/g, `${this.servicePort}`);
    if (this.useManagedHostHeader) {
      envoyConfig = envoyConfig.replace(
        /# MANAGED_HOST_REPLACEMENT/g,
        `- header: { "key": "x-tubi-envoy-managed-host", "value": "${CommonTestServer.domainName}:${
          this.envoyIngressPort
        }" }`
      );
    }
    await writeFile(this.envoyConfigFileName, envoyConfig);
    this.envoy = spawn("envoy", [
      "--v2-config-only",
      "-c",
      this.envoyConfigFileName,
      "--service-cluster",
      "test-server"
    ]);
    this.zipkin.start();
    this.envoy.stdout.on("data", data => {
      this.envoyStdout += data;
    });
    this.envoy.stderr.on("data", data => {
      this.envoyStderr += data;
    });
    this.envoy.once("exit", code => {
      if (code) {
        console.log(`Envoy exited abnormal: ${code}`);
        console.log("stdout", this.envoyStdout);
        console.log("stderr", this.envoyStderr);
      }
    });
    // wait for envoy to be up
    await sleep(100);
  }

  async stop() {
    this.envoy.kill();
    this.zipkin.stop();
    await unlink(this.envoyConfigFileName);
  }
}
