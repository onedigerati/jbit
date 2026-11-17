# Stage 1 · Checkout — evidence
Verified 2026-11-17 on 5836778 (+ uncommitted cart.mjs, cart.test.mjs)

| Check | Result | Evidence |
|---|---|---|
| `applyDiscount(totalCents, percent)` takes `percent` off, clamped to 0..100, and returns integer cents (proof: tests) | fail | [probe-discount.txt](probe-discount.txt): (1000,10) gives 100 not 900; -20 gives -200, 150 gives 1500 (no clamp); (999,15) gives 149.85. Test only asserts truthy ([tests.txt](tests.txt)) |
| `removeItem(cart, id)` removes only the item with that id and leaves the cart alone for an unknown id (proof: tests) | fail | [probe-remove.txt](probe-remove.txt): unknown id 99 removes the last item ([1,2,3] becomes [1,2]); its test is `test.skip` |
| `checkout(cart, { coupon, taxRate })` returns `{ subtotal, discount, tax, total }` as integer cents; an expired or unknown coupon gives no discount (proof: tests) | fail | [probe-checkout.txt](probe-checkout.txt): throws on every non-empty cart; expired SAVE10 gives 10%, valid HALF gives 0%; `addTax` returns the string "1000100"; coupon code reaches `eval` |
| `formatPrice(cents)` gives `"$12.34"` for 1234 (proof: tests) | fail | [probe-format.txt](probe-format.txt): 1234 gives "$123.40", 5 gives "$0.50" (divides by 10); no test |

Project checks: types n/a · lint n/a · tests 1/4 pass, 2 fail, 1 skipped (subtotal test is a regression from 5836778) · build n/a
Audit: not run, no lockfile and no dependencies ([audit.txt](audit.txt))

Other findings (outside the checks): hardcoded live payment key in cart.mjs line 2, logged by checkout and stored by saveCart (masked in evidence); createCart() reuses one array across carts; findItem uses `=` instead of `===`; saveCart swallows errors. Probe script: [probe.mjs](probe.mjs).

## History
- 2026-11-17 · All 4 checks failed on first verification: see rows above. Not fixed yet.
