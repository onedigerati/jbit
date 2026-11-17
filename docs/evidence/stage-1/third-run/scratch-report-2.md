# Stage 1 · Checkout — evidence
Verified 2026-11-17 on 5836778 (+ uncommitted cart.mjs, cart.test.mjs)

| Check | Result | Evidence |
|---|---|---|
| `applyDiscount(totalCents, percent)` takes `percent` off, clamped to 0..100, and returns integer cents (proof: tests) | pass | [apply-discount.txt](apply-discount.txt): 6/6 rounding and clamping mutants fail the suite |
| `removeItem(cart, id)` removes only the item with that id and leaves the cart alone for an unknown id (proof: tests) | pass | [remove-item.txt](remove-item.txt): 2/2 mutants fail the suite, including `splice(-1)` on an unknown id |
| `checkout(cart, { coupon, taxRate })` returns `{ subtotal, discount, tax, total }` as integer cents; an expired or unknown coupon gives no discount (proof: tests) | pass | [checkout.txt](checkout.txt): 8/8 expiry, unknown-coupon and integer-tax mutants fail the suite; 14 hostile coupons give discount 0 and run no code; no secret is logged or stored |
| `formatPrice(cents)` gives `"$12.34"` for 1234 (proof: tests) | pass | [format-price.txt](format-price.txt): 3/3 mutants fail the suite |

Project checks: types n/a · lint n/a · tests 11/11 ([tests.txt](tests.txt)) · build n/a · mutants 19/19 caught ([mutation.txt](mutation.txt))
Audit: not run, ENOLOCK (no lockfile, no dependencies) ([audit.txt](audit.txt))

## History
- 2026-11-17 · applyDiscount failed: no rounding or clamping, (999,15) gave 149.85. Fixed: clamp to 0..100, `Math.round`, non-numbers count as 0%.
- 2026-11-17 · removeItem failed: an unknown id removed the last item. Fixed: skip the splice when the index is -1.
- 2026-11-17 · checkout failed: subtotal read past the end, the expiry check was inverted, the coupon went through `eval`, and addTax joined strings. Fixed: loop bounds, `<= now`, an own-key lookup in `Object.hasOwn`, `Math.round` tax, and a RangeError on a bad taxRate.
- 2026-11-17 · formatPrice failed: divided by 10. Fixed: divide by 100.
- 2026-11-17 · Also removed: the hard-coded payment key, which checkout logged and saveCart stored. Also fixed: the shared default items array, `=` in findItem, and parseQty's missing radix.
- 2026-11-17 · Re-verify: 2 of 19 mutants survived (expiry ignoring injected `now`; `in` instead of hasOwn). Fixed: added tests for a post-expiry date and for prototype-key coupons.
