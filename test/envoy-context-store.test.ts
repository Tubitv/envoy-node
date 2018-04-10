import EnvoyContext from "../src/envoy-context";
import store, { EliminateStore, NodeInfo } from "../src/envoy-context-store";
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
    expect(store.isEnabled()).toBeTruthy();
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
    expect(store.getStoreImpl().size()).toBe(0);
    expect(store.getStoreImpl().oldSize()).toBe(0);
  });

  it("should trace error when set context if store is not enabled", () => {
    const originalTrace = console.trace;
    console.trace = jest.fn();
    store.set(new EnvoyContext({}));
    expect(console.trace).toBeCalled();
    console.trace = originalTrace;
  });

  it("should trace error when get context if store is not enabled", () => {
    const originalTrace = console.trace;
    console.trace = jest.fn();
    expect(store.get()).toBeUndefined();
    expect(console.trace).toBeCalled();
    console.trace = originalTrace;
  });

  it("should trace error when enable / disable twice", () => {
    const originalTrace = console.trace;
    console.trace = jest.fn();
    store.enable();
    store.enable();
    expect(console.trace).toBeCalled();
    console.trace = jest.fn();
    store.disable();
    store.disable();
    expect(console.trace).toBeCalled();
    console.trace = originalTrace;
  });

  it("Eliminate Store should works", () => {
    const es = new EliminateStore();
    expect(es.get(1)).toBeUndefined();
    expect(es.size()).toBe(0);
    expect(es.oldSize()).toBe(0);

    const info = new NodeInfo(1);
    es.set(1, info);
    expect(es.get(1)).toBe(info);
    expect(es.size()).toBe(1);
    expect(es.oldSize()).toBe(0);

    const oldTime = es.getLastEliminateTime();
    es.eliminate();
    expect(es.size()).toBe(0);
    expect(es.oldSize()).toBe(1);
    expect(es.getLastEliminateTime()).toBeGreaterThan(oldTime);

    const info2 = new NodeInfo(2);
    es.set(2, info2);
    expect(es.get(2)).toBe(info2);
    expect(es.size()).toBe(1);
    expect(es.oldSize()).toBe(1);

    expect(es.get(1)).toBe(info);
    expect(es.size()).toBe(2);
    expect(es.oldSize()).toBe(1);

    es.delete(1);
    expect(es.size()).toBe(1);
    expect(es.oldSize()).toBe(0);
    expect(es.get(1)).toBeUndefined();
    expect(es.get(2)).toBe(info2);

    es.clear();
    expect(es.size()).toBe(0);
    expect(es.oldSize()).toBe(0);
  });

  it("should set eliminate interval works", () => {
    expect(store.getEliminateInterval()).toBe(300 * 1000);
    store.setEliminateInterval(1);
    expect(store.getEliminateInterval()).toBe(1);
  });
});
