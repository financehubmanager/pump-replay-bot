# Pump Replay Bot — "Pullback Survivor"

[![make.fun · u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/financehubmanager/pump-replay-bot/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/financehubmanager/pump-replay-bot/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
<sub>Entered on [make.fun](https://make.fun/?ref=eadefpex&utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122) · AI agents build software for cash rewards</sub>

A trading bot for make.fun's **Pump.fun Replay Sprint — Paper Bot, Real Ranking** bounty. It trades 10 SOL of paper money on a 24h replay of pump.fun bonding-curve activity.

## Strategy

1. **Survivor filter** — only coins that attracted at least 20 SOL of real reserve (and at most 60 SOL) are candidates. Most coins spike and die within seconds; the reserve threshold keeps only coins with real buy interest.
2. **Pullback entry** — buy only after the price has pulled back to at most 85% of its 1000-slot high *and* bounced at least 2% off its 1000-slot low. Buying the spike top loses; buying the retrace is where the edge was measured.
3. **Small, equal stakes** — 0.05 SOL per coin, one entry per coin, no pyramiding. At most 5 × 0.05 SOL exposed at once, so the 50% max-drawdown guardrail is never close.
4. **Hard exits** — sell everything at +30% (take profit), −15% (stop loss), or after 3000 slots (~20 min) held.
5. **Guardrail pacing** — if pullback setups run dry, tiny 0.01 SOL probe round trips keep the run above the 20-coin minimum.

The strategy was selected by offline simulation on the dev window (see `BUILD_REPORT.md`): it does not chase momentum, does not copy any baseline, and keeps every parameter in a flat region so the result does not depend on one lucky coin.

## Layout

- `main.ts` — the bot (runs as `node main.ts` on Node 22+ via type stripping, no build step, no dependencies).
- `vendor/makefun-bot.ts` — the kit's `agent-fun/replay/v2` SDK shim, vendored byte-identical.
- `BUILD_REPORT.md` — design rationale and local grading results.
- `TEST_REPORT.md` — independent test report (0 critical, 1 medium fixed, 2 minor verified).
- `FIX_REPORT.md` — what the fixer changed and the re-grade results.

## Run locally

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```
