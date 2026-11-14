# Who gets which signal

Every stream of signals is a **channel**, and an admin switches each channel on or off for each member in
Admin → Users (open a member, "Signals this member gets").

| Channel | What it carries | New members |
|---|---|---|
| USDJPY | forex signals on USDJPY (the JARVIS EA) | on |
| Gold | forex signals on XAUUSD (the Retrace EA) | on |
| Wann | game calls from Wann | off |
| Stocks | stock picks | off |
| Crypto | crypto picks | off |

- A member with no explicit choice gets the channel's default. Admins get every channel unless one is switched off
  for them.
- **Future signals.** A forex signal on a symbol J has not seen before creates its own channel automatically (named
  after the symbol, off by default), so it reaches no member until an admin switches it on. Another kind of signal is
  a new row in `signal_channels`.
- **What a switch does.** Off means: no notification, no receipt, nothing in the lists, and for Stocks and Crypto no
  tab and no access to the picks. Turning Wann on sends the member the calls that are live at that moment.
- Test signals ignore channels: they go to admins (and named test targets) only.

Storage: `signal_channels` (the channels and their defaults), `user_channels` (the explicit choices),
`has_channel(user, channel)` (the one rule everything asks). Enforced in `signal_create_receipts` (forex),
`wann_create_receipts` (Wann), the `stock_picks` read policy and `stock_take` (stocks, crypto), and the pick
notifications (`channel_users`).
