import asyncHooks from "async_hooks";
import EnvoyContext from "./envoy-context";

/**
 * this will store the information of a node
 */
class NodeInfo {
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

const store = new Map<number, NodeInfo>();

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
  asyncHook.enable();
}

/**
 * Disable the context store,
 * all data will be clean up as well.
 * This function is not intended to be call in the application life cycle.
 */
function disable() {
  asyncHook.disable();
  store.clear();
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
  const asyncId = asyncHooks.executionAsyncId();
  const info = store.get(asyncId);
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
  if (info === undefined) {
    console.trace(
      "[envoy-node] Cannot find info of current execution, have you enabled and set the context store correctly?"
    );
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
  const asyncId = asyncHooks.executionAsyncId();
  return getContext(asyncId);
}

export default {
  enable,
  disable,
  set,
  get
};
