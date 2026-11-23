# Playwright for headless screenshots from a dependency-free Node script (research, 2026-11-23)

Scope: a small Node script shipped in a plugin. It takes PNG screenshots of a page and diffs two PNGs, and must not add a dependency to the user's project. Facts below were checked on this machine (Linux aarch64 under WSL2, Node 22) in the session scratchpad, plus the docs and the npm registry.

No page read contained instructions aimed at an AI agent.

---

## Question

What is the current stable Playwright, and which version at least two weeks old should be pinned? Which package, `playwright` or `playwright-core`? How do you install only the Chromium headless shell into a custom cache outside a repo, and how big is it? How does `npx -y playwright@<ver>` compare with a cached install? What is the lightest way to diff two PNGs?

## Answer

**Versions (npm registry, 2026-11-23).** `latest` is 1.65.1 (published 2026-11-13, 10 days old, too new). **Pin `1.65.0`** (2026-11-05, 18 days old). The previous minor is 1.64.1 (2026-10-14). The `next` tag is 1.66.0 alpha.

**`playwright` vs `playwright-core`.**
- `playwright@1.65.1` is a thin package (about 5 MB unpacked) whose only dependency is `playwright-core@1.65.1` (about 14 MB). It adds the `playwright` CLI name and test-runner glue.
- A library script needs only `playwright-core`. It exports `chromium` and has the `install` CLI too.
- `npx playwright …` needs the `playwright` package name (the bin).
- Neither downloads browsers on `npm install`. Browsers come from `playwright install`.

**Headless shell only, custom cache.**
- `PLAYWRIGHT_BROWSERS_PATH=<dir> npx -y playwright@1.65.0 install --only-shell chromium` installs `chromium_headless_shell-1254` (Chrome Headless Shell 158.0.8127.18) plus `ffmpeg-1013`.
- Measured: 14 s; 284 MB on disk for the shell plus 3.9 MB for ffmpeg.
- Download sizes (Content-Length): about 130 MB (linux-arm64 129.9 MB, linux64 132.0 MB, win64 129.2 MB, mac-arm64 105.0 MB), plus about 2 MB for ffmpeg. For comparison, the full Chromium `chrome-linux64.zip` is 207 MB.
- `chromium.launch()` in headless mode used the shell. Only the shell was installed and the launch succeeded. Note that `chromium.executablePath()` still reports the full-Chromium path.
- The docs say headless mode uses the shell by default, and `--only-shell` skips the full browser.
- Default cache is `~/.cache/ms-playwright` (Linux), `~/Library/Caches/ms-playwright` (macOS) or `%USERPROFILE%\AppData\Local\ms-playwright`.
- The same `PLAYWRIGHT_BROWSERS_PATH` must be set at run time.
- Playwright garbage-collects browser versions that no client still needs. The cache keeps a `.links` dir. Set `PLAYWRIGHT_SKIP_BROWSER_GC=1` or pass `--no-remove` to opt out.
- On Linux, system libraries may be missing. `playwright install-deps` / `--with-deps` uses the OS package manager, which needs root.
- `npx playwright install` outside a project prints a boxed warning about missing project dependencies. It's harmless.

**`npx -y playwright@1.65.0` vs a cached install.**
- `npx -y playwright@1.65.0 screenshot [--full-page] [--viewport-size "w,h"] [--wait-for-selector s] [--color-scheme dark] <url> <file>` captures with no script at all.
- Measured: about 3.3 s cold, with an empty npm cache (it fetches about 19 MB of packages; the npm cache grew to 65 MB). About 0.6 to 1 s warm, from the `_npx` cache. With `npm_config_offline=true` it also works once warm.
- npx resolves from the user's npm cache, which is outside the repo. Nothing touches the project's `package.json`.
- Cached install: `npm i --prefix <cache>/lib --no-save --no-package-lock playwright-core@1.65.0` (about 0.5 s warm, 14 MB). The script then does `createRequire(<cache>/lib/)('playwright-core')`.
- Measured: launch, goto and screenshot took 75 to 90 ms on a local file.
- A cached install gives a script full API control (multiple viewports, waits, a single browser launch for many shots) and no per-call npx resolution. npx is simplest for one-off CLI screenshots.

