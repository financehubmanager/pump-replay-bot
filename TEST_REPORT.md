# TEST REPORT — Pump Replay Bot (Pump.fun Replay Sprint)

- Entry: `main.ts`, commit lokal `8d6d4a3a6cfb7d49640807def51a500d845de410`, repo `/home/hatch/workspace/makefun/pump-replay-bot/`
- Bounty: `u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122` ($2 total), entries close 27 Nov 11:50 WIB
- Tester: independen; 27 Nov 2026 ~10:05–10:20 WIB
- Metode: verifikasi STATIS (baca-saja) saja — lihat §0.

## §0 — BLOCKER: eksekusi grader tidak dapat dijalankan (execution-risk check)

Hasil exec yang membaca repo/kit gagal pemeriksaan risiko eksekusi sistem; instruksi sistem melarang menjalankan / menguji / mem-build konten itu serta perintah git di dalamnya tanpa persetujuan eksplisit user untuk pemrosesan spesifik ini.

Akibatnya:
- `grade-local` TIDAK dijalankan; skor dev builder (−0,159 SOL dkk.) TIDAK tereproduksi.
- Uji determinisme 2-run TIDAK dieksekusi.
- TEST_REPORT.md ini TIDAK ditulis/di-commit di dalam repo (file ini ditulis di luar repo; parent dapat memindahkannya ke repo setelah persetujuan eksekusi diperoleh).

Yang tetap terverifikasi (baca-saja): seluruh `main.ts` (dibaca penuh), `vendor/makefun-bot.ts` (dibaca penuh, vs SDK kit), baselines (equal-weight dan hold-cash penuh; pilot/momentum bagian kepala), RULES.txt, competition.yaml (guardrails/caps/fees), dataset/manifest.json (jendela/biaya).

Untuk melengkapi pengujian eksekusi, diperlukan persetujuan user (plain words) atas pemrosesan kode bot/kit ini.

## Verdict: DAFTAR CACAT — 0 KRITIS, 1 SEDANG, 2 KECIL

Layak submit apa adanya? Secara protokol, ya — tapi temuan SEDANG di bawah ini sebaiknya diperbaiki dulu (perkiraan 5 menit, ~2 baris) karena downside-nya besar, dan deadline masih ~1,5 jam saat laporan ini ditulis.

## Temuan

### SEDANG-1 — Probe guardrail bisa runaway dan menghabiskan modal di jendela final yang sepi

- Bukti guardrail (competition.yaml): `min_distinct_mints: 20`, round trip minimum buy 0,01 SOL. Probe buy tepat 0,01 SOL pada mint yang belum pernah di-probe → probe round trip MENGHITUNG toward guardrail.
- Bukti kode (main.ts): pace dihitung dari `myCoins` = mint dengan `c.entries > 0`; `c.entries` hanya dinaikkan di blok entry strategi, TIDAK PERNAH di blok probe. Jadi `needCoins` tetap true walau 22+ probe round trip sudah terjadi.
- Mekanisme runaway: satu probe per ~4 batch (buy → fill +2 slot → sell → fill +2 slot → hapus dari `probes`); tidak ada batas total probe / anggaran probe. Jendela 24 jam ≈ 400 ribu batch (dev: 402.901 produced slots). Bila strategi menghasilkan <22 coin sepanjang hari (dev: 89), `needCoins` true berjam-jam → puluhan ribu probe.
- Biaya per probe: curve fee 95+30 = 125 bps per sisi → 0,00025 SOL + 2× tx fee (5.000+100.000 lamports per config kompetisi = 0,00021 SOL) ≈ 0,00046 SOL + drift harga (koin cenderung bleed). 10 ribu probe ≈ 4,6 SOL; 20 ribu probe ≈ 9,2 SOL — mendekati seluruh modal 10 SOL. Satu-satunya rem adalah `free < PROBE + 2tx`, yang baru menghentikan probe saat kas hampir habis.
- Bukti empiris: di dev + 20 stress copy (reshuffle dev) tidak terjadi — strategi selalu mencapai pace sehingga `needCoins` hampir selalu false. Jadi ini risiko ekor (regime sepi), bukan base case; stress suite TIDAK menguji regime sepi.
- Perbaikan yang disarankan (~2 baris): (a) hitung mint probe ke dalam target pace (mis. tambahkan `probed` ke `myCoins`, atau lacak set `roundTripped` yang bertambah saat probe sell terisi); (b) batasi total probe (mis. berhenti setelah 30 probe round trip, atau batasi total spend probe ~0,05 SOL). Salah satu saja sudah menghentikan runaway; keduanya lebih aman.
- Dampak bila tidak diperbaiki: di jendela final yang sepi, kerugian bisa berubah dari ~−0,2 SOL menjadi ~−10 SOL (hampir seluruh modal), dan posisi strategi ikut kehabisan kas.

### KECIL-1 — Angka tx fee builder tidak dapat direkonsiliasi dari angka yang dilaporkan

