import { test } from "node:test";
import assert from "node:assert/strict";
import { afterLoad, hasForex, homeFor } from "../src/lib/channels.ts";

test("menu: the app lands on the first thing a member has, and Signals needs a forex signal", () => {
  assert.equal(hasForex(["usdjpy", "gold"]), true);
  assert.equal(hasForex(["eurusd", "crypto"]), true);                  // a symbol added later is forex too
  assert.equal(hasForex(["wann", "stocks", "crypto"]), false);
  assert.equal(homeFor(["usdjpy", "wann", "stocks"]), "/");
  assert.equal(homeFor(["wann", "crypto"]), "/wann");
  assert.equal(homeFor(["stocks", "crypto"]), "/stocks");
  assert.equal(homeFor(["crypto"]), "/crypto");
  assert.equal(homeFor([]), "/settings");                               // nothing switched on: only Settings is left
});

test("menu: a request that failed leaves the member's signals as they were", () => {
  assert.deepEqual(afterLoad(null, ["usdjpy"], false), ["usdjpy"]);
  assert.deepEqual(afterLoad(["usdjpy", "gold"], null, true), ["usdjpy", "gold"]);   // offline for a moment: nothing disappears
  assert.equal(afterLoad(null, null, true), null);                                   // never knew: still loading, not "nothing"
  assert.deepEqual(afterLoad(["usdjpy"], [], false), []);                            // the admin really switched everything off
});
