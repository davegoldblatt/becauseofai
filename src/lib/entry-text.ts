// The text of an entry file as the pipeline sees it. The pipeline owns five
// top-level keys (rationale, receipts, drafted, verification, held); every
// other byte belongs to the editor and is never re-serialised. Ranges come
// from the YAML parser, not from line patterns, so quoted keys, comments,
// document markers, and keep-style scalars survive.
import { createHash } from "node:crypto";
import { parseDocument, isMap, isScalar, stringify, type Document, type Pair } from "yaml";

export const OWNED_KEYS = ["rationale", "receipts", "drafted", "verification", "held"] as const;
export type OwnedKey = (typeof OWNED_KEYS)[number];
export type Owned = Partial<Record<OwnedKey, unknown>>;

export type TopBlock = { key: string; start: number; end: number; keyNode: unknown; valueNode: unknown };

function keyText(k: unknown): string {
  return isScalar(k) ? String(k.value) : String(k);
}

// Every top-level mapping entry with its byte range [start, end): from the key
// to the start of the next key (or the end of the mapping).
export function topBlocks(raw: string): { doc: Document; blocks: TopBlock[]; mapEnd: number } {
  const doc = parseDocument(raw, { schema: "core", keepSourceTokens: true });
  if (!isMap(doc.contents)) throw new Error("entry is not a YAML mapping");
  const items = doc.contents.items as Pair[];
  const starts = items.map((p) => (p.key as { range?: [number, number, number] }).range?.[0] ?? -1);
  if (starts.some((s) => s < 0)) throw new Error("could not read key positions");
  const mapRange = (doc.contents as { range?: [number, number, number] }).range!;
  const mapEnd = mapRange[2];
  const blocks = items.map((p, i) => ({
    key: keyText(p.key),
    start: starts[i],
    end: i + 1 < items.length ? starts[i + 1] : mapEnd,
    keyNode: p.key,
    valueNode: p.value,
  }));
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

// The content a verification is about: the editor's bytes minus notes and
// history (the verifier never sees them, and a note or a history line must not
// invalidate a verification), plus the receipts exactly as they stand.
export function verifiableContent(raw: string): string {
  const base = stripOwned(raw);
  const { blocks } = topBlocks(base);
  let out = "";
  let cursor = 0;
  for (const b of blocks) {
    if (b.key === "notes" || b.key === "history") {
      out += base.slice(cursor, b.start);
      cursor = b.end;
    }
  }
  out += base.slice(cursor);
  const receipts = readOwned(raw).receipts ?? [];
  return out.replace(/\s+$/, "") + "\n" + stringify({ receipts }, { lineWidth: 0, schema: "core" });
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
