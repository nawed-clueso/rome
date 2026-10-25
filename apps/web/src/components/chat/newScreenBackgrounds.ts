import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

export type BackgroundStyleId =
  | "aurora"
  | "dawn"
  | "silk"
  | "gradient"
  | "spotlight"
  | "topography"
  | "none";
export type Rgb = readonly [number, number, number];

/** One frame of the background: the time, where the light sits, and the colours to paint with. */
export interface FieldFrame {
  readonly time: number;
  /** The pointer's light, as fractions of the canvas; it trails the pointer. */
  readonly glow: { readonly x: number; readonly y: number };
  /** The theme's text colour. */
  readonly ink: Rgb;
  /** The colour to paint in: the space's, or one chosen for the background. */
  readonly accent: Rgb;
  /** Whether a colour was chosen, so styles that are neutral by default take it too. */
  readonly tinted: boolean;
  /** How strongly the pointer lights things up: 0 to 2, 1 as designed. */
  readonly intensity: number;
  readonly dark: boolean;
}

/**
 * How a style draws. Light and colour styles paint a small canvas that the page
 * scales up and blurs; line and dot styles draw at full resolution.
 */
type Render =
  | {
      readonly kind: "soft";
      /** Canvas pixels per CSS pixel; tiny, since the result is blurred anyway. */
      readonly resolution: number;
      /** Built-in blur, in CSS pixels at full size. */
      readonly blur: number;
      readonly draw: (
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        frame: FieldFrame,
      ) => void;
    }
  | {
      readonly kind: "sharp";
      readonly draw: (
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        frame: FieldFrame,
        preview: boolean,
      ) => void;
    };

export interface BackgroundStyle {
  readonly id: BackgroundStyleId;
  readonly name: string;
  readonly description: string;
  /** Opacity at 100%, light and dark. */
  readonly opacity: readonly [number, number];
  /** How quickly the light catches up with the pointer, per frame (0..1). */
  readonly follow: number;
  /** Lays a still film grain over it. */
  readonly grain: boolean;
  /** Redraws per second; slow styles need few. */
  readonly fps: number;
  /** Changes only with the pointer, so frames without movement are skipped. */
  readonly timeless?: boolean;
  /** Takes the Intensity setting: how strongly the pointer lights it up. */
  readonly intensity?: boolean;
  readonly render: Render | null;
}

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** The colour turned around the hue wheel by `degrees`, keeping its lightness. */
export function shiftHue([r, g, b]: Rgb, degrees: number): Rgb {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [r, g, b];
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue =
    max === rn
      ? ((gn - bn) / delta) % 6
      : max === gn
        ? (bn - rn) / delta + 2
        : (rn - gn) / delta + 4;
  hue = (hue * 60 + degrees + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

// Reused by Topography for its small, pixel-exact frame.
const scratch =
  typeof document === "undefined"
    ? (null as unknown as HTMLCanvasElement)
    : document.createElement("canvas");

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * amount),
  Math.round(a[1] + (b[1] - a[1]) * amount),
  Math.round(a[2] + (b[2] - a[2]) * amount),
];

