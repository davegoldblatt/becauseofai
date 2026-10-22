// Per-entry OG image: a plain text card (HANDOFF §9 default). Newsreader for the
// sentence, the three grades as text, achieved and published side by side.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import type { Entry } from "../schema.ts";
import { achievedState, fmtDate, effectLine, EVIDENCE_LABEL, ATTRIBUTION_LABEL, WINDOW_LABEL, SECTION_LABEL, DOMAIN_LABEL } from "../lib/format.ts";

// Resolved from the project root: at build time this module runs from a bundled
// chunk under dist/, so import.meta.url would point at the wrong place. Astro
// and Cloudflare Pages both build from the project root.
const font = (w: number) => fs.readFileSync(path.resolve(process.cwd(), `src/og/Newsreader-${w}.ttf`));
const fontData = { 500: font(500), 600: font(600) };

const PAPER = "#fbf8f2", INK = "#1f1b17", INK3 = "#6b635b", RULE = "#e3dcd0";
const BADGE: Record<string, [string, string]> = {
  "ev-A": ["#d6e2ff", "#1b3d8f"], "ev-B": ["#e0e8f6", "#2b4a86"], "ev-C": ["#e9ecf2", "#475777"], "ev-D": ["#eeeff2", "#626a7c"],
  "at-isolated": ["#d8eedc", "#1e5a2e"], "at-only-path": ["#d4ece5", "#195446"], "at-bundled": ["#f6e6c2", "#6a4b08"], "at-ai-vs-ai": ["#f0dcc8", "#6c3d14"],
  "wi-in": ["#d2ebe9", "#135b55"], "wi-ongoing": ["#dde7e6", "#2f5856"], "wi-pre": ["#ebe8e3", "#5f5850"],
};
const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });
function pill(key: string, label: string) {
  const [bg, fg] = BADGE[key] ?? [PAPER, INK3];
  return h("div", { display: "flex", backgroundColor: bg, color: fg, borderRadius: 999, padding: "6px 18px", fontSize: 24, border: BADGE[key] ? "none" : `2px dashed ${RULE}` }, label);
}

export async function renderEntryOg(e: Entry): Promise<Buffer> {
  const g = e.grades;
  const effect = effectLine(e);
  const headlineSize = e.headline.length > 150 ? 36 : e.headline.length > 110 ? 42 : 50;
  const effectSize = effect && effect.length > 140 ? 20 : 24;
  const tree = h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1200, height: 630, padding: "56px 64px", backgroundColor: PAPER, color: INK, fontFamily: "Newsreader" }, [
    h("div", { display: "flex", justifyContent: "space-between", fontSize: 26, color: INK3 }, [h("div", {}, "Because of AI"), h("div", {}, e.section === "because" ? DOMAIN_LABEL[e.domain] : SECTION_LABEL[e.section])]),
    h("div", { display: "flex", flexDirection: "column", gap: 18 }, [
      h("div", { display: "flex", fontSize: headlineSize, lineHeight: 1.18, fontWeight: 600, letterSpacing: -0.5 }, e.headline),
      ...(effect ? [h("div", { display: "flex", gap: 10, fontSize: effectSize, lineHeight: 1.3, color: INK }, [h("span", { color: INK3 }, "Effect"), h("span", { display: "flex" }, effect)])] : []),
    ]),
    h("div", { display: "flex", flexDirection: "column", gap: 18 }, [
      h("div", { display: "flex", gap: 12 }, [
        pill(`ev-${g.evidence}`, g.evidence ? `evidence ${EVIDENCE_LABEL[g.evidence]}` : "evidence not graded"),
        pill(`at-${g.attribution}`, g.attribution ? `attribution ${ATTRIBUTION_LABEL[g.attribution]}` : "attribution not graded"),
        pill(`wi-${g.window}`, g.window ? `window ${WINDOW_LABEL[g.window]}` : "window not graded"),
      ]),
      h("div", { display: "flex", gap: 40, fontSize: 26 }, [
        h("div", { display: "flex", gap: 10 }, [h("span", { color: INK3 }, "Achieved"), h("span", {}, achievedState(e).text)]),
        h("div", { display: "flex", gap: 10 }, [h("span", { color: INK3 }, "Published"), h("span", {}, fmtDate(e.dates.published))]),
      ]),
    ]),
  ]);
  return render(tree);
}

export async function renderSiteOg(thesis: string): Promise<Buffer> {
  const tree = h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1200, height: 630, padding: "56px 64px", backgroundColor: PAPER, color: INK, fontFamily: "Newsreader" }, [
    h("div", { display: "flex", fontSize: 26, color: INK3 }, "Because of AI"),
    h("div", { display: "flex", fontSize: 56, lineHeight: 1.18, fontWeight: 500, letterSpacing: -0.5 }, thesis),
    h("div", { display: "flex", fontSize: 26, color: INK3 }, "A registry of measured AI benefits to people. becauseofai.org"),
  ]);
  return render(tree);
}

async function render(tree: unknown): Promise<Buffer> {
  const svg = await satori(tree as any, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Newsreader", data: fontData[500], weight: 500, style: "normal" },
      { name: "Newsreader", data: fontData[600], weight: 600, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
