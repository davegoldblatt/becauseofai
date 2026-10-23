// Deterministic full-text fetch of a primary source, with no model involved.
// Strategies, in order: the ClinicalTrials.gov API for a registry record, Europe
// PMC full text for anything with a DOI, then the URL itself as HTML or PDF
// (pdftotext). A landing page, an abstract, a paywall, or a block is reported
// as not full text; the pipeline holds the entry rather than guessing.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const UA_EMAIL = "dave@becauseofai.org";
export const UA = `becauseofai-verifier/1.0 (https://becauseofai.org; mailto:${UA_EMAIL})`;
export const MAX_CHARS = 160_000;
export const MIN_FULL_TEXT_CHARS = 2_000;

export type SourceText =
  | { ok: true; url: string; finalUrl: string; method: string; text: string; sha256: string; chars: number; truncated: boolean }
  | { ok: false; url: string; method: string; reason: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function extractDoi(url: string): string | null {
  let u = url;
  try { u = decodeURIComponent(url); } catch {}
  const m = /10\.\d{4,9}\/[^\s"'<>?#]+/.exec(u);
  return m ? m[0].replace(/[.,;)]+$/, "") : null;
}

export function nctOf(url: string): string | null {
  const m = /\b(NCT\d{8})\b/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

export function pmcidOf(url: string): string | null {
  const m = /\b(PMC\d{6,9})\b/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  middot: "·", bull: "•", deg: "°", plusmn: "±", times: "×", divide: "÷", micro: "µ", frac12: "½", frac14: "¼", frac34: "¾",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", sect: "§", para: "¶", le: "≤", ge: "≥", ne: "≠", minus: "−",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", mu: "μ", sigma: "σ", chi: "χ", eacute: "é", egrave: "è", agrave: "à", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", ntilde: "ñ",
};
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? all;
  });
}

// HTML or JATS/XML to plain text with paragraph breaks. Scripts, styles, and
// page chrome go; table cells become tab-separated.
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|svg|template|iframe|canvas|math)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<(br|hr)\b[^>]*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|dd|dt|figcaption|caption|title|abstract|sec|fig|table-wrap|label|ref|list-item|ack|back|front|body)\s*>/gi, "\n");
  s = s.replace(/<\/(td|th)\s*>/gi, "\t");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/ /g, " ");
  s = s.replace(/[ \t]*\t[ \t]*/g, "\t").replace(/ {2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

const PAYWALL = /(access through your institution|buy this article|purchase (pdf|access)|subscribe to (the )?journal|sign in to read|institutional login|get full access|rent or buy|login to view full|full text access)/i;

function finish(url: string, finalUrl: string, method: string, text: string, opts: { minChars: number; maxChars: number; html?: string }): SourceText {
  const title = opts.html ? titleOf(opts.html) : "";
  if (/just a moment|attention required|access denied|are you a robot/i.test(title)) return { ok: false, url, method, reason: `blocked by the site (${title})` };
  if (text.length < opts.minChars) return { ok: false, url, method, reason: `only ${text.length} characters of text: a landing page or an abstract, not the full document` };
  if (text.length < 8_000 && PAYWALL.test(text)) return { ok: false, url, method, reason: "paywalled: the page offers the abstract and a purchase or sign-in prompt" };
  const truncated = text.length > opts.maxChars;
  const body = truncated ? text.slice(0, opts.maxChars) : text;
  return { ok: true, url, finalUrl, method, text: body, sha256: sha(body), chars: body.length, truncated };
}

// A fetch that follows redirects itself and keeps cookies across the hops.
// Publishers bounce a first visit through a cookie check (nature.com sends
// every new client to idp.nature.com and back); without a jar the final page
// is a "cookies not supported" stub. This is the same thing a browser does.
type Jar = Map<string, Map<string, string>>; // cookie domain -> name -> value

function storeCookies(jar: Jar, url: URL, setCookies: string[]): void {
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim(), value = pair.slice(eq + 1).trim();
    let domain = url.hostname;
    for (const a of attrs) {
      const [k, v] = a.split("=").map((x) => x.trim());
      if (k.toLowerCase() === "domain" && v) domain = v.replace(/^\./, "").toLowerCase();
    }
    if (!jar.has(domain)) jar.set(domain, new Map());
    jar.get(domain)!.set(name, value);
  }
}

function cookieHeader(jar: Jar, url: URL): string {
  const out: string[] = [];
  for (const [domain, cookies] of jar) {
    if (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) for (const [n, v] of cookies) out.push(`${n}=${v}`);
  }
  return out.join("; ");
}

async function get(url: string, accept: string, timeoutMs: number, hops = 8): Promise<Response> {
  const jar: Jar = new Map();
  let current = url;
  const deadline = Date.now() + timeoutMs;
  for (let i = 0; i <= hops; i++) {
    const u = new URL(current);
    const headers: Record<string, string> = { "User-Agent": UA, Accept: accept };
    const cookie = cookieHeader(jar, u);
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(current, { headers, redirect: "manual", signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    storeCookies(jar, u, r.headers.getSetCookie?.() ?? []);
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc && i < hops) {
      await r.arrayBuffer().catch(() => undefined);
      current = new URL(loc, current).toString();
      continue;
    }
    // Reads of r.url by callers expect the final address.
    Object.defineProperty(r, "url", { value: current });
    return r;
  }
  throw new Error("too many redirects");
}

function flatten(v: unknown, prefix = "", out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) { v.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out)); return out; }
  if (typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) flatten(x, prefix ? `${prefix}.${k}` : k, out); return out; }
  out.push(`${prefix}: ${String(v)}`);
  return out;
}

