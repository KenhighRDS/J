# TJR module: data, broker and hosting routes

Checked on **20 November 2026** against each provider's own pages. Every figure has its source next to it. Anything
that could not be confirmed on an official page is marked **unverified**. Prices change: recheck before paying.
Nothing here has been bought, and no account has been opened.

What the module needs, in the order it needs it:

1. **History** for backtests: 12 months or more of 1-minute bars for NQ and ES (MNQ and MES trade at the same prices).
2. **Fresh bars** during 09:30 to 11:30 New York for signals.
3. **Paper trading**, automatic.
4. **Live orders**, later, and only after the owner switches them on.

## The three options

| | What you get | First-year fixed cost | Per trade (1 MNQ, in and out) |
|---|---|---|---|
| **A. Minimum cost** | Real backtests now, plus an automatic forward paper test that replays each session a few hours after it ends | **$0** | none (simulated) |
| **B. Best value** | Real-time signals, a broker paper account, and the same connection goes live later | **about $19** in data fees, plus a funded Interactive Brokers account (your money, not a fee) and somewhere to run the gateway ($0 on your own PC, about $50 to $70 a year on a small server) | **$1.22** |
| **C. Advanced** | Exchange-direct real-time feed, separate from the broker | **about $2,400 to $2,700** | $1.22 at Interactive Brokers |

**Recommendation.** Start with **A** today: it costs nothing and answers the first question, which is whether the
rules have any edge at all. Move to **B** only if the backtest and the forward test justify it. **C** buys speed and
depth a 5-minute strategy does not use.

### Option A in detail: $0

- **History: Massive, Futures Basic plan.** Minute bars for CME futures are on every plan including the free one; the
  free plan gives 2 years of history, data that is at least 8 hours old, and 5 calls a minute.
  Source: `massive.com/docs/rest/futures/aggregates.md` ("Futures Basic: Included", "8-hour historical", "2 years",
  "Records date back to April 3, 2017"); price and "Non-pros only" on `massive.com/futures`.
  J already holds a Massive key for the stock picks. Whether that account has the futures plan switched on is not yet
  known: the first download will tell.
