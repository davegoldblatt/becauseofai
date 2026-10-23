// The daily email as designed HTML: the site's hierarchy (one heavy
// nameplate, a running line in monospace, poster-size numbers, ledger rows
// with a 2px rule, one signal colour) in email-safe form: inline styles,
// system fonts, a single column, no images. Two placeholders stay for the
// routine to fill: <!--NOTE--> (the morning note) and <!--NEEDS--> (what
// needs Dave). Everything else is written by code from measured facts.
export type Post = { url: string; text: string; created_at: string; impressions: number | null; likes: number; replies: number; reposts: number; bookmarks: number };
export type Mention = { url: string; from: string; text: string; created_at: string; in_reply_to_us: boolean; new?: boolean };
export type DigestForHtml = {
  generated_at: string;
  site: string;
  counts: Record<string, number>;
  held: number;
  announced: { id: string; date: string; url: string; headline: string }[];
  x: null | { username: string; followers: number | null; posts: Post[]; mentions: Mention[]; note?: string };
  traffic: null | { pageviews: number; visits: number; top_paths: { path: string; views: number }[]; day: string; note?: string };
  changed: { headline: string; change: string; state: string; url: string | null; reasonText: string | null }[];
  heldList: { headline: string; reasonText: string; since: string }[];
  leads: number;
  bulk: boolean;
};

const INK = "#0e0e0e", PAPER = "#ffffff", SIGNAL = "#ff4f00", GRAPHITE = "#6b6b6b", RULE = "#8a8a8a";
// One family: the device's own interface face (San Francisco on iPhone and
// Mac, Roboto on Android, Segoe on Windows). It is what the mail app itself is
// set in, it is tuned for small sizes on screens, and it is the only kind of
// font Gmail and Outlook render at all: they drop downloaded fonts. Hierarchy
// comes from weight, size and colour, not from a condensed or monospace face.
const UI = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
const DISPLAY = UI;
const BODY = UI;
const MONO = UI;
const NUMS = "font-variant-numeric:tabular-nums;font-feature-settings:'tnum';";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (v: number | null | undefined) => (v == null ? "?" : v.toLocaleString("en-US"));
const count = (v: number | null | undefined, word: string) => `${num(v)} ${word}${v === 1 ? "" : "s"}`;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const label = (s: string) => `<div style="font:600 12px/1.5 ${UI};text-transform:uppercase;letter-spacing:.06em;color:${GRAPHITE};">${esc(s)}</div>`;
const h2 = (s: string) => `<div style="font:700 13px/1.2 ${UI};text-transform:uppercase;letter-spacing:.08em;color:${INK};border-top:2px solid ${INK};padding-top:12px;margin:34px 0 12px;">${esc(s)}</div>`;
const row = (inner: string, rule = INK) => `<div style="border-top:1px solid ${rule};padding:12px 0;">${inner}</div>`;
const sentence = (s: string, href?: string) => href
  ? `<a href="${esc(href)}" style="font:600 16px/1.35 ${UI};color:${INK};text-decoration:none;">${esc(s)}</a>`
  : `<div style="font:600 16px/1.35 ${UI};color:${INK};">${esc(s)}</div>`;
const meta = (s: string) => `<div style="font:400 13px/1.6 ${UI};${NUMS}color:${GRAPHITE};margin-top:5px;">${s}</div>`;
const tile = (n: string, l: string, color = INK) => `<td style="padding:0 22px 0 0;vertical-align:bottom;"><div style="font:800 40px/1 ${UI};${NUMS}letter-spacing:-.02em;color:${color};">${esc(n)}</div>${label(l)}</td>`;

