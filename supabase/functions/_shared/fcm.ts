// Firebase Cloud Messaging HTTP v1 with a service account (secret FCM_SERVICE_ACCOUNT). Token cached in memory + public.kv.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface ServiceAccount { project_id: string; client_email: string; private_key: string }
let cached: { token: string; exp: number } | null = null;
let sa: ServiceAccount | null = null;

function account(): ServiceAccount {
  if (sa) return sa;
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) throw new Error("Missing secret FCM_SERVICE_ACCOUNT");
  sa = JSON.parse(raw) as ServiceAccount;
  return sa;
}
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function pemToDer(pem: string): ArrayBuffer {
  const b = atob(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
  const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a.buffer;
}
async function signJwt(a: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(a.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}
export async function accessToken(sb: SupabaseClient): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const { data: row } = await sb.from("kv").select("value").eq("key", "fcm_token").maybeSingle();
  const v = row?.value as { token: string; exp: number } | undefined;
  if (v && v.exp - 60_000 > now) { cached = v; return v.token; }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signJwt(account()) }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: now + j.expires_in * 1000 };
  await sb.from("kv").upsert({ key: "fcm_token", value: cached, updated_at: new Date().toISOString() });
  return cached.token;
}

export interface Device { id: string; user_id: string; platform: "android" | "web"; fcm_token: string }
export interface PushContent {
  title: string; body: string; route: string; ttlSec: number;
  /** All values must be strings (FCM data rule). */
  data: Record<string, string>;
}
export interface SendResult { ok: boolean; status: string; error?: string; response?: unknown; deleted?: boolean }

/** Builds the per-platform FCM v1 message. Android: data-only, HIGH priority. Web: notification + webpush block (iPhone recipe). */
export function buildMessage(d: Device, c: PushContent): Record<string, unknown> {
  const ttl = Math.max(0, Math.round(c.ttlSec));
  const data = { ...c.data, title: c.title, body: c.body, route: c.route };
  if (d.platform === "android") {
    return { token: d.fcm_token, data, android: { priority: "HIGH", ttl: `${ttl}s` } };
  }
  return {
    token: d.fcm_token,
    notification: { title: c.title, body: c.body },
    data,
    webpush: {
      headers: { Urgency: "high", TTL: String(ttl) },
      notification: { title: c.title, body: c.body, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", tag: c.data.notification_id, renotify: true, require_interaction: true },
      fcm_options: { link: c.route },
    },
  };
}

export async function sendPush(sb: SupabaseClient, d: Device, c: PushContent, log: { signal_id?: string | null; wann_call_id?: string | null; kind: string }): Promise<SendResult> {
  let result: SendResult;
  try {
    const token = await accessToken(sb);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account().project_id}/messages:send`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: buildMessage(d, c) }),
    });
    const text = await res.text();
    let body: unknown = text; try { body = JSON.parse(text); } catch { /* keep text */ }
    if (res.ok) result = { ok: true, status: "sent", response: body };
    else {
      const code = (body as { error?: { details?: { errorCode?: string }[]; status?: string } })?.error;
      const fcmCode = code?.details?.find((x) => x.errorCode)?.errorCode ?? code?.status ?? String(res.status);
      result = { ok: false, status: fcmCode, error: text.slice(0, 500), response: body };
      if (fcmCode === "UNREGISTERED" || fcmCode === "NOT_FOUND" || res.status === 404) {
        await sb.from("devices").delete().eq("id", d.id);
        result.deleted = true;
      }
    }
  } catch (e) {
    result = { ok: false, status: "exception", error: e instanceof Error ? e.message : String(e) };
  }
  await sb.from("push_log").insert({ device_id: d.id, user_id: d.user_id, signal_id: log.signal_id ?? null, wann_call_id: log.wann_call_id ?? null, kind: log.kind, title: c.title, fcm_status: result.status, error: result.error ?? null, response: result.response ?? null });
  return result;
}
