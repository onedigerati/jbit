# Stage 1 · Sign-in button — evidence
Verified 2026-11-23 on 63893e6, plus uncommitted changes (index.html, style.css)

| Check | Result | Evidence |
|---|---|---|
| The header shows a "Sign in" button at the right end, at 390 and 1280 wide, light and dark, nothing cut off or overlapping (proof: screenshot, a test can't judge the layout) | pass | [home-390-light.png](home-390-light.png) (local), [home-390-dark.png](home-390-dark.png) (local), [home-1280-light.png](home-1280-light.png) (local), [home-1280-dark.png](home-1280-dark.png) (local), [home-console.txt](home-console.txt), [compare-before-after.txt](compare-before-after.txt); described below |

Project checks: none exist (static site, no package.json, Makefile or CI config) · page loaded with no console errors, page errors or failed requests ([home-console.txt](home-console.txt))
Audit: no dependencies, nothing to audit

Before/after: `compare` shows all four shots changed (2–6% of pixels), all in the header where the button was added; expected. Before shots in `before/` (local).

Screenshots:
- [home-390-light.png](home-390-light.png): phone width, light; header reads Tidepool, Features, Pricing, then a blue "Sign in" button flush right with 16px margin; single row, nothing cut off or overlapping.
- [home-390-dark.png](home-390-dark.png): phone width, dark; same layout, light-blue button with dark text, readable, nothing cut off.
- [home-1280-light.png](home-1280-light.png): desktop, light; brand and nav at left, blue "Sign in" button at the far right of the header.
- [home-1280-dark.png](home-1280-dark.png): desktop, dark; same layout, light-blue accent button at far right, readable.