export function renderHtml(d: DigestForHtml): string {
  const day = date(d.generated_at);
  const posts = d.x?.posts.filter((p) => !p.text.startsWith("@")) ?? [];
  const replies = d.x?.posts.filter((p) => p.text.startsWith("@")) ?? [];
  const sum = (k: keyof Post) => posts.reduce((a, p) => a + ((p[k] as number | null) ?? 0), 0);
  const parts: string[] = [];

  // Masthead and running line.
  parts.push(`<div style="font:800 26px/1.1 ${UI};letter-spacing:-.02em;color:${INK};">Because of AI</div>`);
  parts.push(`<div style="border-top:2px solid ${INK};border-bottom:1px solid ${RULE};margin:10px 0 22px;padding:9px 0;font:400 14px/1.5 ${UI};${NUMS}color:${GRAPHITE};">${esc(day)} &middot; ${d.counts.because} benefits, ${d.counts["not-because"]} null results, ${d.counts["not-yet"]} on the watchlist &middot; <span style="color:${d.held ? SIGNAL : GRAPHITE};">${d.held} held off the site</span></div>`);

  // The note (the routine writes this).
  parts.push(`<div style="font:400 17px/1.55 ${UI};color:${INK};max-width:560px;"><!--NOTE--></div>`);

  // Numbers at poster size.
  if (d.x) {
    parts.push(h2("The account, last 7 days"));
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 4px;"><tr>${tile(num(sum("impressions")), "views", SIGNAL)}${tile(num(sum("likes")), "likes")}${tile(num(sum("replies")), "replies")}${tile(num(sum("reposts")), "reposts")}${tile(num(d.x.followers), "followers")}</tr></table>`);
    if (d.x.note) parts.push(meta(esc(d.x.note)));
  }

  // People replying: the thing he most wants to see.
  parts.push(h2("People replying"));
  if (d.x?.mentions.length) {
    for (const m of d.x.mentions) parts.push(`<div style="border-left:4px solid ${m.new === false ? RULE : SIGNAL};padding:6px 0 6px 14px;margin:10px 0;">${sentence(`${m.from}${m.in_reply_to_us ? ", replying to us" : ""}`)}<div style="font:400 16px/1.5 ${UI};color:${INK};margin-top:4px;">&ldquo;${esc(m.text.replace(/\s+/g, " ").slice(0, 280))}&rdquo;</div>${meta(`${m.new === false ? "earlier this week &middot; " : ""}${esc(date(m.created_at))} &middot; <a href="${esc(m.url)}" style="color:${GRAPHITE};">open on x</a>`)}</div>`);
  } else parts.push(`<div style="font:400 15px/1.5 ${BODY};color:${GRAPHITE};">Nobody replied to or mentioned the account this week.</div>`);

  // Posts as ledger rows.
  parts.push(h2("What we posted"));
  if (posts.length) {
    for (const p of posts) parts.push(row(`${sentence(p.text.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim(), p.url)}${meta(`${esc(date(p.created_at))} &middot; <span style="color:${INK};">${count(p.impressions, "view")}</span> &middot; ${count(p.likes, "like")} &middot; ${count(p.replies, "repl").replace(/repls$/, "replies").replace(/repl$/, "reply")} &middot; ${count(p.reposts, "repost")} &middot; ${count(p.bookmarks, "bookmark")}`)}`));
  } else if (d.announced.length) {
    for (const a of d.announced) parts.push(row(`${sentence(a.headline, a.url)}${meta(`announced ${esc(a.date)}`)}`));
  } else parts.push(`<div style="font:400 15px/1.5 ${BODY};color:${GRAPHITE};">Nothing new was posted.</div>`);
  if (replies.length) {
    parts.push(`<div style="margin-top:14px;">${label(`The account's own replies to others, last 7 days (${replies.length})`)}</div>`);
    for (const p of replies) parts.push(row(`${sentence(p.text.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim().slice(0, 160), p.url)}${meta(`${esc(date(p.created_at))} &middot; ${count(p.impressions, "view")} &middot; ${count(p.likes, "like")} &middot; ${count(p.replies, "repl").replace(/repls$/, "replies").replace(/repl$/, "reply")}`)}`, RULE));
  }

  // Traffic.
  parts.push(h2("Site traffic"));
  if (d.traffic && !d.traffic.note) {
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 10px;"><tr>${tile(num(d.traffic.pageviews), "page views", SIGNAL)}${tile(num(d.traffic.visits), "visits")}</tr></table>`);
    for (const t of d.traffic.top_paths) parts.push(row(`<div style="font:400 15px/1.4 ${UI};${NUMS}color:${INK};">${esc(t.path)} <span style="color:${GRAPHITE};">${num(t.views)}</span></div>`, RULE));
  } else parts.push(`<div style="font:400 15px/1.5 ${BODY};color:${GRAPHITE};">${esc(d.traffic?.note ?? "Not connected yet.")}</div>`);

  // Registry.
  parts.push(h2("The registry"));
  if (d.bulk) parts.push(`<div style="font:400 15px/1.5 ${BODY};color:${GRAPHITE};">A bulk rebuild touched every entry file at once; nothing new was added.</div>`);
  else if (d.changed.length) for (const c of d.changed) parts.push(row(`${sentence(c.headline, c.url ?? undefined)}${meta(`${esc(c.change[0].toUpperCase() + c.change.slice(1))} &middot; ${c.url ? `<span style="color:${INK};">live</span>` : `<span style="color:${SIGNAL};font-weight:600;">held</span>: ${esc(c.reasonText ?? c.state)}`}`)}`));
  else parts.push(`<div style="font:400 15px/1.5 ${BODY};color:${GRAPHITE};">No entry was added or changed.</div>`);
  if (d.heldList.length) {
    parts.push(`<div style="margin-top:14px;">${label(`Still off the site (${d.heldList.length})`)}</div>`);
    for (const h of d.heldList) parts.push(row(`${sentence(h.headline)}${meta(`<span style="color:${SIGNAL};font-weight:600;">Held</span> since ${esc(h.since)}: ${esc(h.reasonText)}`)}`, RULE));
  }
  if (d.leads) parts.push(`<div style="margin-top:14px;font:400 15px/1.5 ${BODY};color:${GRAPHITE};">The morning scan logged ${d.leads} lead${d.leads === 1 ? "" : "s"} for the editor to read.</div>`);

  // Needs Dave.
  parts.push(h2("Needs you"));
  parts.push(`<div style="font:400 17px/1.55 ${UI};color:${INK};"><!--NEEDS--></div>`);

  // Footer.
  parts.push(`<div style="border-top:2px solid ${INK};margin-top:36px;padding-top:10px;font:400 13px/1.6 ${UI};color:${GRAPHITE};">Every number here is measured by code. Facts gathered ${esc(d.generated_at.slice(0, 16).replace("T", " "))} UTC &middot; <a href="${esc(d.site)}" style="color:${GRAPHITE};">${esc(d.site.replace(/^https?:\/\//, ""))}</a> &middot; <a href="${esc(d.site)}/changelog#held" style="color:${GRAPHITE};">held list</a></div>`);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Because of AI, ${esc(day)}</title></head><body style="margin:0;padding:0;background:${PAPER};"><div style="max-width:640px;margin:0 auto;padding:28px 20px 40px;background:${PAPER};color:${INK};">${parts.join("\n")}</div></body></html>\n`;
}