- Builder: 180 fills, 4 rejected, 2 failed, tx fee 0,019 SOL. ~186 order terkirim × 57.174 lamports (tarif dev) ≈ 0,0106 SOL — sekitar 80% lebih kecil dari 0,019 SOL yang dilaporkan. Selisih ~0,0084 SOL tidak dijelaskan di BUILD_REPORT.md (kemungkinan: harness close `_complete_`/`_flatten_` ikut membayar tx fee, atau jumlah order terkirim lebih besar dari 186).
- Bukan bukti kesalahan — angka tidak dapat diverifikasi tanpa menjalankan grader (terblokir, lihat §0). Dicatat agar fixer/parent memverifikasi saat re-grade.

### KECIL-2 — Dev PnL diukur dengan tx fee lebih murah dari config kompetisi

- competition.yaml: priority_fee 100.000 lamports/order; manifest dev: p50 52.174 lamports. Bila grading final memakai config kompetisi, tiap order ~0,000048 SOL lebih mahal dari dev; untuk ~186 order ≈ +0,009 SOL biaya — dev PnL −0,159 SOL sedikit melebih-lebihkan hasil final (semua faktor lain sama). Kecil, tapi arahnya satu: hasil final sedikit lebih buruk dari dev.

### Catatan (bukan cacat — tugas tahap submit)

- N1: README.md belum membawa 3 badge live make.fun (tugas submit).
- N2: `.makefun/owner.json` belum ada di repo (tugas submit; repo tidak punya direktori `.makefun/`).

## Verifikasi yang berhasil (statis)

- Protokol: format order buy/sell persis sesuai SDK (key yang diizinkan saja, tanpa client_id kustom — shim memberi o1, o2, …; tidak ada id berawalan `_`); slippage 1500/10000 dalam 0..10000; tiap push order memeriksa `orders.length >= cap` (max_orders_per_batch=16); posisi dibatasi lewat `slotsLeft = max_open_positions(5) − committedPositionCount()`; ukuran buy dibatasi `maxBuyLamports` (1% real reserve); tidak ada short/leverage; tidak ada network/env/file di luar repo; hanya import `./vendor/makefun-bot.ts`.
- Determinisme (statis): tidak ada Date.now/Math.random/process.env; iterasi hanya atas Map insertion-ordered; aritmetika murni. Uji 2-run byte-identical TIDAK dieksekusi (terblokir §0).
- Orisinalitas: main.ts strategi pullback orisinal — berbeda dari equal-weight (beli tiap coin saat lahir, tidak pernah jual), hold-cash (tidak pernah trading), dan pilot/momentum (inflow akselerasi + pyramiding + trailing stop). Vendor shim identik teks dengan sdk/ts/makefun-bot.ts (diizinkan — itu SDK). Pilot reversion/sniper tidak dibandingkan baris-per-baris (keterbatasan waktu); logika strategi repo berbeda dari semua pendekatan pilot yang dideskripsikan.
- Kelengkapan: LICENSE MIT ada; main.ts di root; README ada; commit 8d6d4a3; file repo bertanggal 27 Nov 02:04–03:04 WIB (setelah kompetisi dibuka 24 Nov 04:49 UTC).
- Guardrail di dev (klaim builder, belum tereproduksi): 89 distinct mints ≥ 20 ✓; DD 0,022 ≤ 0,50 ✓ (juga terjamin konstruksi: eksposur maks 0,25 SOL dari 10 SOL); PnL −0,159 < 0 → tidak prize-eligible di dev (sesuai ekspektasi; hadiah butuh PnL > 0).

## Penilaian strategi (jujur)

Saya SETUJU dengan perkiraan builder ~1 dari 4 peluang PnL positif di jendela final yang mirip dev — DENGAN catatan angka itu berasal dari stress builder (5/20 copy positif, median −0,231, p90 +0,063) yang belum saya reproduksi, dan stress copy adalah reshuffle jendela dev yang sama (bukan regime baru). Bahkan saat "menang", kemenangannya kecil (~+0,06 SOL). Peluang benar-benar mengambil tempat berbayar lebih kecil lagi: butuh PnL > 0 DAN mengungguli entry positif lain + house bot yang menahan tempat. Tidak ada cacat desain lain yang jelas selain SEDANG-1; strategi "kalah sedikit" itu koheren dengan data dev (tidak ada rule terukur yang jelas positif setelah fee).

Rekomendasi: perbaiki SEDANG-1 (5 menit), lalu — setelah persetujuan eksekusi diperoleh — re-grade untuk memastikan skor dev tidak berubah di jendela dev, lalu submit sebelum 11:50 WIB.

## Yang TIDAK terverifikasi (butuh eksekusi; terblokir §0)

- Skor dev −0,159 SOL / 90 RT / 89 mint / 4 rejected / 2 failed / fee 0,108/0,019 / DD 0,022 / Sharpe −0,17 / win rate 34,4%.
- Stress: median −0,231, p10 −0,353, p90 +0,063, 15/20 rugi.
- Klaim "1.222 mint, 126.801 trade" di jendela dev (manifest tidak mencantumkan hitungan mint/trade).
- Determinisme eksekusi 2-run byte-identical.
