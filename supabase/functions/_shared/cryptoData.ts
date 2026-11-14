// Crypto market data for the crypto function, with no key needed: Binance's public market-data host for prices and
// daily candles, CoinGecko's public API for market value, description and company treasuries. CoinGecko is best
// effort (its keyless limit is low): a pick still goes out without it, just with fewer facts.
import { DataError } from "./stockData.ts";
import { candles, type Candle, type CoinInfo, type Ticker, type TreasuryCompany } from "./cryptoRules.ts";

async function getJson<T>(source: string, url: string, headers: Record<string, string> = {}, retry = 0): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new DataError(source, 0, `${source}: no answer (${e instanceof Error ? e.message : "network error"})`); }
  if (res.status === 429 && retry > 0) { await res.body?.cancel(); await new Promise((r) => setTimeout(r, 3500)); return getJson<T>(source, url, headers, retry - 1); }
  if (!res.ok) throw new DataError(source, res.status, `${source}: ${res.status === 429 ? "rate limit reached" : res.status === 451 || res.status === 403 ? "blocked from this region" : `error ${res.status}`}`);
  return (await res.json()) as T;
}

const BINANCE = "https://data-api.binance.vision/api/v3";
export const binance = {
  /** 24-hour figures for every pair, in one call. */
  tickers: () => getJson<Ticker[]>("Binance", `${BINANCE}/ticker/24hr?type=MINI`),
  /** Closed daily candles, oldest first (the day still forming is left out). */
  daily: async (pair: string, limit = 260): Promise<Candle[]> => candles(await getJson<unknown[][]>("Binance", `${BINANCE}/klines?symbol=${pair}&interval=1d&limit=${limit}`)),
  /** The day in progress (UTC): what the price has done since midnight. */
  today: async (pair: string): Promise<Candle | null> => {
    const rows = await getJson<unknown[][]>("Binance", `${BINANCE}/klines?symbol=${pair}&interval=1d&limit=1`);
    const r = rows[0]; return r ? { t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), q: Number(r[7]) } : null;
  },
  /** Days since the pair's first candle: how long the coin has traded on Binance. */
  listedDays: async (pair: string): Promise<number | null> => {
    const rows = await getJson<unknown[][]>("Binance", `${BINANCE}/klines?symbol=${pair}&interval=1d&startTime=0&limit=1`);
    return rows[0] ? Math.floor((Date.now() - Number(rows[0][0])) / 864e5) : null;
  },
};

const GECKO = "https://api.coingecko.com/api/v3";
interface GeckoMarket { id: string; symbol: string; name: string; market_cap: number | null; market_cap_rank: number | null; ath: number | null; ath_change_percentage: number | null; circulating_supply: number | null; max_supply: number | null; image: string | null }
interface GeckoCoin { description?: { en?: string }; categories?: string[]; links?: { homepage?: string[] } }
/** Names and categories that mean "this is not a coin to pick": copies of stocks, funds, dollars, gold or another coin. */
const NOT_A_COIN = /tokeni[sz]ed|bstocks|xstocks|stablecoin|wrapped|bridged|liquid staking token|leveraged/i;
/** The category worth showing on a pick, most telling first. */
const CATEGORY = [/layer 1/i, /layer 2/i, /meme/i, /decentralized finance|defi/i, /exchange/i, /artificial intelligence|\bai\b/i, /gaming/i, /payment/i, /oracle/i, /privacy/i, /real world assets/i, /infrastructure/i, /smart contract platform/i];
export const coingecko = {
  /** Market value, rank, supply and description for a ticker. Several coins can share a ticker: the largest one is meant. */
  info: async (symbol: string): Promise<(CoinInfo & { excluded: string | null }) | null> => {
    const list = await getJson<GeckoMarket[]>("CoinGecko", `${GECKO}/coins/markets?vs_currency=usd&symbols=${symbol.toLowerCase()}&order=market_cap_desc&per_page=10`, {}, 1);
    const m = [...list].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))[0];
    if (!m) return null;
    let coin: GeckoCoin = {};
    try { coin = await getJson<GeckoCoin>("CoinGecko", `${GECKO}/coins/${m.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`, {}, 1); } catch { coin = {}; }
    const cats = coin.categories ?? [];
    const text = (coin.description?.en ?? "").replace(/<[^>]+>/g, "").replace(/\r?\n+/g, " ").trim();
    return {
      id: m.id, name: m.name, rank: m.market_cap_rank, cap: m.market_cap, ath: m.ath, athChange: m.ath_change_percentage, circulating: m.circulating_supply, maxSupply: m.max_supply, image: m.image,
      description: text || null, category: CATEGORY.map((re) => cats.find((c) => re.test(c))).find((c) => c) ?? null, homepage: coin.links?.homepage?.find((h) => h) ?? null,
      excluded: NOT_A_COIN.test(m.name) ? m.name : cats.find((c) => NOT_A_COIN.test(c)) ?? null,
    };
  },
  /** Public companies that hold the coin (Bitcoin and Ether only). */
  treasury: async (id: string) => (await getJson<{ companies?: TreasuryCompany[] }>("CoinGecko", `${GECKO}/companies/public_treasury/${id}`)).companies ?? [],
};
