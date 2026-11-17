# Stage 1 review: Checkout (uncommitted diff, cart.mjs + cart.test.mjs)

Reviewer: JBIT reviewer. Date: 2026-11-17. Verdict: **not ready. None of the four plan checks is met, and there are two security problems.**

How I checked: I ran `git diff` and `npm test` (4 tests: 1 pass, 2 fail, 1 skipped). I also ran a probe script outside the repo (`/tmp/jbit-probe/probe.mjs`) that imports `cart.mjs` and calls each function. Secrets are masked below.

## Fix now

1. **Live payment secret hard-coded and leaked** (`cart.mjs:4` `PAYMENT_KEY = 'sk_live_***'`). It is printed to stdout in `checkout` (`console.log('checkout', ..., PAYMENT_KEY)`) and written to the store in `saveCart` (`JSON.stringify({ cart, key: PAYMENT_KEY })`). Confirmed by reading those lines. The key appears in the working tree, so treat it as compromised: rotate it, load it from env/config, and never log it or store it.
2. **Code injection through the coupon code** (`couponPercent`: `eval('COUPONS.' + code)`). The coupon code is user input. Probe: `couponPercent('HALF;globalThis.PWN=1')` set `globalThis.PWN === 1`, so arbitrary code runs. Prototype keys also get through: `couponPercent('constructor')` returns `undefined`, so `checkout` would give a discount of `NaN`. Fix: use an own-property lookup (`Object.hasOwn(COUPONS, code)`) on a normalised string.
3. **`isExpired` is inverted** (`expires > Date.now()`). Probe on 2026-11-17: the expired `SAVE10` (expires 2026-01-01) returns 10%, and the valid `HALF` (expires 2027-06-30) returns 0. This breaks the check "expired coupon gives no discount" in both directions.
4. **`subtotal` off-by-one** (`i <= cart.items.length`). It throws `Cannot read properties of undefined (reading 'price')` on every cart, so `checkout` always throws. This is why the existing baseline test "subtotal adds price times qty" now fails (a regression), and why "checkout runs" fails.
5. **`applyDiscount` does not clamp or round.** `(999,10)` gives `99.9`, `(1000,150)` gives `1500`, and `(1000,-10)` gives `-100`. Fails the check "clamped to 0..100, integer cents".
6. **`addTax` concatenates strings.** `toFixed` returns a string, so `addTax(1000, 0.1)` gives `"1000100"`. `checkout` then puts the whole taxed total in `tax`, and `total` (`sub - discount + tax`) becomes string concatenation. Fix: `tax = Math.round(sub * rate)`, return only the tax, and keep it numeric.
7. **`formatPrice` divides by 10.** `formatPrice(1234)` gives `"$123.40"`; the check wants `"$12.34"`. Negative cents are not handled either.
8. **`removeItem` with an unknown id deletes the last item.** `findIndex` returns -1 and `splice(-1, 1)` removes the last element. Probe: items `[1,2]` with `removeItem(.., 99)` leaves `[1]`. Fails the check "unknown id leaves cart alone".
9. **`createCart` shares one default array** (`DEFAULT_ITEMS`). Every `createCart()` returns the same `items` array. Probe: adding to one cart makes the item show up in a new `createCart()`, so carts leak between users. `createCart(items)` also aliases the caller's array.
10. **`findItem` assigns instead of comparing** (`i.id = id`). Probe: `findItem(cart, 7)` rewrites the first item's id to 7 and returns it.
11. **Tests do not prove any check.**
    - `applyDiscount returns something` only checks the result is truthy, and passes with `99.9`.
    - The `removeItem` test is `test.skip`.
    - `checkout runs` only checks the result is truthy.
    - There are no tests for `formatPrice`, clamping, rounding, an expired or unknown coupon, an unknown id in `removeItem`, or the integer-ness of the `checkout` fields.
    - The second `import` sits mid-file. It works because imports are hoisted, but it should go with the others.
    - Each plan check needs exact-value assertions, plus a fixed clock for the expiry test.

## Defer

- **`saveCart`** swallows every error (`catch (e) {}`) and does not await `store.put`, so a failed save goes unnoticed. Even with the key removed, it should propagate errors or report them.
- **`parseQty`** uses `parseInt` with no radix and no validation. `'3abc'` gives 3, `'-2'` gives -2, and `'x'` gives NaN. It is not in this stage's checks, but it is user input feeding money and should be validated (positive integer) before it is used.
- **`checkout`** logs the full cart contents to the console. Drop that, apart from the key (already covered in finding 1).

## Reject

- **`addItem` copying the item (`{ ...item }`)**: this is unchanged baseline code and is fine.

## Found sound

- `addItem` is unchanged and correct.
- The `COUPONS` table data itself (codes, percents, dates) is plausible.
- The `checkout` return shape `{ subtotal, discount, tax, total }` matches the plan once the bugs above are fixed.