// The registry record as compact JSON: the protocol and results sections,
// which hold everything an entry can cite. The derived and document sections
// (MeSH terms, attached files) are dropped so the record is not truncated.
async function clinicalTrials(url: string, nct: string, timeoutMs: number, maxChars: number): Promise<SourceText> {
  const api = `https://clinicaltrials.gov/api/v2/studies/${nct}?format=json`;
  const r = await get(api, "application/json", timeoutMs);
  if (!r.ok) return { ok: false, url, method: "clinicaltrials", reason: `ClinicalTrials.gov API ${r.status}` };
  const json = (await r.json()) as Record<string, unknown>;
  const kept = { protocolSection: json.protocolSection, resultsSection: json.resultsSection, hasResults: json.hasResults };
  const text = JSON.stringify(kept, null, 1).replace(/^\s+/gm, (m) => " ".repeat(Math.min(m.length, 6)));
  return finish(url, api, "clinicaltrials", text, { minChars: 500, maxChars });
}

async function europePmcFullText(url: string, pmc: string, timeoutMs: number, maxChars: number): Promise<SourceText | null> {
  const ft = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmc}/fullTextXML`;
  const r2 = await get(ft, "application/xml", timeoutMs);
  if (!r2.ok) return null;
  const xml = await r2.text();
  if (!/<body[\s>]/i.test(xml)) return null; // front matter only
  return finish(url, ft, "europepmc", htmlToText(xml), { minChars: MIN_FULL_TEXT_CHARS, maxChars });
}

// Unpaywall: the legitimate open-access copy of a DOI, when one exists
// (publisher OA, PMC, or a repository). Tried after the publisher page fails.
async function unpaywall(url: string, doi: string, timeoutMs: number, maxChars: number): Promise<SourceText | null> {
  const r = await get(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UA_EMAIL)}`, "application/json", timeoutMs);
  if (!r.ok) return null;
  const json = (await r.json()) as { is_oa?: boolean; best_oa_location?: Loc | null; oa_locations?: Loc[] };
  if (!json.is_oa) return null;
  const locs = [json.best_oa_location, ...(json.oa_locations ?? [])].filter((l): l is Loc => !!l);
  const seen = new Set<string>();
  for (const l of locs) {
    for (const u of [l.url_for_pdf, l.url]) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const pmc = pmcidOf(u);
      const t = pmc ? await europePmcFullText(url, pmc, timeoutMs, maxChars).catch(() => null) : await direct(u, timeoutMs, maxChars).catch(() => null);
      if (t && t.ok) return { ...t, url, method: `unpaywall:${t.method}` };
    }
  }
  return null;
}
type Loc = { url?: string | null; url_for_pdf?: string | null; host_type?: string };

