import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { ardiaAvailable, loadArdia } from "./ardiaHostStore";

/**
 * Answers the browser: its new tabs start on the New screen, as does Cmd+N on a
 * page, for a chat; a tab picked in the sidebar brings up the browser page that
 * shows it.
 */
export function BrowserEvents(props: {
  readonly onNewTab: () => void;
  readonly onNewChat: () => void;
}) {
  const navigate = useNavigate();
  const onNewTab = useEffectEvent(() => props.onNewTab());
  const onNewChat = useEffectEvent(() => props.onNewChat());
  useEffect(() => {
    if (!ardiaAvailable) return;
    let stopped = false;
    let stop = () => {};
    void loadArdia().then((module) => {
      if (stopped) return;
      const stopNewTabs = module.setNewTabHandler(() => onNewTab());
      const stopNewChats = module.setNewChatHandler(() => onNewChat());
      const stopOpened = module.onTabOpened(() => void navigate({ to: "/browse" }));
      stop = () => {
        stopNewTabs();
        stopNewChats();
        stopOpened();
      };
    });
    return () => {
      stopped = true;
      stop();
    };
  }, [navigate]);
  return null;
}
