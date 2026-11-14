# Crypto picks

The twin of the stock picks (`docs/stocks.md`) for coins: J scans the most traded coins once a day, sends the best
to every active member with no manual step, tracks each pick around the clock until it closes, and counts what a
member bought in their portfolio. It has its own tab in the app and its own page under Admin → Crypto.

## What a pick is

| | Meaning |
|---|---|
| **Fresh breakout** (`catalyst`) | An established coin closes at its highest daily close in weeks, on clearly more volume than usual. |
| **New listing** (`ipo`) | A coin listed on Binance 2 weeks to 6 months ago that holds above its first day's close and is back near its high. |
| **Swing trade** | Days to weeks. Buy-up-to price, stop and target; closes at one of them or after 21 days. |
| **Long-term hold** | Months. No stop or target; closes after a year or by an admin. |

The pick page is the stock one with crypto wording: the plan, why J picked it, what it is, key facts, the public
companies that hold it (Bitcoin and Ether only), what could go wrong, and the member's position.

## Rules (`supabase/functions/_shared/cryptoRules.ts`, tested in `tests/crypto.test.ts`)

**Universe.** The 90 most traded coins against USDT on Binance with at least $8M traded in 24 hours. Stablecoins,
gold tokens, wrapped copies and leveraged tokens are left out by name; tokenised stocks and funds are recognised from
CoinGecko's name and categories when a coin reaches the final step, and a coin that cannot be identified is never sent.

**Fresh breakout filters.** At least 90 days of history; the latest daily close is the highest in 20 days or more; up
3% to 35% on the day; closed in the upper half of the day's range; volume at least 1.3 times its 20-day average and
$15M; above its 50-day average.

**New listing filters.** Listed 14 to 180 days ago; at least 5% above its first day's close; within 12% of its highest
close; up on the day (not more than 35%); at least $10M traded.

**Score, 0 to 100.** Breakouts: how long the high goes back, volume surge, the day's strength, trend (50-day and
200-day averages), strength against Bitcoin over 30 days, liquidity, room above the 20-day average. Listings: premium
over the first day, closeness to the high, the day's move, volume, age, strength against Bitcoin. A pick needs the
minimum score (default 70; 10 higher while Bitcoin is below its 200-day average). At most 2 picks a day, 10 swing and
6 long-term picks open at once, and no coin twice within 30 days.

**Long-term or swing.** Long-term needs all of: listed for about three years or more, $150M or more traded a day, a
high going back 90 days or more, and a price above the 200-day average. Everything else is a swing.

**Swing plan.** Buy up to 4% above the pick price. Stop 2.5 average daily ranges (ATR 14) below, always 8% to 20%
away. Target at twice the risk.

**Why these rules.** Trend following is the best-documented edge in crypto: coins that close at new highs on rising
volume tend to keep going, far more so while Bitcoin itself is in an uptrend, which is why a weak Bitcoin raises the
bar. Most new listings sink below their first day within weeks; the rule keeps only the few that do not. Replayed on
10 July 2025 the rules pick Bitcoin at $116,010 and Ether at $2,951 as long-term holds and XRP at $2.55 as a swing; on
14 November 2026, with Bitcoin 16% down on the month, they pick nothing. None of this is a guarantee.

## Tracking

Crypto trades every day, all day. The scan runs once the UTC daily candle has closed (from 00:10 UTC). Every 15
minutes each open pick is re-priced from the day's candle and closed at its stop or target (at the day's open if the
price gapped through; the stop wins if both were touched) or when its time runs out. Members holding it are told.

## Data sources (no key needed)

| Source | Used for |
|---|---|
| Binance public market data (`data-api.binance.vision`) | prices, daily candles, volume, how long a coin has been listed |
| CoinGecko public API | market value and rank, supply, description, category, companies holding Bitcoin or Ether |

CoinGecko's keyless limit is low, so it is best effort: a call is retried once, a finalist waits for the next run when
the source is busy, and after five failed tries the coin is passed over rather than sent unidentified.

## Storage

Crypto shares the stock tables, told apart by `asset = 'crypto'` on `stock_picks` and `stock_scans`. Settings:
`crypto_enabled`, `crypto_max_per_day`, `crypto_min_score`. Function: `supabase/functions/crypto`. Cron: `j-crypto`.

## Setup (owner)

Nothing to paste. Admin → Crypto: **Check the sources**, **Preview the scan** (sends nothing) and **Send a test pick**
(admins only, any coin). Leave **Send picks automatically** on.