function blob(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: Rgb,
  alpha: number,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.55, rgba(color, alpha * 0.45));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export const BACKGROUND_STYLES: readonly BackgroundStyle[] = [
  {
    id: "aurora",
    fps: 24,
    name: "Aurora",
    description: "Soft fields of the space's colour drifting over about a minute.",
    opacity: [0.55, 0.42],
    follow: 0.012,
    grain: true,
    render: {
      kind: "soft",
      resolution: 1 / 8,
      blur: 48,
      draw: (context, width, height, frame) => {
        const t = frame.time;
        const size = Math.max(width, height);
        const warm = shiftHue(frame.accent, 38);
        const cool = shiftHue(frame.accent, -42);
        context.clearRect(0, 0, width, height);
        blob(
          context,
          (0.26 + 0.1 * Math.sin(t * 0.05)) * width,
          (0.3 + 0.08 * Math.cos(t * 0.043)) * height,
          0.55 * size,
          frame.accent,
          0.5,
        );
        blob(
          context,
          (0.76 + 0.08 * Math.cos(t * 0.037)) * width,
          (0.26 + 0.1 * Math.sin(t * 0.052)) * height,
          0.48 * size,
          warm,
          0.4,
        );
        blob(
          context,
          (0.56 + 0.14 * Math.sin(t * 0.029 + 1.3)) * width,
          (0.86 + 0.06 * Math.cos(t * 0.034)) * height,
          0.6 * size,
          cool,
          0.36,
        );
        blob(
          context,
          frame.glow.x * width,
          frame.glow.y * height,
          0.3 * size,
          mix(frame.accent, [255, 255, 255], 0.35),
          0.3,
        );
      },
    },
  },
  {
    id: "dawn",
    fps: 20,
    name: "Dawn",
    description: "A low glow along the bottom edge that breathes slowly.",
    opacity: [0.6, 0.5],
    follow: 0.015,
    grain: true,
    render: {
      kind: "soft",
      resolution: 1 / 8,
      blur: 36,
      draw: (context, width, height, frame) => {
        const breathe = 0.5 + 0.5 * Math.sin(frame.time * 0.24);
        const warm = shiftHue(frame.accent, 30);
        context.clearRect(0, 0, width, height);
        const cx = (0.5 + (frame.glow.x - 0.5) * 0.18) * width;
        const rx = width * 0.85;
        const ry = height * (0.5 + 0.06 * breathe);
        context.save();
        context.translate(cx, height * 1.05);
        context.scale(1, ry / rx);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
        gradient.addColorStop(0, rgba(warm, 0.75));
        gradient.addColorStop(0.35, rgba(frame.accent, 0.45));
        gradient.addColorStop(0.7, rgba(frame.accent, 0.12));
        gradient.addColorStop(1, rgba(frame.accent, 0));
        context.fillStyle = gradient;
        context.fillRect(-rx, -rx, rx * 2, rx * 2);
        context.restore();
      },
    },
  },
  {
    id: "spotlight",
    fps: 30,
    timeless: true,
    name: "Spotlight",
    description: "A dot grid you can barely see, until the pointer lights it up.",
    opacity: [0.5, 0.55],
    follow: 0.1,
    grain: false,
    intensity: true,
    render: {
      kind: "sharp",
      draw: (context, width, height, frame, preview) => {
        const step = preview ? 11 : 22;
        const aspect = width / Math.max(1, height);
        // Intensity widens the lit patch, brightens it, swells its dots and lifts the rest of the grid.
        const k = frame.intensity;
        const spread = 10 / (0.5 + 0.5 * k);
        const peak = Math.min(1, 0.3 + 0.45 * k);
        const floor = 0.04 + 0.06 * k;
        const swell = (preview ? 0.6 : 1) * (0.4 + 0.6 * k);
        context.clearRect(0, 0, width, height);
        for (let y = step / 2; y < height; y += step) {
          for (let x = step / 2; x < width; x += step) {
            const dx = (x / width - frame.glow.x) * aspect;
            const dy = y / height - frame.glow.y;
            const light = Math.exp(-(dx * dx + dy * dy) * spread);
            const alpha = floor + light * peak;
            const base = frame.tinted ? frame.accent : frame.ink;
            context.fillStyle = rgba(
              light > 0.4 ? mix(base, frame.accent, light * 0.6) : base,
              alpha,
            );
            context.beginPath();
            context.arc(x, y, (preview ? 0.7 : 1) + light * swell, 0, Math.PI * 2);
            context.fill();
          }
        }
      },
    },
  },
  {
    id: "topography",
    fps: 12,
    name: "Topography",
    description: "Faint map lines, almost still, that brighten near the pointer.",
    opacity: [0.3, 0.32],
    follow: 0.05,
    grain: false,
    intensity: true,
    render: {
      kind: "sharp",
      draw: (context, width, height, frame, preview) => {
        const cell = preview ? 1 : 2;
        const w = Math.ceil(width / cell);
        const h = Math.ceil(height / cell);
        const image = context.createImageData(w, h);
        const data = image.data;
        const aspect = w / Math.max(1, h);
        const t = frame.time * 0.03;
        const [r, g, b] = frame.tinted ? frame.accent : frame.ink;
        for (let y = 0; y < h; y++) {
          const ny = y / h;
          for (let x = 0; x < w; x++) {
            const nx = x / w;
            const dx = (nx - frame.glow.x) * aspect;
            const dy = ny - frame.glow.y;
            const light =
              Math.exp(-(dx * dx + dy * dy) * (6 / (0.5 + 0.5 * frame.intensity))) *
              frame.intensity;
            const field =
              0.5 +
              0.25 * Math.sin(nx * 4.2 + t) * Math.cos(ny * 3.3 - t * 0.8) +
              0.25 * Math.sin((nx * 1.3 + ny) * 5.1 + t * 0.6);
            const band = (field * 7) % 1;
            const on = band < 0.045 + light * 0.03;
            const i = (y * w + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = on ? 255 * Math.min(1, 0.35 + light * 0.65) : 0;
          }
        }
        // Drawn small and stretched, so lines keep their pixel width when the canvas is larger.
        scratch.width = w;
        scratch.height = h;
        scratch.getContext("2d")?.putImageData(image, 0, 0);
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;
        context.drawImage(scratch, 0, 0, width, height);
      },
    },
  },
  {
    id: "silk",
    fps: 24,
    name: "Silk",
    description: "Soft ribbons of colour folding slowly; they lift toward the pointer.",
    opacity: [0.5, 0.42],
    follow: 0.02,
    grain: true,
    render: {
      kind: "soft",
      resolution: 1 / 3,
      blur: 10,
      draw: (context, width, height, frame) => {
        const t = frame.time;
        context.clearRect(0, 0, width, height);
        // Broad, overlapping folds; each is translucent, so where they cross the colour deepens.
        for (let k = 0; k < 4; k++) {
          const color = shiftHue(frame.accent, (k - 1.5) * 16);
          const base = height * (0.18 + k * 0.2);
          const amp = height * (0.08 + 0.025 * k);
          const curve = (x: number) => {
            const nx = x / width;
            const lift =
              Math.exp(-((nx - frame.glow.x) ** 2) * 8) * (frame.glow.y * height - base) * 0.18;
            return (
              base +
              amp * Math.sin(nx * 2.6 + t * 0.08 + k * 1.1) +
              amp * 0.45 * Math.sin(nx * 6.1 - t * 0.05 + k * 2.3) +
              lift
            );
          };
          const thickness = (x: number) =>
            height * (0.16 + 0.07 * Math.sin((x / width) * 3.4 + t * 0.04 + k * 1.7));
          const steps = 64;
          context.beginPath();
          for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * width;
            if (i === 0) context.moveTo(x, curve(x));
            else context.lineTo(x, curve(x));
          }
          for (let i = steps; i >= 0; i--) {
            const x = (i / steps) * width;
            context.lineTo(x, curve(x) + thickness(x));
          }
          context.closePath();
          const gradient = context.createLinearGradient(
            0,
            base - amp,
            0,
            base + amp + height * 0.23,
          );
          gradient.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.35), 0.55));
          gradient.addColorStop(0.35, rgba(color, 0.4));
          gradient.addColorStop(1, rgba(color, 0.02));
          context.fillStyle = gradient;
          context.fill();
          // The sheen along the fold's top edge.
          context.beginPath();
          for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * width;
            if (i === 0) context.moveTo(x, curve(x));
            else context.lineTo(x, curve(x));
          }
          context.strokeStyle = rgba(mix(color, [255, 255, 255], 0.6), 0.35);
          context.lineWidth = Math.max(1, height * 0.008);
          context.stroke();
        }
      },
    },
  },
  {
    id: "gradient",
    fps: 15,
    name: "Gradient",
    description:
      "A wash of three shades of the colour that turns slowly, about once every five minutes.",
    opacity: [0.45, 0.38],
    follow: 0.015,
    grain: true,
    render: {
      kind: "soft",
      resolution: 1 / 8,
      blur: 24,
      draw: (context, width, height, frame) => {
        const angle = frame.time * 0.02;
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.hypot(width, height) / 2;
        const gradient = context.createLinearGradient(
          cx - Math.cos(angle) * r,
          cy - Math.sin(angle) * r,
          cx + Math.cos(angle) * r,
          cy + Math.sin(angle) * r,
        );
        gradient.addColorStop(0, rgba(shiftHue(frame.accent, -35), 0.55));
        gradient.addColorStop(0.5, rgba(frame.accent, 0.3));
        gradient.addColorStop(1, rgba(shiftHue(frame.accent, 35), 0.5));
        context.clearRect(0, 0, width, height);
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        blob(
          context,
          frame.glow.x * width,
          frame.glow.y * height,
          0.35 * Math.max(width, height),
          mix(frame.accent, [255, 255, 255], 0.4),
          0.25,
        );
      },
    },
  },
  {
    id: "none",
    fps: 0,
    name: "None",
    description: "A plain background.",
    opacity: [0, 0],
    follow: 0,
    grain: false,
    render: null,
  },
];

