export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}
export const SITE_URL = Deno.env.get("J_SITE_URL") ?? "https://j-signals.netlify.app";
