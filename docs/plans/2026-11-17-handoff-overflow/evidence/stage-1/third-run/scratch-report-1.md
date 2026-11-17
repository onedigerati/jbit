# Stage 1 · Checkout — evidence
Verified 2026-11-17 on 5836778 (+ uncommitted cart.mjs, cart.test.mjs)

| Check | Result | Evidence |
|---|---|---|
| `applyDiscount(totalCents, percent)` takes `percent` off, clamped to 0..100, and returns integer cents (proof: tests) | pass | [tests.txt](tests.txt): tests 3–5; they fail on the pre-fix code, see [tests-catch-bugs.txt](tests-catch-bugs.txt) |
| `removeItem(cart, id)` removes only the item with that id and leaves the cart alone for an unknown id (proof: tests) | pass | [tests.txt](tests.txt): tests 6–7; test 7 fails on the pre-fix code, see [tests-catch-bugs.txt](tests-catch-bugs.txt) |
| `checkout(cart, { coupon, taxRate })` returns `{ subtotal, discount, tax, total }` as integer cents; an expired or unknown coupon gives no discount (proof: tests) | pass | [tests.txt](tests.txt): test 8 (valid, expired, unknown and injection-style coupons; clock pinned); fails on the pre-fix code, see [tests-catch-bugs.txt](tests-catch-bugs.txt) |
| `formatPrice(cents)` gives `"$12.34"` for 1234 (proof: tests) | pass | [tests.txt](tests.txt): test 9; fails on the pre-fix code, see [tests-catch-bugs.txt](tests-catch-bugs.txt) |

Project checks: types n/a · lint n/a · tests 12/12 · build n/a (package.json has only a `test` script)
Audit: not run, `npm audit` needs a lockfile (ENOLOCK); there are no dependencies, so nothing is shipped, see [audit.txt](audit.txt)

Outside the checks, still open: cart.mjs hardcodes a live payment key (`sk_live_[masked]`) and `saveCart` stores it with the cart. The key needs rotating and moving out of source.

## History
- 2026-11-17 · All four checks and `npm test` failed (1 pass, 2 fail, 1 skipped): `subtotal` read past the end of the array; `applyDiscount` returned the discount amount, not clamped or rounded; `removeItem` dropped the last item for an unknown id; `isExpired` was inverted; `couponPercent` passed the coupon code to `eval`; `addTax` joined strings; `formatPrice` divided by 10; the tests only checked truthiness or were skipped. See [tests-before-fix.txt](tests-before-fix.txt), [probe-discount.txt](probe-discount.txt), [probe-remove.txt](probe-remove.txt), [probe-checkout.txt](probe-checkout.txt), [probe-format.txt](probe-format.txt). Fixed: corrected each function, replaced `eval` with an own-key lookup, stopped `checkout` logging the payment key, gave `createCart()` a fresh array per cart, and replaced the placeholder tests with real ones.
