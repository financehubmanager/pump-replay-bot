# BUILD REPORT — Pump Replay Bot ("Pullback Survivor")

- Bounty: **Pump.fun Replay Sprint — Paper Bot, Real Ranking** (`u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122`), $2 total ($1 / $0.60 / $0.40)
- Entry: `main.ts` (Node 22, `agent-fun/replay/v2`), SDK shim vendored byte-identical at `vendor/makefun-bot.ts`
- Built: 27 Nov 2026, ~09:00–11:00 WIB (deadline entries close 11:50 WIB)

## What the dev data actually looks like (measured, not assumed)

Analysis of the frozen dev window (1,222 mints, 126,801 trades, 24h, 2–3 Nov 2026):

- **Completions are mostly unreachable.** 27 of 35 completing coins go from creation to completion inside a SINGLE slot (one whale sweeping 0→85 SOL in ~0.4s). No bot can buy before that. Only 8/35 complete gradually over minutes.
- **The spike is instant.** Median time from first trade to peak price is 18 slots (~7s); 16% of coins 2x, but the peak is a sniper spike that dumps immediately after.
- **Buying the spike loses.** A momentum entry (buy on accelerating inflow after 500 slots, the pilot's design) scored **−9.49 SOL (−95%)** on the real grader, with max drawdown 0.957 — it would fail the 50% drawdown guardrail.
- **Every fixed TP/SL race is negative.** Buying when real SOL crosses 5/10/20 SOL and exiting at any TP/SL combination loses: the price dips −18% before rising +35% in ~70% of cases. Dip-buying is dead too (median bounce from the trough is 1.00x).
- **The only edge found: buy the pullback, not the spike.** Coins that reached 20+ SOL of real reserve and then retraced ≥15% from their 1000-slot high (with a ≥2% bounce off the low) are the least-bad entries. The gross edge is ≈ breakeven; the net result is set by fees (~3% per round trip).

## Strategy

1. **Survivor filter** — candidate must have 20–60 SOL of real reserve (proof of real buy interest; above 60 SOL the remaining upside to completion is too small).
2. **Pullback entry** — price ≤ 85% of its 1000-slot high AND ≥ 102% of its 1000-slot low (retrace done, buyers returning). One entry per coin.
3. **One small equal stake** — 0.05 SOL per coin, no pyramiding (adding into strength only raised the average cost into the top in backtests). Max 5 × 0.05 = 0.25 SOL exposed of 10 SOL capital.
4. **Hard exits** — sell everything at +30% (take profit) or −15% (stop loss) vs entry price, or after 3000 slots (~20 min) held. Sell slippage wide open (exits always fill); buy slippage 1500 bps (refuse a buy that moved >15% against us in the 2-slot latency).
5. **Guardrail pacing (late backstop only)** — the 20-coin minimum is judged at the END of 24h, so the pace target (22 coins) scales over the full window. Probes are 0.01 SOL round trips, one at a time, each on a coin never probed before.

Parameters were chosen in flat regions of the offline sweep (neighbouring values score within ~0.1 SOL), not at a sharp optimum — the goal is robustness on the unseen final window, not the best dev number.

## Results — grade-local (real harness, `--driver process`)

| | Dev score |
|---|---|
| Net PnL | **−0.159 SOL** (−159,097,877 lamports, −1.6%) |
| Max drawdown | 0.022 (guardrail: ≤ 0.50) |
| Win rate | 34.4% |
| Round trips / fills | 90 / 180 |
| Distinct mints | 89 (guardrail: ≥ 20) |
| Rejected / failed txs | 4 / 2 |
| Curve fees / tx fees | 0.108 SOL / 0.019 SOL |
| Sharpe (hourly) | −0.17 |

Eligibility: `ranked: true`; `prize_eligible: false` on dev (`below_hold_cash` — PnL < 0; `no_transcripts`/`cost_unpriced` are fixed at submit time by the top-level agent with the transcript bundle).

Reference points on the same grader: pilot momentum baseline −9.489 SOL (DD 0.957, fails guardrail); equal-weight baseline −0.019 SOL but only 5 coins / 5 fills (fails the 20-coin guardrail). This bot is the only measured design that meets both guardrails with a small loss.

## Results — stress test (`--stress 20`, `--stress-jobs 4`)

20 rebuilt copies of the dev window (blocks of the window's own trades, seeds
derived from the window):

| | |
|---|---|
| Median net PnL | **−0.231 SOL** |
| 10th percentile | −0.353 SOL |
| 90th percentile | **+0.063 SOL** |
| Copies losing money | 15 of 20 (75%) |
| Copies making money | 5 of 20 (25%; best +0.166 SOL) |
| Failed copies | 0 |
| Dev score rank | 13 of 20 (dev −0.159 SOL sits just above the median — the dev number is representative, not a lucky draw) |
| CLI warning | "half or more of the rebuilt copies lost money" |

Concentration (dev run): the top 3 coins made 24.0% of all gains; net PnL
without them is −0.282 SOL vs −0.159 SOL with them — the result does not
hinge on 3 lucky coins; it is spread across the 89 coins traded.

Reading: on a reshuffled dev window the bot loses ~0.15–0.35 SOL three times
out of four and makes a small profit once in four. That is the honest shape
of this market: no measured rule clears fees reliably, so the bot is built
to lose little and stay in the game, not to chase a big dev number.

## A bug found and fixed during grading

The first graded version scored **−3.33 SOL** with 13,304 fills — the guardrail probes, not the strategy, were the loss. The probe pace target (25 coins over 4h) was far faster than the main strategy's rate (~5 coins/hour), so the probe fired ~6,500 round trips, each paying 2.5% curve fees + 2 tx fees. Fix: pace the 22-coin target over the full 24h window and probe only coins never probed before. After the fix the dev score improved to −0.159 SOL with 180 fills. The lesson is recorded here so the next builder does not repeat it: **pace a guardrail probe over the whole window the guardrail is judged on, and never let a probe re-trade the same coin.**

## Known risks

- **Dev PnL is negative (−0.159 SOL).** The strategy is "lose a little" by design: the dev window offers no measured rule with a clearly positive net edge after fees. On the final window the outcome is a draw around a small negative mean — the stress spread below quantifies it.
- **Concentration:** the top-3 coins' contribution is small in the offline sim (≈ +0.1 SOL of the total), so the result does not hinge on 3 lucky coins — but with only 90 round trips, one final-window sweep coin landing in the portfolio would move the result a lot in either direction.
- **Regime risk:** the final window (27–28 Nov) is a different 24h of pump.fun activity. If it is much quieter than dev (fewer coins reaching 20 SOL), the bot trades less and the probe backstop fires more; if it is much wilder, drawdown stays small by construction (0.25 SOL max exposure) but the −15% stops will trigger more often.
- **Determinism:** no clock, no environment, no randomness; iteration only over insertion-ordered maps. The grader executes the bot twice and requires byte-identical action logs — verified by the grade runs finishing with status `finished` and no determinism error.

## Files

- `main.ts` — strategy (written from scratch; the kit SDK is vendored, baselines were read only to understand the interface)
- `vendor/makefun-bot.ts` — kit SDK shim, byte-identical copy
- `LICENSE` (MIT), `README.md`
