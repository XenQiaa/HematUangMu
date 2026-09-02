# CatatYuk AI - Rekap Keuangan Telegram

## Original Problem Statement
> "Saya ingin membuat website rekap keuangan, yang terhubung dengan ai di whatsapp apakah bisa? jadi saya hanya perlu mencatat di whatsapp misalnya 'jajan 15k' maka akan langsung di catat sebagai pengeluaran di website tersebut sebesar Rp. 15.000. Saya ingin buat juga ai nya bisa detect dari foto struk dan voice note"

## User Choices
- Telegram Bot (bukan WhatsApp) — instan & gratis
- Emergent LLM Key + Gemini 3 Flash (teks & foto) + OpenAI Whisper (voice)
- Emergent Google Login (1-klik)
- Bahasa Indonesia, mata uang Rupiah
- Fitur MVP: Dashboard grafik, kategori otomatis, filter tanggal, export CSV
- Deteksi AI: teks natural, foto struk, voice note

## Architecture
- Backend: FastAPI (Python), MongoDB via Motor, semua route `/api/`
- Frontend: React 19, Tailwind, shadcn/ui, recharts, framer-motion, sonner
- AI: `emergentintegrations` (Gemini 3 Flash multimodal + Whisper STT)
- Telegram: webhook receiver via `httpx` (bot token opsional; UI web tetap penuh berfungsi tanpa token)

## What's Been Implemented (2026-02-02)
- Landing page (Indonesian, warm/earthy theme, interactive Telegram mockup)
- Google Sign-in flow + AuthCallback (URL-hash detection)
- Dashboard: 3 summary cards (balance/income/expense), AI quick-add (teks + foto struk), area chart daily trend, pie chart category
- Transactions page: search + filters (type, category, tanggal), edit/delete, CSV export
- Telegram linking page: 6-char pairing code, connection status auto-refresh, unlink
- Telegram bot webhook: parse teks/foto/voice → simpan transaksi + reply konfirmasi
- 12 default categories in Indonesian
- Currency formatter Rp, converts 15k/50rb/1.5jt → integer rupiah via Gemini

## Test Report
`/app/test_reports/iteration_1.json` — 100% pass (backend + frontend).

## Prioritized Backlog
### P0 (blockers before real usage)
- Provide/configure TELEGRAM_BOT_TOKEN & set webhook (user action)

### P1 (next iteration)
- Budget bulanan per kategori + notifikasi via Telegram (rem push)
- Recurring transactions (langganan Netflix, dll)
- Multi-currency / multi-account (dompet/rekening/e-wallet)
- Monthly report PDF via Telegram command `/rekap`

### P2 (nice-to-have)
- Web PWA + offline manual entry
- Family/shared wallet
- OCR pengenalan itemized (list belanja) dari struk
- Dark mode toggle
