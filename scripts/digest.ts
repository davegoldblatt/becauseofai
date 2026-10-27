// The daily digest's facts (DAV-382): what happened in the last day, gathered
// with no model, written as research/digest/latest.json and latest.md. A
// scheduled routine reads them and writes Dave the email.
//
//   node scripts/digest.ts [--since ISO] [--out research/digest]
// Env: X_* keys for the bot's posts and mentions; CF_ANALYTICS_TOKEN + CF_ACCOUNT_ID
// for site traffic. Each part that lacks its credential says so instead of failing.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadEntries } from "../src/lib/entries.ts";
import { heldInfo } from "../src/schema.ts";
import { SITE } from "../src/site.ts";
import { xKeysFromEnv, me, ownPosts, mentions, type XPost } from "./lib/x-api.ts";
import { renderHtml } from "./lib/digest-html.ts";

const argv = process.argv.slice(2);
const opt = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const now = new Date();
const since = new Date(opt("--since") ?? new Date(now.getTime() - 24 * 3600_000).toISOString());
const sinceIso = since.toISOString().replace(/\.\d{3}Z$/, "Z");
const outDir = opt("--out") ?? "research/digest";
const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const day = (iso: string) => iso.slice(0, 10);

type Digest = {
  generated_at: string;
  since: string;
  site: string;
  entries: { published: number; held: number; counts: Record<string, number>; changed: { id: string; headline: string; change: "added" | "changed"; state: string; url: string | null }[]; held_list: { id: string; headline: string; reason: string; since: string; detail: string }[] };
  verifications: { id: string; date: string; result: string; reason: string | null; detail: string; record: string }[];
  announced: { id: string; date: string; url: string }[];
  leads_added: string[];
  x: null | { username: string; followers: number | null; posts: { id: string; url: string; text: string; created_at: string; impressions: number | null; likes: number; replies: number; reposts: number; bookmarks: number; quotes: number }[]; mentions: { id: string; url: string; from: string; text: string; created_at: string; in_reply_to_us: boolean; new: boolean }[]; note?: string };
  traffic: null | { pageviews: number; visits: number; top_paths: { path: string; views: number }[]; day: string; note?: string };
  notes: string[];
};