/** Opacity as a share of each style's own, in percent. */
export const MIN_BACKGROUND_OPACITY = 10;
export const MAX_BACKGROUND_OPACITY = 200;

/** Intensity in percent, 100 as designed. */
export const MIN_BACKGROUND_INTENSITY = 0;
export const MAX_BACKGROUND_INTENSITY = 200;

/** Extra blur on top of a style's own, in CSS pixels. */
export const MIN_BACKGROUND_BLUR = 0;
export const MAX_BACKGROUND_BLUR = 16;
export const DEFAULT_BACKGROUND_BLUR = 0;

/** Colours offered beside the space's own. */
export const BACKGROUND_COLORS: readonly string[] = [
  "#7c8cff",
  "#b07cff",
  "#ff7cb9",
  "#ff8a5c",
  "#f2c14e",
  "#4fc58b",
  "#40b8d8",
  "#9aa4b2",
];

export const backgroundStyle = (id: BackgroundStyleId) =>
  BACKGROUND_STYLES.find((style) => style.id === id) ?? BACKGROUND_STYLES[0]!;

/** One space's background choice. */
export interface BackgroundChoice {
  readonly style: BackgroundStyleId;
  /** Percent of the style's own opacity. */
  readonly opacity: number;
  /** "space" for the space's colour, or a hex colour. */
  readonly color: string;
  readonly blur: number;
  /** How strongly the pointer lights things up, in percent (styles that take it). */
  readonly intensity: number;
  /** Film grain over it, in percent; null keeps the style's own. */
  readonly grain: number | null;
}

