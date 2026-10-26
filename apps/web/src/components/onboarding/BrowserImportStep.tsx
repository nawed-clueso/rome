import { ArrowRightIcon, GlobeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  applyImport,
  type ImportBrowser,
  type ImportPlan,
  type ImportSummary,
  listImportBrowsers,
  planTabCount,
  readImport,
} from "../../browser/rome/browserImport";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

function describePlan(source: ImportBrowser, plan: ImportPlan): string[] {
  const lines: string[] = [];
  const tabs = planTabCount(plan);
  if (plan.spaces.length && source.kind !== "chromium") {
    lines.push(`${plural(plan.spaces.length, "space")} with ${plural(tabs, "pinned tab")}`);
  } else if (tabs) {
    lines.push(`${plural(tabs, "tab")} from the bookmarks bar, as pinned tabs`);
  }
  return lines;
}

function describeSummary(summary: ImportSummary): string {
  const parts = [
    summary.spaces ? plural(summary.spaces, "new space") : null,
    summary.tabs ? plural(summary.tabs, "pinned tab") : null,
    summary.pages ? plural(summary.pages, "page") + " of history" : null,
  ].filter(Boolean);
  return parts.length ? `Imported ${parts.join(", ")}.` : "Everything was already in Rome.";
}

function BrowserIcon(props: { readonly browser: ImportBrowser }) {
  return props.browser.icon ? (
    <img src={props.browser.icon} alt="" className="size-7 shrink-0" />
  ) : (
    <GlobeIcon className="size-5 shrink-0 text-muted-foreground" />
  );
}

/**
 * Brings a new user's browsing over from the browser they used before: pick the
 * browser (and profile), see what it holds, and choose what to bring.
 * `onDone` runs on Continue, whether or not anything was imported.
 */
export function BrowserImportStep(props: {
  readonly onDone: () => void;
  /** Label for the button that moves on without importing. */
  readonly skipLabel?: string;
}) {
  const [browsers, setBrowsers] = useState<readonly ImportBrowser[] | null>(null);
  const [browserId, setBrowserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [tabs, setTabs] = useState(true);
  const [history, setHistory] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    let live = true;
    void listImportBrowsers()
      .catch(() => [])
      .then((found) => {
        if (!live) return;
        setBrowsers(found);
        const first = found[0];
        if (first) {
          setBrowserId(first.id);
          setProfileId(first.profiles[0]?.id ?? null);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const source = browsers?.find((entry) => entry.id === browserId) ?? null;

  // What the chosen profile holds, read again whenever the choice changes.
  useEffect(() => {
    if (!source || !profileId) return;
    let live = true;
    void readImport(source, profileId)
      .then((next) => {
        if (!live) return;
        setPlan(next);
        setReadError(null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setPlan(null);
        setReadError(error instanceof Error ? error.message : "Could not read this browser.");
      });
    return () => {
      live = false;
    };
  }, [source, profileId]);

  const choose = (id: string) => {
    const next = browsers?.find((entry) => entry.id === id);
    if (!next) return;
    setBrowserId(id);
    setProfileId(next.profiles[0]?.id ?? null);
    setPlan(null);
    setReadError(null);
    setSummary(null);
  };

  const runImport = async () => {
    if (!plan) return;
    setImporting(true);
    try {
      setSummary(await applyImport(plan, { tabs, history }));
    } finally {
      setImporting(false);
    }
  };

  if (browsers === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Spinner size="lg" tone="muted" />
        <p className="text-sm text-muted-foreground">Looking for your browsers…</p>
      </div>
    );
  }

  const tabLines = source && plan ? describePlan(source, plan) : [];
  const canImport =
    !!plan && !importing && ((tabs && tabLines.length > 0) || (history && plan.history.length > 0));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Bring your browsing with you
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Rome copies your spaces, pinned tabs and history from the browser you use now. Nothing
        changes there.
      </p>

      {browsers.length === 0 ? (
        <p className="mt-5 rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          No other browsers found on this Mac.
        </p>
      ) : (
        <RadioGroup
          value={browserId ?? ""}
          onValueChange={(value) => choose(String(value))}
          aria-label="Browser to import from"
          className="mt-5"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {browsers.map((entry) => (
              <label
                key={entry.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors",
                  entry.id === browserId
                    ? "border-foreground/40 ring-1 ring-foreground/20 ring-inset"
                    : "border-border hover:border-foreground/25",
                )}
              >
                <Radio value={entry.id} className="sr-only" />
                <BrowserIcon browser={entry} />
                <span className="min-w-0 truncate text-sm font-medium">{entry.name}</span>
              </label>
            ))}
          </div>
        </RadioGroup>
      )}

      {source && source.profiles.length > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Profile</span>
          <Select
            value={profileId ?? ""}
            onValueChange={(value) => {
              setProfileId(String(value));
              setPlan(null);
              setSummary(null);
            }}
          >
            <SelectTrigger size="sm" className="w-48 min-w-0" aria-label="Profile">
              <SelectValue>
                {source.profiles.find((profile) => profile.id === profileId)?.name ?? "Profile"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {source.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      ) : null}

      {source ? (
        <div className="mt-4 rounded-lg border border-border bg-background px-3 py-1">
          {readError ? (
            <p className="py-2.5 text-sm text-muted-foreground">
              {source.kind === "dia" ? `${readError} Open Dia, then choose it again.` : readError}
            </p>
          ) : !plan ? (
            <div className="flex items-center gap-2 py-2.5 text-sm text-muted-foreground">
              <Spinner size="sm" tone="muted" /> Reading {source.name}…
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <Checkbox
                  checked={tabs && tabLines.length > 0}
                  disabled={tabLines.length === 0 || importing}
                  onCheckedChange={(checked) => setTabs(checked === true)}
                />
                <span className="min-w-0 flex-1 text-sm">
                  {tabLines[0] ?? "No spaces or pinned tabs to bring"}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 border-border border-t py-2.5">
                <Checkbox
                  checked={history && plan.history.length > 0}
                  disabled={plan.history.length === 0 || importing}
                  onCheckedChange={(checked) => setHistory(checked === true)}
                />
                <span className="min-w-0 flex-1 text-sm">
                  {plan.history.length
                    ? `${plural(plan.history.length, "recent page")} of history, for address suggestions`
                    : "No history to bring"}
                </span>
              </label>
            </>
          )}
        </div>
      ) : null}

      {summary ? (
        <p role="status" className="mt-3 text-sm text-foreground">
          {describeSummary(summary)}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          Saved passwords and sign-ins stay in your old browser; sign in to sites again in Rome.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {summary ? null : (
            <Button variant="ghost-muted" disabled={importing} onClick={props.onDone}>
              {props.skipLabel ?? "Skip"}
            </Button>
          )}
          {summary ? (
            <Button autoFocus onClick={props.onDone}>
              Continue
              <ArrowRightIcon className="size-3.5" />
            </Button>
          ) : (
            <Button disabled={!canImport} onClick={() => void runImport()}>
              {importing ? <Spinner size="sm" /> : null}
              Import
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
