# Stage 1 · Sign-in button — evidence
Verified 2026-11-23 on 63893e6, plus uncommitted changes (index.html, style.css)

| Check | Result | Evidence |
|---|---|---|
| The header shows a "Sign in" button at the right end, at 390 and 1280 wide, light and dark, nothing cut off or overlapping | pass | [home-390-light.png](home-390-light.png) (local), [home-390-dark.png](home-390-dark.png) (local), [home-1280-light.png](home-1280-light.png) (local), [home-1280-dark.png](home-1280-dark.png) (local), [home-console.txt](home-console.txt), [compare.txt](compare.txt); described below |

Project checks: none exist (static site: no package.json, Makefile or CI); the capture run logged no load failures, console errors or page errors ([home-console.txt](home-console.txt))
Audit: no dependencies, so no audit applies (`npm audit` would, if a package.json is added)

Before/after: [compare.txt](compare.txt) shows all four shots changed against `before/` (1.9% of pixels at 1280, 5.7% at 390): the new button, as expected.

Screenshots:
- [home-390-light.png](home-390-light.png): phone width, light theme; header reads Tidepool, Features, Pricing, then a blue "Sign in" button with white text at the right edge, 16px from it; one line, nothing cut off or overlapping.
- [home-390-dark.png](home-390-dark.png): phone width, dark theme; same layout, the button in light blue with dark text, readable, at the right edge, nothing cut off.
- [home-1280-light.png](home-1280-light.png): desktop width, light theme; brand and nav at the left, the blue "Sign in" button alone at the far right of the header.
- [home-1280-dark.png](home-1280-dark.png): desktop width, dark theme; same as light, button in light blue with dark text at the far right.
