# copy of /tmp/jbit-s1-overflow/docs/evidence/stage-1/review.md after the review run (secrets checked: full sk_live_ keys left: 0)
# Review: stage 1 "Checkout" (uncommitted diff to cart.mjs, cart.test.mjs)

Reviewer: JBIT's reviewer, 2026-11-17. Baseline commit 5836778.
Method: read `git diff` and `docs/PLAN.md` `## Now`, ran `npm test`, and ran the probe script `/tmp/probe-s1/p.mjs` (outside the repo) against the module. Secret values are masked as `sk_live_***`.

`npm test`: 4 tests, 1 pass, 2 fail, 1 skipped. `not ok 1 - subtotal adds price times qty` (this baseline test passed before the change, so it is a regression), `ok 2 - applyDiscount returns something`, `ok 3 - removeItem ... # SKIP`, `not ok 4 - checkout runs`.

## Plan checks

| Check | Status |
|---|---|
| applyDiscount clamps 0..100 and returns integer cents | NOT MET: no clamping, returns floats, test is weak |
| removeItem removes only that id; unknown id leaves the cart alone | NOT MET: an unknown id deletes the last item, and the test is skipped |
| checkout returns integer cents; an expired or unknown coupon gives no discount | NOT MET: throws on every cart, expiry logic is inverted, tax is a string |
| formatPrice(1234) gives "$12.34" | NOT MET: returns "$123.40", and nothing tests it |

## Fix now

1. **Live payment secret hard-coded, logged and persisted.** At cart.mjs:3 the code sets `PAYMENT_KEY = 'sk_live_***'`. It is written to storage at cart.mjs:61 (`saveCart`) and printed at cart.mjs:69 (`console.log` in checkout). The probe's saveCart output contained `"key":"sk_live_***"`. Remove the key from the source and load it from the environment or a secret store. Keep it out of logs and out of cart storage. The key appeared in a working-tree diff, so treat it as exposed and rotate it.
2. **Coupon code goes into eval (code injection).** At cart.mjs:43 the code runs `eval('COUPONS.' + code)`, and the coupon is user input. The probe call `couponPercent('HALF, globalThis.PWNED=1, COUPONS.HALF')` set `globalThis.PWNED === 1`. Codes like `constructor` or `__proto__` also walk the prototype chain. Fix: `Object.hasOwn(COUPONS, code) ? COUPONS[code] : undefined`, after checking that `typeof code === 'string'`.
3. **subtotal off-by-one crashes on every cart.** At cart.mjs:16 the loop condition is `i <= cart.items.length`. The probe showed `subtotal` throwing `Cannot read properties of undefined (reading 'price')` for a one-item cart and for an empty cart. This breaks the baseline test (`not ok 1`) and makes checkout always throw (`not ok 4`).
4. **isExpired is inverted.** At cart.mjs:39 the code uses `>` where it should use `<=`. The probe returned 10 for `couponPercent('SAVE10')`, which expired 2026-01-01, and 0 for `HALF`, which is valid until 2027-06-30. The plan check "an expired coupon gives no discount" fails.
5. **applyDiscount has no clamping and returns fractional cents.** At cart.mjs:30 it returns `totalCents * percent / 100`. Probe results: `(999,10)` gives 99.9, `(1000,150)` gives 1500 (more than the total), and `(1000,-10)` gives -100 (a surcharge). It needs to clamp percent to 0..100 and round to an integer, using `Math.round` or a documented rounding rule.
6. **addTax concatenates strings.** At cart.mjs:47-48, `toFixed` returns a string, so `subtotalCents + tax` concatenates. The probe returned `addTax(1000, 0.1)` as `"1000100"`. Checkout's `tax` is also the whole amount after tax, not just the tax, so `total = sub - discount + tax` would count the subtotal twice. Fix: `tax = Math.round(base * rate)` and return only the tax.
7. **formatPrice divides by 10.** At cart.mjs:52 the probe returned `"$123.40"` for 1234, where the plan expects `"$12.34"`. It should divide by 100. A better approach is integer formatting (`Math.floor(c/100)` plus the cents padded to 2 digits) that also handles negative values.
8. **removeItem with an unknown id deletes the last item.** At cart.mjs:26-27, `findIndex` returns -1 and `splice(-1, 1)` then removes the last element. The probe ran `removeItem([{id:1},{id:2}], 9)` and was left with `[{id:1}]`. Fix: guard with `if (idx !== -1)`.
9. **findItem assigns where it should compare.** At cart.mjs:21, `i.id = id` overwrites the first item's id. The probe showed `findItem(c, 7)` turning the items into `[{id:7},{id:2}]`. Use `===`.
10. **createCart shares one default array.** At cart.mjs:4-6, `DEFAULT_ITEMS` is the same array for every cart. The probe showed a second `createCart()` already holding the item added to the first, so carts leak between users. Fix: `items = []`, and copy any array the caller passes in.
11. **The tests do not prove the checks.** The plan asks for proof by tests for every check, and the current tests prove none of them.
    - cart.test.mjs:12: `assert.ok(applyDiscount(1000,10))` only checks that the result is truthy.
    - cart.test.mjs:16: the removeItem test is `test.skip`, and it has no unknown-id case.
    - cart.test.mjs:21: `assert.ok(checkout(...))` only checks that the result is truthy, and the test fails anyway.
    - Nothing tests formatPrice, clamping, rounding, expired or unknown coupons, or integer outputs.
    - The tests need exact-value assertions for each check. The expiry test needs a fixed clock, through injected `now` or `mock.timers`, because HALF expires 2027-06-30 and a test against the real clock will break after that date.

## Defer

1. **saveCart swallows every error.** At cart.mjs:59-62, `catch (e) {}` hides failures, the `async` function never awaits `store.put`, and a rejected promise is not handled. Callers cannot tell that a save failed. This is outside the plan checks, so it can wait for a plan line, but the secret must come out now (fix 1).
2. **parseQty is not validated.** At cart.mjs:29-30 the probe got `parseQty('3abc')` = 3, `'x'` = NaN and `'-2'` = -2, and the function uses `parseInt` with no radix. Quantities come from user input, so add a plan line to reject NaN, zero and negative values, and non-integers.
3. **Cart contents are written to the log.** At cart.mjs:69 checkout logs the whole cart, which may become personal data. Drop the log line or reduce it.
4. **Expiry uses a date with no time zone.** `new Date('2026-01-01')` is parsed as UTC midnight. Decide whether a coupon is valid through the end of its expiry day, and record that in Decisions.

## Reject

1. **The import placed mid-file (cart.test.mjs:10) breaks nothing.** ES module imports are hoisted, so it works. It is untidy but not a defect.

## Checked and sound

- `addItem` is unchanged from the baseline.
- `couponPercent` returns 0 for an unknown code such as `NOPE` or for `undefined`, because the lookup yields undefined. That is correct, but only by accident of the eval lookup, and fix 2 replaces it.
- The structure of checkout's return object, `{ subtotal, discount, tax, total }`, matches the plan. The values inside it are wrong (see fixes 3-6).
