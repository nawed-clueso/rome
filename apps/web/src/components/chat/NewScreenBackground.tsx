import { type CSSProperties, useEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { useBrowserModel } from "../../browser/rome/browserStore";
import {
  type BackgroundStyleId,
  backgroundFor,
  backgroundStyle,
  grainFor,
  type FieldFrame,
  type Rgb,
  useNewScreenBackground,
} from "./newScreenBackgrounds";

/** A CSS colour (custom properties included) as RGB, whatever colour space it is written in. */
function cssColor(element: HTMLElement, value: string, fallback: Rgb): Rgb {
  const probe = document.createElement("span");
  probe.style.color = value;
  element.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  // Themes use oklch(); a canvas converts any CSS colour to sRGB.
  const swatch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!swatch || !color) return fallback;
  swatch.fillStyle = color;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  return [r ?? fallback[0], g ?? fallback[1], b ?? fallback[2]];
}

// A still film grain, made once: tiny specks of light and dark at random.
let grainUrl: string | null = null;
function grainTexture(): string {
  if (grainUrl) return grainUrl;
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const light = Math.random() > 0.5 ? 255 : 0;
    image.data[i] = light;
    image.data[i + 1] = light;
    image.data[i + 2] = light;
    image.data[i + 3] = Math.random() * 110;
  }
  context.putImageData(image, 0, 0);
  grainUrl = canvas.toDataURL();
  return grainUrl;
}

/**
 * The New screen's background: soft light in the space's colour that slowly
 * follows the pointer. As a `preview` (settings thumbnails) the light wanders on
 * its own and follows the pointer only while it is over the preview.
 */
export function NewScreenBackground(props: {
  readonly styleId?: BackgroundStyleId;
  /** Percent of the style's own opacity. */
  readonly opacity?: number;
  /** "space" or a hex colour. */
  readonly color?: string;
  /** Percent; how strongly the pointer lights things up. */
  readonly intensity?: number;
  /** Percent of film grain; null keeps the style's own. */
  readonly grain?: number | null;
  readonly blur?: number;
  readonly preview?: boolean;
  readonly className?: string;
}) {
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const chosen = useNewScreenBackground((state) => backgroundFor(state, spaceId));
  const chosenStyle = chosen.style;
  const chosenBlur = chosen.blur;
  const style = backgroundStyle(props.styleId ?? chosenStyle);
  const opacity = (props.opacity ?? chosen.opacity) / 100;
  const color = props.color ?? chosen.color;
  const intensity = (props.intensity ?? chosen.intensity ?? 100) / 100;
  const grain =
    grainFor(
      { ...chosen, grain: props.grain !== undefined ? props.grain : (chosen.grain ?? null) },
      style,
    ) / 100;
  const preview = props.preview ?? false;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const render = style.render;
    if (!canvas || !context || !render) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let density = 1;
    let ink: Rgb = [128, 128, 128];
    let accent: Rgb = [128, 128, 128];
    let dark = false;
    const tinted = color !== "space";
    const readColors = () => {
      ink = cssColor(canvas, "var(--foreground)", [128, 128, 128]);
      accent = cssColor(canvas, tinted ? color : "var(--space-accent, var(--primary))", ink);
      dark = document.documentElement.classList.contains("dark");
    };
    const target = { x: 0.5, y: 0.4 };
    const glow = { x: 0.5, y: 0.4 };
    let pointerInside = false;
    let drawnAt = { x: -1, y: -1 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      density = render.kind === "soft" ? render.resolution : window.devicePixelRatio || 1;
      width = Math.max(1, Math.ceil(rect.width * density));
      height = Math.max(1, Math.ceil(rect.height * density));
      canvas.width = width;
      canvas.height = height;
      readColors();
      drawnAt = { x: -1, y: -1 };
    };

    const draw = (time: number) => {
      // Nothing to draw on until the canvas has been measured.
      if (width === 0 || height === 0) return;
      const t = time / 1000;
      if (preview && !pointerInside) {
        target.x = 0.5 + 0.3 * Math.cos(t * 0.5);
        target.y = 0.5 + 0.25 * Math.sin(t * 0.8);
      }
      // Previews move a little quicker so a small tile shows the idea.
      const follow = Math.min(1, style.follow * (preview ? 4 : 1));
      glow.x += (target.x - glow.x) * (still ? 1 : follow);
      glow.y += (target.y - glow.y) * (still ? 1 : follow);
      if (style.timeless && Math.abs(glow.x - drawnAt.x) + Math.abs(glow.y - drawnAt.y) < 0.0005)
        return;
      drawnAt = { x: glow.x, y: glow.y };
      const frame: FieldFrame = { time: t, glow, ink, accent, tinted, intensity, dark };
      if (render.kind === "soft") {
        render.draw(context, width, height, frame);
      } else {
        render.draw(context, width, height, frame, preview);
      }
    };

    const follow = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      pointerInside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (preview && !pointerInside) return;
      target.x = Math.min(1.1, Math.max(-0.1, x));
      target.y = Math.min(1.1, Math.max(-0.1, y));
    };

    const stopResize = observeResize(canvas, () => {
      resize();
      draw(still ? 0 : performance.now());
    });
    // Colours change with the theme and the space; repaint in the new ones.
    const colorWatch = new MutationObserver(() => {
      readColors();
      drawnAt = { x: -1, y: -1 };
      if (still) draw(0);
    });
    colorWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme-id", "style"],
    });

    // Thumbnails out of view don't animate.
    let inView = true;
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
    });
    visibility.observe(canvas);

    const frameMs = 1000 / Math.max(1, style.fps);
    let frameId = 0;
    let last = 0;
    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);
      if (time - last < frameMs || document.hidden || !inView) return;
      last = time;
      draw(time);
    };
    window.addEventListener("pointermove", follow, { passive: true });
    if (!still) frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", follow);
      stopResize();
      colorWatch.disconnect();
      visibility.disconnect();
    };
  }, [style, preview, color, intensity]);

  if (!style.render) return null;
  const scale = opacity * (preview ? 1.2 : 1);
  const [light, dark] = style.opacity;
  // A thumbnail is a fraction of the screen's size, so its blur is too.
  const blurScale = preview ? 0.25 : 1;
  const ownBlur = style.render.kind === "soft" ? style.render.blur : 0;
  const blur = (ownBlur + (props.blur ?? chosenBlur)) * blurScale;
  const place = props.className ?? "absolute inset-0 -z-10";
  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={
          {
            "--background-light": Math.min(1, light * scale),
            "--background-dark": Math.min(1, dark * scale),
            ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}),
          } as CSSProperties
        }
        className={cn(
          "pointer-events-none size-full opacity-(--background-light) dark:opacity-(--background-dark)",
          place,
        )}
      />
      {grain > 0 ? (
        <div
          aria-hidden
          style={
            {
              backgroundImage: `url(${grainTexture()})`,
              "--grain-light": Math.min(1, grain * 0.6),
              "--grain-dark": Math.min(1, grain * 0.4),
            } as CSSProperties
          }
          className={cn(
            "pointer-events-none size-full opacity-(--grain-light) mix-blend-overlay dark:opacity-(--grain-dark)",
            place,
          )}
        />
      ) : null}
    </>
  );
}
