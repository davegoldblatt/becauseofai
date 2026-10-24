// Daily scout: pull yesterday's candidates from sources that expose dates, plus
// alerts about the registry's own entries (retractions, stale window grades).
// Deterministic, no model. Writes .scout/candidates.json and prints a summary.
//
//   node scripts/scout.ts            # last 2 days (overlap protects against gaps)
//   node scripts/scout.ts --days 7
//
// Sources: PubMed E-utilities, medRxiv API, ClinicalTrials.gov API v2, the
// ISRCTN registry API, the AEA RCT registry's latest-trials export, arXiv
// (policy, economics, applied statistics, HCI), OSF preprints (EdArXiv,
// SocArXiv, PsyArXiv), ERIC (education research), journal and working-paper
// feeds (four medical, five general-science, NBER), Crossref (update-to) for
// every source DOI we hold, and a few watched pages whose "data through" date
// is compared with the entry that cites them.
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./lib/csv.ts";
import { loadEntries, staleWindowReason } from "../src/lib/entries.ts";
import type { Entry } from "../src/schema.ts";

const UA = "becauseofai-scout/0.1 (https://becauseofai.org; mailto:dave@vibecap.co)";
const args = process.argv.slice(2);
const days = Math.max(1, Number(args[args.indexOf("--days") + 1] || 2) || 2);
const today = new Date();
const from = new Date(today.getTime() - days * 86400000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const AI = /\b(artificial intelligence|machine learning|deep learning|neural network|large language model|language model|LLM|GPT|chatbot|foundation model|computer[- ]aided|AI[- ]|algorithm(ic)? (decision|support|triage))/i;
const RANDOM = /\b(randomi[sz]ed|randomi[sz]ation|cluster[- ]randomi[sz]ed|stepped[- ]wedge|controlled trial)\b/i;
const OUTCOME = /\b(mortality|survival|detection|diagnos|outcome|patients|students|learners|crash|injur|yield|cases|wait(ing)? (list|time)|burnout|workload)\b/i;

type Candidate = {
  source: string; id: string; title: string; url: string; date: string; venue: string;
  snippet: string; flags: { ai: boolean; randomized: boolean; outcome: boolean };
  fulltext?: string; // a direct document link when the landing page is script-rendered or an index
};
type Alert = { type: string; entry: string; detail: string };
const candidates: Candidate[] = [];
const alerts: Alert[] = [];
const errors: string[] = [];

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url: string): Promise<string> {
  let r = await fetch(url, { headers: { "User-Agent": UA } });
  if (r.status === 429 || r.status === 503) { // arXiv and a few registries rate-limit by the second; one pause, one retry
    const ra = r.headers.get("retry-after") ?? "";
    const secs = /^\d+$/.test(ra.trim()) ? Number(ra) : Number.isNaN(Date.parse(ra)) ? 15 : (Date.parse(ra) - Date.now()) / 1000;
    await new Promise((res) => setTimeout(res, Math.min(Math.max(secs, 0), 60) * 1000));
    r = await fetch(url, { headers: { "User-Agent": UA } });
  }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<\/?[A-Za-z!?][^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const flags = (text: string) => ({ ai: AI.test(text), randomized: RANDOM.test(text), outcome: OUTCOME.test(text) });
function push(c: Candidate) {
  if (!c.flags.ai) return; // every source below is pre-filtered to AI-ish work; keep only AI hits
  if (candidates.some((x) => x.url === c.url)) return;
  candidates.push(c);
}

async function pubmed() {
  const term = '("artificial intelligence"[Title/Abstract] OR "machine learning"[Title/Abstract] OR "deep learning"[Title/Abstract] OR "large language model"[Title/Abstract] OR "neural network"[Title/Abstract]) AND (randomized[Title/Abstract] OR randomised[Title/Abstract] OR "cluster randomised"[Title/Abstract] OR "stepped wedge"[Title/Abstract] OR "before and after"[Title/Abstract] OR deployment[Title/Abstract] OR implementation[Title/Abstract])';
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
  const s = await getJson(`${base}esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&reldate=${days}&datetype=edat&retmode=json&retmax=200`);
  const ids: string[] = s.esearchresult?.idlist ?? [];
  if (!ids.length) return;
  const sum = await getJson(`${base}esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
  for (const id of ids) {
    const d = sum.result?.[id];
    if (!d) continue;
    const doi = (d.articleids ?? []).find((a: any) => a.idtype === "doi")?.value;
    const title = strip(d.title ?? "");
    const date = String(d.sortpubdate ?? d.pubdate ?? "").slice(0, 10).replace(/\//g, "-");
    push({ source: "pubmed", id, title, url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`, date, venue: d.fulljournalname ?? d.source ?? "", snippet: `${d.pubtype?.join(", ") ?? ""}`, flags: flags(title + " " + (d.pubtype ?? []).join(" ")) });
  }
}

