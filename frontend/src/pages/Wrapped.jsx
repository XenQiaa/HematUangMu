import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { http, rupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles, Wallet, TrendingUp, TrendingDown, Trophy, Send, X, Calendar, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function Slide({ children, bg, testid }) {
  return (
    <motion.div data-testid={testid}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`absolute inset-0 rounded-3xl p-8 md:p-12 flex flex-col justify-between overflow-hidden ${bg}`}>
      {children}
    </motion.div>
  );
}

export default function Wrapped() {
  const { year, month } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);

  const y = parseInt(year, 10), m = parseInt(month, 10);

  useEffect(() => {
    http.get("/wrapped", { params: { year: y, month: m } }).then(r => setData(r.data)).catch(() => setData({ empty: true }));
  }, [y, m]);

  if (!data) return <div className="min-h-screen flex items-center justify-center bg-stone-900 text-white">Merangkum cerita bulan {MONTH_NAMES[m-1]}…</div>;

  const monthName = MONTH_NAMES[m-1];
  const share = async () => {
    const text = `Wrapped ${monthName} ${y} @ HematUangMu:\n• Pengeluaran: ${rupiah(data.expense || 0)}\n• Aktif: ${data.active_days || 0} hari\n• ${data.tx_count || 0} transaksi tercatat` + (data.story ? `\n\n${data.story}` : "");
    try {
      if (navigator.share) await navigator.share({ title: "HematUangMu Wrapped", text });
      else { await navigator.clipboard.writeText(text); toast.success("Cerita disalin ke clipboard"); }
    } catch {}
  };

  if (data.empty || data.tx_count === 0) {
    return (
      <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Sparkles className="w-10 h-10 mx-auto text-amber-400 mb-3"/>
          <h1 className="text-2xl font-bold">Belum ada cerita di {monthName} {y}</h1>
          <p className="text-white/60 mt-2">Catat beberapa transaksi dulu, nanti kita bikin wrapped-nya!</p>
          <Button onClick={() => nav("/dashboard")} className="mt-6 bg-ochre hover:bg-ochre-hover text-white rounded-full">Kembali ke Dashboard</Button>
        </div>
      </div>
    );
  }

  const slides = [
    // 1. Intro
    (<Slide key="0" testid="wrap-slide-intro" bg="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white">
      <div>
        <div className="text-sm font-mono uppercase tracking-widest text-white/70">HematUangMu · Wrapped</div>
        <div className="text-white/80 text-lg mt-1">{monthName} {y}</div>
      </div>
      <div>
        <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight">Cerita<br/>Uangmu<br/><span className="text-white/70">bulan ini.</span></h1>
        <p className="mt-6 text-white/80 text-lg max-w-md">Kami rangkum apa yang terjadi di dompetmu — swipe untuk lihat 👉</p>
      </div>
    </Slide>),
    // 2. Balance
    (<Slide key="1" testid="wrap-slide-balance" bg="bg-stone-950 text-white">
      <div className="text-xs uppercase tracking-widest text-white/50 font-semibold flex items-center gap-2"><Wallet className="w-3.5 h-3.5"/> Saldo Bersih</div>
      <div>
        <div className={`text-6xl md:text-8xl font-black tracking-tight ${data.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{data.balance >= 0 ? "+" : ""}{rupiah(data.balance)}</div>
        <div className="mt-6 grid grid-cols-2 gap-6 max-w-md">
          <div><div className="text-xs text-white/50 uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Masuk</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{rupiah(data.income)}</div></div>
          <div><div className="text-xs text-white/50 uppercase tracking-widest flex items-center gap-1"><TrendingDown className="w-3 h-3"/> Keluar</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{rupiah(data.expense)}</div></div>
        </div>
      </div>
    </Slide>),
    // 3. Top categories
    (<Slide key="2" testid="wrap-slide-cats" bg="bg-amber-50 text-stone-900">
      <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold flex items-center gap-2"><Trophy className="w-3.5 h-3.5"/> Podium Pengeluaran</div>
      <div className="w-full">
        {data.top_categories.slice(0, 3).map((c, i) => (
          <motion.div key={c.category} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 * (i+1) }}
            className="flex items-center gap-4 py-3 border-b border-stone-200 last:border-0">
            <div className={`w-14 h-14 rounded-2xl font-black text-2xl flex items-center justify-center ${["bg-amber-500 text-white","bg-stone-400 text-white","bg-orange-800 text-white"][i]}`}>#{i+1}</div>
            <div className="flex-1">
              <div className="font-bold text-xl">{c.category}</div>
              <div className="text-stone-500 text-sm">{rupiah(c.amount)}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Slide>),
    // 4. Biggest tx
    (<Slide key="3" testid="wrap-slide-biggest" bg="bg-gradient-to-br from-rose-600 to-rose-800 text-white">
      <div className="text-xs uppercase tracking-widest text-white/60 font-semibold">💥 Transaksi terbesar</div>
      <div>
        {data.biggest_expense ? (<>
          <div className="text-white/70 text-xl">{data.biggest_expense.description || data.biggest_expense.category}</div>
          <div className="text-5xl md:text-7xl font-black mt-2">{rupiah(data.biggest_expense.amount)}</div>
          <div className="text-white/60 text-sm mt-3">{data.biggest_expense.date} · {data.biggest_expense.category}</div>
        </>) : <div className="text-white/70 text-2xl">Tidak ada pengeluaran besar 👏</div>}
      </div>
    </Slide>),
    // 5. Peak day + Telegram
    (<Slide key="4" testid="wrap-slide-habit" bg="bg-tg-blue text-white">
      <div className="text-xs uppercase tracking-widest text-white/70 font-semibold flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Kebiasaanmu</div>
      <div className="space-y-6">
        {data.peak_day && (
          <div>
            <div className="text-white/70 text-lg">Hari paling boros</div>
            <div className="text-5xl md:text-6xl font-black">{data.peak_day.name}</div>
            <div className="text-white/70 mt-1">Total {rupiah(data.peak_day.amount)}</div>
          </div>
        )}
        <div className="flex items-center gap-3 mt-6">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"><MessageCircle className="w-6 h-6"/></div>
          <div>
            <div className="text-3xl font-black">{data.telegram_count}</div>
            <div className="text-sm text-white/70">transaksi lewat chat Telegram</div>
          </div>
        </div>
        <div className="text-white/70 text-sm">Aktif <b className="text-white">{data.active_days} hari</b> tercatat.</div>
      </div>
    </Slide>),
    // 6. Story + share
    (<Slide key="5" testid="wrap-slide-story" bg="bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 text-white">
      <div className="text-xs uppercase tracking-widest text-white/60 font-semibold flex items-center gap-2"><Sparkles className="w-3.5 h-3.5"/> Sedikit cerita</div>
      <div className="space-y-8">
        <p className="text-2xl md:text-3xl font-semibold leading-relaxed">{data.story || `Kamu tercatat aktif ${data.active_days} hari di ${monthName}. Konsisten, lanjut yuk!`}</p>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="wrap-share-btn" onClick={share} className="bg-white text-stone-900 hover:bg-stone-100 rounded-full h-11 px-5">
            <Send className="w-4 h-4 mr-2"/> Bagikan
          </Button>
          <Button onClick={() => nav("/dashboard")} variant="outline" className="border-white/30 text-white hover:bg-white/10 rounded-full h-11 px-5">
            Kembali
          </Button>
        </div>
      </div>
    </Slide>),
  ];

  const total = slides.length;
  const go = (n) => setIdx((idx + n + total) % total);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative">
      {/* Close */}
      <button onClick={() => nav("/dashboard")} data-testid="wrap-close-btn" className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
        <X className="w-4 h-4"/>
      </button>
      {/* Progress bars */}
      <div className="w-full max-w-md flex gap-1 mb-3 z-10">
        {slides.map((_, i) => (
          <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className={`h-full bg-white transition-all ${i < idx ? "w-full" : i === idx ? "w-full" : "w-0"}`}/>
          </div>
        ))}
      </div>
      <div className="relative w-full max-w-md aspect-[9/16] max-h-[85vh]">
        <AnimatePresence mode="wait">{slides[idx]}</AnimatePresence>
      </div>
      <div className="mt-4 flex gap-3">
        <Button data-testid="wrap-prev-btn" onClick={() => go(-1)} size="icon" variant="ghost" className="text-white hover:bg-white/10 rounded-full"><ChevronLeft className="w-5 h-5"/></Button>
        <div className="text-white/50 text-sm self-center font-mono">{idx + 1} / {total}</div>
        <Button data-testid="wrap-next-btn" onClick={() => go(1)} size="icon" variant="ghost" className="text-white hover:bg-white/10 rounded-full"><ChevronRight className="w-5 h-5"/></Button>
      </div>
    </div>
  );
}