async function europePmc(url: string, doi: string, timeoutMs: number, maxChars: number): Promise<SourceText | null> {
  const q = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=lite`;
  const r = await get(q, "application/json", timeoutMs);
  if (!r.ok) return null;
  const json = (await r.json()) as { resultList?: { result?: { pmcid?: string; fullTextIdList?: { fullTextId?: string[] } }[] } };
  const hit = json.resultList?.result?.[0];
  const pmc = hit?.pmcid ?? hit?.fullTextIdList?.fullTextId?.find((x) => /^PMC/.test(x));
  if (!pmc) return null;
  return europePmcFullText(url, pmc, timeoutMs, maxChars);
}

export function pdfToText(buf: Buffer): { ok: true; text: string } | { ok: false; reason: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boa-pdf-"));
  const file = path.join(dir, "doc.pdf");
  try {
    fs.writeFileSync(file, buf);
    const r = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) return { ok: false, reason: `pdftotext is not installed (${r.error.message})` };
    if (r.status !== 0) return { ok: false, reason: `pdftotext failed: ${(r.stderr || "").trim().slice(0, 200)}` };
    return { ok: true, text: r.stdout.replace(/\f/g, "\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function direct(url: string, timeoutMs: number, maxChars: number): Promise<SourceText> {
  let r: Response;
  try {
    r = await get(url, "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5", timeoutMs);
  } catch (err) {
    return { ok: false, url, method: "html", reason: `fetch failed: ${(err as Error).message}` };
  }
  if (!r.ok) return { ok: false, url, method: "html", reason: `HTTP ${r.status}` };
  const type = (r.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await r.arrayBuffer());
  const isPdf = type.includes("application/pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) {
    const p = pdfToText(buf);
    if (!p.ok) return { ok: false, url, method: "pdf", reason: p.reason };
    return finish(url, r.url, "pdf", p.text, { minChars: MIN_FULL_TEXT_CHARS, maxChars });
  }
  const html = buf.toString("utf8");
  return finish(url, r.url, "html", htmlToText(html), { minChars: MIN_FULL_TEXT_CHARS, maxChars, html });
}

export async function fetchSourceText(url: string, opts: { timeoutMs?: number; maxChars?: number } = {}): Promise<SourceText> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxChars = opts.maxChars ?? MAX_CHARS;
  try {
    const nct = nctOf(url);
    if (nct && /clinicaltrials\.gov/i.test(url)) return await clinicalTrials(url, nct, timeoutMs, maxChars);
    const pmcid = pmcidOf(url);
    if (pmcid) {
      const t = await europePmcFullText(url, pmcid, timeoutMs, maxChars).catch(() => null);
      if (t && t.ok) return t;
    }
    const doi = extractDoi(url);
    if (doi) {
      const pmc = await europePmc(url, doi, timeoutMs, maxChars).catch(() => null);
      if (pmc && pmc.ok) return pmc;
    }
    const d = await direct(url, timeoutMs, maxChars);
    if (d.ok) return d;
    if (doi) {
      const oa = await unpaywall(url, doi, timeoutMs, maxChars).catch(() => null);
      if (oa && oa.ok) return oa;
    }
    return d;
  } catch (err) {
    return { ok: false, url, method: "none", reason: `fetch failed: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Verbatim quote matching. Both sides are normalised the same way: Unicode
// compatibility form, lower case, curly quotes and dashes straightened,
// whitespace collapsed. The loose form keeps letters and digits only.
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const loose = (s: string) => normalizeForMatch(s).replace(/[^a-z0-9]+/g, "");

export function findQuote(text: string, quote: string): { found: boolean; exact: boolean } {
  const t = normalizeForMatch(text);
  const q = normalizeForMatch(quote).replace(/^["'“”‘’]+|["'“”‘’.,;:]+$/g, "");
  if (!q) return { found: false, exact: false };
  if (t.includes(q)) return { found: true, exact: true };
  const lq = loose(quote);
  if (lq.length >= 12 && loose(text).includes(lq)) return { found: true, exact: false };
  return { found: false, exact: false };
}