async function medrxiv() {
  const cats = /health informatics|radiology|epidemiology|public and global health|oncology|cardiovascular|emergency|primary care|infectious|ophthalmology|pathology|psychiatry|obstetrics|pediatrics|surgery|intensive care|dermatology|neurology|endocrinology|nephrology|gastroenterology|respiratory|geriatric|medical education|health policy|health systems|nursing|rehabilitation/i;
  let cursor = 0;
  for (let page = 0; page < 40; page++) {
    const d = await getJson(`https://api.medrxiv.org/details/medrxiv/${iso(from)}/${iso(today)}/${cursor}/json`);
    const coll: any[] = d.collection ?? [];
    for (const x of coll) {
      const text = `${x.title} ${x.abstract}`;
      if (!AI.test(text)) continue;
      if (!cats.test(x.category ?? "")) continue;
      push({ source: "medrxiv", id: x.doi, title: strip(x.title), url: `https://www.medrxiv.org/content/${x.doi}v${x.version}`, date: x.date, venue: `medRxiv · ${x.category}`, snippet: strip(x.abstract).slice(0, 400), flags: flags(text) });
    }
    const total = Number(d.messages?.[0]?.total ?? 0);
    cursor += coll.length;
    if (!coll.length || cursor >= total) break;
  }
}

async function clinicaltrials() {
  const term = `AREA[ResultsFirstPostDate]RANGE[${iso(from)},MAX] AND ("artificial intelligence" OR "machine learning" OR "deep learning" OR "neural network" OR "large language model" OR "decision support" OR "computer-aided" OR "AI-enabled" OR "AI-based")`;
  const fields = "NCTId,BriefTitle,OfficialTitle,ResultsFirstPostDate,PrimaryCompletionDate,StartDate,OverallStatus,DesignAllocation,EnrollmentCount,Condition,InterventionName";
  const d = await getJson(`https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(term)}&fields=${fields}&pageSize=100`);
  for (const s of d.studies ?? []) {
    const p = s.protocolSection ?? {};
    const idm = p.identificationModule ?? {}, st = p.statusModule ?? {}, des = p.designModule ?? {};
    const title = idm.officialTitle || idm.briefTitle || "";
    const text = `${title} ${(p.armsInterventionsModule?.interventions ?? []).map((i: any) => i.name).join(" ")}`;
    // The registry query already restricts to AI terms; a title alone often does not repeat them.
    push({ source: "clinicaltrials", id: idm.nctId, title: strip(title), url: `https://clinicaltrials.gov/study/${idm.nctId}`, date: st.resultsFirstPostDateStruct?.date ?? "", venue: `ClinicalTrials.gov results · ${des.designInfo?.allocation ?? "allocation n/a"} · enrolled ${des.enrollmentInfo?.count ?? "?"} · completed ${st.primaryCompletionDateStruct?.date ?? "?"}`, snippet: (p.conditionsModule?.conditions ?? []).join("; "), flags: { ...flags(text), ai: true, randomized: des.designInfo?.allocation === "RANDOMIZED" || RANDOM.test(text) } });
  }
}

