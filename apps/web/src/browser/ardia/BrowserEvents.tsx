import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { ardiaAvailable, loadArdia } from "./ardiaHostStore";

/**
 * Answers the browser: its new tabs start on the New screen, and a tab picked in
 * the sidebar brings up the browser page that shows it.
 */
export function BrowserEvents(props: { readonly onNewTab: () => void }) {
  const navigate = useNavigate();
  const onNewTab = useEffectEvent(() => props.onNewTab());
  useEffect(() => {
    if (!ardiaAvailable) return;
    let stopped = false;
    let stop = () => {};
    void loadArdia().then((module) => {
      if (stopped) return;
      const stopNewTabs = module.setNewTabHandler(() => onNewTab());
      const stopOpened = module.onTabOpened(() => void navigate({ to: "/browse" }));
      stop = () => {
        stopNewTabs();
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