async function main() {
  const notes: string[] = [];
  // Entries: what changed in the last day and the registry's state.
  const changedFiles = git(["log", `--since=${sinceIso}`, "--no-merges", "--name-status", "--format=", "--", "data/entries/"]).split("\n").filter(Boolean);
  const change = new Map<string, "added" | "changed">();
  for (const line of changedFiles) {
    const [status, file] = line.split(/\t/);
    const id = path.basename(file ?? "", ".yaml");
    if (!id) continue;
    if (status === "A") change.set(id, "added"); else if (!change.has(id)) change.set(id, "changed");
  }
  const loaded = loadEntries();
  const byId = new Map(loaded.all.map((e) => [e.id, e]));
  const published = new Set(loaded.publishable.map((e) => e.id));
  const changed = [...change.entries()].map(([id, c]) => {
    const e = byId.get(id);
    const h = e ? heldInfo(e) : null;
    return { id, headline: e?.headline ?? id, change: c, state: !e ? "removed" : published.has(id) ? "published" : `held (${h?.reason})`, url: e && published.has(id) ? `${SITE.url}/entry/${id}` : null };
  });
  const held_list = loaded.held.map((e) => { const h = heldInfo(e)!; return { id: e.id, headline: e.headline, reason: h.reason, since: h.since, detail: h.detail }; });
  const counts = { because: 0, "not-because": 0, "not-yet": 0 } as Record<string, number>;
  for (const e of loaded.publishable) counts[e.section]++;

  // Gate decisions of the last day: only the records an entry currently stands
  // on (its verification or its hold). Older records of the same entry are
  // history, not today's decision.
  const verifications: Digest["verifications"] = [];
  for (const e of loaded.all) {
    const rel = e.held?.record ?? e.verification?.record;
    if (!rel) continue;
    const p = path.join("data/verifications", rel);
    if (!fs.existsSync(p)) continue;
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    if (r.date < day(sinceIso)) continue;
    verifications.push({ id: e.id, date: r.date, result: published.has(e.id) ? "published" : "held", reason: published.has(e.id) ? null : (heldInfo(e)?.reason ?? null), detail: String(r.adjudication.detail).slice(0, 300), record: rel });
  }

  // Announcer ledger: posted in the last two days.
  const ledger = JSON.parse(fs.readFileSync("research/announced.json", "utf8")) as { posted: Record<string, string> };
  const announced = Object.entries(ledger.posted).filter(([, d]) => d >= day(new Date(since.getTime() - 24 * 3600_000).toISOString())).map(([id, d]) => ({ id, date: d, url: `${SITE.url}/entry/${id}` }));

  // Leads the scout added to the inbox.
  let leads_added: string[] = [];
  try {
    const diff = git(["log", `--since=${sinceIso}`, "-p", "--format=", "--", "research/inbox.md"]);
    leads_added = diff.split("\n").filter((l) => /^\+- /.test(l)).map((l) => l.slice(2).trim()).slice(0, 30);
  } catch { /* no inbox changes */ }

  // X: the bot's posts and their metrics, and mentions.
  let x: Digest["x"] = null;
  const keys = xKeysFromEnv();
  if (!keys) notes.push("The X account could not be read today (no keys in this run).");
  else {
    try {
      const who = await me(keys);
      const posts = (await ownPosts(keys, who.id, 20)).filter((p) => new Date(p.created_at) >= new Date(since.getTime() - 6 * 24 * 3600_000));
      // Mentions over the whole week, so a reply that arrived before the window
      // still shows (marked as earlier); the newest sort first.
      const weekAgo = new Date(since.getTime() - 6 * 24 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const ment = (await mentions(keys, who.id, weekAgo, 50)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const metric = (p: XPost, k: string, np = false) => (np ? p.non_public_metrics?.[k] : p.public_metrics?.[k]) ?? null;
      x = {
        username: who.username, followers: who.followers,
        posts: posts.map((p) => ({ id: p.id, url: `https://x.com/${who.username}/status/${p.id}`, text: p.text, created_at: p.created_at, impressions: metric(p, "impression_count", true) ?? metric(p, "impression_count"), likes: metric(p, "like_count") ?? 0, replies: metric(p, "reply_count") ?? 0, reposts: metric(p, "retweet_count") ?? 0, bookmarks: metric(p, "bookmark_count") ?? 0, quotes: metric(p, "quote_count") ?? 0 })),
        mentions: ment.map((m) => ({ id: m.id, url: `https://x.com/${m.username ?? "i"}/status/${m.id}`, from: m.username ? `@${m.username}` : m.author_id ?? "?", text: m.text, created_at: m.created_at, in_reply_to_us: m.in_reply_to_user_id === who.id, new: new Date(m.created_at) >= since })),
      };
    } catch (err) {
      x = { username: "", followers: null, posts: [], mentions: [], note: `X API failed: ${(err as Error).message}` };
      notes.push(`X: ${(err as Error).message}`);
    }
  }

  // Cloudflare Web Analytics for yesterday, when a token exists.
  let traffic: Digest["traffic"] = null;
  const { CF_ANALYTICS_TOKEN, CF_ACCOUNT_ID } = process.env;
  // GraphQL uses the site ID, which differs from the public beacon token.
  const site = process.env.CF_SITE_TAG ?? "7ac6b33a46224b33bb96dfecabf3f2c9";
  if (!CF_ANALYTICS_TOKEN || !CF_ACCOUNT_ID) notes.push("Traffic: no Cloudflare analytics token yet (CF_ANALYTICS_TOKEN and CF_ACCOUNT_ID), so pageviews are not included.");
  else {
    const dayStart = day(since.toISOString());
    const dayEnd = day(now.toISOString());
    const q = `query($account: String!, $site: String!, $start: Date!, $end: Date!) { viewer { accounts(filter: {accountTag: $account}) {
      total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {siteTag: $site, date_geq: $start, date_lt: $end}) { count sum { visits } }
      paths: rumPageloadEventsAdaptiveGroups(limit: 8, orderBy: [count_DESC], filter: {siteTag: $site, date_geq: $start, date_lt: $end}) { count dimensions { requestPath } } } } }`;
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CF_ANALYTICS_TOKEN}` }, body: JSON.stringify({ query: q, variables: { account: CF_ACCOUNT_ID, site, start: dayStart, end: dayEnd } }), signal: AbortSignal.timeout(30_000) });
      const j = (await r.json()) as { data?: { viewer?: { accounts?: { total: { count: number; sum: { visits: number } }[]; paths: { count: number; dimensions: { requestPath: string } }[] }[] } }; errors?: { message: string }[] };
      const acc = j.data?.viewer?.accounts?.[0];
      if (!acc) throw new Error(j.errors?.map((e) => e.message).join("; ") || "no data");
      traffic = { day: dayStart, pageviews: acc.total[0]?.count ?? 0, visits: acc.total[0]?.sum?.visits ?? 0, top_paths: acc.paths.map((p) => ({ path: p.dimensions.requestPath, views: p.count })) };
    } catch (err) {
      traffic = { day: dayStart, pageviews: 0, visits: 0, top_paths: [], note: `Cloudflare analytics failed: ${(err as Error).message}` };
      notes.push(`Traffic: ${(err as Error).message}`);
    }
  }

  const digest: Digest = {
    generated_at: now.toISOString(), since: sinceIso, site: SITE.url,
    entries: { published: loaded.publishable.length, held: loaded.held.length, counts, changed, held_list },
    verifications, announced, leads_added, x, traffic, notes,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(digest, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "latest.md"), render(digest));
  const headlineOf = (id: string) => byId.get(id)?.headline ?? id;
  fs.writeFileSync(path.join(outDir, "latest.html"), renderHtml({
    generated_at: digest.generated_at, site: SITE.url, counts, held: loaded.held.length,
    announced: announced.map((a) => ({ ...a, headline: headlineOf(a.id) })),
    x: digest.x, traffic: digest.traffic,
    changed: changed.map((c) => ({ headline: c.headline, change: c.change, state: c.state, url: c.url, reasonText: (() => { const r = /^held \((.*)\)$/.exec(c.state)?.[1]; return r ? (REASON[r] ?? r) : null; })() })),
    heldList: held_list.map((h) => ({ headline: h.headline, reasonText: REASON[h.reason] ?? h.reason, since: h.since })),
    leads: leads_added.length, bulk: changed.length > 10,
  }));
  console.log(render(digest));
}

// Plain words for the model and for anyone reading the file: no ids, no
// internal vocabulary, no secrets' names.
const REASON: Record<string, string> = {
  ungrounded: "a number on the entry is not in the source word for word",
  "no-full-text": "we could not read the source in full (the publisher blocks automated readers, or only an abstract is public)",
  "grade-split": "the two models graded it differently",
  "fails-test": "the second model failed it on one of the four tests, or the source shows a conflict the entry does not state",
  "verification-unavailable": "the second model could not be reached",
  "no-primary-source": "it has no primary source, only a press release or a news story",
  disputed: "a reader's dispute split the two models",
};
const n = (v: number | null | undefined, word: string) => (v == null ? `? ${word}` : `${v} ${word}${v === 1 ? "" : "s"}`);

function render(d: Digest): string {
  const L: string[] = [];
  L.push(`Because of AI, the day in plain words. Facts gathered ${d.generated_at.slice(0, 16).replace("T", " ")} UTC, covering the last 24 hours. The email is written from this file; every number here is measured.`, "");

  L.push("WHAT WE POSTED");
  if (d.announced.length) for (const a of d.announced) { const e = d.entries; const h = [...e.changed, ...e.held_list].find((x) => x.id === a.id)?.headline; L.push(`- ${a.date}: "${h ?? a.id}" ${a.url}`); } else L.push("- Nothing new was posted to the account.");
  if (d.x) {
    if (d.x.note) L.push(`- Could not read the X account today: ${d.x.note}`);
    const own = d.x.posts.filter((p) => !p.text.startsWith("@"));
    const replies = d.x.posts.filter((p) => p.text.startsWith("@"));
    if (own.length) { L.push("", "HOW THE POSTS ARE DOING (last 7 days, newest first)"); for (const p of own) L.push(`- ${n(p.impressions, "view")}, ${n(p.likes, "like")}, ${n(p.replies, "reply")}, ${n(p.reposts, "repost")}: "${p.text.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim().slice(0, 110)}" ${p.url}`); }
    if (replies.length) { L.push("", `THE ACCOUNT'S OWN REPLIES TO OTHERS (${replies.length} in the last 7 days)`); for (const p of replies) L.push(`- to ${p.text.split(/\s+/)[0]}: ${n(p.impressions, "view")}, ${n(p.likes, "like")}, ${n(p.replies, "reply")} ${p.url}`); }
    L.push("", `FOLLOWERS: ${d.x.followers ?? "unknown"}`);
    L.push("", `PEOPLE WHO REPLIED TO OR MENTIONED THE ACCOUNT (last 7 days, ${d.x.mentions.filter((m) => m.new).length} new since yesterday)`);
    if (d.x.mentions.length) for (const m of d.x.mentions) L.push(`- ${m.new ? "NEW · " : "earlier this week · "}${m.from}${m.in_reply_to_us ? ", replying to us" : ""}: "${m.text.replace(/\s+/g, " ").slice(0, 200)}" ${m.url}`); else L.push("- None.");
  }

  L.push("", "SITE TRAFFIC");
  if (d.traffic && !d.traffic.note) { L.push(`- ${d.traffic.day}: ${n(d.traffic.pageviews, "page view")}, ${n(d.traffic.visits, "visit")}.`); for (const p of d.traffic.top_paths) L.push(`  - ${p.path}: ${p.views}`); }
  else if (d.traffic?.note) L.push(`- Could not read the traffic numbers today: ${d.traffic.note}`);
  else L.push("- Not connected yet. Dave would need to make a Cloudflare analytics token; until then there are no traffic numbers.");

  L.push("", "THE REGISTRY");
  L.push(`- Live on the site: ${d.entries.counts.because} benefits, ${d.entries.counts["not-because"]} null results, ${d.entries.counts["not-yet"]} watchlist items. Held off the site: ${d.entries.held}.`);
  if (d.entries.changed.length > 10) L.push(`- A bulk change touched ${d.entries.changed.length} entries at once (a rebuild of the files, not ${d.entries.changed.length} new entries).`);
  else if (d.entries.changed.length) { L.push("", "ENTRIES ADDED OR CHANGED IN THE LAST DAY"); for (const c of d.entries.changed) { const reason = /^held \((.*)\)$/.exec(c.state)?.[1]; L.push(`- ${c.change}: "${c.headline}" (${c.url ? `live: ${c.url}` : reason ? `held because ${REASON[reason] ?? reason}` : c.state})`); } }
  else L.push("- No entry was added or changed.");
  if (d.verifications.length) { L.push("", "WHAT THE SECOND MODEL DECIDED IN THE LAST DAY"); for (const v of d.verifications) { const h = [...d.entries.changed, ...d.entries.held_list].find((x) => x.id === v.id)?.headline ?? v.id; L.push(`- "${h}": ${v.result === "published" ? "agreed, so it is live" : `held because ${REASON[v.reason ?? ""] ?? v.reason}`}. ${v.detail}`); } }
  if (d.entries.held_list.length) { L.push("", `STILL HELD OFF THE SITE (${d.entries.held_list.length})`); for (const h of d.entries.held_list) L.push(`- "${h.headline}": ${REASON[h.reason] ?? h.reason} (since ${h.since}). ${h.detail}`); }
  if (d.leads_added.length) { L.push("", `LEADS THE MORNING SCAN LOGGED (${d.leads_added.length})`); for (const l of d.leads_added.slice(0, 12)) L.push(`- ${l}`); }
  if (d.notes.filter((x) => !/^Traffic:/.test(x)).length) { L.push("", "NOTES"); for (const x of d.notes) if (!/^Traffic:/.test(x)) L.push(`- ${x.replace(/CF_ANALYTICS_TOKEN and CF_ACCOUNT_ID/, "a Cloudflare analytics token")}`); }
  return L.join("\n") + "\n";
}

main().catch((err) => { console.error(err?.stack ?? err); process.exit(1); });
