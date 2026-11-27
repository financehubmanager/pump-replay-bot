# FIX REPORT — Pump Replay Bot (Pump.fun Replay Sprint)

- Entry: `main.ts`, builder commit `8d6d4a3a6cfb7d49640807def51a500d845de410`, repo `/home/hatch/workspace/makefun/pump-replay-bot/`
- Bounty: `u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122` ($2 total), entries close 27 Nov 11:50 WIB
- Fixer: 27 Nov 2026 ~10:20–10:35 WIB
- Tester report applied: `/home/hatch/workspace/makefun/TEST_REPORT-pump-replay-bot.md` (0 KRITIS, 1 SEDANG, 2 KECIL), copied into the repo as `TEST_REPORT.md`

## 1. SEDANG-1 — diperbaiki: probe guardrail tidak bisa runaway lagi

Perubahan di `main.ts` (minimal, strategi pullback tidak disentuh):

1. Konstanta baru: `MAX_TOTAL_PROBES = 30` — hard cap jumlah probe round trip yang pernah dibuka selama run.
2. Blok pacing: mint yang di-probe kini dihitung ke target pace — `for (const mint of probed) myCoins.add(mint);` — jadi `needCoins` tidak bisa tetap true berjam-jam setelah probe sudah berjalan. (Probe round trip memang dihitung guardrail sebagai round trip, jadi ini sah.)
3. Kondisi pacing ditambah `probed.size < MAX_TOTAL_PROBES` — begitu 30 probe tercapai, tidak ada probe baru apa pun yang terjadi.
4. Komentar header diperbarui menjelaskan kedua rem ini dan alasannya.

Efek batas: worst case probe kini 30 round trip × ~0,00046 SOL biaya ≈ 0,014 SOL — bukan ~10 SOL. Satu rem saja sudah menghentikan runaway; keduanya dipasang sesuai saran tester.

## 2. KECIL-1 — TERVERIFIKASI (bukan cacat): angka tx fee builder direkonsiliasi persis

Re-grade menunjukkan biaya tx per order yang dikirim = **105.000 lamports** (priority fee 100.000 + base 5.000 dari config kompetisi; grader memberi flag `fee_fallback`). Order yang ditolak pre-submit tidak membayar; order yang gagal tetap membayar (tx gagal di Solana tetap dikenakan fee).

- Run builder: 180 fills + 2 failed = 182 tx berbayar × 105.000 = 19.110.000 lamports = **0,01911 SOL** — persis angka builder (0,019 SOL).
- Run pasca-perbaikan: 176 fills + 2 failed = 178 × 105.000 = 18.690.000 = **0,01869 SOL** — persis angka re-grade.

Selisih yang dicatat tester (~0,0084 SOL) berasal dari perkalian dengan tarif p50 manifest dev (52.174 lamports) — tarif itu bukan yang dipakai grader. Tidak ada biaya close/flatten misterius yang perlu dijelaskan; tidak ada perbaikan kode.

## 3. KECIL-2 — TERVERIFIKASI, premisnya terbalik: dev PnL SUDAH memakai fee kompetisi

Tester memperkirakan grading final akan ~0,009 SOL lebih mahal dari dev karena config kompetisi (100.000 lamports) vs manifest dev (p50 52.174). Re-grade membuktikan sebaliknya: dev grade **sudah** memakai fee config (105.000 lamports/order, flag `fee_fallback`), jadi angka dev −0,159 SOL sudah mencerminkan biaya final pada sumbu ini. Tidak ada koreksi −0,009 SOL tambahan yang menunggu di final. Tidak ada perbaikan kode.

## 4. Tugas tahap submit (dilakukan fixer)

- `README.md`: 3 badge live make.fun di atas (bounty, rank, reward) + sub-line "Entered on make.fun".
- `.makefun/owner.json` dibuat: `{"wallet": "5XrS76uzjrhf9pyMBVQpfL1SpyxX7Dk8vyFUncED2o39"}`.
- `TEST_REPORT.md`: salinan laporan tester di dalam repo.

## 5. Verifikasi — re-grade grade-local (--driver process, --worktree)

| | Builder (commit 8d6d4a3) | Setelah perbaikan (worktree) |
|---|---|---|
| Net PnL | −0,159098 SOL | **−0,160877 SOL** |
| Round trips / fills | 90 / 180 | 88 / 176 |
| Distinct mints | 89 | 88 |
| Win rate | 34,4% | 34,1% |
| Max drawdown | 0,0223 | 0,0223 |
| Rejected / failed | 4 / 2 | 3 / 2 |
| Curve fees / tx fees | 0,10775 / 0,01911 SOL | 0,10722 / 0,01869 SOL |
| Guardrails | 89 koin ≥ 20 ✓, DD ✓ | 88 koin ≥ 20 ✓, DD ✓ |
| Eligible | ranked ya, prize tidak (PnL < 0) | sama |
| Determinisme | L1 regrade byte-identical | L1 regrade byte-identical |

Perbaikan mengorbankan 0,0018 SOL di dev (2 round trip probe lebih sedikit — persis efek yang diinginkan: pace tercapai lebih cepat, probe berhenti lebih awal). Itu ~1% dari skor dan jauh di dalam noise antar-jendela (stress spread builder: median −0,231, p90 +0,063). Guardrail tetap terpenuhi, determinisme tetap byte-identical.

## Penilaian jujur

Entry siap submit. Risiko ekor SEDANG-1 sudah ditutup dengan biaya dev yang dapat diabaikan (0,0018 SOL). Strategi tetap "kalah sedikit" di dev (−0,161 SOL) seperti sebelumnya — peluang prize tetap bergantung pada jendela final yang lebih bersahabat, bukan pada perbaikan ini. Tidak ada cacat tester yang tersisa.
