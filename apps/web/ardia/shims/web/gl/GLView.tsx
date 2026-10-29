import { useEffect, useRef, type CSSProperties } from "react";
import { observeOnscreen, observePixelSize, subscribeFrames } from "./clock";
import { GLSurface, type Uniforms } from "./surface";

export type UniformsAt = (css: [number, number], time: number) => Uniforms;

type Props = {
  fragment: string;
  uniformsAt: UniformsAt;
  animation?: { lastFrameTime: number };
  style?: CSSProperties;
  version?: unknown;
};

const MIN_FRAME_INTERVAL = 0.9 / 60;
// A view hidden for a moment (React parks hidden views and reconnects them, as on a
// space change) keeps its WebGL context this long; making a new one costs a frame or more.
const PARK_MS = 10_000;

const fill: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

export function GLView({ fragment, uniformsAt, animation, style, version }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(uniformsAt);
  latest.current = uniformsAt;
  const view = useRef({
    surface: null as GLSurface | null,
    css: [0, 0] as [number, number],
    time: 0,
    started: false,
    done: false,
    redraw: () => {},
    parked: null as { surface: GLSurface; fragment: string; timer: number } | null,
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const v = view.current;
    v.time = 0;
    v.started = false;
    v.done = false;
    const redraw = () => {
      if (v.surface && v.css[0] > 0 && v.css[1] > 0) v.surface.draw(latest.current(v.css, v.time));
    };
    v.redraw = redraw;
    const parked = v.parked;
    v.parked = null;
    if (parked) window.clearTimeout(parked.timer);
    if (parked && parked.fragment !== fragment) parked.surface.dispose();
    const surface =
      parked && parked.fragment === fragment
        ? parked.surface
        : new GLSurface(fragment, () => v.redraw());
    v.surface = surface;
    Object.assign(surface.canvas.style, { ...fill, display: "block" });
    el.appendChild(surface.canvas);

    const stopSize = observePixelSize(el, (css, pixels) => {
      v.css = css;
      surface.resize(pixels[0], pixels[1]);
      if (!animation || v.started) redraw();
    });

    let stopFrames = () => {};
    let stopOnscreen = () => {};
    if (animation) {
      let pending = 0;
      const tick = (dt: number) => {
        pending += dt;
        if (v.started && pending < MIN_FRAME_INTERVAL) return;
        v.time = v.started ? v.time + pending : 0;
        pending = 0;
        v.started = true;
        const finished = v.time >= animation.lastFrameTime;
        if (finished) v.time = animation.lastFrameTime;
        redraw();
        if (finished) {
          v.done = true;
          stopFrames();
          stopFrames = () => {};
        }
      };
      stopOnscreen = observeOnscreen(el, (visible) => {
        stopFrames();
        stopFrames = visible && !v.done ? subscribeFrames(tick) : () => {};
      });
    }

    return () => {
      stopOnscreen();
      stopFrames();
      stopSize();
      surface.canvas.remove();
      v.surface = null;
      // Kept for a quick reconnect; let go if the view doesn't come back.
      const timer = window.setTimeout(() => {
        if (v.parked?.surface !== surface) return;
        v.parked = null;
        surface.dispose();
      }, PARK_MS);
      v.parked = { surface, fragment, timer };
    };
  }, [fragment, !!animation]);

  useEffect(() => {
    if (!animation) view.current.redraw();
  }, [version]);

  return <div ref={host} style={{ ...fill, ...style }} />;
}
