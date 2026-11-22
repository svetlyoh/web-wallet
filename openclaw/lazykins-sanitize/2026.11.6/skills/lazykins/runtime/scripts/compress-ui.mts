import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { gzip } from "libdeflate";
import { execFileSync } from "node:child_process";
import { extractControlUiStartupAssetPaths } from "./config/control-ui-startup-assets.ts";
import { selectControlUiRoutePreloads } from "../src/gateway/control-ui-route-preloads.ts";
// Improve transfer compression without changing executable bytes or size ceilings.
const root=path.resolve(process.argv[2]);
let changed=0,saved=0;
async function visit(directory:string):Promise<void>{
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) await visit(file);
    else if(entry.isFile() && file.endsWith(".js.gz")){
      const original=await fs.readFile(file.slice(0,-3));
      const previous=await fs.readFile(file);
      const candidate=Buffer.from(gzip(original,12));
      if(!gunzipSync(candidate).equals(original)) throw new Error("Precompression byte verification failed");
      if(candidate.length<previous.length){await fs.writeFile(file,candidate);changed++;saved+=previous.length-candidate.length;}
    }
  }
}
await visit(root);
console.log(JSON.stringify({gzipLevel:12,changedAssets:changed,savedBytes:saved,decodedBytesVerified:true}));
const html=await fs.readFile(path.join(root,"index.html"),"utf8");
const startup=extractControlUiStartupAssetPaths(selectControlUiRoutePreloads(html,null)).filter(file=>file.endsWith(".js"));
if(!startup.length)throw new Error("No native startup JS assets found");
execFileSync(process.argv[3],[process.argv[4],root,...startup],{stdio:"inherit"});
