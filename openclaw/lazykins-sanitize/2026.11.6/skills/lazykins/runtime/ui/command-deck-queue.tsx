import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { ModalDialog } from "../components/modal-dialog.tsx";
import { useApplication } from "../lib/reactive/context.ts";
import { createMediaQuery } from "../lib/reactive/platform.ts";
import { projectOwner } from "../lib/reactive/projection.ts";
import { sessionNavigationTarget } from "../lib/sessions/route-navigation.ts";
import { quietDeskStorageKey } from "./quiet-desk-preference.ts";
import { CommandQueueOwner } from "./command-queue-owner.ts";
import { describeSchedule, resolveDeskSchedule } from "./command-deck-schedule.ts";

type Props = { sessionKey:string;open:boolean|undefined;onOpenChange(open:boolean):void };
export function CommandDeckQueue(props:Props) {
  const context=useApplication();
  const gateway=projectOwner(context.gateway,owner=>owner.snapshot);
  const scope=()=>{gateway.read();return quietDeskStorageKey(context);};
  // A changed authenticated profile retires its forms and pending read owner.
  return <Show when={scope()} keyed>{()=> <CommandQueuePanel sessionKey={props.sessionKey} open={props.open} onOpenChange={props.onOpenChange}/>}</Show>;
}
function CommandQueuePanel(props:Props) {
  const context=useApplication();
  const owner=new CommandQueueOwner(context);
  const projection=projectOwner(owner,current=>current);
  const state=()=>projection.read();
  const can=(operation:"list"|"create"|"priority"|"cancel"|"retry")=>{projection.revision();return owner.can(operation);};
  const narrow=createMediaQuery("(max-width: 1320px)");
  onSettled(()=>owner.bind());
  const [title,setTitle]=createSignal("");
  const [message,setMessage]=createSignal("");
  const [priority,setPriority]=createSignal("2");
  const [preset,setPreset]=createSignal("now");
  const [custom,setCustom]=createSignal("");
  const [timezone,setTimezone]=createSignal(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [formError,setFormError]=createSignal("");
  const [receipt,setReceipt]=createSignal("");
  const preview=createMemo(()=>{
    try{const date=resolveDeskSchedule(preset(),custom(),timezone());return {text:describeSchedule(date,timezone()),atMs:date?.getTime() ?? null,valid:true};}
    catch(error){return {text:error instanceof Error ? error.message : "Choose a valid future time.",atMs:null,valid:false};}
  });
  const submit=async()=>{
    setFormError("");setReceipt("");
    try{
      const submittedTitle=title();const submittedMessage=message();
      const when=preview().atMs === null ? null : new Date(preview().atMs!);
      if(!preview().valid || (when && when.getTime() <= Date.now())) throw new Error("Displayed time has passed. Change the schedule before submitting.");
      const ok=await owner.create({sessionKey:props.sessionKey,title:title().trim(),message:message().trim(),priority:Number(priority()),scheduleAtMs:when?.getTime() ?? null,timezone:timezone()},{preset:preset(),custom:custom()});
      if(ok){if(title()===submittedTitle)setTitle("");if(message()===submittedMessage)setMessage("");setReceipt(when ? "Scheduled. The queue below is authoritative." : "Queued. The queue below is authoritative.");}
    }catch(error){setFormError(error instanceof Error ? error.message : "Task could not be submitted.");}
  };
  function Content(){return <>
    <header><h2>{new Text("Task queue")}</h2><button type="button" aria-label="Close task queue" onClick={()=>props.onOpenChange(false)}>Close</button></header>
    <Show when={can("list")} fallback={<div class="command-deck-unavailable" role="status"><p>{new Text("Priority queue unavailable. Install the matching optional Command Deck backend and reconnect as an administrator.")}</p><button type="button" onClick={()=>context.navigate("activity")}>{new Text("Open native activity")}</button></div>}>
      <p class="command-deck-note" role="status">{state().result ? `${state().result!.capabilities.concurrency} worker · ${state().result!.capabilities.scope}` : "Queue state unavailable"}{state().stale ? " · stale" : ""}</p>
      <Show when={state().result?.capabilities.schedulerEnabled === false}><p class="command-deck-error">{new Text("Native scheduler is disabled. Queued work cannot start.")}</p></Show>
      <button type="button" disabled={state().busy} onClick={()=>void owner.refresh()}>Reconcile</button>
      <Show when={state().error}><p role="alert" class="command-deck-error">{state().error}</p></Show>
      <details class="command-deck-create"><summary>{new Text("Queue or schedule work")}</summary>
        <p class="command-deck-note">{new Text("Source: selected conversation. Existing approval rules still apply.")}</p>
        <label>Title<input aria-label="Task title" maxlength={120} value={title()} onInput={event=>setTitle(event.currentTarget.value)}/></label>
        <label>Instruction<textarea aria-label="Task instruction" rows={3} value={message()} onInput={event=>setMessage(event.currentTarget.value)}/></label>
        <div class="command-deck-field-pair"><label>Priority<select aria-label="Task priority" value={priority()} onChange={event=>setPriority(event.currentTarget.value)}><option value="1">P1 High</option><option value="2">P2 Normal</option><option value="3">P3 Low</option></select></label>
        <label>When<select aria-label="Schedule preset" value={preset()} onChange={event=>setPreset(event.currentTarget.value)}><option value="now">Now</option><option value="hour">In 1h</option><option value="tonight">Tonight 8 PM</option><option value="tomorrow">Tomorrow 9 AM</option><option value="custom">Custom</option></select></label></div>
        <label>Timezone<input aria-label="Schedule timezone" value={timezone()} onInput={event=>setTimezone(event.currentTarget.value)}/></label>
        <Show when={preset()==="custom"}><label>Local time<input type="datetime-local" aria-label="Custom schedule time" value={custom()} onInput={event=>setCustom(event.currentTarget.value)}/></label></Show>
        <p class="command-deck-schedule-preview">{preview().text}</p>
        <button type="button" class="command-deck-primary" disabled={!can("create") || state().busy || state().preparing || state().stale || !title().trim() || !message().trim() || !preview().valid || !props.sessionKey} onClick={()=>void submit()}>{new Text("Queue at displayed time")}</button>
        <Show when={formError()}><p role="alert" class="command-deck-error">{formError()}</p></Show><p role="status">{receipt()}</p>
      </details>
      <For each={state().result?.tasks ?? []} keyed={task=>task.id} fallback={<p class="command-deck-note">{state().result && !state().stale ? "No Command Deck-owned jobs." : "No current queue snapshot."}</p>}>{task=>
        <article class="command-deck-task" data-status={task().status}>
          <div><strong>{task().title}</strong><small>P{task().priority}</small></div>
          <button type="button" class="command-deck-source" onClick={()=>{const target=sessionNavigationTarget({context,face:"chat",sessionKey:task().sessionKey});context.navigate("chat",target.options);}}>{new Text("Source conversation")}</button>
          <p>{task().status.toUpperCase()}</p>
          <Show when={task().error}><details><summary>Details</summary><p class="command-deck-error">{task().error}</p></details></Show>
          <div class="command-deck-task-actions">
            <Show when={task().capabilities.priority}><label>Priority<select aria-label={`Priority for ${task().title}`} value={String(task().priority)} disabled={state().busy || state().preparing || state().stale || !can("priority")} onChange={event=>void owner.mutate("priority",{id:task().id,expectedVersion:task().version,priority:Number(event.currentTarget.value)})}><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option></select></label></Show>
            <Show when={task().capabilities.cancel}><button type="button" aria-label={`Cancel ${task().title}`} disabled={state().busy || state().preparing || state().stale || !can("cancel")} onClick={()=>void owner.mutate("cancel",{id:task().id,expectedVersion:task().version})}>Cancel</button></Show>
            <Show when={task().capabilities.retry}><button type="button" disabled={state().busy || state().preparing || state().stale || !can("retry")} onClick={()=>void owner.retry(task()).catch(error=>setFormError(String(error)))}>Retry</button></Show>
          </div>
        </article>
      }</For>
      <p class="command-deck-note">{new Text("Priority affects this queue only. Native chat owns Stop. Pause and resume are unavailable.")}</p>
    </Show>
  </>;}
  return <Show when={!narrow()} fallback={<Show when={props.open === true}><ModalDialog label="Command Deck task queue" onOpenChange={open=>{if(!open)props.onOpenChange(false);}}><section class="command-deck-queue command-deck-queue--drawer"><Content/></section></ModalDialog></Show>}>
    <Show when={props.open !== false}><aside class="command-deck-queue" aria-label="Command Deck task queue"><Content/></aside></Show>
  </Show>;
}
