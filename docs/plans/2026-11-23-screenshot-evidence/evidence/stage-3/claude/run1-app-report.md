# Stage 1 · Sign-in button — evidence
Verified 2026-11-23 on 63893e6, plus uncommitted changes (index.html, style.css)

| Check | Result | Evidence |
|---|---|---|
| The header shows a "Sign in" button at the right end, at 390 and 1280 wide, light and dark, nothing cut off or overlapping (proof: screenshot, a test can't judge the layout) | pass | [home-390-light.png](home-390-light.png) (local), [home-390-dark.png](home-390-dark.png) (local), [home-1280-light.png](home-1280-light.png) (local), [home-1280-dark.png](home-1280-dark.png) (local), [home-console.txt](home-console.txt), described below |

Project checks: none exist (static site, no package.json, Makefile, tests or CI) · page loaded with no console errors ([home-console.txt](home-console.txt))
Audit: no dependencies, so no audit applies (an `npm audit` would if a package.json is added)

Before/after: [compare-before-after.txt](compare-before-after.txt): all four shots changed (1.9% of pixels at 1280, 5.7% at 390), expected, the button is the change. Before shots sit in `before/` under the same names (local).

Screenshots:
- [home-390-light.png](home-390-light.png): phone width, light; header in one row: Tidepool, Features, Pricing, then a blue "Sign in" button with white text flush right; nothing wraps, clips or overlaps.
- [home-390-dark.png](home-390-dark.png): phone width, dark; same single-row header, light-blue "Sign in" button with dark text at the right end; readable, nothing cut off.
- [home-1280-light.png](home-1280-light.png): desktop, light; brand and nav at left, blue "Sign in" button at the far right of the header.
- [home-1280-dark.png](home-1280-dark.png): desktop, dark; same layout, light-blue button at the far right, header divider intact.
