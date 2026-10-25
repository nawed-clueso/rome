import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import type { WebViewHandle, WebViewProps } from "@ardia-real/ardiacore";
import { acquire, handleFor, present, release, type PoolEntry } from "./webviewPool";

let nextStandalone = 1;

export const WebView = forwardRef<WebViewHandle, WebViewProps>(function WebView(props, ref) {
  const owner = useMemo(() => Symbol("ardia-webview"), []);
  const key = useMemo(() => props.transferKey ?? `standalone:${nextStandalone++}`, []);
  const placeholder = useRef<HTMLElement | null>(null);
  const entry = useRef<PoolEntry | null>(null);

  useLayoutEffect(() => {
    const { entry: leased, reused } = acquire(key, props, owner);
    entry.current = leased;
    queueMicrotask(() => {
      if (leased.owner !== owner) return;
      leased.props.onReady?.(leased.browserId, leased.browserId);
      // A handed-off guest is already on its page; the store learns it again here.
      if (reused && leased.ready) leased.view.dispatchEvent(new Event("did-stop-loading"));
    });
    return () => {
      release(leased, owner, !props.transferKey);
      if (entry.current === leased) entry.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (entry.current?.owner === owner) entry.current.props = props;
  });

  const visible = props.visible !== false;
  useLayoutEffect(() => {
    if (entry.current) present(entry.current, owner, placeholder.current, visible);
  }, [visible]);

  useLayoutEffect(() => {
    const background = props.contentsBackgroundColor;
    if (entry.current && background) entry.current.wrapper.style.background = background;
  }, [props.contentsBackgroundColor]);

  useImperativeHandle(ref, () => handleFor(() => entry.current), []);

  return (
    <View
      ref={placeholder as never}
      pointerEvents="none"
      style={[props.style, { backgroundColor: "transparent" }]}
    />
  );
});
