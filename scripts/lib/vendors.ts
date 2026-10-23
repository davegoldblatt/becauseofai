// One call per vendor that returns a validated structured object. Each vendor
// has two ways in: an API key, or the vendor's own CLI signed in to a
// subscription (OpenAI's Codex login file, Anthropic's Claude Code login). The
// model runs in an empty directory with no tools, so it sees only the prompt.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { z } from "zod";
import type { Vendor } from "../../src/schema.ts";
import type { Tokens } from "./record.ts";

export type Effort = "low" | "medium" | "high" | "xhigh";
export type Request<T> = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
  validate: z.ZodType<T>;
  model: string;
  effort?: Effort;
  maxOutputTokens?: number;
  timeoutMs?: number;
};
export type Result<T> =
  | { ok: true; output: T; via: string; model: string; tokens: Tokens | null; durationMs: number }
  | { ok: false; error: string; via: string; model: string; durationMs: number };

export type Availability = { via: "api" | "codex-login" | "claude-login" } | { via: null; why: string };

const CODEX = process.env.CODEX_BIN || "codex";
const CLAUDE = process.env.CLAUDE_BIN || "claude";

let codexHomeCache: string | null | undefined;
// Where Codex finds its login. CODEX_AUTH_JSON (the file's contents, from a
// secret) wins; then CODEX_HOME; then ~/.codex. The model always runs against
// a fresh temporary home holding only auth.json (0600, removed at exit), never
// the operator's real home with its session history and config.
export function codexHome(): string | null {
  if (codexHomeCache !== undefined) return codexHomeCache;
  let auth: string | null = null;
  const fromSecret = process.env.CODEX_AUTH_JSON;
  if (fromSecret && fromSecret.trim()) auth = fromSecret;
  else {
    for (const dir of [process.env.CODEX_HOME, path.join(os.homedir(), ".codex")]) {
      const f = dir && path.join(dir, "auth.json");
      if (f && fs.existsSync(f)) { auth = fs.readFileSync(f, "utf8"); break; }
    }
  }
  if (!auth) return (codexHomeCache = null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boa-codex-"));
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(path.join(dir, "auth.json"), auth, { mode: 0o600 });
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  return (codexHomeCache = dir);
}

// The environment a vendor CLI runs with: a path to find its binary, a
// throwaway home, and the one variable it needs for its login. Nothing else
// from the job (tokens, keys, the repository's location) is passed on.
function cliEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "boa-home-"));
  process.on("exit", () => fs.rmSync(home, { recursive: true, force: true }));
  return { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir(), LANG: "C.UTF-8", TERM: "dumb", ...extra };
}

// A structured answer that carries something shaped like a credential is not
// an answer: it is refused before anything is written or posted.
const SECRET_SHAPES = [/\bsk-[A-Za-z0-9_-]{16,}/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bAKIA[A-Z0-9]{12,}/, /"refresh_token"\s*:/, /"access_token"\s*:/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
export function looksLikeSecret(output: unknown): string | null {
  const s = JSON.stringify(output);
  for (const re of SECRET_SHAPES) if (re.test(s)) return re.source;
  return null;
}

export function availability(vendor: Vendor): Availability {
  if (vendor === "openai") {
    if (process.env.OPENAI_API_KEY) return { via: "api" };
    // The CLI route runs an agent with a read-only shell. On a shared runner
    // that is a tool the verifier does not need; the API has none. It takes an
    // explicit opt-in there.
    if (process.env.GITHUB_ACTIONS && process.env.ALLOW_CODEX_LOGIN_IN_CI !== "1") {
      return { via: null, why: "no OPENAI_API_KEY; the Codex login route is not used in CI unless ALLOW_CODEX_LOGIN_IN_CI=1" };
    }
    if (codexHome()) return { via: "codex-login" };
    return { via: null, why: "no OPENAI_API_KEY and no Codex login (CODEX_AUTH_JSON or CODEX_HOME/auth.json)" };
  }
  if (process.env.ANTHROPIC_API_KEY) return { via: "api" };
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.CLAUDE_CONFIG_DIR || fs.existsSync(path.join(os.homedir(), ".claude"))) return { via: "claude-login" };
  return { via: null, why: "no ANTHROPIC_API_KEY and no Claude Code login (CLAUDE_CODE_OAUTH_TOKEN)" };
}

export async function callStructured<T>(vendor: Vendor, req: Request<T>): Promise<Result<T>> {
  const t0 = Date.now();
  const a = availability(vendor);
  if (!a.via) return { ok: false, error: a.why, via: "none", model: req.model, durationMs: 0 };
  try {
    const raw =
      vendor === "openai"
        ? a.via === "api" ? await openaiApi(req) : await codexCli(req)
        : a.via === "api" ? await anthropicApi(req) : await claudeCli(req);
    const leak = looksLikeSecret(raw.output);
    if (leak) return { ok: false, error: `output refused: it carries something shaped like a credential (${leak})`, via: a.via, model: req.model, durationMs: Date.now() - t0 };
    const parsed = req.validate.safeParse(raw.output);
    if (!parsed.success) {
      return { ok: false, error: `output did not match the schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, via: a.via, model: req.model, durationMs: Date.now() - t0 };
    }
    return { ok: true, output: parsed.data, via: a.via, model: raw.model ?? req.model, tokens: raw.tokens, durationMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 600), via: a.via, model: req.model, durationMs: Date.now() - t0 };
  }
}

type Raw = { output: unknown; tokens: Tokens | null; model?: string };

function emptyDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdin: string; timeoutMs: number }): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${cmd} timed out after ${Math.round(opts.timeoutMs / 1000)}s`)); }, opts.timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    p.stdin.end(opts.stdin);
  });
}

