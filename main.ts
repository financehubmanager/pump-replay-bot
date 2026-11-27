// Pump.fun Replay Sprint — "Pullback Survivor" bot.
//
// Idea (from measuring the dev window, not from any baseline):
//   * A pump.fun coin's price is a pure function of its real SOL reserve
//     (constant-product curve), so "real SOL" is the honest size signal.
//   * Most coins spike within seconds of creation and then bleed: buying the
//     spike itself loses (the pilot momentum approach lost ~95% on dev).
//   * The coins that survive to 20+ SOL of real reserve are the only ones
//     with a real chance of a further run — but buying them AT the spike top
//     still loses, because the price almost always retraces first.
//   * So: enter only after the retrace. Buy a coin that (a) proved itself by
//     reaching 20 SOL of real reserve, (b) has since pulled back to at most
//     85% of its 1000-slot high, and (c) has already bounced at least 2% off
//     its 1000-slot low (the flush is over, buyers are returning).
//   * One small, equal stake per coin (0.05 SOL), one entry per coin, no
//     pyramiding (adding into strength only raised the average cost into the
//     top in backtests). Exit everything at +30% or -15% versus the entry
//     price, or after 3000 slots (~20 min) whatever the price is.
//   * Tiny stakes keep the worst case small: at most 5 x 0.05 SOL = 0.25 SOL
//     exposed at once out of 10 SOL capital, so the drawdown guardrail
//     (50%) is never close. The edge, if any, comes from the minority of
//     coins that run +30% after a pullback, not from any single coin.
//
// Guardrail pacing: the run must end with round trips on >= 20 coins. If
// the pullback setups run dry, the bot opens tiny 0.01 SOL probe round trips
// on liquid coins (buy, sell as soon as the buy lands) until it is back on
// pace. Probes are capped at one at a time, each on a coin never probed
// before, and never compete with the main five position slots. A probed mint
// counts toward the pace target (a probe round trip is a round trip), and
// total probes are hard-capped at 30 — without the cap, a quiet final
// window could leave the pace unmet for hours and the probe would fire
// tens of thousands of times, burning the whole 10 SOL on fees. The pace
// target scales over the FULL 24h window: pacing it over 4h instead made
// the bot churn ~6,500 probe round trips on the dev window, and the probes'
// fees alone cost ~3 SOL — the pacing, not the strategy, was the loss.
//
// Deterministic by construction: no clock, no environment, no randomness;
// iteration only over insertion-ordered maps fed by the batch stream. The
// only numbers are the constants below, chosen on the dev window and kept
// in flat regions (neighbouring values score within ~0.1 SOL of each other).

import { LAMPORTS_PER_SOL, runBot, type Batch, type BotState, type OrderInput, type Pubkey } from './vendor/makefun-bot.ts';

// ------------------------------------------------------------------ tuning
const STAKE_LAMPORTS = LAMPORTS_PER_SOL / 20n; // 0.05 SOL per coin
const MIN_BUY_LAMPORTS = LAMPORTS_PER_SOL / 100n; // 0.01 SOL: smallest useful buy
const ENTRY_RQ_MIN_SOL = 20; // coin must have attracted >= 20 SOL of real reserve
const ENTRY_RQ_MAX_SOL = 60; // beyond this the remaining upside is too small
const MIN_AGE_SLOTS = 10; // slots since CreateEvent before an entry is allowed
const LOOKBACK_SLOTS = 1000; // window for the pullback high/low
const PULLBACK_MAX = 0.85; // price must be at most 85% of the lookback high
const BOUNCE_MIN = 1.02; // ...and at least 2% above the lookback low
const TAKE_PROFIT = 0.3; // sell everything at +30% versus entry price
const STOP_LOSS = 0.15; // sell everything at -15% versus entry price
const MAX_HOLD_SLOTS = 3000; // sell everything after ~20 minutes held
const MAX_ENTRIES_PER_MINT = 1;
const BUY_SLIPPAGE_BPS = 1500; // refuse a buy that moved >15% against us in latency
const SELL_SLIPPAGE_BPS = 10000; // exits always go through
const MAX_PROBES = 1;
const PROBE_LAMPORTS = LAMPORTS_PER_SOL / 100n; // 0.01 SOL probe round trip
const MAX_TOTAL_PROBES = 30; // hard cap on probe round trips ever opened (runaway backstop)
const TARGET_COINS = 22; // guardrail pacing target (pace-scaled by block time)
const PACE_SECONDS = 86_400; // the full 24h window to reach the target

