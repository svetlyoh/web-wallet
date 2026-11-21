import { createMemo, createSignal, For } from "solid-js";
import { pathForRoute } from "../app-route-paths.ts";
import type { AppSidebarRenderHost } from "../components/app-sidebar-render.tsx";
import { renderAppSidebarFooterBar } from "../components/app-sidebar-render.tsx";
import type { SidebarRecentSession } from "../components/app-sidebar-session-types.ts";
import { renderNewSessionLink as NewSessionLink } from "../components/solid/new-session-link.tsx";
import { handleNavigationClick } from "../lib/navigation-click.ts";
import { CommandDeckCrewRoster } from "./command-deck-crew-roster.tsx";
import { DeskModeEntries } from "./quiet-desk.tsx";

export function CommandDeckSidebar(props: { host: AppSidebarRenderHost; rows(): readonly SidebarRecentSession[] }) {
  const [filter, setFilter] = createSignal("all");
  const [search, setSearch] = createSignal("");
  const rows = createMemo(() => props.rows().filter(row => !row.archived && row.label.toLowerCase().includes(search().toLowerCase()) &&
    (filter() === "all" || (filter() === "pinned" && row.pinned) || (filter() === "active" && row.hasActiveRun) || (filter() === "unread" && row.unread))));
  return <aside class="command-deck-navigation sidebar" aria-label="Command Deck channels">
    <nav class="command-deck-rail" aria-label="Channel filters">
      <strong>LK</strong>
      <For each={[{id:"all",label:"All channels",symbol:"#"},{id:"pinned",label:"Pinned channels",symbol:"*"},{id:"active",label:"Active channels",symbol:">"},{id:"unread",label:"Unread channels",symbol:"@"}]}>{item =>
        <button type="button" title={item.label} aria-label={item.label} aria-pressed={filter() === item.id ? "true" : "false"} onClick={() => setFilter(item.id)}>{item.symbol}</button>
      }</For>
    </nav>
    <section class="command-deck-channels">
      <header><strong>{new Text("Command Deck")}</strong><small>{new Text("Conversations")}</small></header>
      <NewSessionLink basePath={props.host.basePath} agentId={props.host.selectedAgentIdForSessions()} class="command-deck-new" label="New conversation" showTooltip={false}
        disabledReason={(() => { const access = props.host.readNewSessionAccess(); return access.allowed ? undefined : access.reason; })()}
        onOpen={(agentId,target) => props.host.requestOpenNewSession(agentId,target)} />
      <CommandDeckCrewRoster />
      <input type="search" aria-label="Search channels" placeholder="Find a conversation" value={search()} onInput={event => setSearch(event.currentTarget.value)} />
      <div class="command-deck-channel-list">
        <For each={rows()} keyed={row => row.key} fallback={<p>{new Text("No matching conversations.")}</p>}>{row =>
          <a href={props.host.sidebarSessionHref(row())} class={["command-deck-channel",{active:row().active}]} aria-current={row().active ? "page" : undefined}
            onClick={event => handleNavigationClick(event,()=>props.host.selectSession(row().key,undefined,row()))}>
            <span class="command-deck-channel-symbol" aria-hidden="true">#</span>
            <span><strong>{row().label}</strong><small>{row().attention.kind === "approval" || row().attention.kind === "question" ? "Needs your review" : row().lastRunError ? "Couldn't finish" : row().hasActiveRun ? "Working" : row().status === "queued" ? "Waiting to start" : row().status ?? "Status unavailable"}{row().unread ? " · Unread" : ""}{row().hasComposerDraft ? " · Draft" : ""}</small></span>
          </a>
        }</For>
      </div>
      <footer>
        <a href={pathForRoute("sessions",props.host.basePath)} onClick={event => handleNavigationClick(event,()=>props.host.onNavigate?.("sessions"))}>{new Text("All conversations")}</a>
        <a href={pathForRoute("appearance",props.host.basePath)} onClick={event => handleNavigationClick(event,()=>props.host.onNavigate?.("appearance"))}>Settings</a>
        <DeskModeEntries mode={props.host.deskMode} onChange={props.host.onChangeDeskMode} />
        {renderAppSidebarFooterBar(props.host)}
      </footer>
    </section>
  </aside>;
}
