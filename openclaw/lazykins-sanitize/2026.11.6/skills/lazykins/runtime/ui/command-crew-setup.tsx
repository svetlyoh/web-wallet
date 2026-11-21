import { createSignal, For, onSettled, Show } from "solid-js";
import { useApplication } from "../lib/reactive/context.ts";
import { projectOwner } from "../lib/reactive/projection.ts";
import { commandCrewAssetPath, getCommandCrewOwner, type CommandCrewMetadata } from "./command-crew-owner.ts";

function packageFilename(metadata:CommandCrewMetadata):string { return metadata.templatePath.slice(metadata.templatePath.lastIndexOf("/")+1); }
function setupCommands(metadata:CommandCrewMetadata):string {
  const file=packageFilename(metadata);
  const verify=metadata.templateSha256 ? `echo '${metadata.templateSha256}  ${file}' | sha256sum -c -\n` : "";
  return `${verify}OC_PROFILE='default' # Match the selected Gateway's actual profile\nCREW_REVIEW="$(mktemp -d "$HOME/CommandDeck-${metadata.id}-review.XXXXXX")"\ntar -xzf "./${file}" -C "$CREW_REVIEW"\nSOURCE="$CREW_REVIEW/package"\nopenclaw --profile "$OC_PROFILE" templates inspect "$SOURCE"\nopenclaw --profile "$OC_PROFILE" templates add "$SOURCE" --agent-id ${metadata.id} --dry-run --json\n\n# Only after reviewing and approving this agent:\nopenclaw --profile "$OC_PROFILE" templates add "$SOURCE" --agent-id ${metadata.id} --json`;
}
export function CommandCrewSetup(props:{onOpenAgent?:(agentId:string)=>void;onClose?:()=>void}) {
  const context=useApplication();
  const owner=getCommandCrewOwner(context);
  const projection=projectOwner(owner,current=>current.state);
  const state=()=>projection.read();
  const [reviewing,setReviewing]=createSignal(false);
  const [skipJace,setSkipJace]=createSignal(false);
  const [skipCruz,setSkipCruz]=createSignal(false);
  const selectedTargets=()=>{state();return [...(!skipJace() && owner.verifiedAgentId("jace") ? ["jace" as const] : []),...(!skipCruz() && owner.verifiedAgentId("cruz") ? ["cruz" as const] : [])];};
  const canReview=()=>{state();return owner.canReviewDelegation();};
  onSettled(()=>owner.bind());
  const start=()=>{owner.dismiss(false);setReviewing(true);};
  const close=()=>{owner.dismiss();setReviewing(false);props.onClose?.();};
  return <section class="command-crew-setup" aria-label="Command Deck crew setup">
    <header class="command-crew-welcome">
      <img src={commandCrewAssetPath(context,"command-deck/crew/avatars/helm.png")} alt="Helm" width="80" height="80" />
      <div><p class="command-crew-eyebrow">{new Text("YOUR COMMAND DECK CREW")}</p><h2>{new Text("Meet Helm")}</h2><p class="command-crew-subtitle">{new Text("Keeps your AI crew in sync.")}</p></div>
    </header>
    <p>{new Text("Meet Helm. Your crew's point person. Give Helm the goal, and it'll keep the team moving.")}</p>
    <p class="command-crew-note">{new Text("Helm, Jace and Cruz are proposed additions until the authenticated Gateway verifies their real agent records. Other OpenClaw agents and your ordinary default stay as they are.")}</p>
    <div class="command-crew-actions"><button type="button" class="btn command-crew-primary" onClick={start}>{new Text("Set up Command Deck crew")}</button><button type="button" class="btn" onClick={close}>{new Text("Not now")}</button><button type="button" class="btn" disabled={state().busy} onClick={()=>void owner.refresh(true)}>{new Text("Retry discovery")}</button></div>
    <Show when={state().error}><p class="command-crew-error" role="alert">{state().error}</p></Show>
    <Show when={!state().catalog && state().busy}><p role="status">{new Text("Loading the bundled crew and checking the Gateway...")}</p></Show>
    <div class="command-crew-cards">
      <For each={state().catalog?.agents ?? []} keyed={metadata=>metadata.id}>{metadata=><article class="command-crew-card" data-agent-id={metadata().id}>
        <header><img src={commandCrewAssetPath(context,metadata().avatarPath)} alt="" width="52" height="52" /><div><h3>{metadata().name}</h3><p>{metadata().role}</p></div></header>
        <p>{metadata().description}</p>
        <span class="command-crew-status" data-state={state().statuses[metadata().id].state}>{state().statuses[metadata().id].state === "verified" ? "Installed - files verified" : state().statuses[metadata().id].state === "missing" ? "Not installed - proposed template" : state().statuses[metadata().id].state === "review" ? "Already present - needs review" : state().statuses[metadata().id].state === "checking" ? "Checking Gateway" : "Setup blocked"}</span>
        <p class="command-crew-note">{state().statuses[metadata().id].message}</p>
        <Show when={state().statuses[metadata().id].state === "verified"}><button type="button" class="btn" disabled={!props.onOpenAgent} onClick={()=>{const id=owner.verifiedAgentId(metadata().id);if(id)props.onOpenAgent?.(id);}}>{new Text(`Chat with ${metadata().name}`)}</button></Show>
        <Show when={metadata().id === "jace"}><label class="command-crew-skip"><input type="checkbox" checked={skipJace()} onChange={event=>{setSkipJace(event.currentTarget.checked);owner.cancelDelegationReview();}} />{new Text("Skip Jace for now")}</label></Show>
        <Show when={metadata().id === "cruz"}><label class="command-crew-skip"><input type="checkbox" checked={skipCruz()} onChange={event=>{setSkipCruz(event.currentTarget.checked);owner.cancelDelegationReview();}} />{new Text("Skip Cruz for now")}</label></Show>
        <Show when={reviewing() && (metadata().id === "helm" || (metadata().id === "jace" ? !skipJace() : !skipCruz()))}>
          <details class="command-crew-review"><summary>{new Text(`Review ${metadata().name} addition`)}</summary>
            <p>{new Text(`Template ${metadata().packageName} - ${metadata().version}. Proposed agent ID: ${metadata().id}. It gets its own workspace and chat; no plugins, model selection, schedules or channel bindings are added.`)}</p>
            <Show when={state().statuses[metadata().id].state === "review"} fallback={<>
              <a class="btn" href={commandCrewAssetPath(context,metadata().templatePath)} download={packageFilename(metadata())}>{new Text(`Download ${metadata().name} template`)}</a>
              <p class="command-crew-note">{new Text("On the Gateway host, set OC_PROFILE to its actual service profile and change into the folder containing this download. Stop that selected Gateway using its existing service manager before running native local Template Add. Inspect and review the dry-run output for this agent; run the final Add command only if you approve it.")}</p>
              <pre><code>{setupCommands(metadata())}</code></pre>
            </>}><p>{new Text("This ID is already occupied. Review that existing agent in native settings and decide whether to use it. Command Deck will not replace, rename or overwrite it; do not run Add over that ID.")}</p></Show>
          </details>
        </Show>
      </article>}</For>
    </div>
    <Show when={reviewing()}><section class="command-crew-host-step" aria-label="Host-side crew installation">
      <h3>{new Text("Review each addition on your Gateway host")}</h3>
      <p>{new Text("This OpenClaw version exposes browser Template Add for registry packages, not bundled local archives. Command Deck therefore does not call an invented upload API. The local templates above are complete native packages, not the outer distribution ZIPs.")}</p>
      <p>{new Text("Add only the agents you approve. Helm works alone; Jace and Cruz are optional. If Add reports a different actual agent ID, stop and review that result instead of assuming it created the requested crew ID. Restart the selected Gateway after installation, reconnect, then choose Verify installed crew.")}</p>
      <p>{new Text("If the native command reports Templates Labs or a local-state ownership requirement, use the bundled host guide. Command Deck never changes Labs, kills a Gateway process, or bypasses that refusal.")}</p>
      <a href={commandCrewAssetPath(context,"command-deck/crew/INSTALL-AND-COMPATIBILITY.md")} target="_blank" rel="noopener noreferrer">{new Text("Open host setup and compatibility guide")}</a>
      <div class="command-crew-actions"><button type="button" class="btn command-crew-primary" disabled={state().busy} onClick={()=>void owner.refresh(true)}>{new Text("Verify installed crew")}</button><button type="button" class="btn" onClick={close}>{new Text("Review later")}</button></div>
    </section></Show>
    <section class="command-crew-permissions" aria-label="Helm delegation permissions">
      <h3>{new Text("Delegation is a separate choice")}</h3>
      <p>{new Text("Direct Jace and Cruz chats do not pass through Helm. Only an approved target grant lets Helm attempt a native child run; effective tools, model and sandbox policies can still block it. No work starts during setup.")}</p>
      <p class="command-crew-note" role="status">{state().delegationMessage}</p>
      <button type="button" class="btn" disabled={state().delegationBusy || !canReview() || selectedTargets().length===0} onClick={()=>void owner.reviewDelegation(selectedTargets())}>{new Text("Review Helm delegation permissions")}</button>
      <Show when={state().delegationReview}>{review=><div class="command-crew-policy-review">
        <p>{new Text(`Proposed Helm targets: ${review().targets.join(", ")}. Existing targets are retained. This only changes Helm's explicit subagent allowlist; it may require a Gateway reload. It does not grant extra tools, sessions_send, channel access or global-default ownership.`)}</p>
        <pre><code>{review().raw}</code></pre>
        <div class="command-crew-actions"><button type="button" class="btn" disabled={state().delegationBusy} onClick={()=>owner.cancelDelegationReview()}>{new Text("Cancel")}</button><button type="button" class="btn command-crew-primary" disabled={state().delegationBusy} onClick={()=>void owner.approveDelegation()}>{new Text("Approve this target addition")}</button></div>
      </div>}</Show>
      <Show when={!canReview()}><p class="command-crew-note">{new Text("A verified Helm and an authorized Gateway owner are required to review this policy. Existing agents remain available through native OpenClaw.")}</p></Show>
    </section>
  </section>;
}
