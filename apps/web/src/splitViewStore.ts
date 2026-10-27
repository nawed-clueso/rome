import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

/** A split holds at most two rows of three chats. */
export const MAX_SPLIT_ROWS = 2;
export const MAX_SPLIT_COLUMNS = 3;

/** Chats (and browser tabs) shown side by side, as Arc's split view: one unit in the sidebar. */
export interface SplitGroup {
  readonly id: string;
  /** Scoped thread keys or tab keys (`splitTabKey`), top row first, each row left to right. */
  readonly rows: readonly (readonly string[])[];
  /** Folded to its header in the sidebar. */
  readonly collapsed?: boolean;
  /** What the user called it; unnamed splits show as "Split view". */
  readonly name?: string;
}

export type SplitSide = "left" | "right" | "top" | "bottom";

/** Where a dropped chat goes: beside `target`, on `side`. */
export interface SplitPlacement {
  readonly target: string;
  readonly side: SplitSide;
}

export const splitMembers = (group: SplitGroup): string[] => group.rows.flat();

/** A browser tab in a split, beside the chats, keyed apart from thread keys. */
export const splitTabKey = (tabId: string) => `tab:${tabId}`;
export const splitTabId = (key: string): string | null =>
  key.startsWith("tab:") ? key.slice(4) : null;

export const splitGroupOf = (groups: readonly SplitGroup[], threadKey: string | null) =>
  threadKey === null
    ? null
    : (groups.find((group) => group.rows.some((row) => row.includes(threadKey))) ?? null);

/** The rows after placing `threadKey`, or null where it can't go. */
export function placeInRows(
  rows: readonly (readonly string[])[],
  threadKey: string,
  { target, side }: SplitPlacement,
): string[][] | null {
  const rowIndex = rows.findIndex((row) => row.includes(target));
  if (rowIndex < 0 || rows.flat().includes(threadKey)) return null;
  const next = rows.map((row) => [...row]);
  const row = next[rowIndex]!;
  const column = row.indexOf(target);
  if (side === "left" || side === "right") {
    if (row.length >= MAX_SPLIT_COLUMNS) return null;
    row.splice(side === "left" ? column : column + 1, 0, threadKey);
    return next;
  }
  if (next.length < MAX_SPLIT_ROWS) {
    // A second row, alone under (or over) the first.
    return side === "top" ? [[threadKey], ...next] : [...next, [threadKey]];
  }
  // Two rows already: it joins the other row, under or over its target.
  const otherIndex = side === "top" ? rowIndex - 1 : rowIndex + 1;
  const other = next[otherIndex];
  if (!other || other.length >= MAX_SPLIT_COLUMNS) return null;
  const share = (column + 0.5) / row.length;
  other.splice(Math.round(share * other.length), 0, threadKey);
  return next;
}

interface SplitViewState {
  readonly groups: readonly SplitGroup[];
  /** How much of its row each chat takes, relative to the others (default 1). */
  readonly columnWeights: Readonly<Record<string, number>>;
  /** How much of the split each row takes, by group (default even). */
  readonly rowWeights: Readonly<Record<string, readonly number[]>>;
  /** Places `threadKey` beside a chat: in that chat's split, or a new one. */
  readonly place: (mainKey: string, threadKey: string, placement: SplitPlacement) => boolean;
  /** Puts `threadKey` beside `besideKey` wherever there is room. */
  readonly join: (besideKey: string, threadKey: string) => void;
  /** Takes a chat out of its split; a split left with one chat ends. */
  readonly leave: (threadKey: string) => void;
  /** Ends a split; its chats go back to the list. */
  readonly separate: (groupId: string) => void;
  readonly setColumnWeights: (weights: Readonly<Record<string, number>>) => void;
  readonly setRowWeights: (groupId: string, weights: readonly number[]) => void;
  readonly setCollapsed: (groupId: string, collapsed: boolean) => void;
  /** Names a split; a blank name goes back to "Split view". */
  readonly rename: (groupId: string, name: string) => void;
  /**
   * Lays a split out as `rows`, or makes a new one when `groupId` is null.
   * Members come out of any other split; members it held but `rows` leaves out
   * leave it, and its sizes go back to even. Returns the split's id, or null when
   * the rows don't fit.
   */
  readonly setRows: (groupId: string | null, rows: readonly (readonly string[])[]) => string | null;
}

/** Whether rows fit a split: one or two rows of one to three, two members at least, none twice. */
export function rowsFit(rows: readonly (readonly string[])[]): boolean {
  const members = rows.flat();
  return (
    rows.length >= 1 &&
    rows.length <= MAX_SPLIT_ROWS &&
    rows.every((row) => row.length >= 1 && row.length <= MAX_SPLIT_COLUMNS) &&
    members.length >= 2 &&
    new Set(members).size === members.length
  );
}

