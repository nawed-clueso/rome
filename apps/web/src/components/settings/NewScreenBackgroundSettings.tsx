import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";

import { NewScreenBackground } from "../chat/NewScreenBackground";
import { useBrowserModel, useCurrentSpace } from "../../browser/rome/browserStore";
import { SpaceMark } from "../sidebar/rome/RomeSidebarTop";
import { Button } from "../ui/button";
import {
  BACKGROUND_COLORS,
  BACKGROUND_STYLES,
  type BackgroundChoice,
  backgroundFor,
  DEFAULT_BACKGROUND,
  backgroundStyle,
  grainFor,
  MAX_BACKGROUND_BLUR,
  MAX_BACKGROUND_GRAIN,
  MAX_BACKGROUND_INTENSITY,
  MAX_BACKGROUND_OPACITY,
  MIN_BACKGROUND_BLUR,
  MIN_BACKGROUND_GRAIN,
  MIN_BACKGROUND_INTENSITY,
  MIN_BACKGROUND_OPACITY,
  useNewScreenBackground,
} from "../chat/newScreenBackgrounds";
import { cn } from "~/lib/utils";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const NO_IDS: readonly string[] = [];

const sameChoice = (a: BackgroundChoice, b: BackgroundChoice) =>
  a.style === b.style &&
  a.opacity === b.opacity &&
  a.color === b.color &&
  a.blur === b.blur &&
  a.intensity === b.intensity &&
  (a.grain ?? null) === (b.grain ?? null);

const sliderStyle = (value: number, min: number, max: number) => {
  const ratio = (value - min) / (max - min);
  return {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
};

function Slider(props: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-3 sm:w-[13rem]">
      <output
        className="min-w-14 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={props.id}
      >
        {props.value}
        {props.unit}
      </output>
      <input
        aria-label={props.label}
        className="settings-slider min-w-0 flex-1"
        id={props.id}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        step={props.step}
        style={sliderStyle(props.value, props.min, props.max)}
        type="range"
        value={props.value}
      />
    </div>
  );
}

