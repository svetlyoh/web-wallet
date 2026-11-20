import {Worker} from "node:worker_threads";

/** Local plugins cannot use trusted-only shared state. Own a private async SQLite CAS worker. */
export class QueueStore {
  constructor(stateDir) {
    this.authority=new Int32Array(new SharedArrayBuffer(4));Atomics.store(this.authority,0,1);
    this.sequence=0;this.pending=new Map();this.closed=false;
    this.worker=new Worker(new URL("./store-worker.js",import.meta.url),{workerData:{stateDir,authority:this.authority.buffer}});
    this.worker.on("message",message=>{const waiter=this.pending.get(message.id);if(!waiter)return;this.pending.delete(message.id);message.error ? waiter.reject(new Error(message.error)) : waiter.resolve(message.value);});
    this.worker.on("error",()=>this.fail(new Error("Queue SQLite worker failed. Inspect local state and service logs.")));
    this.worker.on("exit",code=>{this.closed=true;if(code!==0 || this.pending.size) this.fail(new Error("Queue SQLite worker exited before acknowledgement."));});
  }
  fail(error) {this.closed=true;for(const waiter of this.pending.values())waiter.reject(error);this.pending.clear();}
  request(operation,args={}) {
    if(this.closed || (operation!=="close" && Atomics.load(this.authority,0)!==1)) return Promise.reject(new Error("Queue service is unavailable."));
    return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,operation,...args});});
  }
  registerIfAbsent(key,value) {return this.request("register",{key,value});}
  observe(key) {return this.request("observe",{key});}
  compareAndApply(key,comparison,change) {
    if(change.operation!=="update" || change.action!=="set") throw new Error("Unsupported queue CAS operation.");
    return this.request("compare",{key,comparison,value:change.value});
  }
  revoke() {Atomics.store(this.authority,0,0);}
  async close() {this.revoke();if(!this.closed){await this.request("close");await this.worker.terminate();this.closed=true;}}
}
