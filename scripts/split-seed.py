#!/usr/bin/env python3
"""Split data/seed-entries.yaml into data/entries/<id>.yaml by TEXT, then prove no value changed.

Text split: each top-level "- id:" block is cut out of the seed and its 2-space list
indent removed. Nothing is re-serialized, so numbers, dates, quoting and folded
scalars stay byte-faithful. Section-header comments are dropped. The proof parses
the seed and every written file with the same parser and deep-compares them.
"""
import re, sys, pathlib
import yaml  # pyyaml, proof only

ROOT = pathlib.Path(__file__).resolve().parents[1]
SEED = ROOT / "data" / "seed-entries.yaml"
OUT = ROOT / "data" / "entries"

text = SEED.read_text()
lines = text.splitlines(keepends=True)
starts = [i for i, l in enumerate(lines) if l.startswith("- id: ")]
blocks = []
for n, s in enumerate(starts):
    e = starts[n + 1] if n + 1 < len(starts) else len(lines)
    block = lines[s:e]
    # trim trailing blank lines and section-header comment lines at the end of the block
    while block and (block[-1].strip() == "" or block[-1].lstrip().startswith("#")):
        block.pop()
    out = []
    for l in block:
        if l.startswith("- "):
            out.append(l[2:])
        elif l.startswith("  "):
            out.append(l[2:])
        elif l.strip() == "":
            out.append("\n")
        else:
            raise SystemExit(f"unexpected indent in block starting line {s+1}: {l!r}")
    blocks.append("".join(out).rstrip("\n") + "\n")

seed_docs = yaml.safe_load(text)
assert len(seed_docs) == len(blocks), (len(seed_docs), len(blocks))
OUT.mkdir(parents=True, exist_ok=True)
written = []
for doc, body in zip(seed_docs, blocks):
    eid = doc["id"]
    m = re.match(r"id: (\S+)\n", body)
    assert m and m.group(1) == eid, (eid, body[:40])
    p = OUT / f"{eid}.yaml"
    p.write_text(body)
    written.append(p)
    back = yaml.safe_load(body)
    if back != doc:
        raise SystemExit(f"MISMATCH after split: {eid}")
print(f"wrote {len(written)} files to {OUT.relative_to(ROOT)}; deep-compare against the seed: identical")
