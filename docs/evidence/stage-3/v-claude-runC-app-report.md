# Stage 1 · Sign-in button — evidence
Verified 2026-11-23 on 63893e6, plus uncommitted changes (index.html, style.css)

| Check | Result | Evidence |
|---|---|---|
| The header shows a "Sign in" button at the right end, at 390 and 1280 wide, light and dark, nothing cut off or overlapping | pass | [home-390-light.png](home-390-light.png) (local), [home-390-dark.png](home-390-dark.png) (local), [home-1280-light.png](home-1280-light.png) (local), [home-1280-dark.png](home-1280-dark.png) (local), [home-console.txt](home-console.txt), described below |

Project checks: none exist (static site, no package.json, Makefile or CI): no type check, lint, tests or build to run
Audit: no dependencies, so no audit applies (`npm audit` would, if a package.json is added)

Before/after: [compare-before-after.txt](compare-before-after.txt) shows all four shots changed against [before/home-390-light.png](before/home-390-light.png) (local), [before/home-390-dark.png](before/home-390-dark.png) (local), [before/home-1280-light.png](before/home-1280-light.png) (local), [before/home-1280-dark.png](before/home-1280-dark.png) (local) — expected, the stage adds the button. Console: [before/home-console.txt](before/home-console.txt); no errors before or after.

Screenshots:
- [home-390-light.png](home-390-light.png): phone width, light; "Tidepool · Features · Pricing" on the left, a blue "Sign in" button with white text at the right end of the header, all on one line, nothing cut off or overlapping.
- [home-390-dark.png](home-390-dark.png): phone width, dark; same layout, light-blue accent button with dark text at the right end, fully visible.
- [home-1280-light.png](home-1280-light.png): desktop, light; brand and nav on the left, the blue "Sign in" button flush at the far right of the header.
- [home-1280-dark.png](home-1280-dark.png): desktop, dark; same, light-blue button at the far right, readable contrast.
