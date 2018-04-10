import asyncHooks from "async_hooks";
import EnvoyContext from "./envoy-context";

/**
 * this will store the information of a node
 */
export class NodeInfo {
  /**
   * the reference count of this info,
   * init will be 1,
   * when this async execution trigger another execution,
   *  this will increase 1,
   * when this execution or one of its child execution is destroyed,
   *  this will decrease 1
   */
  referenceCount = 1;

  /**
   * who trigger this async execution
   */
  readonly triggerAsyncId: number;

  /**
   * the context set in this execution
   */
  context?: EnvoyContext = undefined;

  constructor(triggerAsyncId: number) {
    this.triggerAsyncId = triggerAsyncId;
  }
}

/**
 * Eliminate Store
 * using two map for context storage, to avoid holding too many data
 * it will eliminate the old data
 */
export class EliminateStore {
  private old = new Map<number, NodeInfo>();
  private current = new Map<number, NodeInfo>();

  private lastEliminateTime = Date.now();

  /**
   * get context
   * @param asyncId asyncId
   */
  get(asyncId: number) {
    const infoFromCurrent = this.current.get(asyncId);
    if (infoFromCurrent !== undefined) {
      return infoFromCurrent;
    }
    const infoFromOld = this.old.get(asyncId);
    if (infoFromOld !== undefined) {
      this.current.set(asyncId, infoFromOld);
    }
    return infoFromOld;
  }

  /**
   * set context
   * @param asyncId asyncId
   * @param info context info
   */
  set(asyncId: number, info: NodeInfo) {
    this.current.set(asyncId, info);
  }

  /**
   * delete context
   * @param asyncId asyncId
   */
  delete(asyncId: number) {
    this.current.delete(asyncId);
    this.old.delete(asyncId);
  }

  /**
   * clear all data
   */
  clear() {
    this.old.clear();
    this.current.clear();
  }

  /**
   * eliminate the old data
   */
  eliminate() {
    this.old = this.current;
    this.current = new Map<number, NodeInfo>();
    this.lastEliminateTime = Date.now();
  }

  /**
   * get last eliminate time
   */
  getLastEliminateTime() {
    return this.lastEliminateTime;
  }

  /**
   * the current size
   */
  size() {
    return this.current.size;
  }

  /**
   * the old store size
   */
  oldSize() {
    return this.old.size;
  }
}

const store = new EliminateStore();
let enabled = false;
let eliminateInterval = 300 * 1000; // 300s, 5 mins

/**
 * set the store's eliminate interval, context data older than this and not
 * read will be eventually eliminated
 * @param interval time in milliseconds
 */
function setEliminateInterval(interval: number) {
  eliminateInterval = interval;
}

/**
 * get eliminate interval
 */
function getEliminateInterval() {
  return eliminateInterval;
}

/**
 * clean up will decrease the reference count.
 * if the reference count is 0, it will remove it from the store and decrease its parent's reference count.
 *  and try to see if its parent needs to be clean up as well.
 * @param asyncId the asyncId of the execution needs to be cleaned up
 */
function storeCleanUp(asyncId: number) {
  const info = store.get(asyncId);
  if (info === undefined) {
    return;
  }
  info.referenceCount--;
  if (info.referenceCount === 0) {
    store.delete(asyncId);
    storeCleanUp(info.triggerAsyncId);
  }
}

const asyncHook = asyncHooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    /* istanbul ignore next */
    if (Date.now() - store.getLastEliminateTime() > eliminateInterval) {
      store.eliminate();
    }
    let triggerInfo = store.get(triggerAsyncId);
    if (!triggerInfo) {
      triggerInfo = new NodeInfo(-1);
      store.set(triggerAsyncId, triggerInfo);
    }
    triggerInfo.referenceCount++;
    const info = new NodeInfo(triggerAsyncId);
    store.set(asyncId, info);
  },
  destroy(asyncId) {
    storeCleanUp(asyncId);
  }
});

/**
 * Enable the context store,
 * you should call this function as early as possible,
 * i.e. put it in your application's start.
 */
function enable() {
  if (!enabled) {
    asyncHook.enable();
    enabled = true;
  } else {
    console.trace("[envoy-node] You want to enable the enabled store");
  }
}

/**
 * Disable the context store,
 * all data will be clean up as well.
 * This function is not intended to be call in the application life cycle.
 */
function disable() {
  if (enabled) {
    asyncHook.disable();
    store.clear();
    enabled = false;
  } else {
    console.trace("[envoy-node] You want to disable the disabled store");
  }
}

function markContext(triggerAsyncId: number, context: EnvoyContext) {
  const triggerInfo = store.get(triggerAsyncId);
  if (triggerInfo === undefined) {
    // no trigger info
    return; // skip
  }
  if (triggerInfo.context) {
    // trigger id has context already (reach to the border of the other request)
    return; // done
  }
  triggerInfo.context = context;
  markContext(triggerInfo.triggerAsyncId, context);
}

/**
 * According to the context store design, this function is required to be called exactly once for a request.
 * Setting multiple calls to this function will lead to context corruption.
 * @param context the context you want to set
 */
function set(context: EnvoyContext) {
  if (!enabled) {
    console.trace("[envoy-node] cannot set context when store is not enabled.");
    return;
  }
  const asyncId = asyncHooks.executionAsyncId();
  const info = store.get(asyncId);
  /* istanbul ignore next */
  if (info === undefined) {
    console.trace(
      "[envoy-node] Cannot find info of current execution, have you enabled the context store correctly?"
    );
    return;
  }
  info.context = context;
  markContext(info.triggerAsyncId, context);
}

/**
 * get context from the execution tree
 * @param asyncId the async id
 */
function getContext(asyncId: number): EnvoyContext | undefined {
  const info = store.get(asyncId);
  /* istanbul ignore next */
  if (!info) {
    return undefined;
  }
  if (!info.context) {
    info.context = getContext(info.triggerAsyncId);
  }
  return info.context;
}

/**
 * get the context previous set in the store of the current execution
 */
function get(): EnvoyContext | undefined {
  if (!enabled) {
    console.trace("[envoy-node] cannot get context when store is not enabled.");
    return undefined;
  }
  const asyncId = asyncHooks.executionAsyncId();
  const context = getContext(asyncId);
  /* istanbul ignore next */
  if (context === undefined) {
    console.trace(
      "[envoy-node] Cannot find info of current execution, have you enabled and set the context store correctly?"
    );
  }
  return context;
}

function isEnabled() {
  return enabled;
}

function getStoreImpl() {
  return store;
}

export default {
  enable,
  disable,
  set,
  get,
  isEnabled,
  getStoreImpl,
  getEliminateInterval,
  setEliminateInterval
};
