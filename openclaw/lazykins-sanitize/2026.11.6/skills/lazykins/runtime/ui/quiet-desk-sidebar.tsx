import { DeskModeEntries } from "./quiet-desk.tsx";
import { For } from "solid-js";
import type { SidebarRecentSession } from "../components/app-sidebar-session-types.ts";
import { pathForAgentPanel, pathForRoute } from "../app-route-paths.ts";
import type { AppSidebarRenderHost } from "../components/app-sidebar-render.tsx";
import { renderAppSidebarFooterBar } from "../components/app-sidebar-render.tsx";
import { renderNewSessionLink as NewSessionLink } from "../components/solid/new-session-link.tsx";
import { Icon } from "../components/solid/icon.tsx";
import { handleNavigationClick } from "../lib/navigation-click.ts";

export function QuietDeskSidebar(props: { host: AppSidebarRenderHost; recent: () => readonly SidebarRecentSession[] }) {
  const filesPath = () => pathForAgentPanel(props.host.expandedAgentId(), "files", props.host.basePath);
  return <aside class="lazykins-sidebar sidebar" aria-label="Quiet Desk navigation">
    <div class="lazykins-brand"><div><strong>LazyKins</strong><small>Quiet Desk</small></div>
      <button type="button" class="btn btn--sm" aria-label="Collapse sidebar" onClick={() => props.host.onToggleSidebar?.()}><Icon name="menu" /></button>
    </div>
    <NewSessionLink basePath={props.host.basePath} agentId={props.host.expandedAgentId()}
      class="lazykins-new-conversation" label="New conversation" showShortcut
      disabledReason={(() => { const access = props.host.readNewSessionAccess(); return access.allowed ? undefined : access.reason; })()}
      onOpen={(agentId, target) => props.host.requestOpenNewSession(agentId, target)} />
    <nav class="lazykins-nav" aria-label="Workspace">
      <a href={pathForRoute("sessions", props.host.basePath)} class="lazykins-nav-link" aria-current={props.host.activeRouteId === "sessions" ? "page" : undefined}
        onClick={(event) => handleNavigationClick(event, () => props.host.onNavigate?.("sessions"))}><Icon name="messageCircle" />Conversations</a>
      <a href={pathForRoute("workboard", props.host.basePath)} class="lazykins-nav-link" aria-current={props.host.activeRouteId === "workboard" ? "page" : undefined}
        onClick={(event) => handleNavigationClick(event, () => props.host.onNavigate?.("workboard"))}><Icon name="layoutGrid" />Tasks</a>
      <a href={filesPath()} class="lazykins-nav-link" onClick={(event) => handleNavigationClick(event, () => props.host.onNavigate?.("agents", {pathname: filesPath()}))}><Icon name="file" />Files</a>
    </nav>
    <p class="lazykins-note">{new Text("Tasks: Workboard when enabled. Files: this agent's workspace.")}</p>
    <div class="lazykins-recents"><h2>{new Text("Recent conversations")}</h2>
      <For each={props.recent()} keyed={(row) => row.key}>{(row) =>
        <a class="lazykins-recent" href={props.host.sidebarSessionHref(row())}
          aria-current={row().active ? "page" : undefined}
          onClick={(event) => handleNavigationClick(event, () => props.host.selectSession(row().key, undefined, row()))}>
          <span class="lazykins-recent-name">{row().label}</span>
          <small>{row().hasActiveRun ? "Working" : row().lastRunError ? "Couldn't finish" : row().attention.kind !== "none" ? "Needs your review" : ""}</small>
        </a>
      }</For>
      <a class="lazykins-nav-link" href={pathForRoute("sessions", props.host.basePath)}
        onClick={(event) => handleNavigationClick(event, () => props.host.onNavigate?.("sessions"))}>{new Text("All conversations")}</a>
    </div>
    <div class="lazykins-sidebar-bottom">
      <DeskModeEntries mode={props.host.deskMode} onChange={props.host.onChangeDeskMode} />
      <a href={pathForRoute("appearance", props.host.basePath)} class="lazykins-nav-link"
        onClick={(event) => handleNavigationClick(event, () => props.host.onNavigate?.("appearance"))}><Icon name="settings" />Settings</a>
      {renderAppSidebarFooterBar(props.host)}
    </div>
  </aside>;
}