export const DEFAULT_BACKGROUND: BackgroundChoice = {
  style: "dawn",
  opacity: 100,
  color: "space",
  blur: DEFAULT_BACKGROUND_BLUR,
  intensity: 100,
  grain: 15,
};

/** Grain in percent: what a style shows unless the space sets its own. */
export const MIN_BACKGROUND_GRAIN = 0;
export const MAX_BACKGROUND_GRAIN = 100;
export const STYLE_GRAIN = 40;

export const grainFor = (choice: BackgroundChoice, style: BackgroundStyle) =>
  choice.grain ?? (style.grain ? STYLE_GRAIN : 0);

interface BackgroundState {
  /** What spaces without a choice of their own show. */
  readonly shared: BackgroundChoice;
  /** Each space's own choice, by space id. */
  readonly bySpace: Readonly<Record<string, BackgroundChoice>>;
  /** Changes one space's background, or the shared one when `spaceId` is null. */
  readonly update: (spaceId: string | null, patch: Partial<BackgroundChoice>) => void;
  /** Gives every space this space's background. */
  readonly applyToAll: (spaceId: string | null) => void;
}

const clampBlur = (blur: number) =>
  Math.min(MAX_BACKGROUND_BLUR, Math.max(MIN_BACKGROUND_BLUR, Math.round(blur)));

