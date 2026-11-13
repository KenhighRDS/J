// Market data clients for the stocks function. Finnhub (free key) drives the scan; Massive, formerly Polygon (free key,
// optional) adds the company description and price history; SEC EDGAR and OpenFIGI (no key) give big-investor holdings.
import type { Bar, EarningsRow, IpoRow, Metric, Profile2, Quote, Recommendation } from "./stockRules.ts";

export class DataError extends Error { constructor(public source: string, public status: number, message: string) { super(message); } }

async function get(source: string, url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try { res = await fetch(url, { ...init, headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new DataError(source, 0, `${source}: no answer (${e instanceof Error ? e.message : "network error"})`); }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 160);
    const why = res.status === 401 || res.status === 403 ? "key refused" : res.status === 429 ? "rate limit reached" : `error ${res.status}`;
    throw new DataError(source, res.status, `${source}: ${why}${body ? ` (${body})` : ""}`);
  }
  return res;
}
const getJson = async <T>(source: string, url: string, headers?: Record<string, string>, init?: RequestInit) => (await (await get(source, url, headers, init)).json()) as T;

export function finnhub(key: string) {
  const call = <T>(path: string, params: Record<string, string>) =>
    getJson<T>("Finnhub", `https://finnhub.io/api/v1${path}?${new URLSearchParams(params)}`, { "X-Finnhub-Token": key });
  return {
    quote: (symbol: string) => call<Quote>("/quote", { symbol }),
    profile: (symbol: string) => call<Profile2>("/stock/profile2", { symbol }),
    metric: async (symbol: string) => (await call<{ metric?: Metric }>("/stock/metric", { symbol, metric: "all" })).metric ?? {},
    earnings: async (from: string, to: string) => (await call<{ earningsCalendar?: EarningsRow[] }>("/calendar/earnings", { from, to })).earningsCalendar ?? [],
    ipos: async (from: string, to: string) => (await call<{ ipoCalendar?: IpoRow[] }>("/calendar/ipo", { from, to })).ipoCalendar ?? [],
    recommendation: async (symbol: string) => (await call<Recommendation[]>("/stock/recommendation", { symbol }))[0] ?? null,
    surprises: (symbol: string) => call<{ actual: number | null; estimate: number | null; period: string; surprisePercent: number | null }[]>("/stock/earnings", { symbol }),
  };
}
export type Finnhub = ReturnType<typeof finnhub>;

export interface TickerDetails { description?: string; total_employees?: number; homepage_url?: string; list_date?: string; name?: string; sic_description?: string }
export function massive(key: string) {
  const call = <T>(path: string) => getJson<T>("Massive", `https://api.massive.com${path}`, { Authorization: `Bearer ${key}` });
  return {
    details: async (symbol: string) => (await call<{ results?: TickerDetails }>(`/v3/reference/tickers/${encodeURIComponent(symbol)}`)).results ?? null,
    /** Daily bars, oldest first. */
    bars: async (symbol: string, from: string, to: string): Promise<Bar[]> =>
      ((await call<{ results?: Bar[] }>(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000`)).results ?? [])
        .filter((b) => Number.isFinite(b.c) && Number.isFinite(b.h) && Number.isFinite(b.l)),
  };
}
export type Massive = ReturnType<typeof massive>;

/** SEC EDGAR asks every client to name itself and give a contact address, and to stay under 10 requests a second. */
export function sec(contact: string) {
  const headers = { "User-Agent": `J Signals ${contact}` };
  const pad = (cik: number) => String(cik).padStart(10, "0");
  return {
    submissions: (cik: number) => getJson<{ name?: string; filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[] } } }>("SEC", `https://data.sec.gov/submissions/CIK${pad(cik)}.json`, headers),
    /** The information-table XML of a 13F filing: the .xml in the folder that is not the cover page. */
    infoTable: async (cik: number, accession: string): Promise<string | null> => {
      const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}`;
      const idx = await getJson<{ directory?: { item?: { name: string; size?: string }[] } }>("SEC", `${dir}/index.json`, headers);
      const xml = (idx.directory?.item ?? []).filter((f) => /\.xml$/i.test(f.name) && !/primary_doc/i.test(f.name)).sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
      if (!xml) return null;
      return await (await get("SEC", `${dir}/${xml.name}`, { ...headers, Accept: "application/xml,text/xml,*/*" })).text();
    },
  };
}

/** CUSIP → US ticker through OpenFIGI (no key: 10 per request, 25 requests a minute). Unknown CUSIPs come back as null. */
export async function figiMap(cusips: string[]): Promise<Record<string, { ticker: string | null; name: string | null }>> {
  const { tickerFromFigi } = await import("./stockRules.ts");
  const out: Record<string, { ticker: string | null; name: string | null }> = {};
  for (let i = 0; i < cusips.length; i += 10) {
    const batch = cusips.slice(i, i + 10);
    const res = await getJson<{ data?: { ticker?: string; name?: string; securityType?: string; marketSector?: string }[]; warning?: string }[]>("OpenFIGI", "https://api.openfigi.com/v3/mapping", { "Content-Type": "application/json" },
      // a code that starts with a letter is a CINS: the same thing for a company registered outside the US (Chubb, Aon, ...)
      { method: "POST", body: JSON.stringify(batch.map((c) => ({ idType: /^[A-Z]/.test(c) ? "ID_CINS" : "ID_CUSIP", idValue: c, exchCode: "US" }))) });
    batch.forEach((c, j) => { const job = res[j] ?? {}; out[c] = { ticker: tickerFromFigi(job), name: job.data?.[0]?.name ?? null }; });
  }
  return out;
}
