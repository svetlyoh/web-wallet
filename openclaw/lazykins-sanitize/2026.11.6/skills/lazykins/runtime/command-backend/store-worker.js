import {parentPort,workerData} from "node:worker_threads";
import {DatabaseSync} from "node:sqlite";
import {chmodSync,lstatSync,mkdirSync} from "node:fs";
import path from "node:path";

const home=path.join(workerData.stateDir,"lazykins-command-desk");
try {mkdirSync(home,{mode:0o700});} catch(error) {if(error.code!=="EEXIST") throw error;}
if(lstatSync(home).isSymbolicLink() || !lstatSync(home).isDirectory()) throw new Error("Queue state directory is aliased.");
chmodSync(home,0o700);
const file=path.join(home,"tasks.sqlite3");
try {const stat=lstatSync(file);if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1) throw new Error("Queue database is aliased.");} catch(error) {if(error.code!=="ENOENT") throw error;}
const db=new DatabaseSync(file);
chmodSync(file,0o600);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
const schema=db.prepare("PRAGMA user_version").get().user_version;
if(schema!==0 && schema!==1) throw new Error("Unknown Command Desk queue database schema; data retained.");
// A single-key CAS is the complete storage primitive. SQL never runs on Gateway's thread.
db.exec("CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL); PRAGMA user_version=1");
const authority=new Int32Array(workerData.authority);
function assertCurrent() {if(Atomics.load(authority,0)!==1) throw new Error("Queue service authority was retired.");}
parentPort.on("message",({id,operation,key,value,comparison})=>{
  try {
    if(operation==="close"){db.close();parentPort.postMessage({id,value:true});parentPort.close();return;}
    assertCurrent();
    if(typeof key!=="string" || key!=="queue-v1") throw new Error("Unknown queue key.");
    if(operation==="observe") {
      const row=db.prepare("SELECT value,revision FROM records WHERE key=?").get(key);
      parentPort.postMessage({id,value:{value:row ? JSON.parse(row.value) : null,comparison:row?.revision ?? null}});return;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      assertCurrent();
      const row=db.prepare("SELECT revision FROM records WHERE key=?").get(key);
      let result;
      if(operation==="register") {
        if(!row) db.prepare("INSERT INTO records VALUES(?,?,1)").run(key,JSON.stringify(value));
        result={status:row ? "exists" : "applied"};
      } else if(operation==="compare") {
        if(!row || row.revision!==comparison) result={status:"conflict"};
        else {db.prepare("UPDATE records SET value=?,revision=revision+1 WHERE key=?").run(JSON.stringify(value),key);result={status:"applied"};}
      } else throw new Error("Unknown queue operation.");
      assertCurrent();db.exec("COMMIT");parentPort.postMessage({id,value:result});
    } catch(error) {db.exec("ROLLBACK");throw error;}
  } catch(error) {parentPort.postMessage({id,error:error instanceof Error ? error.message : "Queue storage failed."});}
});
