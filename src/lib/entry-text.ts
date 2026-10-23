// The text of an entry file as the pipeline sees it. The pipeline owns five
// top-level keys (rationale, receipts, drafted, verification, held); every
// other byte belongs to the editor and is never re-serialised. Ranges come
// from the YAML parser, not from line patterns, so quoted keys, comments,
// document markers, and keep-style scalars survive.
import { createHash } from "node:crypto";
import { parseDocument, isMap, isScalar, stringify, visit, type Document, type Pair } from "yaml";

// Fields a verification is about. Notes, history, and the pipeline's own keys
// are not among them; nothing else on an entry is left out.
const VERIFIED_KEYS = ["id", "section", "rank", "headline", "impact", "impact_number", "impact_label", "summary", "caveat", "domain", "ai_type", "grades", "comparison", "effect", "reach", "dates", "sources", "conflicts", "what_would_change", "related"] as const;

export const OWNED_KEYS = ["rationale", "receipts", "drafted", "verification", "held"] as const;
export type OwnedKey = (typeof OWNED_KEYS)[number];
export type Owned = Partial<Record<OwnedKey, unknown>>;

export type TopBlock = { key: string; start: number; end: number; keyNode: unknown; valueNode: unknown };

function keyText(k: unknown): string {
  return isScalar(k) ? String(k.value) : String(k);
}

// Anchors and aliases let one field's bytes stand in for another's; the
// textual editor and the projection both refuse them (README, trust boundaries).
function refuseAliases(doc: Document): void {
  let alias = false;
  visit(doc, { Alias: () => { alias = true; return visit.BREAK; } });
  if (alias) throw new Error("entry uses YAML anchors and aliases; not supported");
}

// Every top-level mapping entry with its byte range [start, end): from the key
// to the end of its value (trailing newline included). Comments and blank
// lines between one entry and the next belong to the editor, not to a block.
export function topBlocks(raw: string): { doc: Document; blocks: TopBlock[]; mapEnd: number } {
  const doc = parseDocument(raw, { schema: "core", keepSourceTokens: true });
  if (!isMap(doc.contents)) throw new Error("entry is not a YAML mapping");
  refuseAliases(doc);
  const items = doc.contents.items as Pair[];
  const mapRange = (doc.contents as { range?: [number, number, number] }).range!;
  const mapEnd = mapRange[2];
  const blocks = items.map((p, i) => {
    const kr = (p.key as { range?: [number, number, number] }).range;
    if (!kr) throw new Error("could not read key positions");
    // "? key" (an explicit key) would leave its indicator behind on a rewrite.
    const lineStart = raw.lastIndexOf("\n", kr[0] - 1) + 1;
    if (/^\s*\?\s*$/.test(raw.slice(lineStart, kr[0]))) throw new Error(`explicit key "? ${keyText(p.key)}" is not supported`);
    const vr = (p.value as { range?: [number, number, number] } | null)?.range;
    let end = vr ? vr[2] : kr[2];
    // Take the newline that closes the value's last line, nothing past it.
    if (raw[end - 1] !== "\n") { const nl = raw.indexOf("\n", end); end = nl < 0 ? raw.length : nl + 1; }
    const next = i + 1 < items.length ? (items[i + 1].key as { range?: [number, number, number] }).range![0] : mapEnd;
    if (end > next) end = next;
    return { key: keyText(p.key), start: kr[0], end, keyNode: p.key, valueNode: p.value };
  });
  return { doc, blocks, mapEnd };
}

// The file without the owned blocks: the editor's bytes, untouched, ending in one newline.
export function stripOwned(raw: string): string {
  const { blocks } = topBlocks(raw);
  let out = "";
  let cursor = 0;
  for (const b of blocks) {
    if ((OWNED_KEYS as readonly string[]).includes(b.key)) {
      out += raw.slice(cursor, b.start);
      cursor = b.end;
    }
  }
  out += raw.slice(cursor);
  // Anything after the mapping (a document-end marker, comments) stays where it was.
  return out.endsWith("\n") ? out : out + "\n";
}

export function readOwned(raw: string): Owned {
  const { doc } = topBlocks(raw);
  const js = doc.toJS() as Record<string, unknown>;
  const out: Owned = {};
  for (const k of OWNED_KEYS) if (k in js) out[k] = js[k];
  return out;
}

// The content a verification is about: a canonical rendering of the parsed,
// alias-resolved values of every verified field plus the receipts. Not the
// file's bytes, so a note, a history line, a comment, or an anchor cannot
// change what the hash covers or hide a change to a value.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}
export function verifiableContent(raw: string): string {
  const doc = parseDocument(raw, { schema: "core" });
  refuseAliases(doc);
  const js = doc.toJS() as Record<string, unknown>;
  const view: Record<string, unknown> = {};
  for (const k of VERIFIED_KEYS) if (k in js) view[k] = js[k];
  view.receipts = js.receipts ?? [];
  return JSON.stringify(canonical(view));
}

export function contentSha256(raw: string): string {
  return createHash("sha256").update(verifiableContent(raw)).digest("hex");
}

// The file with the given owned blocks replacing whatever it carried, in a
// fixed order, appended after the editor's bytes and before anything that
// followed the mapping. A key set to undefined is removed.
export function withOwned(raw: string, owned: Owned): string {
  const { blocks, mapEnd } = topBlocks(raw);
  const prev = readOwned(raw);
  const merged: Owned = { ...prev, ...owned };
  // Editor's bytes inside the mapping, then the owned blocks, then the tail.
  let body = "";
  let cursor = 0;
  for (const b of blocks) {
    if ((OWNED_KEYS as readonly string[]).includes(b.key)) {
      body += raw.slice(cursor, b.start);
      cursor = b.end;
    }
  }
  body += raw.slice(cursor, mapEnd);
  if (!body.endsWith("\n")) body += "\n";
  for (const k of OWNED_KEYS) {
    if (merged[k] === undefined) continue;
    body += stringify({ [k]: merged[k] }, { lineWidth: 0, schema: "core" });
  }
  return body + raw.slice(mapEnd);
}
