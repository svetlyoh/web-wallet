import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [source, crew, output] = process.argv.slice(2);
if (!source || !crew || !output) throw new Error("Expected pinned source, crew sources and new public output");
const { validateTemplateProject } = await import(pathToFileURL(path.join(source,"src/templates/project.ts")).href);
const { buildTemplateProject } = await import(pathToFileURL(path.join(source,"src/templates/project-build.ts")).href);
const catalog = JSON.parse(await fs.readFile(path.join(crew,"catalog.json"),"utf8"));
await fs.mkdir(path.join(output,"templates"),{recursive:true});
await fs.mkdir(path.join(output,"avatars"),{recursive:true});
const receipts = [];
const digest = (bytes:Uint8Array) => createHash("sha256").update(bytes).digest("hex");
for (const agent of catalog.agents) {
  const originalBundle=agent.id === "helm" ? "CommandDeck-Helm-v1.1" : "CommandDeck-Helm-Crew-v1.0";
  const authored=await validateTemplateProject(path.join(crew,"originals",originalBundle,`${agent.id}-template`));
  if(authored.ok) throw new Error("Compatibility adaptation needs review: original Template unexpectedly validates");
  const root = path.join(crew,"sources",`${agent.id}-template`);
  const validated = await validateTemplateProject(root);
  if (!validated.ok) throw new Error(`${agent.id}: ${JSON.stringify(validated.diagnostics)}`);
  if (validated.template.manifest.agent.id !== agent.id || validated.packageJson.name !== agent.packageName || validated.packageJson.version !== agent.version) throw new Error("Crew package identity differs from pinned catalog");
  const manifest = validated.template.manifest;
  if (manifest.packages.length || Object.keys(manifest.mcpServers).length || manifest.cronJobs.length) throw new Error("Crew must not introduce packages, MCP or jobs");
  const artifact = path.join(output,"templates",`${agent.id}-${agent.version}.tgz`);
  const result = await buildTemplateProject(root,artifact);
  const bytes = await fs.readFile(artifact);
  for (const ext of ["png","svg"]) await fs.copyFile(path.join(root,"workspace/avatars",`${agent.id}.${ext}`),path.join(output,"avatars",`${agent.id}.${ext}`));
  agent.templateSha256 = digest(bytes);
  receipts.push({id:agent.id,packageName:agent.packageName,version:agent.version,agentId:manifest.agent.id,
    validated:true,originalValidationDiagnostics:authored.diagnostics.map((d:{code:string})=>d.code),nativeApi:"validateTemplateProject/buildTemplateProject",templateSha256:digest(bytes),
    nativeIntegrity:result.integrity,excludedPaths:validated.excludedPaths,
    preservedWorkspaceFiles:Object.keys(manifest.workspace.bootstrapFiles).length+manifest.workspace.files.length});
}
await fs.writeFile(path.join(output,"catalog.json"),JSON.stringify(catalog,null,2)+"\n");
await fs.copyFile(path.join(crew,"COMPATIBILITY.md"),path.join(output,"INSTALL-AND-COMPATIBILITY.md"));
await fs.writeFile(path.join(output,"native-build-receipts.json"),JSON.stringify({schemaVersion:1,openclawVersion:"2026.11.6",sourceSha:"06afb10d3272cc9deaf38ca6a3b7b839d5935638",nativeValidationPassed:true,liveGatewayCreationTested:false,ordinaryOrDelegatedModelResponsesTested:false,agents:receipts},null,2)+"\n");
console.log(JSON.stringify({crewBuildPassed:true,agents:receipts.map(r=>r.id),publicOutput:output}));
