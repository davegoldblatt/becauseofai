// Read the bot's own posts and mentions from the X API with the same OAuth
// 1.0a keys the announcer posts with. No library: the signature is HMAC-SHA1
// over the normalised request, per the OAuth 1.0a spec.
import { createHmac, randomBytes } from "node:crypto";

export type XKeys = { appKey: string; appSecret: string; accessToken: string; accessSecret: string };

export function xKeysFromEnv(): XKeys | null {
  const { X_APP_KEY, X_APP_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_APP_KEY || !X_APP_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) return null;
  return { appKey: X_APP_KEY, appSecret: X_APP_SECRET, accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_TOKEN_SECRET };
}

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function authHeader(keys: XKeys, method: string, url: string, query: Record<string, string>): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.appKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: keys.accessToken,
    oauth_version: "1.0",
  };
  const params = { ...query, ...oauth };
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&"))].join("&");
  const key = `${enc(keys.appSecret)}&${enc(keys.accessSecret)}`;
  oauth.oauth_signature = createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ");
}

export async function xGet<T = unknown>(keys: XKeys, path: string, query: Record<string, string> = {}): Promise<T> {
  const url = `https://api.x.com/2${path}`;
  const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join("&");
  const r = await fetch(qs ? `${url}?${qs}` : url, { headers: { Authorization: authHeader(keys, "GET", url, query), "User-Agent": "becauseofai-digest/1.0" }, signal: AbortSignal.timeout(30_000) });
  const body = (await r.json().catch(() => ({}))) as T & { title?: string; detail?: string };
  if (!r.ok) throw new Error(`X API ${r.status} on ${path}: ${(body as { detail?: string }).detail ?? (body as { title?: string }).title ?? JSON.stringify(body).slice(0, 200)}`);
  return body;
}

export type XPost = { id: string; text: string; created_at: string; public_metrics?: Record<string, number>; non_public_metrics?: Record<string, number>; author_id?: string; in_reply_to_user_id?: string };

export async function me(keys: XKeys): Promise<{ id: string; username: string; followers: number | null }> {
  const r = await xGet<{ data: { id: string; username: string; public_metrics?: { followers_count?: number } } }>(keys, "/users/me", { "user.fields": "public_metrics" });
  return { id: r.data.id, username: r.data.username, followers: r.data.public_metrics?.followers_count ?? null };
}

export async function ownPosts(keys: XKeys, userId: string, max = 20): Promise<XPost[]> {
  const r = await xGet<{ data?: XPost[] }>(keys, `/users/${userId}/tweets`, { max_results: String(max), "tweet.fields": "created_at,public_metrics,non_public_metrics", exclude: "retweets" });
  return r.data ?? [];
}

export async function mentions(keys: XKeys, userId: string, sinceIso: string, max = 50): Promise<(XPost & { username?: string })[]> {
  const r = await xGet<{ data?: XPost[]; includes?: { users?: { id: string; username: string }[] } }>(keys, `/users/${userId}/mentions`, { max_results: String(max), start_time: sinceIso, "tweet.fields": "created_at,author_id,public_metrics,in_reply_to_user_id", expansions: "author_id", "user.fields": "username" });
  const names = new Map((r.includes?.users ?? []).map((u) => [u.id, u.username]));
  return (r.data ?? []).map((p) => ({ ...p, username: p.author_id ? names.get(p.author_id) : undefined }));
}