**PNG diff options (measured on two 400×300 shots differing by one letter).**
1. **pixelmatch + pngjs** (`pixelmatch@7.1.0` about 36 KB, ESM, depends on `pngjs`; `pngjs@7.0.0` about 0.7 MB).
   - Public, stable API. Returns the count of differing pixels and writes a diff image.
   - Result: 82 px at `threshold: 0.1`, 0 px for identical shots.
   - pixelmatch 8.0.0 (2026-10-06) is the latest and is eligible for pinning. Only 7.1.0 was tested.
2. **Playwright's own comparator.** `require('playwright-core/lib/coreBundle').utils.getComparator('image/png')(a, b, {threshold})` works in 1.65.0.
   - Result: "78 pixels (ratio 0.01 …) are different", plus a diff PNG buffer. It is pixelmatch-derived and handles size mismatches.
   - Costs nothing extra if `playwright-core` is already cached.
   - **It is internal, not public API.** The `coreBundle` export path is new and has moved before. Pin exactly, and keep a test that fails loudly if it disappears.
   - `utilsBundle` also exposes `PNG` (pngjs), so pngjs isn't needed separately.
3. **Other.** `odiff-bin@4.5.0` is a native binary, very fast, and a larger download. It's overkill here. A zero-dependency byte or hash equality check (`crypto` SHA-256 of the files) answers only "identical or not". That is enough when Chromium rendering is deterministic on one machine, but too brittle across machines.

## Sources

- npm registry (`npm view playwright time dist-tags`, `playwright-core`, `pixelmatch`, `pngjs`, `odiff-bin`), queried 2026-11-23
- Playwright, Browsers: https://playwright.dev/docs/browsers (read 2026-11-23)
- Playwright, Library: https://playwright.dev/docs/library (read 2026-11-23)
- `https://cdn.playwright.dev/builds/cft/158.0.8127.18/<platform>/chrome-headless-shell-*.zip`, HEAD requests for size, 2026-11-23
- Local runs, 2026-11-23: install, `npx playwright screenshot`, a `playwright-core` capture script, and both comparators (scratch scripts, not kept)

## Confidence

- **High:** versions, sizes, the headless-shell install and launch, the npx and cached timings on this machine, and pixelmatch.
- **Medium:** the internal `getComparator` path. It works on 1.65.0 but is not public and may move in any release.
- **Medium:** behaviour on macOS and Windows. Sizes were checked; installs were not.

## What it changes for a plan that ships a capture script

- Pin `playwright-core@1.65.0` (and `pixelmatch@7.1.0` or `8.0.0` plus `pngjs@7.0.0` if not using the internal comparator). Install them once into a JBIT-owned cache outside any repo, such as `${CLAUDE_PLUGIN_DATA}` on Claude or `~/.cache/jbit/playwright-1.65.0` on any host. Set `PLAYWRIGHT_BROWSERS_PATH` to a sibling dir. Then nothing enters the user's project, and re-runs are offline.
- The first run costs about 130 MB of download and about 290 MB of disk. The skill should say so and ask first (it's spend and disk on the user's machine). A check should prove a second run makes no network fetch.
- Use the cached library form for the script (many shots, one browser launch). Keep `npx -y playwright@1.65.0 screenshot` as the no-script fallback.
- Prefer pixelmatch + pngjs for the diff (public API, under 1 MB). Use Playwright's internal comparator only behind a pinned version and a smoke test.
- Linux hosts without the shared libraries need `install-deps` (root). The script should detect the launch error and print the exact command, not try sudo.
