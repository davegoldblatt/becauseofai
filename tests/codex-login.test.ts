// The robot's ChatGPT login is written back after a refresh (scripts/lib/vendors.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VENDORS = path.resolve("scripts/lib/vendors.ts");
const login = (refresh: string) => JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: "x", access_token: "y", refresh_token: refresh }, last_refresh: "2026-11-09T00:00:00Z" });

// A child process stands in for one gate run: it takes the login, the CLI
// "refreshes" it in the throwaway home, and the process exits.
function runOnce(home: string, writeback: boolean, newLogin: string | null) {
  const script = `import { codexHome } from ${JSON.stringify(VENDORS)}; import fs from "node:fs"; import path from "node:path";
    const d = codexHome(); ${newLogin === null ? "" : `fs.writeFileSync(path.join(d, "auth.json"), ${JSON.stringify(newLogin)});`}`;
  const env = { ...process.env, CODEX_HOME: home, CODEX_AUTH_JSON: "", ...(writeback ? { CODEX_LOGIN_WRITEBACK: "1" } : { CODEX_LOGIN_WRITEBACK: "" }) };
  const r = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function freshHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "boa-login-test-"));
  fs.writeFileSync(path.join(home, "auth.json"), login("old"));
  return home;
}

test("a refreshed login is saved back when write-back is on", () => {
  const home = freshHome();
  runOnce(home, true, login("new"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8")).tokens.refresh_token, "new");
});

test("without write-back the source login is never touched (control)", () => {
  const home = freshHome();
  runOnce(home, false, login("new"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8")).tokens.refresh_token, "old");
});

test("a broken login is never written back", () => {
  const home = freshHome();
  runOnce(home, true, "{ not json");
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8")).tokens.refresh_token, "old");
  runOnce(home, true, JSON.stringify({ tokens: {} }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8")).tokens.refresh_token, "old");
});