// --- OpenAI -----------------------------------------------------------------

async function openaiApi<T>(req: Request<T>): Promise<Raw> {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: req.model,
      instructions: req.system,
      input: req.user,
      ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
      max_output_tokens: req.maxOutputTokens ?? 8000,
      text: { format: { type: "json_schema", name: req.schemaName, schema: req.schema, strict: true } },
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 600_000),
  });
  const body = (await r.json()) as any;
  if (!r.ok) throw new Error(`OpenAI API ${r.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const msg = (body.output ?? []).find((o: any) => o.type === "message");
  const text = msg?.content?.find((c: any) => c.type === "output_text")?.text;
  if (typeof text !== "string") throw new Error(`OpenAI API returned no output_text (status ${body.status}, ${body.incomplete_details?.reason ?? "no detail"})`);
  const u = body.usage ?? {};
  return { output: JSON.parse(text), model: body.model, tokens: u.input_tokens != null ? { input: u.input_tokens, output: u.output_tokens ?? 0, total: u.total_tokens ?? u.input_tokens + (u.output_tokens ?? 0), cached: u.input_tokens_details?.cached_tokens ?? 0, reasoning: u.output_tokens_details?.reasoning_tokens ?? 0 } : null };
}

async function codexCli<T>(req: Request<T>): Promise<Raw> {
  const home = codexHome()!;
  const work = emptyDir("boa-codex-work-");
  const schemaFile = path.join(work, "schema.json");
  const outFile = path.join(work, "out.json");
  const cwd = path.join(work, "empty");
  fs.mkdirSync(cwd);
  fs.writeFileSync(schemaFile, JSON.stringify(req.schema));
  try {
    const args = [
      "exec", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--sandbox", "read-only", "-C", cwd,
      "-m", req.model, "-c", `model_reasoning_effort="${req.effort ?? "high"}"`, "--output-schema", schemaFile, "-o", outFile, "-",
    ];
    const prompt = `${req.system}\n\nAnswer with one JSON object matching the output schema and nothing else.\n\n${req.user}`;
    const r = await run(CODEX, args, { cwd, env: cliEnv({ CODEX_HOME: home }), stdin: prompt, timeoutMs: req.timeoutMs ?? 900_000 });
    if (!fs.existsSync(outFile)) throw new Error(`codex exec exited ${r.code} without output: ${(r.stderr || r.stdout).trim().slice(-400)}`);
    const text = fs.readFileSync(outFile, "utf8").trim();
    if (!text) throw new Error(`codex exec wrote an empty answer (exit ${r.code})`);
    const m = /tokens used\s*\n?\s*([\d,]+)/i.exec(r.stdout + "\n" + r.stderr);
    const total = m ? Number(m[1].replace(/,/g, "")) : null;
    return { output: JSON.parse(text), tokens: total != null ? { input: 0, output: 0, total } : null };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// --- Anthropic --------------------------------------------------------------

async function anthropicApi<T>(req: Request<T>): Promise<Raw> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxOutputTokens ?? 8000,
      system: req.system,
      // Thinking is set explicitly: a forced tool choice and thinking do not mix,
      // and some models turn thinking on when the field is omitted.
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: req.user }],
      tools: [{ name: req.schemaName, description: "Record the structured answer.", input_schema: req.schema }],
      tool_choice: { type: "tool", name: req.schemaName },
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 600_000),
  });
  const body = (await r.json()) as any;
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const block = (body.content ?? []).find((c: any) => c.type === "tool_use");
  if (!block) throw new Error(`Anthropic API returned no tool_use block (stop_reason ${body.stop_reason})`);
  const u = body.usage ?? {};
  return { output: block.input, model: body.model, tokens: u.input_tokens != null ? { input: u.input_tokens, output: u.output_tokens ?? 0, total: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) } : null };
}

async function claudeCli<T>(req: Request<T>): Promise<Raw> {
  const cwd = emptyDir("boa-claude-work-");
  try {
    // Not --bare: bare mode refuses OAuth, and the subscription login is the
    // point. The run is clean because the working directory is empty and, in
    // CI, the config directory is fresh; --system-prompt replaces the default.
    const args = [
      "-p", "--no-session-persistence", "--model", req.model, "--output-format", "json", "--json-schema", JSON.stringify(req.schema),
      "--max-turns", "1", "--tools", "", "--system-prompt", req.system,
    ];
    const extra: Record<string, string> = {};
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) extra.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (process.env.CLAUDE_CONFIG_DIR) extra.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
    const r = await run(CLAUDE, args, { cwd, env: cliEnv(extra), stdin: req.user, timeoutMs: req.timeoutMs ?? 900_000 });
    const line = r.stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    if (!line) throw new Error(`claude -p produced no JSON (exit ${r.code}): ${(r.stderr || r.stdout).trim().slice(-400)}`);
    const body = JSON.parse(line);
    if (body.is_error) throw new Error(`claude -p error: ${String(body.result).slice(0, 400)}`);
    const output = body.structured_output ?? (typeof body.result === "string" ? JSON.parse(body.result) : null);
    if (output == null) throw new Error("claude -p returned no structured output");
    const u = body.usage ?? {};
    const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const model = Object.keys(body.modelUsage ?? {})[0];
    return { output, model, tokens: u.output_tokens != null ? { input, output: u.output_tokens, total: input + u.output_tokens } : null };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
