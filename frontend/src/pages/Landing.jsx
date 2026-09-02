import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loginWithGoogle, useAuth } from "@/lib/auth";
import { Send, Mic, Camera, Wallet, ArrowRight, MessageCircle, Sparkles, Zap, Shield, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SAMPLE_CHATS = [
  { me: "jajan 15k", bot: "💸 Tercatat • Rp 15.000 • Makanan & Minuman" },
  { me: "bensin pertamax 50rb", bot: "💸 Tercatat • Rp 50.000 • Transportasi" },
  { me: "gaji bulanan 8.5jt", bot: "💰 Tercatat • Rp 8.500.000 • Gaji" },
  { me: "kopi susu gula aren 22rb", bot: "💸 Tercatat • Rp 22.000 • Makanan & Minuman" },
];

export default function Landing() {
  const [chatIdx, setChatIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();

  const cycle = () => {
    setTyping(true);
    setTimeout(() => {
      setChatIdx((i) => (i + 1) % SAMPLE_CHATS.length);
      setTyping(false);
    }, 800);
  };

  const active = SAMPLE_CHATS[chatIdx];

  return (
    <div className="min-h-screen bg-cream relative">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-cream/80 border-b border-stone-200/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-ochre flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold tracking-tight text-lg">CatatYuk<span className="text-ochre">.</span></span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button data-testid="nav-dashboard-btn" onClick={() => nav("/dashboard")} className="bg-ochre hover:bg-ochre-hover text-white rounded-full">
                Buka Dashboard <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button data-testid="nav-login-btn" onClick={loginWithGoogle} className="bg-ochre hover:bg-ochre-hover text-white rounded-full h-10 px-5">
                Masuk dengan Google
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <Badge className="bg-terracotta/10 text-terracotta hover:bg-terracotta/10 border-0 rounded-full mb-5">
            <Sparkles className="w-3 h-3 mr-1" /> AI · Telegram · Rupiah
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-stone-900">
            Catat keuangan<br/>secepat <span className="text-ochre">kirim chat.</span>
          </h1>
          <p className="mt-6 text-lg text-stone-600 leading-relaxed max-w-xl">
            Cukup kirim <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded">&quot;jajan 15k&quot;</span> ke bot Telegram — CatatYuk AI otomatis mencatatnya sebagai pengeluaran Rp 15.000 di dashboard kamu.
            Foto struk & voice note juga bisa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button data-testid="hero-start-btn" onClick={user ? () => nav("/dashboard") : loginWithGoogle} className="bg-stone-900 hover:bg-stone-800 text-white rounded-full h-12 px-7 text-base">
              Mulai Gratis <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button data-testid="hero-demo-btn" onClick={cycle} variant="outline" className="rounded-full h-12 px-6 border-stone-300 text-base">
              Lihat Demo Live
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-5 text-sm text-stone-500">
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4"/> Data pribadi</span>
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4"/> Instan</span>
            <span className="flex items-center gap-1.5"><LineChart className="w-4 h-4"/> Grafik & CSV</span>
          </div>
        </div>

        {/* Phone mockup */}
        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-to-br from-terracotta/20 via-amber-200/40 to-emerald-100/60 rounded-[3rem] blur-2xl" />
          <div className="relative bg-white warm-border rounded-[2.2rem] p-4 shadow-xl">
            <div className="bg-tg-blue rounded-t-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-white font-semibold text-sm">CatatYuk Bot</div>
                <div className="text-white/70 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 pulse-dot"/> aktif sekarang
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3 min-h-[320px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23f5f2ec%22%2F%3E%3C%2Fsvg%3E')]">
              <motion.div key={`me-${chatIdx}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                <div className="bg-tg-blue text-white rounded-2xl rounded-tr-md px-4 py-2 max-w-[75%] shadow-sm">
                  <div className="text-sm font-medium">{active.me}</div>
                </div>
              </motion.div>
              {typing ? (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm flex gap-1.5">
                    <span className="w-2 h-2 bg-stone-400 rounded-full pulse-dot"/>
                    <span className="w-2 h-2 bg-stone-400 rounded-full pulse-dot" style={{ animationDelay: "0.2s" }}/>
                    <span className="w-2 h-2 bg-stone-400 rounded-full pulse-dot" style={{ animationDelay: "0.4s" }}/>
                  </div>
                </div>
              ) : (
                <motion.div key={`bot-${chatIdx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-2 max-w-[75%] shadow-sm border border-stone-100">
                    <div className="text-sm text-stone-800 leading-relaxed">{active.bot}</div>
                  </div>
                </motion.div>
              )}
              <div className="pt-4 flex gap-2 flex-wrap">
                {["jajan 15k", "bensin 50rb", "gaji 8.5jt"].map((s, i) => (
                  <button key={i} onClick={() => { setChatIdx(SAMPLE_CHATS.findIndex(c => c.me === s) || 0); cycle(); }}
                    className="text-xs bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:bg-stone-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-stone-100 p-3 flex items-center gap-2">
              <div className="flex-1 bg-stone-50 rounded-full px-4 py-2 text-sm text-stone-400">Ketik pesan…</div>
              <div className="w-9 h-9 bg-tg-blue rounded-full flex items-center justify-center">
                <Send className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-stone-200/60">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
            Tiga cara cepat, satu <span className="text-ochre">dashboard</span> rapi.
          </h2>
          <p className="mt-3 text-stone-600 text-lg">AI CatatYuk mengerti bahasa sehari-hari kamu, baca struk otomatis, sampai transkrip voice note.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          {[
            { icon: MessageCircle, title: "Chat Teks", desc: "Kirim 'kopi 22rb' atau 'bensin pertamax 50 ribu' — otomatis kategori & tercatat.", color: "bg-amber-100 text-ochre" },
            { icon: Camera, title: "Foto Struk", desc: "Jepret struk belanja, AI ekstrak total dan menyimpan sebagai pengeluaran.", color: "bg-rose-100 text-terracotta" },
            { icon: Mic, title: "Voice Note", desc: "Rekam suara 'tadi bayar parkir 5000' — transkrip + parsing otomatis.", color: "bg-emerald-100 text-emerald-700" },
          ].map((f, i) => (
            <Card key={i} className="p-6 rounded-2xl warm-border bg-white hover:-translate-y-1 transition-transform">
              <div className={`w-11 h-11 rounded-xl ${f.color} flex items-center justify-center`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="mt-5 font-bold text-lg">{f.title}</h3>
              <p className="mt-2 text-stone-600 text-sm leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-stone-200/60">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">Cara Pakai</h2>
        <div className="grid md:grid-cols-3 gap-8 mt-12">
          {[
            { n: "01", t: "Masuk Google", d: "Login satu klik. Data langsung terpisah aman per akun." },
            { n: "02", t: "Hubungkan Telegram", d: "Salin kode 6-digit, kirim ke bot. Selesai dalam 10 detik." },
            { n: "03", t: "Chat & Catat", d: "Kirim teks, foto, atau voice — dashboard update real-time." },
          ].map((s, i) => (
            <div key={i} className="relative">
              <div className="font-mono text-6xl font-extrabold text-ochre/20">{s.n}</div>
              <h3 className="mt-2 font-bold text-xl">{s.t}</h3>
              <p className="mt-2 text-stone-600 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 text-center">
          <Button data-testid="cta-bottom-btn" onClick={user ? () => nav("/dashboard") : loginWithGoogle} className="bg-ochre hover:bg-ochre-hover text-white rounded-full h-12 px-8 text-base">
            Coba Sekarang, Gratis <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-stone-200/60 py-8 text-center text-sm text-stone-500">
        <div>© 2026 CatatYuk. Dibuat dengan ❤ untuk pencatatan keuangan tanpa ribet.</div>
      </footer>
    </div>
  );
}