- **Fallback for history: Databento.** Pay per use, no subscription: one year of 1-minute bars for NQ, MNQ, ES and MES
  is quoted at **$8.32**, five years at $40.38. New accounts get **$125 of credit**, valid 6 months.
  Source: `databento.com/pricing` ("OHLCV-1m $70.00 / GB"; "4 products · OHLCV-1m · 365 days $8.32"; "New users get
  $125 in free credits").
- **Forward paper test:** each trading day, once the data is released, the service downloads the session and runs the
  paper book over it. The signals are recorded hours late, so this is a test, not an alert service. It is still a
  genuine out-of-sample test: the rules are fixed before the bars exist.
- **Hosting:** a scheduled Google Cloud Run job fits in the free tier (first 240,000 vCPU-seconds and 450,000
  GiB-seconds a month; this job needs far less). Source: `cloud.google.com/run/pricing`. Running it on your own PC is
  also $0.

### Option B in detail: Interactive Brokers

| Item | Figure | Source |
|---|---|---|
| Account minimum, inactivity fee, maintenance fee | $0, $0, $0 | `interactivebrokers.com/en/accounts/required-minimums.php`, `.../individual.php` |
| API | Web API "free of cost"; TWS API has a $0 monthly minimum; needs a funded IBKR Pro account | `interactivebrokers.com/docs/web-api/introduction`, `.../docs/tws-api/doc/notes-limitations/requirements` |
| Real-time CME top of book, non-professional | **$1.55 a month** (waived above $20 of commissions) | `interactivebrokers.com/en/pricing/market-data-pricing.php` |
| Equity needed to subscribe to market data | **$500** plus the subscription | same page |
| Paper account | Included, but only once the live account is approved and **funded**; it shares the live account's data | `ibkrguides.com/clientportal/aboutpapertradingaccounts.htm`, IBKR market data sharing page |
| Commission MNQ / MES | $0.25 a contract | `interactivebrokers.com/en/pricing/commissions-futures.php` |
| Exchange fee MNQ / MES, NFA fee | $0.35, $0.01 | `interactivebrokers.com/en/accounts/fees/CME.php` |
| **All in, per side, one MNQ or MES** | **$0.61** (NQ / ES: $2.24, IBKR's own example) | sum of the three lines above |
| Historical bars through the API | Need the data subscription; expired contracts go back 2 years; 60 requests per 10 minutes | `.../docs/tws-api/doc/md/market-data-limitations` |
| Automation | Allowed, must be declared as automated | IBKR automation and software disclosure page |

Things to know before choosing it:

- **Margin.** IBKR's intraday initial margin for one MNQ was about **$4,303** on the day checked (US-resident view;
  it changes, and other countries may differ). A cash account gets no intraday rate. In practice, trading one MNQ live
  there needs roughly $5,000 or more in the account. The $500 figure is only what the data subscription requires.
  Source: `interactivebrokers.com/en/trading/margin-futures-fops.php`.
- **The gateway needs a person now and then.** IB Gateway restarts daily (automatic) but needs a manual login with
  two-factor approval about once a week, and has no headless mode. It must run on a PC or a server with a desktop.
  Source: `.../docs/tws-api/doc/download-tws`, `.../supported-two-factor-authentication-2-fa`.
- **Country.** IBKR accepts clients from most countries, not all: check
  `interactivebrokers.com/en/accounts/open-account-country-list.php` for yours.

First-year fixed cost: 12 × $1.55 = **$18.60** in data. Server, if not your own PC: DigitalOcean $4 a month
(`digitalocean.com/pricing/droplets`), Amazon Lightsail $5, Hetzner €5.49.

### Option C in detail

Databento's live feed is the Standard plan at **$199 a month**, CME fees included for personal use, on condition that
you hold a funded futures broker account and use software that can route orders to it
(`databento.com/pricing`, `databento.com/legal/exchange-data-policy`). Massive's real-time futures plan is also
**$199 a month** (`massive.com/futures`). Add a broker for orders. About $2,400 to $2,700 a year, for no benefit a
5-minute strategy can measure.

## Routes looked at and set aside

| Route | Why not (now) | Source |
|---|---|---|
| **Tradovate / NinjaTrader API** | Needs a live account with $1,000, plus **$25 a month** for API access. Market data through the API additionally needs a CME licence agreement as a sub-vendor (cost **unverified**; user reports say several hundred dollars a month). $35 inactivity fee per 30 days without a live trade on the free plan. All-in $0.94 a side per micro on the free plan. | `support.tradovate.com/s/article/Tradovate-API-Access`, `tradovate.com/pricing`, `info.tradovate.com/pricing/commissions` |
| **ProjectX / TopstepX API** | $29 a month ($14.50 with their code) on top of a paid evaluation ($49 a month and up). It is a prop-firm simulator: "Live funded accounts are not allowed to trade through the ProjectX API", and orders must come from your own device, not a server. | `help.topstep.com/en/articles/11187768-topstepx-api-access`, `gateway.docs.projectx.com` |
| **Ironbeam API** | Free only if you trade 5 contracts a month, otherwise from $249 a month; real-time simulation is a $99 a month add-on. | `ironbeam.com/knowledge-base/ironbeam-api-access/` |
| **tastytrade API** | Possible later. No API fee stated; funded account needed for quotes; the sandbox has only shown stock fills; $0.75 a side per micro plus fees. Pricing details **unverified**. | `developer.tastytrade.com`, `tastytrade.com/pricing` |
| **TradeStation API** | Possible later: one API for history, simulation and live. Fees **unverified** (their pricing page refused automated reading). | `api.tradestation.com/docs` |
| **Webull, Architect** | Futures through an API exist; data terms for automated use are unclear or the documents are old. **Unverified.** | `developer.webull.com`, `docs.architect.co` |
| **Alpaca, Schwab** | No futures through the API (Alpaca: "on roadmap"; Schwab **unverified**). | `docs.alpaca.markets` |
| **GitHub Actions as the host** | Free only on a public repository; about $10.68 a month on a private one for this workload, and its terms exclude running a service unrelated to building the project. | `docs.github.com/en/billing/concepts/product-billing/github-actions` |

## Licensing notes

- **Non-professional.** All the low prices above are for a private person trading their own money. CME's own
  definition and fee list (top of book $1.55 per exchange a month from June 2026) could only be read through search
  extracts, because cmegroup.com refused automated requests: **unverified**, though IBKR's price page shows the same
  $1.55.
- **Showing the data to others.** Massive's individual plans are for non-professionals; Databento's personal use
  "cannot be shared". The TJR module is therefore **admin-only** in J: its candles are shown to the owner, not to
  members. Sending a *signal* to members (direction, entry, stop, target) is a different matter from showing them the
  price feed, and is not built here.
- **Contract specifications** used by the engine (NQ $20 and MNQ $2 a point, ES $50 and MES $5 a point, tick 0.25;
  Globex Sunday to Friday 18:00 to 17:00 New York with a daily break 17:00 to 18:00; quarterly contracts; roll on the
  Monday before the third Friday). These match IBKR's fee pages and are standard, but the CME product pages themselves
  could not be opened by an automated reader: confirm them once at
  `cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.contractSpecs.html` and the three sister pages.

## What needs the owner's approval

1. Reading futures data with the Massive key (free plan, no purchase).
2. Any paid step: a Databento top-up beyond the free credit, an IBKR account and its $1.55 a month, a server.
3. Switching live orders on. They are off and locked.