/** `members` as split rows: one row up to three, else two as even as they go, the first fuller. */
export function evenRows(members: readonly string[]): string[][] {
  if (members.length <= MAX_SPLIT_COLUMNS) return [[...members]];
  const first = Math.ceil(members.length / MAX_SPLIT_ROWS);
  return [members.slice(0, first), members.slice(first)];
}

const withoutMember = (groups: readonly SplitGroup[], threadKey: string): SplitGroup[] =>
  groups.flatMap((group) => {
    if (!group.rows.some((row) => row.includes(threadKey))) return [group];
    const rows = group.rows
      .map((row) => row.filter((key) => key !== threadKey))
      .filter((row) => row.length > 0);
    return rows.flat().length < 2 ? [] : [{ ...group, rows }];
  });

const newGroupId = () =>
  `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useSplitViewStore = create<SplitViewState>()(
  persist(
    (set, get) => ({
      groups: [],
      columnWeights: {},
      rowWeights: {},
      place: (mainKey, threadKey, placement) => {
        if (threadKey === mainKey || threadKey === placement.target) return false;
        // A chat dragged out of another split leaves it first.
        const groups = withoutMember(get().groups, threadKey);
        const host = splitGroupOf(groups, mainKey);
        const rows = placeInRows(host?.rows ?? [[mainKey]], threadKey, placement);
        if (!rows) return false;
        set({
          groups: host
            ? groups.map((group) => (group.id === host.id ? { ...group, rows } : group))
            : [...groups, { id: newGroupId(), rows }],
        });
        return true;
      },
      join: (besideKey, threadKey) => {
        const { place, groups } = get();
        const rows = splitGroupOf(groups, besideKey)?.rows ?? [[besideKey]];
        const last = (row: readonly string[] | undefined) => row?.[row.length - 1] ?? besideKey;
        void (
          place(besideKey, threadKey, { target: last(rows[0]), side: "right" }) ||
          place(besideKey, threadKey, { target: last(rows[rows.length - 1]), side: "bottom" }) ||
          place(besideKey, threadKey, { target: last(rows[rows.length - 1]), side: "right" })
        );
      },
      leave: (threadKey) =>
        set((state) =>
          splitGroupOf(state.groups, threadKey)
            ? { groups: withoutMember(state.groups, threadKey) }
            : state,
        ),
      separate: (groupId) =>
        set((state) => ({ groups: state.groups.filter((group) => group.id !== groupId) })),
      setColumnWeights: (weights) =>
        set((state) => ({ columnWeights: { ...state.columnWeights, ...weights } })),
      setRowWeights: (groupId, weights) =>
        set((state) => ({ rowWeights: { ...state.rowWeights, [groupId]: weights } })),
      setCollapsed: (groupId, collapsed) =>
        set((state) => ({
          groups: state.groups.map((group) =>
            group.id === groupId ? { ...group, collapsed } : group,
          ),
        })),
      setRows: (groupId, rows) => {
        if (!rowsFit(rows)) return null;
        const id = groupId ?? newGroupId();
        let groups = get().groups;
        const before = groups.find((group) => group.id === id);
        for (const key of rows.flat()) {
          if (splitGroupOf(groups, key)?.id !== id) groups = withoutMember(groups, key);
        }
        const next = { ...before, id, rows: rows.map((row) => [...row]) };
        const at = groups.findIndex((group) => group.id === id);
        // A new layout starts even: sizes from the old one don't fit it.
        const { [id]: _rows, ...rowWeights } = get().rowWeights;
        const columnWeights = { ...get().columnWeights };
        for (const key of rows.flat()) delete columnWeights[key];
        set({
          rowWeights,
          columnWeights,
          groups:
            at >= 0
              ? groups.map((group, index) => (index === at ? next : group))
              : [...groups, next],
        });
        return id;
      },
      rename: (groupId, name) =>
        set((state) => ({
          groups: state.groups.map((group) => {
            if (group.id !== groupId) return group;
            const { name: _old, ...rest } = group;
            return name.trim() ? { ...rest, name: name.trim() } : rest;
          }),
        })),
    }),
    {
      name: "rome:split-view:v2",
      version: 3,
      // Splits were a single row of chats before rows existed.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as {
          groups?: { id: string; members?: string[]; rows?: string[][] }[];
        };
        if (version >= 3) return persisted as SplitViewState;
        const groups = (old.groups ?? []).flatMap((group) => {
          const members = group.rows?.flat() ?? group.members ?? [];
          if (members.length < 2) return [];
          const rows = [
            members.slice(0, MAX_SPLIT_COLUMNS),
            members.slice(MAX_SPLIT_COLUMNS, MAX_SPLIT_COLUMNS * 2),
          ];
          return [{ id: group.id, rows: rows.filter((row) => row.length > 0) }];
        });
        return { groups, columnWeights: {}, rowWeights: {} } as unknown as SplitViewState;
      },
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        groups: state.groups,
        columnWeights: state.columnWeights,
        rowWeights: state.rowWeights,
      }),
    },
  ),
);
