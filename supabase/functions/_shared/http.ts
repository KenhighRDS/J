export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-j-key, x-j-cron-key, x-j-feed-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function fail(status: number, message: string): never { throw new HttpError(status, message); }
export async function readJson<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { fail(400, "Body must be JSON"); }
}
/** Wraps a handler: CORS preflight, uniform error responses. */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try { return await fn(req); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
    }
  };
}
export function requireCronKey(req: Request): void {
  const key = Deno.env.get("J_CRON_KEY");
  if (!key || req.headers.get("x-j-cron-key") !== key) fail(401, "Bad cron key");
}
