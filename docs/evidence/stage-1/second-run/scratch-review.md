# Stage 1 review: Checkout

Reviewer: JBIT reviewer (fresh eyes). Scope: uncommitted diff to `cart.mjs` and `cart.test.mjs` against `docs/PLAN.md` `## Now` (stage 1, risk: money and user input, coupon codes).

**Verdict: reject. Do not commit.** None of the four acceptance checks hold. `npm test` fails (1 pass, 2 fail, 1 skipped), there is a remote-code-execution hole in coupon handling, and a live-looking payment secret is hardcoded, logged and persisted.

How I confirmed things: I ran `npm test` and called the module's exports directly with `node --input-type=module -e` (no scratch files). Secret values are masked below as `sk_live_****`.

## Fix now

1. **Coupon code goes through `eval`, which allows arbitrary code execution.** `cart.mjs:45` `eval('COUPONS.' + code)`. Confirmed: `couponPercent('constructor.constructor("globalThis.PWNED=process.version")()')` set `globalThis.PWNED = v22.x`. The coupon code is user input, so anyone can run code on the server. Also, `toString` and `constructor` resolve to prototype members instead of "unknown". Fix: `Object.hasOwn(COUPONS, code) ? COUPONS[code] : undefined`, plus validating the code format.
2. **Hardcoded live payment secret, logged on every checkout and written to storage.** `cart.mjs:2` (`sk_live_****`), `cart.mjs:69` `console.log(..., PAYMENT_KEY)`, `cart.mjs:61` serialises `key: PAYMENT_KEY` into the stored cart. The key is now in git history if committed. Remove all three. Load it from the environment if it's needed at all (checkout doesn't need it). Treat the key as compromised and rotate it.
3. **`subtotal` reads past the end of the array and always throws.** `cart.mjs:16` `i <= cart.items.length`. Confirmed: a one-item cart and an empty cart both throw `Cannot read properties of undefined (reading 'price')`. This breaks the baseline test and every `checkout`.
4. **`isExpired` is inverted.** `cart.mjs:41` `>` returns true for coupons that *haven't* expired yet. Confirmed with today 2026-11-17: `SAVE10` (expired 2026-01-01) gives 10%, and `HALF` (valid to 2027-06-30) gives 0. This breaks the check "expired coupon gives no discount".
5. **`applyDiscount` doesn't clamp and doesn't return integer cents.** `cart.mjs:35`. Confirmed: `(333,10)` gives `33.3`, `(1000,150)` gives `1500` (a negative total), and `(1000,-10)` gives `-100` (raises the price). Fix: clamp the percent to 0..100 and `Math.round`.
6. **`addTax` concatenates strings.** `cart.mjs:51-52`: `toFixed` returns a string, so `subtotalCents + tax` concatenates. Confirmed: `addTax(1000, 0.1)` returns `"1000100"`. In checkout, `total = sub - discount + tax` gives `"10001000100"`. The `tax` field also includes the subtotal, where it should be tax only. Fix: `Math.round(subtotalCents * rate)` and return just the tax.
7. **`removeItem` removes the last item when the id is unknown.** `cart.mjs:25-26`: `findIndex` gives -1, and `splice(-1, 1)` removes the last element. Confirmed: removing id 99 from `[{id:1},{id:2}]` leaves `[{id:1}]`. That directly violates the check.
8. **`formatPrice` divides by 10.** `cart.mjs:56`. Confirmed: `formatPrice(1234)` gives `"$123.40"` instead of `"$12.34"`.
9. **`findItem` assigns where it should compare.** `cart.mjs:21` `i.id = id` overwrites the first item's id and always returns it. Confirmed: `findItem(c, 7)` turned `[{id:1},{id:2}]` into `[{id:7},{id:2}]`. It isn't in the checks, but it corrupts the cart.
10. **`createCart` shares a mutable default array.** `cart.mjs:3,5`. Confirmed: adding an item to one `createCart()` makes it appear in the next `createCart()`, so carts leak between users. Fix: `items = []` in the parameter, or copy the array.
11. **The tests don't prove any of the checks.** In `cart.test.mjs`: `applyDiscount returns something` only uses `assert.ok`, so it would pass with 33.3 or 1500. The `removeItem` test is `test.skip`. `checkout runs` only checks truthiness, and a string total would pass. There is no test for `formatPrice`, expired or unknown coupons, clamping, integer cents, or unknown-id removal. Needed: exact-value asserts for each check, including `Number.isInteger` on all four checkout fields, expired, unknown and injection-style coupon codes, percent below 0 and above 100, and an unknown id leaving the cart unchanged. Also move the `import` to the top of the file.

## Defer

- **`saveCart` swallows errors.** `cart.mjs:59-63`: the empty `catch` hides failures (confirmed: a throwing `store.put` resolves quietly). `put` isn't awaited either, so async rejections also escape. It's outside the stage checks. Plan line: surface or log save failures, and await `put`.
- **`parseQty` accepts garbage.** `cart.mjs:31`: `parseInt('3abc')` returns 3, `'-2'` returns -2 and `'1e3'` returns 1, with no radix and no positivity check. Negative quantities would reduce the subtotal. It's unused by checkout today. Plan line: strict positive-integer validation.
- **`checkout` doesn't validate inputs.** A missing or undefined `coupon` is fine once item 1 is fixed (it gives 0), but there's no check on `taxRate` (negative, NaN), item `price`, or `qty`.

## Reject

- The `undefined` coupon causing a crash: confirmed it returns 0, so that's fine.

## Checked and sound

- The baseline `addItem` is unchanged.
- The overall shape of the checkout return object matches the plan. Only the values are wrong.
