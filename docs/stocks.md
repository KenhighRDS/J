# Stock picks and the portfolio

J scans the US market after each close, sends the best stocks to every active member with no manual step, tracks
each pick until it closes, and keeps a money portfolio per member (stocks, J trades and Wann calls they took).

## What a pick is

| | Meaning |
|---|---|
| **Fresh event** (`catalyst`) | An established company beat earnings estimates and the market rewarded it the same day. |
| **New listing** (`ipo`) | Listed 25 to 365 days ago, holding above its offer price and pushing to a new high. |
| **Swing trade** | Days to weeks. Carries a buy-up-to price, a stop and a target; closes at one of them or after 30 days. |
| **Long-term hold** | Months. No stop or target; tracked by percent since the pick; closes after a year or by an admin. |

A pick page shows: the plan, why J picked it, what the company does, key facts, which big investors hold it and for
how much, what could go wrong, and the member's own position.

## Rules (all in `supabase/functions/_shared/stockRules.ts`, tested in `tests/stocks.test.ts`)

**Candidates**
- Earnings: reports whose first market reaction is today (before or during today's session, or after yesterday's
  close), EPS at least 5% above the estimate, sales not below the estimate by more than 1%.
- Listings: priced IPOs on NYSE or Nasdaq that raised at least $75M, not blank-cheque shells, 25 to 365 days old,
  outside the insider lock-up expiry window (days 160 to 195).
- Never a stock with an open pick, nor one picked in the last 60 days (earnings) or 90 days (listing).

**Filters** (a failed filter is shown as the reason on the admin page)
- Price at least $5, listed on NYSE or Nasdaq, traded today.
- Earnings: company value at least $500M, at least $10M traded a day, up 2% to 30% on the day, closed in the upper
  60% of the day's range; with price history, above its 50-day average.
- Listings: company value at least $300M, at least $5M traded a day, at least 5% above the offer price, within 8% of
  its high since listing, up on the day.

**Score, 0 to 100.** Earnings: size of the beat, sales beat, the day's reaction, closeness to the 52-week high and
recent trend, sales growth, profit, size. Listings: premium over the offer, closeness to the high, the day's move,
size of the offering, age, growth, size. A pick needs the minimum score (default 70; 10 higher while the S&P 500 is
below its 200-day average). At most 2 picks a day, 12 swing and 8 long-term picks open at once.

**Long-term or swing.** Long-term needs all of: company value of $2B or more, sales growing 15% or more, profitable,
within 20% of its high, most covering analysts rating it a buy, and for a listing at least 90 days of trading.
Everything else is a swing.

**Swing plan.** Buy up to 3% above the pick price. Stop two average daily ranges (ATR 14) below, or just under the
day's low without price history; always 5% to 12% away. Target at twice the risk.

**Why these rules.** Prices keep drifting in the direction of an earnings surprise for weeks (post-earnings
announcement drift), more so with a sales beat and a strong close; stocks near their 52-week high keep outperforming;
new listings that hold above the offer and break out of their first base are the classic IPO setup, while the
lock-up expiry is a known drag. None of this is a guarantee: the rules pick setups with an edge on average.

## Tracking

Every 15 minutes of the US session each open pick is re-priced. A swing pick closes at its stop or target (at the
open if the price gapped through; the stop wins if both were touched the same day) or when its time runs out. Members
holding it get a notification; admins always do.

## Big investors

Seventeen well-known investors (Buffett, Ackman, Dalio's Bridgewater, Wood, Druckenmiller, Tepper, Soros, Icahn, Loeb,
Klarman, Einhorn, Coleman, Laffont, the Gates Foundation Trust, Terry Smith, Li Lu, Howard Marks) are followed through
their quarterly 13F filings at the SEC. Each filing is read once, positions are added up per security, and CUSIPs are
matched to tickers through OpenFIGI. A pick lists who holds it, for how much, and what share of their portfolio.
Filings come out up to 45 days after the quarter ends, and the page says so.

## Portfolio

- **Stocks:** "I bought it" asks how much went in and the price paid. Value follows the latest price; "I sold it"
  fixes the result.
- **J trades:** money comes from the member's own figure, else their linked MT5 account, else their lot times the pips.
- **Wann calls:** after "I took it" the app asks what was paid and what it pays if it wins. Lost = minus the stake,
  won = payout minus stake.

## Data sources

| Source | Key | Used for |
|---|---|---|
| Finnhub | free key, required | prices, earnings and IPO calendars, company numbers, analyst ratings |
| Massive (formerly Polygon) | free key, optional | what the company does, price history (ATR stop, 50-day and 200-day averages) |
| SEC EDGAR | none, contact email required | 13F filings |
| OpenFIGI | none | CUSIP to ticker |

Limits respected: Finnhub 60 calls a minute (a scan checks 14 stocks a minute), Massive 5 a minute (2 finalists a
minute), SEC 10 a second, OpenFIGI 25 requests a minute.

**Licence note.** The free plans of Finnhub and Massive are for personal use. Showing their numbers to paying members
may need a paid plan from each; that is the owner's decision.

## Setup (owner)

1. Admin → Stocks: paste the Finnhub key (finnhub.io, "Get free API key"). Optional: the Massive key (massive.com).
2. Enter a contact email for SEC filings.
3. Tap **Check keys**. Every source should say Working.
4. Tap **Preview the scan** to see what would be picked on the last trading day (nothing is sent), and **Send a test
   pick** to get one on admin phones only.
5. Leave **Send picks automatically** on. The first real scan runs after the next US close (4:20 pm New York).
