import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/lib/csv.ts";

test("parseCsv: quoted commas, embedded newlines, doubled quotes, CRLF", () => {
  const rows = parseCsv('Title,Abstract,Status\r\n"Teaching Evaluation, by AI","Line one\nline two with ""quotes""",in_development\r\nPlain,,done\r\n');
  assert.deepEqual(rows, [
    ["Title", "Abstract", "Status"],
    ["Teaching Evaluation, by AI", 'Line one\nline two with "quotes"', "in_development"],
    ["Plain", "", "done"],
  ]);
});

test("parseCsv: trailing line without newline and blank lines", () => {
  assert.deepEqual(parseCsv("a,b\n\nc,d"), [["a", "b"], ["c", "d"]]);
});
