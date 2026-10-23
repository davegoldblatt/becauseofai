// Announce new entries: find the entries a push added, wait until their pages
// are live, fetch their share images, and write the posts the workflow sends.
//
//   node scripts/announce.ts --before <sha> --after <sha>   (a push to main)
//   node scripts/announce.ts --entry <id>[,<id>]           (by hand)
//   flags: --no-wait (skip the live check), --out <dir> (default .announce)
//
// Output: <out>/posts.json, one post per entry, plus <out>/<id>.png.
// Prints nothing to post as an empty list and exits 0: that is the common case.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadOrThrow } from "../src/lib/entries.ts";
import { isUnreviewed } from "../src/lib/format.ts";
import type { Entry } from "../src/schema.ts";

const SITE = "https://becauseofai.org";
const X_LIMIT = 280;
const URL_WEIGHT = 23; // X counts every link as 23 characters
const DRAFT_NOTE = "(Automated draft, not yet reviewed by the editor.)";

type Post = { id: string; url: string; text: string; image: string | null; alt: string; unreviewed: boolean };

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const flag = (name: string) => process.argv.includes(name);

function addedIds(before: string, after: string): string[] {
  if (/^0+$/.test(before)) return []; // first push to a branch: nothing to compare against
  const out = execFileSync("git", ["diff", "--diff-filter=A", "--name-only", before, after, "--", "data/entries/"], { encoding: "utf8" });
  return out.split("\n").filter((f) => f.endsWith(".yaml")).map((f) => path.basename(f, ".yaml"));
}

// Headline first, then the draft note when needed, then the link. Trim the
// headline at a word boundary if X would refuse the whole thing.
function compose(e: Entry, url: string, unreviewed: boolean): string {
  const tail = (unreviewed ? "\n\n" + DRAFT_NOTE : "") + "\n\n";
  const room = X_LIMIT - URL_WEIGHT - tail.length;
  let head = e.headline.trim();
  if (head.length > room) {
    head = head.slice(0, room - 1);
    head = head.slice(0, Math.max(head.lastIndexOf(" "), 40)).replace(/[\s,;:]+$/, "") + "…";
  }
  return head + tail + url;
}

async function waitLive(url: string, minutes: number): Promise<boolean> {
  const until = Date.now() + minutes * 60_000;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (r.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return false;
}

async function fetchImage(url: string, file: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (r.status !== 200) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000 || buf.subarray(1, 4).toString() !== "PNG") return false;
    fs.writeFileSync(file, buf);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const out = arg("--out") ?? ".announce";
  fs.mkdirSync(out, { recursive: true });
  let ids: string[];
  if (arg("--entry")) ids = arg("--entry")!.split(",").map((s) => s.trim()).filter(Boolean);
  else if (arg("--before") && arg("--after")) ids = addedIds(arg("--before")!, arg("--after")!);
  else throw new Error("pass --before <sha> --after <sha> or --entry <id>");

  const loaded = loadOrThrow();
  const byId = new Map(loaded.publishable.map((e) => [e.id, e]));
  const heldIds = new Set(loaded.held.map((e) => e.id));
  const posts: Post[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) {
      console.log(heldIds.has(id) ? `skip ${id}: held (no primary source), nothing to announce` : `skip ${id}: not a publishable entry`);
      continue;
    }
    const url = `${SITE}/entry/${id}`;
    const unreviewed = isUnreviewed(e);
    if (!flag("--no-wait")) {
      const live = await waitLive(url, 12);
      if (!live) {
        console.log(`skip ${id}: page not live after 12 minutes (${url})`);
        continue;
      }
    }
    const image = path.join(out, `${id}.png`);
    const ok = await fetchImage(`${SITE}/og/${id}.png`, image);
    posts.push({
      id, url, text: compose(e, url, unreviewed), image: ok ? image : null,
      alt: `Because of AI share card: ${e.impact}`, unreviewed,
    });
  }
  fs.writeFileSync(path.join(out, "posts.json"), JSON.stringify(posts, null, 2) + "\n");
  for (const p of posts) console.log(`post ${p.id} (${p.text.length} chars${p.image ? ", image" : ", no image"}${p.unreviewed ? ", unreviewed" : ""})\n${p.text}\n`);
  console.log(`${posts.length} post(s) written to ${out}/posts.json`);
}
main().catch((err) => { console.error(err?.stack ?? err); process.exit(1); });
