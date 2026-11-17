# Stage 1 review · Checkout (uncommitted diff, cart.mjs + cart.test.mjs)

Reviewed 2026-11-17 against docs/PLAN.md stage 1. Verdict: **not acceptable**. None of the four checks are met, `npm test` fails (2 fail, 1 pass, 1 skip), and there are two security problems (a live-looking secret committed and logged, and `eval` on coupon input).

How confirmed: `npm test`, plus a probe script (outside the repo) calling each export directly. Results quoted below.

## Fix now

1. **Hardcoded live payment secret** · cart.mjs:2 `PAYMENT_KEY = 'sk_live_****'`. A `sk_live_` key in source, about to be committed. It is also written to stdout on every checkout (cart.mjs:69 `console.log('checkout', JSON.stringify(cart), PAYMENT_KEY)`), which also logs the whole cart, and it is persisted next to the cart in `saveCart` (cart.mjs:61). Remove it, load it from the environment if it is needed at all (nothing in this module needs it), drop the log line, and **rotate the key**: treat it as leaked because it has been in the working tree.
2. **Code injection via coupon code** · cart.mjs:45 `eval('COUPONS.' + code)`. The coupon is user input. Probe: `couponPercent('x||(globalThis.pwned=1)')` set `globalThis.pwned` to 1. Replace with `Object.hasOwn(COUPONS, code) ? COUPONS[code] : undefined` after a type/format check on `code`. Also guard against `__proto__`/`constructor` lookups.
3. **Expiry check inverted** · cart.mjs:41 uses `>`, so a coupon counts as "expired" when its date is in the future. Probe: `SAVE10` (expired 2026-01-01) gives 10; `HALF` (valid to 2027-06-30) gives 0. This breaks check 3 ("an expired coupon gives no discount").
4. **subtotal off-by-one** · cart.mjs:16 `i <= cart.items.length` reads past the end and throws `Cannot read properties of undefined (reading 'price')` for every cart. This breaks the baseline test that was passing before the diff, and every checkout. The original `reduce` was correct; revert it.
5. **applyDiscount: no clamp, non-integer cents** · cart.mjs:35. Probes: `(333,10)` gives 33.3; `(1000,150)` gives 1500 (more than the total); `(1000,-10)` gives -100 (a negative discount means a surcharge). Check 1 asks for a 0..100 clamp and integer cents. Clamp `percent`, use `Math.round`, and pick one rounding rule and document it. Also note the name versus the check: the check says it "takes percent off" (which reads as returning the reduced total), but checkout uses the result as the discount amount. Settle which one it is and test it.
6. **addTax string concatenation** · cart.mjs:51 `toFixed(0)` returns a string, so `subtotalCents + tax` concatenates. Probe: `addTax(1000, 0.1)` gives `"1000100"`. It also returns subtotal+tax, but checkout treats it as tax alone and then adds it to the total again (cart.mjs:70), so the total would double-count. Return `Math.round(subtotalCents * rate)` as tax only. Validate `taxRate` (a negative, NaN or missing rate gives a NaN or negative total).
7. **formatPrice divides by 10** · cart.mjs:56. Probe: `formatPrice(1234)` gives `"$123.40"`, but the check expects `"$12.34"`. Use `/ 100`, or better, integer math (`Math.trunc(c/100)` and `String(c%100).padStart(2,'0')`) with negative handling.
8. **removeItem with an unknown id deletes the last item** · cart.mjs:26. `findIndex` returns -1 and `splice(-1,1)` removes the last element. Probe: removing id 9 from `[{id:1},{id:2}]` leaves `[{id:1}]`. This breaks check 2 directly. Guard with `if (idx !== -1)`.
9. **findItem assigns instead of comparing** · cart.mjs:21 `i.id = id` overwrites the first item's id. Probe: `findItem(cart, 5)` turned items into `[{id:5},{id:2}]`. Use `===`.
10. **Shared mutable default cart** · cart.mjs:3,5. `createCart()` with no argument returns the same `DEFAULT_ITEMS` array every time, so items added to one cart show up in every new cart (probe confirmed). Use `items = []` and copy any array passed in (`[...items]`).
11. **Tests do not prove the checks** · cart.test.mjs. `applyDiscount returns something` uses `assert.ok`, which would pass for 1500, 33.3 or -100. The removeItem test is `test.skip`, and the unknown-id case is not tested at all. `checkout runs` uses `assert.ok`, with no field values, no integer-cents assertion, and no expired or unknown coupon case. There is no formatPrice test. Each check needs exact-value tests, including: clamp at <0 and >100, odd-cent rounding, unknown-id removal, expired/unknown/missing coupon, integer `Number.isInteger` on all four checkout fields, and `formatPrice(1234) === "$12.34"` plus a few edge values (0, 5, 100). Expiry tests should inject or fake the clock (`Date.now`), because otherwise they depend on today's date (HALF expires 2027-06-30).
12. **saveCart swallows every error** · cart.mjs:60-62. It is `async`, but it doesn't await `store.put`, and the `catch {}` is empty, so a failed save is silent (and a rejected promise from an async store escapes the try entirely). Await the call and let it throw, or return or log the error. It also persists the secret (see 1).

## Defer

1. **parseQty accepts bad quantities** · cart.mjs:31 `parseInt(text)` with no radix. Probes: `'1.5'` gives 1, `'-3'` gives -3, `'abc'` gives NaN. Nothing calls it yet and it is outside the stage checks, but it is user input feeding money math. Add a plan line: parse with radix 10, require a positive integer within a sane upper bound, and reject anything else.
2. **No overflow or input validation on item prices and quantities** · addItem/subtotal accept non-integer, negative or huge `price`/`qty`. `price*qty` can exceed `Number.MAX_SAFE_INTEGER` and lose cents silently. Add a plan line to validate items as non-negative safe integers on `addItem`.

## Reject

1. **Unused `findItem`/`parseQty` exports count as scope creep.** Rejected as a finding in itself. They are small, and their bugs are listed above.

## Checked and sound

- `addItem` (unchanged) copies the item on push.
- The return shape of `checkout`, `{ subtotal, discount, tax, total }`, matches check 3 (the values inside it are wrong; see above).
- The coupon table holds an expired coupon and a valid one, which is good test material once the expiry clock is injectable.
