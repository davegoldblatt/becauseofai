// Textual edits to an entry file that leave every other byte alone. The entry
// files are hand-formatted (folded scalars, comments), and the yaml library
// re-flows them on a round trip, so the pipeline never re-serialises a whole
// file. Ranges come from the parser (src/lib/entry-text.ts), and every edit is
// parsed and validated against the draft schema before it is handed back.
import { parseDocument, stringify, isScalar, isSeq, isMap, parse } from "yaml";
import { DraftEntrySchema } from "../../src/schema.ts";
import { topBlocks } from "../../src/lib/entry-text.ts";
export { OWNED_KEYS, stripOwned, readOwned, withOwned, verifiableContent, contentSha256, type Owned, type OwnedKey } from "../../src/lib/entry-text.ts";

// Throws when the text is not a valid entry; returns it unchanged otherwise.
export function assertEntry(text: string, what = "edited entry"): string {
  let doc: unknown;
  try { doc = parse(text, { schema: "core" }); } catch (err) { throw new Error(`${what} is not valid YAML: ${(err as Error).message}`); }
  const r = DraftEntrySchema.safeParse(doc);
  if (!r.success) throw new Error(`${what} fails the schema: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return text;
}

type Range = [number, number, number];
const rangeOf = (n: unknown): Range | undefined => (n as { range?: Range })?.range;

// A block sequence's item indentation and insertion point, from the source.
function seqLayout(raw: string, key: string): { insertAt: number; indent: string } {
  const { blocks } = topBlocks(raw);
  const b = blocks.find((x) => x.key === key);
  if (!b) throw new Error(`no ${key} block`);
  const seq = b.valueNode;
  if (!isSeq(seq) || seq.flow) throw new Error(`${key} is not a block sequence`);
  const items = seq.items;
  if (!items.length) throw new Error(`${key} is empty`);
  const first = rangeOf(items[0])!;
  // The dash sits before the first item's node; its column is the item indentation.
  const dash = raw.lastIndexOf("-", first[0]);
  const lineStart = raw.lastIndexOf("\n", dash) + 1;
  const indent = raw.slice(lineStart, dash);
  const last = rangeOf(items[items.length - 1])!;
  // Insert after the last item's full extent (trailing newline included).
  let insertAt = last[2];
  if (raw[insertAt - 1] !== "\n") insertAt = raw.indexOf("\n", insertAt) + 1 || raw.length;
  return { insertAt, indent };
}

function renderItems(items: unknown[], indent: string): string {
  return stringify(items, { lineWidth: 0, schema: "core" })
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => indent + l)
    .join("\n") + "\n";
}

// A sequence written in flow style (or empty) cannot take a textual insert;
// the document API appends and re-flows the file. Rare, and never a failure.
function appendViaDocument(raw: string, key: string, item: unknown): string {
  const doc = parseDocument(raw, { schema: "core" });
  const seq = doc.get(key, true);
  if (seq && isSeq(seq)) doc.addIn([key], item); else doc.set(key, [item]);
  return doc.toString({ lineWidth: 0 });
}

// Append a history line inside the history block, with the block's own indentation.
export function appendHistory(raw: string, item: { date: string; note: string }): string {
  let out: string;
  try {
    const { insertAt, indent } = seqLayout(raw, "history");
    out = raw.slice(0, insertAt) + renderItems([{ date: item.date, note: item.note }], indent) + raw.slice(insertAt);
  } catch {
    out = appendViaDocument(raw, "history", { date: item.date, note: item.note });
  }
  return assertEntry(out, "entry after appending a history line");
}

// Append a source to the sources block; returns the new index.
export function appendSource(raw: string, src: { title: string; url: string; type: "primary" | "secondary" }): { text: string; index: number } {
  const index = ((parseDocument(raw, { schema: "core" }).toJS() as { sources?: unknown[] }).sources ?? []).length;
  let text: string;
  try {
    const { insertAt, indent } = seqLayout(raw, "sources");
    text = raw.slice(0, insertAt) + renderItems([src], indent) + raw.slice(insertAt);
  } catch {
    text = appendViaDocument(raw, "sources", src);
  }
  return { text: assertEntry(text, "entry after appending a source"), index };
}

// Replace the scalar at `path` (for example ["grades", "evidence"] or
// ["effect", "absolute"]) using the node's source range, so nothing else
// moves. A block scalar is replaced by a one-line double-quoted string, with
// the newline the block consumed put back. A missing key is added through the
// document API, which re-flows the file; the caller is told so.
export function setScalar(raw: string, path: (string | number)[], value: string | number | null): { text: string; reflowed: boolean } {
  const doc = parseDocument(raw, { schema: "core", keepSourceTokens: true });
  const node = doc.getIn(path, true);
  if (node && isScalar(node) && node.range) {
    const [start, valueEnd, nodeEnd] = node.range;
    const rendered = typeof value === "string" && value.includes("\n") ? JSON.stringify(value) : stringify(value, { schema: "core", lineWidth: 0 }).replace(/\n$/, "");
    const wasBlock = node.type === "BLOCK_FOLDED" || node.type === "BLOCK_LITERAL";
    const tail = raw.slice(wasBlock ? nodeEnd : valueEnd);
    const sep = tail.startsWith("\n") || tail === "" ? "" : "\n";
    const text = raw.slice(0, start) + rendered + sep + tail;
    return { text: assertEntry(text, `entry after setting ${path.join(".")}`), reflowed: false };
  }
  const parent = path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
  if (!parent || !(isMap(parent) || isSeq(parent))) throw new Error(`cannot set ${path.join(".")}: parent is not a map`);
  doc.setIn(path, value);
  const text = doc.toString({ lineWidth: 0 });
  return { text: assertEntry(text, `entry after adding ${path.join(".")}`), reflowed: true };
}