async function feeds() {
  const list: [string, string][] = [
    ["Lancet Digital Health", "https://www.thelancet.com/rssfeed/landig_online.xml"],
    ["NEJM AI", "https://ai.nejm.org/action/showFeed?type=etoc&feed=rss&jc=ai"],
    ["Nature Medicine", "https://www.nature.com/nm.rss"],
    ["JAMA", "https://jamanetwork.com/rss/site_3/67.xml"],
    // General-science journals (DAV-387): the field experiments in education,
    // work and the environment run here and never reach PubMed.
    ["Science", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science"],
    ["Science Advances", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv"],
    ["Nature", "https://www.nature.com/nature.rss"],
    ["Nature Human Behaviour", "https://www.nature.com/nathumbehav.rss"],
    ["PNAS", "https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas"],
    // Working papers: the economics field experiments on AI at work appear here first (DAV-388).
    ["NBER working papers", "https://back.nber.org/rss/new.xml"],
  ];
  for (const [venue, url] of list) {
    try {
      const xml = await getText(url);
      for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
        const item = m[0];
        const title = strip(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const link = strip(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] ?? "");
        const desc = strip(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
        const date = strip(item.match(/<(?:pubDate|dc:date)>([\s\S]*?)<\/(?:pubDate|dc:date)>/)?.[1] ?? "");
        const text = `${title} ${desc}`;
        if (!AI.test(text)) continue;
        // Feeds list items late and some carry no date: keep undated items, drop what is clearly old or future.
        const day = ymd(date);
        if (day && (day < iso(new Date(from.getTime() - 7 * 86400000)) || day > iso(today))) continue;
        push({ source: "rss", id: link, title, url: link, date: day, venue, snippet: desc.slice(0, 400), flags: flags(text) });
      }
    } catch (e) {
      errors.push(`${venue}: ${(e as Error).message}`);
    }
  }
}

function doisOf(e: Entry): string[] {
  const out = new Set<string>();
  for (const s of e.sources as any[]) {
    if (s.doi) out.add(s.doi);
    const m = /10\.\d{4,9}\/[^\s?#]+/.exec(s.url);
    if (m) {
      let doi = m[0];
      while (/\.(pdf|full|abstract|html)$/i.test(doi)) doi = doi.replace(/\.(pdf|full|abstract|html)$/i, "");
      out.add(doi);
    }
  }
  return [...out];
}

// A date as "October 22, 2026" or "2026-10-22" to YYYY-MM-DD; "" when unreadable.
function ymd(s: string | undefined | null): string {
  if (!s) return "";
  // A bare "October 23, 2026" parses as local midnight; read it as UTC so the day does not shift with the runner's zone.
  const zoned = /^\d{4}-\d{2}-\d{2}/.test(s) || /(Z|[+-]\d{2}:?\d{2}|UTC|GMT)$/i.test(s.trim());
  const t = Date.parse(zoned ? s : `${s.trim()} UTC`);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}
const xmlText = (block: string, tag: string) => strip(block.match(new RegExp(`<${tag}(?:\\s(?:[^>"']|"[^"]*"|'[^']*')*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");

// ISRCTN (UK and international registry): interventional records edited in the
// window that mention AI and have either posted results or passed their end
// date. Registrations of trials still running are not pulled: they are
// protocols, and the scout drops protocols.
// Posted results: the publication stage says so, a basic or plain-English
// report is filled in, or an uploaded output is typed as results. Uploaded
// protocols, information sheets and analysis plans do not count.
const isrctnResults = (t: string) => /^Results$/i.test(xmlText(t, "publicationStage")) || ["basicReport", "plainEnglishReport"].some((k) => xmlText(t, k).length > 0) || /<output\b[^>]*outputType="[^"]*results[^"]*"/i.test(t);
async function isrctn() {
  // The date needs a time part: without one the registry ignores the clause and returns every match.
  const q = `("artificial intelligence" OR "machine learning" OR "deep learning" OR "large language model" OR "neural network" OR chatbot OR GPT) AND lastEdited GE ${iso(from)}T00:00:00`;
  const xml = await getText(`https://www.isrctn.com/api/query/format/default?q=${encodeURIComponent(q)}&limit=100`);
  for (const m of xml.matchAll(/<fullTrial\b[\s\S]*?<\/fullTrial>/g)) {
    const t = m[0];
    const id = xmlText(t, "isrctn");
    const edited = ymd(t.match(/<trial\b[^>]*\blastUpdated="([^"]+)"/)?.[1]);
    if (!id || !edited || edited < iso(from) || edited > iso(today) || !/^Interventional$/i.test(xmlText(t, "primaryStudyDesign"))) continue;
    const ended = ymd(xmlText(t, "overallEndDate"));
    const hasResults = isrctnResults(t);
    if (!hasResults && (!ended || ended > iso(today))) continue;
    const title = xmlText(t, "scientificTitle") || xmlText(t, "title");
    const summary = xmlText(t, "plainEnglishSummary");
    const text = `${title} ${summary} ${xmlText(t, "intervention")}`;
    if (!AI.test(text)) continue;
    const allocation = xmlText(t, "allocation");
    push({ source: "isrctn", id: `ISRCTN${id}`, title, url: `https://www.isrctn.com/ISRCTN${id}`, date: ended, venue: `ISRCTN registry · ${allocation || "Interventional"}${hasResults ? " · results posted" : " · ended, no results posted"}`, snippet: summary.slice(0, 400), flags: { ...flags(text), randomized: /randomi[sz]ed/i.test(allocation) || RANDOM.test(text) } });
  }
}

// AEA RCT Registry: the latest trials export (the registry's newest records),
// kept when they mention AI and were updated in the window. Mostly leads for
// the watchlist: the field experiments on AI tutors, advisors and workers.
async function aeaRegistry() {
  const rows = parseCsv(await getText("https://www.socialscienceregistry.org/trials/search.csv"));
  const head = rows[0] ?? [];
  const missing = ["Title", "Url", "Last update date", "RCT_ID", "Status", "Start date", "End date", "Keywords", "Abstract", "Intervention", "Country names"].filter((h) => !head.includes(h));
  if (missing.length) throw new Error(`AEA export is missing columns: ${missing.join(", ")}`);
  const col = (r: string[], name: string) => r[head.indexOf(name)] ?? "";
  for (const r of rows.slice(1)) {
    const updated = ymd(col(r, "Last update date"));
    if (!updated || updated < iso(from) || updated > iso(today)) continue;
    const title = strip(col(r, "Title"));
    const text = `${title} ${col(r, "Abstract").slice(0, 1500)} ${col(r, "Keywords")} ${col(r, "Intervention").slice(0, 500)}`;
    if (!AI.test(text)) continue;
    push({ source: "aea-registry", id: col(r, "RCT_ID"), title, url: col(r, "Url").replace(/^http:\/\//, "https://"), date: updated, venue: `AEA RCT Registry · ${col(r, "Status")} · ${col(r, "Start date") || "?"} to ${col(r, "End date") || "?"} · ${col(r, "Country names")}`, snippet: strip(col(r, "Abstract")).slice(0, 400), flags: { ...flags(text), randomized: true } });
  }
}

// arXiv: policy, economics, applied statistics and HCI preprints that report a
// randomized or field experiment. Everything on arXiv is "AI", so a paper
// must also carry a trial word and an outcome word to count.
async function arxiv() {
  const query = '(cat:cs.CY OR cat:econ.GN OR cat:stat.AP OR cat:cs.HC OR cat:econ.EM) AND (abs:randomized OR abs:randomised OR abs:"field experiment" OR abs:"controlled trial") AND (abs:"language model" OR abs:"artificial intelligence" OR abs:chatbot OR abs:"machine learning" OR abs:"generative AI")';
  const xml = await getText(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=50`);
  for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
    const e = m[0];
    const published = ymd(xmlText(e, "published"));
    if (!published || published < iso(from) || published > iso(today)) continue;
    const title = xmlText(e, "title").replace(/\s+/g, " ");
    const summary = xmlText(e, "summary");
    const text = `${title} ${summary}`;
    const f = flags(text);
    if (!(f.ai && f.randomized && f.outcome)) continue;
    const url = (xmlText(e, "id") || "").replace(/^http:/, "https:").replace(/v\d+$/, "");
    const cat = e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? "";
    push({ source: "arxiv", id: url, title, url, date: published, venue: `arXiv · ${cat}`, snippet: summary.slice(0, 400), flags: f });
  }
}

// OSF preprints: education and social-science preprints published in the
// window that report an AI trial (a trial word is required: the outcome words
// alone let position papers through).
async function osfPreprints() {
  for (const provider of ["edarxiv", "socarxiv", "psyarxiv"]) {
    try {
      const d = await getJson(`https://api.osf.io/v2/preprints/?filter[provider]=${provider}&filter[date_published][gte]=${iso(from)}&page[size]=100&fields[preprints]=title,description,date_published,doi`);
      for (const p of d.data ?? []) {
        const a = p.attributes ?? {};
        const published = ymd(a.date_published);
        if (!published || published < iso(from) || published > iso(today)) continue;
        const text = `${a.title ?? ""} ${a.description ?? ""}`;
        const f = flags(text);
        if (!(f.ai && f.randomized)) continue;
        const url = p.links?.html ?? (a.doi ? `https://doi.org/${a.doi}` : "");
        if (!url) continue;
        push({ source: "osf", id: p.id, title: strip(a.title ?? ""), url, date: published, venue: `${provider === "edarxiv" ? "EdArXiv" : provider === "socarxiv" ? "SocArXiv" : "PsyArXiv"} preprint`, snippet: strip(a.description ?? "").slice(0, 400), flags: f, fulltext: `https://osf.io/download/${p.id}/` });
      }
    } catch (err) {
      errors.push(`osf ${provider}: ${(err as Error).message}`);
    }
  }
}

// ERIC (US Department of Education index): education studies of AI with a
// trial in them, newest additions first. ERIC exposes no per-record add date,
// so the same items can appear on consecutive days; links the inbox already
// holds are skipped here so the triage sees only what is new to it.
async function eric() {
  const inbox = fs.existsSync("research/inbox.md") ? fs.readFileSync("research/inbox.md", "utf8") : "";
  const year = today.getUTCFullYear();
  const q = `("artificial intelligence" OR "large language model" OR chatbot OR "machine learning" OR "intelligent tutoring") AND (randomized OR randomised OR "controlled trial" OR "field experiment") AND (publicationdateyear:${year} OR publicationdateyear:${year - 1})`;
  const d = await getJson(`https://api.ies.ed.gov/eric/?search=${encodeURIComponent(q)}&format=json&rows=8&fields=title,publicationdateyear,source,url,id,description&sort=dateadded%20desc`);
  for (const x of d.response?.docs ?? []) {
    const title = strip(x.title ?? "");
    const text = `${title} ${x.description ?? ""}`;
    const url = x.url || `https://eric.ed.gov/?id=${x.id}`;
    if (inbox.includes(url) || inbox.includes(`https://eric.ed.gov/?id=${x.id}`)) continue;
    // ERIC hosts the PDF of its ED documents (reports, working papers); EJ journal articles live with the publisher.
    push({ source: "eric", id: x.id, title, url, date: `${x.publicationdateyear ?? ""}`, venue: `ERIC · ${x.source ?? ""} · no add date, may recur`, snippet: strip(x.description ?? "").slice(0, 400), flags: flags(text), ...(/^ED\d+$/.test(x.id ?? "") ? { fulltext: `https://files.eric.ed.gov/fulltext/${x.id}.pdf` } : {}) });
  }
}

// Watched pages: a company or agency page an entry cites, whose "data through"
// date can be read. When the page has moved past the entry's achieved end, the
// entry has new data to take in. Stateless: the comparison is with the entry.
const WATCH: { entry: string; url: string; pattern: RegExp }[] = [
  { entry: "waymo-injury-crashes", url: "https://waymo.com/safety/impact/", pattern: /through\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi },
];
const MONTH = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
async function watched(entries: Entry[]) {
  for (const w of WATCH) {
    const e = entries.find((x) => x.id === w.entry);
    if (!e) continue;
    try {
      const html = await getText(w.url);
      const found = [...new Set([...html.matchAll(w.pattern)].map((m) => `${m[2]}-${String(MONTH.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}`))];
      if (found.length !== 1) { alerts.push({ type: "watch-unreadable", entry: w.entry, detail: `${w.url}: ${found.length === 0 ? 'the "data through" date was not found on the page; the layout may have changed' : `the page names more than one "through" month (${found.join(", ")}); read it by hand`}` }); continue; }
      const seen = found[0];
      const end = e.dates.achieved_end != null ? String(e.dates.achieved_end).slice(0, 7) : null;
      if (end && seen > end) alerts.push({ type: "watch-updated", entry: w.entry, detail: `${w.url} now reports data through ${seen}; the entry's achieved end is ${end}` });
    } catch (err) {
      errors.push(`watch ${w.entry}: ${(err as Error).message}`);
    }
  }
}

async function crossref(entries: Entry[]) {
  for (const e of entries) {
    for (const doi of doisOf(e)) {
      try {
        const d = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
        const updates: any[] = d.message?.["update-to"] ?? [];
        for (const u of updates) {
          alerts.push({ type: `crossref-${u.type ?? "update"}`, entry: e.id, detail: `${doi}: ${u.label ?? u.type} dated ${u.updated?.["date-time"] ?? "?"} (${u.DOI ?? ""})` });
        }
      } catch (err) {
        errors.push(`crossref ${doi}: ${(err as Error).message}`);
      }
    }
  }
}

async function main() {
  const r = loadEntries({ today });
  for (const e of r.all) {
    const stale = staleWindowReason(e, today);
    if (stale) alerts.push({ type: "stale-window", entry: e.id, detail: stale });
  }
  for (const w of r.warnings) if (!alerts.some((a) => a.entry + a.detail === w.file.replace(".yaml", "") + w.message)) alerts.push({ type: "validate-warning", entry: w.file.replace(".yaml", ""), detail: w.message });
  const jobs: [string, () => Promise<void>][] = [
    ["pubmed", pubmed], ["medrxiv", medrxiv], ["clinicaltrials", clinicaltrials], ["isrctn", isrctn], ["aea-registry", aeaRegistry],
    ["arxiv", arxiv], ["osf", osfPreprints], ["eric", eric], ["rss", feeds], ["watch", () => watched(r.all)], ["crossref", () => crossref(r.all)],
  ];
  for (const [name, job] of jobs) {
    try { await job(); } catch (e) { errors.push(`${name}: ${(e as Error).message}`); }
  }
  candidates.sort((a, b) => Number(b.flags.randomized) - Number(a.flags.randomized) || Number(b.flags.outcome) - Number(a.flags.outcome) || (b.date > a.date ? 1 : -1));
  const known = new Set(r.all.flatMap((e) => (e.sources as any[]).map((s) => s.url)));
  const out = {
    generated_at: today.toISOString(), window: { from: iso(from), to: iso(today), days },
    counts: { candidates: candidates.length, randomized: candidates.filter((c) => c.flags.randomized).length, alerts: alerts.length, errors: errors.length },
    existing_entry_ids: r.all.map((e) => e.id), existing_source_urls: [...known],
    candidates, alerts, errors,
  };
  fs.mkdirSync(path.resolve(process.cwd(), ".scout"), { recursive: true });
  fs.writeFileSync(path.resolve(process.cwd(), ".scout/candidates.json"), JSON.stringify(out, null, 2));
  console.log(`scout ${out.window.from}..${out.window.to}: ${candidates.length} candidates (${out.counts.randomized} randomized), ${alerts.length} alerts, ${errors.length} source errors`);
  for (const c of candidates.slice(0, 15)) console.log(`  [${c.source}${c.flags.randomized ? " RCT" : ""}] ${c.date} ${c.title.slice(0, 90)} — ${c.venue.slice(0, 50)}`);
  for (const a of alerts) console.log(`  ALERT ${a.type} ${a.entry}: ${a.detail.slice(0, 120)}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
}
main();
