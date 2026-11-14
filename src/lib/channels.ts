// Pure rules about a member's signals ("channels"): what counts as forex, and where the app lands.
/** Channels that are not a forex symbol. Every other channel is one (usdjpy, gold, and symbols added later). */
const NOT_FOREX = ["wann", "stocks", "crypto"];
export const hasForex = (channels: string[]) => channels.some((c) => !NOT_FOREX.includes(c));
/** Where a member lands: the first thing they actually have. */
export function homeFor(channels: string[]): string {
  if (hasForex(channels)) return "/";
  return channels.includes("wann") ? "/wann" : channels.includes("stocks") ? "/stocks" : channels.includes("crypto") ? "/crypto" : "/settings";
}
/** What the app knows after asking the server. A request that failed never changes the menu: a bad connection must not
 *  take the Signals button away. */
export const afterLoad = (known: string[] | null, data: unknown, failed: boolean): string[] | null => (failed ? known : ((data ?? []) as string[]));
