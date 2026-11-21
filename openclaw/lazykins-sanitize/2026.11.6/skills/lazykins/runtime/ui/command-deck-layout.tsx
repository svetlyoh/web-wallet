import { createMemo, createSignal } from "solid-js";
import { UI_COMMAND_EVENT, type UiCommandDetail } from "../components/panel-toggle-contract.ts";
import { useApplication } from "../lib/reactive/context.ts";
import { createMediaQuery } from "../lib/reactive/platform.ts";
import { projectOwner } from "../lib/reactive/projection.ts";

export function CommandDeckHeader(props: { sessionKey: string; queueOpen: boolean | undefined; onQueueOpenChange(open: boolean): void }) {
  const context = useApplication();
  const sessions = projectOwner(context.sessions,owner => owner.state.result?.sessions ?? []);
  const gateway = projectOwner(context.gateway,owner => owner.snapshot);
  const narrow = createMediaQuery("(max-width: 1320px)");
  const noSplit = createMediaQuery("(max-width: 1099px)");
  const other = createMemo(() => sessions.read().find(row => row.key !== props.sessionKey && !row.archived));
  const [error,setError] = createSignal("");
  const split = () => {
    const row = other();
    if (!row || noSplit() || context.gateway.snapshot.phase !== "connected") return;
    const detail: UiCommandDetail = { sessionKey: props.sessionKey, command: {kind:"split",sessionKey:row.key,direction:"right"} };
    if (window.dispatchEvent(new CustomEvent(UI_COMMAND_EVENT,{cancelable:true,detail}))) setError("Open a conversation before splitting.");
    else setError("");
  };
  return <div class="command-deck-header-actions">
    <button type="button" class="btn btn--sm command-deck-split" aria-label="Split with another conversation" title={!other() ? "Open another conversation first" : "Open another conversation beside this pane"}
      disabled={!other() || noSplit() || gateway.read().phase !== "connected"} onClick={split}>Split</button>
    <button type="button" class="btn btn--sm" aria-label="Task queue" aria-pressed={(props.queueOpen ?? !narrow()) ? "true" : "false"}
      onClick={() => props.onQueueOpenChange(!(props.queueOpen ?? !narrow()))}>Queue</button>
    <span role="status" class="sr-only">{error()}</span>
  </div>;
}