/** A space's background: its own choice, else the shared one. */
export const backgroundFor = (
  state: Pick<BackgroundState, "shared" | "bySpace">,
  spaceId: string | null,
) => (spaceId ? state.bySpace[spaceId] : undefined) ?? state.shared;

/** The New screen's background, chosen per space in Appearance settings. */
export const useNewScreenBackground = create<BackgroundState>()(
  persist(
    (set) => ({
      shared: DEFAULT_BACKGROUND,
      bySpace: {},
      update: (spaceId, patch) =>
        set((state) => {
          const next = { ...backgroundFor(state, spaceId), ...patch };
          if (patch.blur !== undefined) next.blur = clampBlur(patch.blur);
          if (patch.grain !== undefined && patch.grain !== null) {
            next.grain = Math.min(
              MAX_BACKGROUND_GRAIN,
              Math.max(MIN_BACKGROUND_GRAIN, Math.round(patch.grain)),
            );
          }
          if (patch.intensity !== undefined) {
            next.intensity = Math.min(
              MAX_BACKGROUND_INTENSITY,
              Math.max(MIN_BACKGROUND_INTENSITY, Math.round(patch.intensity)),
            );
          }
          if (patch.opacity !== undefined) {
            next.opacity = Math.min(
              MAX_BACKGROUND_OPACITY,
              Math.max(MIN_BACKGROUND_OPACITY, Math.round(patch.opacity)),
            );
          }
          return spaceId ? { bySpace: { ...state.bySpace, [spaceId]: next } } : { shared: next };
        }),
      applyToAll: (spaceId) =>
        set((state) => ({ shared: backgroundFor(state, spaceId), bySpace: {} })),
    }),
    {
      name: "rome:new-screen-background:v1",
      version: 6,
      migrate: (persisted, version) => {
        // The first set of styles was busy pattern work; those start over on the default.
        if (version < 2)
          return { shared: DEFAULT_BACKGROUND, bySpace: {} } as unknown as BackgroundState;
        type Old = Partial<BackgroundChoice> & { strength?: "subtle" | "balanced" | "bold" };
        // Paper, Linen, Dunes and Night sky were retired; spaces on them go back to the default.
        const known = (style: unknown) =>
          BACKGROUND_STYLES.some((option) => option.id === style)
            ? (style as BackgroundStyleId)
            : DEFAULT_BACKGROUND.style;
        // Strength became an opacity percentage; choices gained a colour, then intensity.
        const upgrade = (old: Old | undefined): BackgroundChoice => {
          const { strength, ...rest } = old ?? {};
          const opacity = strength === "subtle" ? 60 : strength === "bold" ? 150 : 100;
          return { ...DEFAULT_BACKGROUND, opacity, ...rest, style: known(rest.style) };
        };
        if (version < 3)
          return { shared: upgrade(persisted as Old), bySpace: {} } as unknown as BackgroundState;
        const old = (persisted ?? {}) as { shared?: Old; bySpace?: Record<string, Old> };
        return {
          shared: upgrade(old.shared),
          bySpace: Object.fromEntries(
            Object.entries(old.bySpace ?? {}).map(([id, choice]) => [id, upgrade(choice)]),
          ),
        } as unknown as BackgroundState;
      },
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ shared: state.shared, bySpace: state.bySpace }),
    },
  ),
);
