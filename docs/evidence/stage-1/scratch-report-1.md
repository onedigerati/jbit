# copy of /tmp/jbit-s1-overflow/docs/evidence/stage-1/report.md after verify run 1
# Stage 1 · Checkout — evidence
Verified 2026-11-17 on 5836778 (+ uncommitted cart.mjs, cart.test.mjs)

| Check | Result | Evidence |
|---|---|---|
| `applyDiscount(totalCents, percent)` takes `percent` off, clamped to 0..100, and returns integer cents (proof: tests) | fail | [tests.txt](tests.txt): only test is `assert.ok(applyDiscount(1000, 10))`, no clamp or integer assertion; [probe-behaviour.txt](probe-behaviour.txt): (999,10) gives 99.9, (1000,-10) gives -100, (1000,150) gives 1500 |
| `removeItem(cart, id)` removes only the item with that id and leaves the cart alone for an unknown id (proof: tests) | fail | [tests.txt](tests.txt): only test is `test.skip`; [probe-behaviour.txt](probe-behaviour.txt): unknown id 9 drops the last item (`splice(-1,1)`) |
| `checkout(cart, { coupon, taxRate })` returns `{ subtotal, discount, tax, total }` as integer cents; an expired or unknown coupon gives no discount (proof: tests) | fail | [tests.txt](tests.txt): 'checkout runs' fails with TypeError in `subtotal` (loop `i <= length`); [probe-behaviour.txt](probe-behaviour.txt): `isExpired` backwards (expired SAVE10 gives 10, valid HALF gives 0), `addTax(900,0.1)` gives "90090" |
| `formatPrice(cents)` gives `"$12.34"` for 1234 (proof: tests) | fail | [tests.txt](tests.txt): no formatPrice test; [probe-behaviour.txt](probe-behaviour.txt): `formatPrice(1234)` gives "$123.40" |

Project checks: types n/a (none defined) · lint n/a (none defined) · tests 1/4 pass, 2 fail, 1 skipped; the `subtotal` failure is a regression from 5836778 · build n/a (none defined)
Audit: not run, `npm audit --omit=dev` failed with ENOLOCK (no lockfile); package.json declares no dependencies ([audit.txt](audit.txt))

Outside the checks: cart.mjs line 2 holds a live-looking payment key (`sk_live_[masked]`), which `checkout` logs to the console and `saveCart` writes to the store; `couponPercent` runs `eval` on the coupon code (user input).

## History
- 2026-11-17 · all four checks failed on first verification; not yet fixed.
