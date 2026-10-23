// Textual edits to an entry file that leave every other byte alone. The entry
// files are hand-formatted (folded scalars, comments), and the yaml library
// re-flows them on a round trip, so the pipeline never re-serialises a whole
// file. It owns four top-level keys (rationale, receipts, verification, held),
// which it strips and re-appends at the end, and it appends history lines and
// replaces single scalar values by their source range.
import { createHash } from "node:crypto";
import { parseDocument, stringify, isScalar, isMap, isSeq } from "yaml";

export const OWNED_KEYS = ["rationale", "receipts", "verification", "held"] as const;
export type OwnedKey = (typeof OWNED_KEYS)[number];
export type Owned = Partial<Record<OwnedKey, unknown>>;

export type Block = { key: string; start: number; end: number }; // line indexes, end exclusive

const TOP_KEY = /^([A-Za-z_][A-Za-z0-9_]*):(\s|$)/;

export function topLevelBlocks(raw: string): Block[] {
  const lines = raw.split("\n");
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = TOP_KEY.exec(lines[i]);
    if (!m) continue;
    if (out.length) out[out.length - 1].end = i;
    out.push({ key: m[1], start: i, end: lines.length });
  }
  return out;
}

// The file without the pipeline's own blocks, trailing whitespace trimmed, one newline at the end.
export function stripOwned(raw: string): string {
  const lines = raw.split("\n");
  const drop = new Set<number>();
  for (const b of topLevelBlocks(raw)) {
    if ((OWNED_KEYS as readonly string[]).includes(b.key)) for (let i = b.start; i < b.end; i++) drop.add(i);
  }
  const kept = lines.filter((_, i) => !drop.has(i)).join("\n");
  return kept.replace(/\s+$/, "") + "\n";
}

export function readOwned(raw: string): Owned {
  const doc = parseDocument(raw, { schema: "core" });
  const out: Owned = {};
  for (const k of OWNED_KEYS) if (doc.has(k)) out[k] = doc.get(k, false) === null ? null : (doc.toJS() as Record<string, unknown>)[k];
  return out;
}

// Serialise one owned block. Keys stay in the order given; strings keep their
// content exactly (yaml quotes them when it must). lineWidth 0 never folds.
function block(key: string, value: unknown): string {
  return stringify({ [key]: value }, { lineWidth: 0, schema: "core" });
}

// The file with the given owned blocks replacing whatever it carried, in a
// fixed order at the end. A key set to undefined is removed.
export function withOwned(raw: string, owned: Owned): string {
  const base = stripOwned(raw);
  const prev = readOwned(raw);
  const merged: Owned = { ...prev, ...owned };
  let out = base;
  for (const k of OWNED_KEYS) {
    if (merged[k] === undefined) continue;
    out += block(k, merged[k]);
  }
  return out;
}

// The content a verification is about: the file without the owned blocks and
// without notes and history, which the verifier never sees and which may change
// (a dispute line, an editor's note) without changing what was verified.
export function verifiableContent(raw: string): string {
  const base = stripOwned(raw);
  const lines = base.split("\n");
  const drop = new Set<number>();
  for (const b of topLevelBlocks(base)) if (b.key === "notes" || b.key === "history") for (let i = b.start; i < b.end; i++) drop.add(i);
  return lines.filter((_, i) => !drop.has(i)).join("\n").replace(/\s+$/, "") + "\n";
}

export function contentSha256(raw: string): string {
  return createHash("sha256").update(verifiableContent(raw)).digest("hex");
}

// Append a primary source to the sources block; returns the new index.
export function appendSource(raw: string, src: { title: string; url: string; type: "primary" | "secondary" }): { text: string; index: number } {
  const lines = raw.split("\n");
  const blocks = topLevelBlocks(raw);
  const b = blocks.find((x) => x.key === "sources");
  if (!b) throw new Error("no sources block");
  let end = b.end;
  while (end > b.start + 1 && lines[end - 1].trim() === "") end--;
  const index = parseDocument(raw, { schema: "core" }).get("sources") instanceof Object ? ((parseDocument(raw, { schema: "core" }).toJS() as { sources: unknown[] }).sources.length) : 0;
  const item = stringify([src], { lineWidth: 0, schema: "core" }).replace(/\n$/, "").split("\n").map((l) => "  " + l);
  lines.splice(end, 0, ...item);
  return { text: lines.join("\n"), index };
}

// Append a history line inside the history block, keeping the owned blocks after it.
export function appendHistory(raw: string, item: { date: string; note: string }): string {
  const lines = raw.split("\n");
  const blocks = topLevelBlocks(raw);
  const h = blocks.find((b) => b.key === "history");
  if (!h) throw new Error("no history block");
  // Last non-blank line of the block.
  let end = h.end;
  while (end > h.start + 1 && lines[end - 1].trim() === "") end--;
  const item_ = stringify([{ date: item.date, note: item.note }], { lineWidth: 0, schema: "core" })
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => "  " + l);
  lines.splice(end, 0, ...item_);
  return lines.join("\n");
}

// Replace the scalar at `path` (for example ["grades", "evidence"] or
// ["effect", "absolute"]) using the node's source range, so nothing else moves.
// A missing key is added through the document API, which re-flows the file;
// the caller is told so it can say so in the record.
export function setScalar(raw: string, path: (string | number)[], value: string | number | null): { text: string; reflowed: boolean } {
  const doc = parseDocument(raw, { schema: "core", keepSourceTokens: true });
  const node = doc.getIn(path, true);
  if (node && isScalar(node) && node.range) {
    const [start, valueEnd] = node.range;
    const rendered = stringify(value, { lineWidth: 0, schema: "core" }).replace(/\n$/, "");
    return { text: raw.slice(0, start) + rendered + raw.slice(valueEnd), reflowed: false };
  }
  const parent = path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
  if (!parent || !(isMap(parent) || isSeq(parent))) throw new Error(`cannot set ${path.join(".")}: parent is not a map`);
  doc.setIn(path, value);
  return { text: doc.toString({ lineWidth: 0 }), reflowed: true };
}