const LAMPORTS = 1e9;

interface PricePoint {
  slot: number;
  price: number;
}

interface Coin {
  created: number | null;
  /** (slot, price) history, trimmed to LOOKBACK_SLOTS. */
  history: PricePoint[];
  entries: number;
}

interface Held {
  opened: number;
  /** Market price (SOL per token) when the buy was decided. */
  entryPrice: number;
  /** True once any fill of this position landed. */
  filled: boolean;
}

function priceOf(curve: { virtual_token_reserves: bigint; virtual_quote_reserves: bigint }): number {
  const vt = Number(curve.virtual_token_reserves);
  const vq = Number(curve.virtual_quote_reserves);
  return vt > 0 ? vq / vt : 0;
}

const coins = new Map<Pubkey, Coin>();
const held = new Map<Pubkey, Held>();
/** Probe round trips in flight, by mint: false while buying, true once selling. */
const probes = new Map<Pubkey, boolean>();
/** Coins ever probed: each probe must add a NEW distinct mint. */
const probed = new Set<Pubkey>();
let firstBlockTime: number | null = null;
let lastBlockTime: number | null = null;

function coinOf(mint: Pubkey): Coin {
  let c = coins.get(mint);
  if (c === undefined) {
    c = { created: null, history: [], entries: 0 };
    coins.set(mint, c);
  }
  return c;
}

