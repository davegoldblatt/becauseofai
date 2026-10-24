// Daily scout: pull yesterday's candidates from sources that expose dates, plus
// alerts about the registry's own entries (retractions, stale window grades).
// Deterministic, no model. Writes .scout/candidates.json and prints a summary.
//
//   node scripts/scout.ts            # last 2 days (overlap protects against gaps)
//   node scripts/scout.ts --days 7
//
// Sources: PubMed E-utilities, medRxiv API, ClinicalTrials.gov API v2, four
// journal RSS feeds (four medical, five general-science), Crossref (update-to)
// for every source DOI we hold.
import fs from "node:fs";
import path from "node:path";
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
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
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
        push({ source: "rss", id: link, title, url: link, date: date ? new Date(date).toISOString().slice(0, 10) : "", venue, snippet: desc.slice(0, 400), flags: flags(text) });
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
  const jobs: [string, () => Promise<void>][] = [["pubmed", pubmed], ["medrxiv", medrxiv], ["clinicaltrials", clinicaltrials], ["rss", feeds], ["crossref", () => crossref(r.all)]];
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
