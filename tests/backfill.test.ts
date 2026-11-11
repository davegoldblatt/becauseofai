// The backfill plan (DAV-475): fixed slices, and a rank tie that does not stop the build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, inboxPart, doneSlices, nextSlice, SECTORS } from "../scripts/backfill-slice.ts";
import { parseEntryFiles, bySection, readEntryFiles } from "../src/lib/entries.ts";

test("the plan is fixed: five inbox parts, every sector in four quarters, fifty-two weeks", () => {
  const p = plan();
  assert.equal(p.length, 5 + SECTORS.length * 4 + 52);
  assert.deepEqual(p.map((s) => s.index), p.map((_, i) => i));
  assert.deepEqual(p.slice(0, 5).map((s) => s.kind), ["inbox", "inbox", "inbox", "inbox", "inbox"]);
  // The same call gives the same plan (no clock in it).
  assert.deepEqual(plan(), p);
  // Weeks do not overlap and reach back a year.
  const weeks = p.filter((s) => s.kind === "academic") as { from: string; to: string }[];
  for (let i = 1; i < weeks.length; i++) assert.equal(weeks[i].to, weeks[i - 1].from);
  assert.ok(weeks[weeks.length - 1].from <= "2025-11-12", weeks[weeks.length - 1].from);
  // Every sector appears once per quarter.
  const ann = p.filter((s) => s.kind === "announce") as { sector: string; from: string }[];
  assert.equal(new Set(ann.map((s) => `${s.sector}|${s.from}`)).size, ann.length);
});

test("inbox parts cover every lead with a link exactly once, and skip the housekeeping lines", () => {
  const text = ["## 2026-11-01", "- Lead A. [paper](https://example.org/a). Missing: dates.", "- Skipped: protocols, reviews (https://example.org/x).", "- Lead B https://example.org/b", "no bullet https://example.org/c", "- Lead C, no link", "- Lead D https://example.org/d"].join("\n");
  const parts = [1, 2, 3].map((k) => inboxPart(text, k, 3));
  assert.deepEqual(parts.flat(), ["- Lead A. [paper](https://example.org/a). Missing: dates.", "- Lead B https://example.org/b", "- Lead D https://example.org/d"]);
});

test("two entries with the same rank in a section: a warning, and the order is fixed by id", () => {
  const files = readEntryFiles();
  const names = Object.keys(files).filter((f) => /^section: because$/m.test(files[f])).slice(0, 2);
  assert.equal(names.length, 2);
  const rankOf = (raw: string) => Number(/^rank: (\d+)$/m.exec(raw)![1]);
  const tied = { ...files, [names[1]]: files[names[1]].replace(/^rank: \d+$/m, `rank: ${rankOf(files[names[0]])}`) };
  const r = parseEntryFiles(tied, { records: {} });
  assert.equal(r.errors.filter((e) => /rank/.test(e.message)).length, 0);
  assert.equal(r.warnings.filter((w) => /already used/.test(w.message)).length, 1);
  const ids = bySection(r.all, "because").filter((e) => e.rank === rankOf(files[names[0]])).map((e) => e.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(ids.length, 2);
});

test("a growing inbox does not move leads between parts: sections after the anchor day are left out", () => {
  const base = ["## 2026-11-01", "- A https://example.org/a", "- B https://example.org/b", "## 2026-11-10 (daily scout)", "- C https://example.org/c", "- D https://example.org/d"].join("\n");
  const grown = base + "\n## 2026-11-12 (daily scout)\n- E https://example.org/e\n## 2026-12-01\n- F https://example.org/f\n";
  for (const k of [1, 2]) assert.deepEqual(inboxPart(grown, k, 2), inboxPart(base, k, 2));
  assert.deepEqual([1, 2].flatMap((k) => inboxPart(grown, k, 2)).map((l) => l[2]), ["A", "B", "C", "D"]);
});

test("the next slice comes from the log: done slices are skipped, a failed one comes round again, a finished plan stops", () => {
  const log = "# Backfill log\n\n## 2026-11-11, slice 0: inbox leads, part 1 of 5\n\nDrafted (2):\n- x\n\n## 2026-11-11, slice 5: announcements: hospitals\n";
  assert.deepEqual([...doneSlices(log)].sort((a, b) => a - b), [0, 5]);
  // The three open slices at the front are 1, 2, 3; the salt picks among them and never a done one.
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((salt) => nextSlice(log, salt)!.index), [1, 2, 3, 1, 2, 3]);
  // Slice 1 ran and left no heading (it failed): it is still offered.
  assert.equal(nextSlice(log, 0)!.index, 1);
  // A mention of a slice in the body is not a heading.
  assert.equal(doneSlices("- see slice 9: something\nslice 10: x\n").size, 0);
  // Every slice done: nothing left, whatever the salt.
  const all = plan().map((s) => `## 2026-12-01, slice ${s.index}: ${s.label}`).join("\n");
  assert.equal(nextSlice(all, 7), null);
  // One left near the end is found.
  const allButLast = plan().slice(0, -1).map((s) => `## d, slice ${s.index}: x`).join("\n");
  assert.equal(nextSlice(allButLast, 2)!.index, plan().length - 1);
});