/** The space's own colour, the preset colours, and any colour from the system picker. */
function ColorChoice(props: {
  readonly value: string;
  readonly spaceAccent: string | null;
  readonly onChange: (value: string) => void;
}) {
  const custom = props.value !== "space" && !BACKGROUND_COLORS.includes(props.value);
  const swatch = (selected: boolean) =>
    cn(
      "relative grid size-6 shrink-0 cursor-pointer place-items-center rounded-full outline-none transition-shadow",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      selected
        ? "ring-2 ring-foreground ring-inset"
        : "hover:ring-2 hover:ring-foreground/30 hover:ring-inset",
    );
  return (
    <div
      role="radiogroup"
      aria-label="Background colour"
      className="flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        role="radio"
        aria-checked={props.value === "space"}
        aria-label="The space's colour"
        onClick={() => props.onChange("space")}
        style={{ background: props.spaceAccent ?? "var(--primary)" }}
        className={swatch(props.value === "space")}
      >
        <span className="font-semibold text-3xs text-white uppercase mix-blend-difference">S</span>
      </button>
      {BACKGROUND_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={props.value === color}
          aria-label={color}
          onClick={() => props.onChange(color)}
          style={{ background: color }}
          className={swatch(props.value === color)}
        />
      ))}
      <label
        aria-label="Any colour"
        style={{
          background: custom
            ? props.value
            : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
        className={swatch(custom)}
      >
        <input
          type="color"
          value={custom ? props.value : "#7c8cff"}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** The New screen's background, per space: a live thumbnail of each style, its colour, opacity and blur. */
export function NewScreenBackgroundSection() {
  // Each space keeps its own background; this edits the space you're in.
  const space = useCurrentSpace();
  const spaceId = space?.id ?? null;
  const spaceCount = useBrowserModel((state) => state.browser?.spaces.length ?? 0);
  const choice = useNewScreenBackground((state) => backgroundFor(state, spaceId));
  const update = useNewScreenBackground((state) => state.update);
  const applyToAll = useNewScreenBackground((state) => state.applyToAll);
  const { style, opacity, color, blur } = choice;
  const intensity = choice.intensity ?? DEFAULT_BACKGROUND.intensity;
  const takesIntensity = backgroundStyle(style).intensity === true;
  const grain = grainFor(choice, backgroundStyle(style));
  const ownGrain = choice.grain ?? null;
  const set = (patch: Partial<BackgroundChoice>) => update(spaceId, patch);
  // Whether every space already shows what this one does.
  const spaceIds = useBrowserModel(
    useShallow((state) => state.browser?.spaces.map((option) => option.id) ?? NO_IDS),
  );
  const sharedChoice = useNewScreenBackground((state) => state.shared);
  const bySpace = useNewScreenBackground((state) => state.bySpace);
  const sameEverywhere = spaceIds.every((id) =>
    sameChoice(backgroundFor({ shared: sharedChoice, bySpace }, id), choice),
  );

  return (
    <SettingsSection
      id="new-screen"
      title="New screen"
      headerAction={
        space && spaceCount > 1 ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <SpaceMark space={space} className="size-4 rounded-sm text-3xs" />
              For {space.name}
            </span>
            <Button
              size="xs"
              variant="outline"
              disabled={sameEverywhere}
              onClick={() => applyToAll(spaceId)}
            >
              {sameEverywhere ? "Same in all spaces" : "Use in all spaces"}
            </Button>
          </div>
        ) : null
      }
    >
      <SettingsRow
        {...searchableSetting("new-screen-background")}
        description="What sits behind the New screen. Each space keeps its own; hover a preview to try it."
        resetAction={
          style !== DEFAULT_BACKGROUND.style ? (
            <SettingResetButton
              label="background"
              onClick={() => set({ style: DEFAULT_BACKGROUND.style })}
            />
          ) : null
        }
      >
        <div
          role="radiogroup"
          aria-label="Background style"
          className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 pt-1 pb-3"
        >
          {BACKGROUND_STYLES.map((option) => {
            const selected = option.id === style;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => set({ style: option.id })}
                className="group flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl text-left outline-none"
              >
                <span
                  className={cn(
                    "relative block aspect-[16/10] overflow-hidden rounded-lg border bg-background transition-shadow",
                    "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-inset",
                    selected
                      ? "border-foreground/60 ring-1 ring-foreground/60 ring-inset"
                      : "border-border group-hover:border-foreground/25",
                  )}
                >
                  <NewScreenBackground
                    styleId={option.id}
                    opacity={opacity}
                    color={color}
                    blur={blur}
                    intensity={intensity}
                    grain={ownGrain}
                    preview
                    className="absolute inset-0"
                  />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
                  <span className="truncate font-medium text-sm">{option.name}</span>
                  <span className="line-clamp-2 text-muted-foreground text-xs">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsRow>
      <SettingsRow
        {...searchableSetting("new-screen-background-color")}
        description="Paint it in the space's colour (S), or any colour you like."
        resetAction={
          color !== DEFAULT_BACKGROUND.color ? (
            <SettingResetButton
              label="background colour"
              onClick={() => set({ color: DEFAULT_BACKGROUND.color })}
            />
          ) : null
        }
        control={
          <ColorChoice
            value={color}
            spaceAccent={space?.accent ?? null}
            onChange={(next) => set({ color: next })}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("new-screen-background-opacity")}
        description="How strongly it shows; 100% is the style as designed."
        resetAction={
          opacity !== DEFAULT_BACKGROUND.opacity ? (
            <SettingResetButton
              label="background opacity"
              onClick={() => set({ opacity: DEFAULT_BACKGROUND.opacity })}
            />
          ) : null
        }
        control={
          <Slider
            id="new-screen-background-opacity"
            label="Background opacity"
            value={opacity}
            min={MIN_BACKGROUND_OPACITY}
            max={MAX_BACKGROUND_OPACITY}
            step={5}
            unit="%"
            onChange={(next) => set({ opacity: next })}
          />
        }
      />
      {takesIntensity ? (
        <SettingsRow
          {...searchableSetting("new-screen-background-intensity")}
          description="How strongly the pointer lights it up: how bright and how wide the lit patch is, and how much shows elsewhere."
          resetAction={
            intensity !== DEFAULT_BACKGROUND.intensity ? (
              <SettingResetButton
                label="background intensity"
                onClick={() => set({ intensity: DEFAULT_BACKGROUND.intensity })}
              />
            ) : null
          }
          control={
            <Slider
              id="new-screen-background-intensity"
              label="Background intensity"
              value={intensity}
              min={MIN_BACKGROUND_INTENSITY}
              max={MAX_BACKGROUND_INTENSITY}
              step={5}
              unit="%"
              onChange={(next) => set({ intensity: next })}
            />
          }
        />
      ) : null}
      <SettingsRow
        {...searchableSetting("new-screen-background-grain")}
        description="Film grain over it, the same for every style."
        resetAction={
          ownGrain !== DEFAULT_BACKGROUND.grain ? (
            <SettingResetButton
              label="background grain"
              onClick={() => set({ grain: DEFAULT_BACKGROUND.grain })}
            />
          ) : null
        }
        control={
          <Slider
            id="new-screen-background-grain"
            label="Background grain"
            value={grain}
            min={MIN_BACKGROUND_GRAIN}
            max={MAX_BACKGROUND_GRAIN}
            step={5}
            unit="%"
            onChange={(next) => set({ grain: next })}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("new-screen-background-blur")}
        description="Extra softness on top of each style's own."
        resetAction={
          blur !== DEFAULT_BACKGROUND.blur ? (
            <SettingResetButton
              label="background blur"
              onClick={() => set({ blur: DEFAULT_BACKGROUND.blur })}
            />
          ) : null
        }
        control={
          <Slider
            id="new-screen-background-blur"
            label="Background blur"
            value={blur}
            min={MIN_BACKGROUND_BLUR}
            max={MAX_BACKGROUND_BLUR}
            step={1}
            unit=" px"
            onChange={(next) => set({ blur: next })}
          />
        }
      />
    </SettingsSection>
  );
}
