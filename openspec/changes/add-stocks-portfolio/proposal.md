# Add stock picks and a money portfolio

## Why
Members get forex signals and Wann calls from J. Wolf wants a third stream: fresh, well-chosen stocks sent
automatically, with enough information to decide, plus one place where each member sees what everything they took
has made in money.

## What changes
- A daily scan finds stock picks (new listings and fresh earnings beats; swing trades and long-term holds, each
  labelled) and sends them to every active member with no review step. Decisions taken with Wolf on 2026-11-13:
  both kinds, fully automatic, both horizons, free data keys.
- Each pick carries a description of the company, key facts, the reasons, the risks, and which big investors hold it.
- A Portfolio tab: stocks bought (amount put in), J trades taken (lot), Wann calls taken (stake and payout).
- An admin Stocks page: data keys, on/off switch, preview scan, test pick, why each stock was picked or passed over.
- The EA bridge gets a test button that works with the market closed (separate commit).

The authoritative description is `docs/stocks.md`.

## Scope
In: everything in docs/stocks.md. Out: placing orders, broker links for stocks, markets outside the US, paid data.

## Acceptance
- Rules, portfolio math and database functions are covered by `npm test` and `npm run test:db`.
- With a Finnhub key saved, Check keys reports every source, Preview the scan lists candidates with a reason each,
  and Send a test pick reaches admin phones.
