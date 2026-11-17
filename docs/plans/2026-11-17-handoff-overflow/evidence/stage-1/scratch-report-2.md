# copy of /tmp/jbit-s1-overflow/docs/evidence/stage-1/report.md after verify run 2
# Stage 1 · Checkout — evidence
Verified 2026-11-17 on 5836778 (+ uncommitted changes to cart.mjs, cart.test.mjs)

| Check | Result | Evidence |
|---|---|---|
| `applyDiscount(totalCents, percent)` takes `percent` off, clamped to 0..100, and returns integer cents (proof: tests) | pass | [tests.txt](tests.txt): tests 3–5 ok; [apply-discount.txt](apply-discount.txt): with clamp and rounding removed, tests 4, 5, 8 fail (expected 0, got -500) |
| `removeItem(cart, id)` removes only the item with that id and leaves the cart alone for an unknown id (proof: tests) | pass | [tests.txt](tests.txt): tests 6–7 ok; [remove-item.txt](remove-item.txt): splicing on unknown id fails test 7; matching the wrong id fails tests 6–7 |
| `checkout(cart, { coupon, taxRate })` returns `{ subtotal, discount, tax, total }` as integer cents; an expired or unknown coupon gives no discount (proof: tests) | pass | [tests.txt](tests.txt): tests 8–10 ok; [checkout.txt](checkout.txt): expiry ignored fails test 9; unrounded tax fails tests 8–10; [coupon-injection.txt](coupon-injection.txt): unknown or malicious codes give 0 discount, and an eval version fails test 10 (PWNED=1) |
| `formatPrice(cents)` gives `"$12.34"` for 1234 (proof: tests) | pass | [tests.txt](tests.txt): test 11 ok; [format-price.txt](format-price.txt): dropping `.toFixed(2)` fails test 11 (the 0 -> "$0.00" case catches it; 1234 alone would not) |
| Extra (brief): coupon code can't execute code | pass | [coupon-injection.txt](coupon-injection.txt): own-key lookup only, no eval; an injected code ran under the eval version and test 10 caught it |
| Extra (brief): no payment key in cart.mjs, logs or stored output | pass | [secret-scan.txt](secret-scan.txt): 0 matches in the working tree, git history and ~/.npm/_logs |
| Extra (brief): `cart.mjs` restored exactly after the breaks | pass | [restore-check.txt](restore-check.txt): `git diff` sha256 8d26db3a… and `cart.mjs` sha256 62493deb… match before and after |

Project checks: types n/a · lint n/a · tests 11/11 pass (`npm test`) · build n/a (package.json defines only `test`)
Audit: unproven — `npm audit --omit=dev` fails with ENOLOCK (no lockfile); package.json declares no dependencies, so nothing is shipped ([audit.txt](audit.txt))

Known gap outside the checks: `checkout` returns NaN tax and total when `taxRate` is omitted.

## History
- 2026-11-17 · All four checks failed: `applyDiscount` returned the discount, unclamped, non-integer; `removeItem` with unknown id removed the last item; `checkout` threw (subtotal off-by-one), coupon expiry inverted, tax string-concatenated, coupon code passed to `eval`; `formatPrice` divided by 10. Also a hard-coded live-format payment key was logged and stored. Fixed: rewrote those functions in cart.mjs (clamp + round, guard -1, `<` loop, own-key coupon lookup with `now` param, numeric rounded tax, /100), removed the key, and replaced truthy-only tests with 11 asserting tests.
