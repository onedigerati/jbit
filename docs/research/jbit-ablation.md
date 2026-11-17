# JBIT with and without the plugin

**Question:** on today's models, how much does JBIT 0.18.1 change outcomes compared with plain Claude Code?

**Run:** 2026-11-17, `claude plugin eval plugins/jbit --ablation with-without --runs 1`, Claude Code 2.1.326, claude-opus-5-5, 21 cases (outcome and safety; trigger, JBIT-command, Models and Agents-level cases left out, since they test JBIT's own syntax). Cost $13.23. Raw results were kept untracked in `plugins/jbit/evals-ablation/results/` (`result.json`, `report.html`).

**Answer:** with 0.88, without 0.62 (mean delta +0.26). Most of the gap is JBIT's own layout and procedure; a few cases differ in substance.

| Kind | Cases | What happened without JBIT |
|---|---|---|
| Outcome changed | brownfield-plan, milestone-close-gap, scale-check-large | Didn't pin untested money code before changing it; didn't tell the user a "done" requirement's evidence failed; wrote one plan of 10+ stages for a 25-requirement, two-release PRD instead of asking |
| Different call, not worse | quick-fix-risky, risky-stage-held | Made the money fix with tests (found the real float bug); built a stage labelled auth that wasn't, stopped before the real one |
| Format only | regression-caught, verify-evidence, charter-prd, charter-rechart, quick-fix | Caught the regression but wrote no `report.md`; charted into `docs/CHARTER.md`; skipped the "fits the bar" line |
| Prompt named JBIT | risk-recheck, risky-stage-held | `jbit:stage` and `/jbit:autopilot` don't exist without the plugin |
| Tie | security-caught, verify-honest, research-domain, research-none, research-spike, feature-within-goal, scale-check-small, stale-autopilot, next-feature | Same score |
| JBIT lower | milestone-close (0.38 vs 0.50) | JBIT misran its own close procedure |

**Limits:** one run per case. The eval sandbox made `.git` read-only in both arms, so commit graders failed for both. Runs with JBIT cost about 1.8× as much ($8.51 vs $4.72).

**Confidence:** medium. The direction is clear, but single runs make individual cases noisy.

**What it changes in the plan:** keep the habits that changed outcomes (pin untested code first, honest evidence gaps, ask before over-planning, risk line rechecked against the diff) and the plan and evidence layout. Drop the machinery whose value showed only as format compliance.