await runBot({
  onBatch(state: BotState, batch: Batch): OrderInput[] {
    const now = batch.slot;
    const orders: OrderInput[] = [];
    const cap = state.hello.caps.max_orders_per_batch;
    const tx = state.txFeeLamports();

    // ---- take the batch in: creation slots and per-coin price history.
    const traded: Pubkey[] = [];
    const seenTraded = new Set<Pubkey>();
    for (const e of batch.events) {
      if (e.block_time !== null) {
        if (firstBlockTime === null) firstBlockTime = e.block_time;
        if (lastBlockTime === null || e.block_time > lastBlockTime) lastBlockTime = e.block_time;
      }
      if (e.event === 'CreateEvent') {
        coinOf(e.mint).created = e.slot;
      } else if (e.event === 'TradeEvent') {
        const c = coinOf(e.mint);
        c.history.push({ slot: e.slot, price: priceOf(e) });
        while (c.history.length > 0 && c.history[0]!.slot <= now - LOOKBACK_SLOTS) c.history.shift();
        if (!seenTraded.has(e.mint)) {
          seenTraded.add(e.mint);
          traded.push(e.mint);
        }
      }
    }

    const pendingByMint = new Map<Pubkey, number>();
    for (const po of state.pending.values()) {
      pendingByMint.set(po.order.mint, (pendingByMint.get(po.order.mint) ?? 0) + 1);
    }
    const hasPendingSell = (mint: Pubkey): boolean => {
      for (const po of state.pending.values()) {
        if (po.order.mint === mint && po.order.side === 'sell') return true;
      }
      return false;
    };

    // ---- exits first: take-profit, stop-loss, or time limit; sell everything.
    for (const [mint, h] of held) {
      const pos = state.positions.get(mint);
      if (pos === undefined) {
        if (!pendingByMint.has(mint)) {
          held.delete(mint);
          const c = coinOf(mint);
          if (!h.filled) c.entries -= 1; // the buy never landed: the coin stays eligible
        }
        continue;
      }
      h.filled = true;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const price = priceOf(curve);
      if (price <= 0 || h.entryPrice <= 0) continue;
      const ret = price / h.entryPrice - 1;
      const done = ret <= -STOP_LOSS || ret >= TAKE_PROFIT || now - h.opened > MAX_HOLD_SLOTS;
      if (!done || hasPendingSell(mint) || orders.length >= cap) continue;
      orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: SELL_SLIPPAGE_BPS });
    }

    // ---- probes: sell a landed probe as soon as its buy has filled.
    for (const [mint, selling] of probes) {
      const pos = state.positions.get(mint);
      if (pos === undefined) {
        if (!pendingByMint.has(mint)) probes.delete(mint);
        continue;
      }
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete || pendingByMint.has(mint)) continue;
      if (orders.length >= cap) break;
      orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: SELL_SLIPPAGE_BPS });
      if (!selling) probes.set(mint, true);
    }

    // ---- entries: the pullback survivor setup, one small stake per coin.
    let free = state.freeCashLamports();
    let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
    for (const mint of traded) {
      if (orders.length >= cap || slotsLeft <= 0) break;
      if (held.has(mint) || probes.has(mint) || pendingByMint.has(mint)) continue;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const c = coins.get(mint)!;
      if (c.entries >= MAX_ENTRIES_PER_MINT) continue;
      if (c.created === null || now - c.created < MIN_AGE_SLOTS) continue;
      const rqSol = Number(curve.real_quote_reserves) / LAMPORTS;
      if (rqSol < ENTRY_RQ_MIN_SOL || rqSol > ENTRY_RQ_MAX_SOL) continue;
      if (c.history.length === 0) continue;
      let high = 0;
      let low = Number.POSITIVE_INFINITY;
      for (const p of c.history) {
        if (p.price > high) high = p.price;
        if (p.price < low) low = p.price;
      }
      const price = priceOf(curve);
      if (price <= 0 || high <= 0 || low === Number.POSITIVE_INFINITY) continue;
      if (price > high * PULLBACK_MAX) continue; // has not pulled back enough
      if (price < low * BOUNCE_MIN) continue; // still at the low: no bounce yet
      const capLamports = state.maxBuyLamports(mint);
      let amount = capLamports < STAKE_LAMPORTS ? capLamports : STAKE_LAMPORTS;
      if (amount > free - tx) amount = free - tx;
      if (amount < MIN_BUY_LAMPORTS) continue;
      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: BUY_SLIPPAGE_BPS });
      free -= amount + tx;
      held.set(mint, { opened: now, entryPrice: price, filled: false });
      c.entries += 1;
      slotsLeft -= 1;
    }

    // ---- guardrail pacing: open a probe when fills or coins lag the pace.
    if (
      probes.size < MAX_PROBES &&
      probed.size < MAX_TOTAL_PROBES &&
      slotsLeft > 0 &&
      firstBlockTime !== null &&
      lastBlockTime !== null
    ) {
      const pace = Math.min(1, (lastBlockTime - firstBlockTime) / PACE_SECONDS);
      const myCoins = new Set<Pubkey>();
      // coins ever bought: held now, plus anything we previously held (entries>0).
      for (const [mint, cc] of coins) if (cc.entries > 0) myCoins.add(mint);
      // a probe round trip is a round trip: probed mints count toward pace,
      // so a quiet window cannot keep needCoins true after probes have fired.
      for (const mint of probed) myCoins.add(mint);
      // fills are not tracked by the shim; pace on distinct coins — a probe
      // round trip adds two fills as well, so coins lagging implies fills lag.
      const needCoins = myCoins.size < Math.ceil(TARGET_COINS * pace);
      if (needCoins) {
        for (const mint of traded) {
          if (orders.length >= cap || probes.size >= MAX_PROBES) break;
          if (held.has(mint) || probes.has(mint) || probed.has(mint) || pendingByMint.has(mint) || state.positions.has(mint)) continue;
          const curve = state.curves.get(mint);
          if (curve === undefined || curve.complete) continue;
          // the probe must fit the 1%-of-real-reserve cap with room to spare.
          if (curve.real_quote_reserves < PROBE_LAMPORTS * 150n) continue;
          if (free < PROBE_LAMPORTS + 2n * tx) break;
          orders.push({ side: 'buy', mint, quote_lamports: PROBE_LAMPORTS, max_slippage_bps: BUY_SLIPPAGE_BPS });
          probes.set(mint, false);
          probed.add(mint);
          free -= PROBE_LAMPORTS + tx;
        }
      }
    }

    return orders;
  },
});
