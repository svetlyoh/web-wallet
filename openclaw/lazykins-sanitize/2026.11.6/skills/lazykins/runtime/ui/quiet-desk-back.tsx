import { pathForRoute } from "../app-route-paths.ts";
import { Icon } from "../components/solid/icon.tsx";
import { handleNavigationClick } from "../lib/navigation-click.ts";
import { useApplication } from "../lib/reactive/context.ts";

export function QuietDeskBackToChat() {
  const context = useApplication();
  return <nav class="lazykins-back-bar" aria-label="Return to chat">
    <a class="btn lazykins-back-to-chat" href={pathForRoute("chat", context.basePath)}
      onClick={event => handleNavigationClick(event, () => context.navigate("chat"))}>
      <Icon name="arrowLeft" /><span>{new Text("Back to chat")}</span>
    </a>
  </nav>;
}
