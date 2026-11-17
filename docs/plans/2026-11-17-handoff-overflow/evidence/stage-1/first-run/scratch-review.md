# Stage 1 (Checkout) review

Scope: uncommitted diff of `cart.mjs` and `cart.test.mjs` against 5836778, checked against the four checks in `docs/PLAN.md`.
How I checked: I ran `npm test` and two probe scripts outside the repo (`/tmp/rv/p.mjs`, `/tmp/rv/q.mjs`) that import `cart.mjs`.

Verdict: **not ready.** None of the four checks is met. `npm test` fails (2 fail, 1 skipped, 1 pass). There is a live secret in source, a remote code execution hole through the coupon code, and every money function is wrong.

## Fix now (most severe first)

1. **Live payment secret hard-coded and leaked.** Locations: `cart.mjs:2`, `:61`, `:69`. `sk_live_...` sits in source. `checkout` logs it to the console on every call (line 69). `saveCart` writes it into the store next to the cart (line 61). The key was not in the baseline (`git show 5836778:cart.mjs` has no match), so it was added in this diff.
   Fix: remove the key from code, load it from env/secret config only where payment needs it, and never log or persist it. Treat this key as compromised and rotate it, because it has now been on disk and in the working tree.

2. **Coupon code is passed to `eval`, so untrusted input runs as code.** Location: `cart.mjs:45`. Confirmed:
   - `couponPercent('SAVE10,globalThis.pwned=1,COUPONS.SAVE10')` set `globalThis.pwned = 1`.
   - `'X||{percent:100,expires:"2000-01-01"}'` returns 100, so a user can make any order free.
   - The same payload with `percent:-500` returns -500, which inflates the total.
   - `'constructor'` resolves to `Object`, gives `percent` undefined, and makes the discount NaN.

   Fix: `Object.hasOwn(COUPONS, code) ? COUPONS[code] : null`, after checking `typeof code === 'string'`. Better still, use a `Map`. Also clamp the percent.

3. **`isExpired` is inverted.** Location: `cart.mjs:41`. It returns true when `expires` is in the future. Probe: `couponPercent('SAVE10')` (expired 2026-01-01) returns 10, and `couponPercent('HALF')` (valid until 2027-06-30) returns 0. An invalid date gives NaN, which counts as "not expired".
   Fix: `!(t > Date.now())` with `t = Date.parse(...)`. Decide whether a coupon is valid through the end of its expiry day, and test both boundaries with an injected clock.

4. **`subtotal` reads past the end of the array.** Location: `cart.mjs:16`. The loop uses `<=`, so `cart.items[length]` is undefined and the function throws `Cannot read properties of undefined (reading 'price')` for every cart. This breaks the baseline test (`not ok 1`) and `checkout` (`not ok 4`).
   Fix: use `<`, or restore the `reduce`.

5. **`addTax` returns a string and adds the subtotal twice.** Locations: `cart.mjs:51-52`, `:68`, `:70`. `toFixed` returns a string, so `addTax(1000, 0.1)` gives `"1000100"`. `checkout` then treats that value as the tax and computes `sub - discount + tax`, which is string concatenation and counts the subtotal twice anyway.
   Fix: `tax = Math.round(base * rate)` returning the tax only, and `total = sub - discount + tax`. Validate that `taxRate` is a finite number ≥ 0.

6. **`applyDiscount` does not clamp and does not return integers.** Location: `cart.mjs:34-36`. `applyDiscount(999, 10)` gives 99.9, `(1000, 150)` gives 1500, and `(1000, -20)` gives -200. A NaN percent gives NaN. This fails check 1.
   Fix: clamp the percent to 0..100 (non-finite becomes 0) and `Math.round` the result.
   Also settle the meaning. The check says "takes percent off", which suggests it should return the discounted total, while `checkout` uses the return value as the discount amount. Pick one meaning and name it accordingly.

7. **`removeItem` with an unknown id removes the last item.** Location: `cart.mjs:25-26`. `findIndex` returns -1 and `splice(-1, 1)` drops the last element. Probe: removing id 9 from `[{id:1},{id:2}]` left `[{id:1}]`. This fails check 2.
   Fix: return early when `idx === -1`, or use `filter`. Decide whether `removeItem` should mutate the cart or return a new one, and keep that consistent with `addItem`.

8. **`formatPrice` divides by 10.** Location: `cart.mjs:56`. `formatPrice(1234)` gives `"$123.40"`, so check 4 fails.
   Fix: divide by 100. Better, use integer math (`Math.trunc(c/100)` and `String(abs%100).padStart(2,'0')`) and handle the sign for negative values.

9. **`findItem` assigns instead of comparing.** Location: `cart.mjs:21`. It uses `i.id = id`. Probe: `findItem(c, 7)` changed the first item's id to 7 and returned it.
   Fix: use `===`.

10. **Shared default array in `createCart`.** Location: `cart.mjs:3,5`. Every `createCart()` with no argument shares `DEFAULT_ITEMS`. Probe: after `addItem` on one cart, a fresh `createCart().items` already held that item. This leaks cart contents between users.
    Fix: `items = []` in the parameter list, or copy the input with `[...items]`.

11. **Tests do not prove any check.** Location: `cart.test.mjs:12-24`.
    - `applyDiscount returns something` uses `assert.ok`, which passes for 99.9, 1500 and -200.
    - The `removeItem` test is `test.skip`, and it has no unknown-id case.
    - `checkout runs` only asserts truthiness, and `"1000100"` would pass it.
    - There is no `formatPrice` test.
    - There are no coupon tests: expired, unknown, injection payload, or prototype keys.
    - There are no tests for clamping, negative, NaN or huge inputs.

    Fix: write exact `assert.equal`/`deepEqual` tests for each check. Assert `Number.isInteger` on every checkout field. Use an injectable clock for expiry. Add a test that hostile coupon strings give 0 and have no side effects.

12. **`checkout` has no input validation.** Location: `cart.mjs:65`. Calling `checkout(cart)` without options throws on destructuring. Item `price` and `qty` are trusted as-is, so negative or fractional values flow into the totals.
    Fix: default the options to `= {}`, and reject (or have `addItem` reject) item prices and quantities that are not non-negative integers.

## Defer

- **`parseQty` is an out-of-scope helper.** Location: `cart.mjs:30-32`. It has no radix, and `parseInt('3abc')` gives 3 while `'-5'` gives -5. It is unused by this stage. Either drop it or validate with `/^\d+$/` when quantities from user input arrive.
- **`saveCart` is out of scope and swallows errors.** Location: `cart.mjs:59-63`. It is `async` but neither awaits nor returns `store.put`, and its empty `catch` hides failures. Apart from the key leak in finding 1, consider removing it from this stage.
- **Huge inputs.** Once the code moves to integer math, prices × qty above `Number.MAX_SAFE_INTEGER` lose precision. Add a bound check or use BigInt if large orders are realistic. This is low priority.

## Reject

- None.

## Sound

- `addItem` (unchanged) copies the item before pushing, and that behaviour is fine.
- The plan's integer-cents decision is the right approach. The code just does not follow it yet.
