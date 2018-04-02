import EnvoyContext from "../src/envoy-context";
import store from "../src/envoy-context-store";
import { sleep } from "./lib/utils";

class Data {
  inputCtx: EnvoyContext;
  fromSetTimeout: EnvoyContext;
  fromPromise: EnvoyContext;
  fromAsync: EnvoyContext;
}

function timeoutExec(data: Data) {
  data.fromSetTimeout = store.get();
}

function promiseExec(data: Data) {
  return Promise.resolve().then(() => {
    data.fromPromise = store.get();
  });
}

async function mainExecute(data: Data) {
  setTimeout(() => {
    timeoutExec(data);
  }, 10);
  await promiseExec(data);
  data.fromAsync = store.get();
}

async function middlewareLogic0() {
  // empty
}

async function middlewareLogic1(data: Data) {
  store.set(data.inputCtx);
}

async function middleware(data: Data) {
  await middlewareLogic0();
  await middlewareLogic1(data);
}

async function root(data: Data) {
  await middleware(data);
  await mainExecute(data);
}

describe("Envoy context store", () => {
  it("should works", async () => {
    const testData = [1, 2, 3].map(idx => {
      const data = new Data();
      data.inputCtx = new EnvoyContext({
        "x-request-id": `${idx}`
      });
      return data;
    });
    store.enable();
    for (const data of testData) {
      await root(data);
    }
    await sleep(50);
    store.disable();
    testData.forEach(data => {
      expect(data.inputCtx).toBe(data.fromAsync);
      expect(data.inputCtx).toBe(data.fromPromise);
      expect(data.inputCtx).toBe(data.fromSetTimeout);
    });
  });
});
