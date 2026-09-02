import { useState, useRef, useEffect } from "react";
import { http } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Kenapa bulan ini aku boros?",
  "Kategori apa yang paling naik dibanding bulan lalu?",
  "Kasih 3 tips hemat yang cocok buat pola pengeluaranku",
  "Rangkum kondisi keuanganku sekarang",
  "Aku boros di makanan, gimana caranya kurangi?",
];

function renderMd(text) {
  // very light markdown-ish: newlines and bullets
  return text.split("\n").map((line, i) => {
    const bullet = line.match(/^\s*[-•]\s+(.*)/);
    if (bullet) return <li key={i} className="ml-4 list-disc mb-1 leading-relaxed">{bullet[1]}</li>;
    if (!line.trim()) return <div key={i} className="h-2"/>;
    return <p key={i} className="mb-2 leading-relaxed">{line}</p>;
  });
}

export default function Coach() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Halo! Aku Hemat, coach keuanganmu 🧠\nTanya apa saja soal pengeluaran, budget, atau minta tips hemat berdasarkan data kamu." },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const { data } = await http.post("/coach", { question, days: 60 });
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (e) {
      toast.error("Coach gagal", { description: e.response?.data?.detail || e.message });
      setMessages((m) => [...m, { role: "assistant", text: "Maaf, aku lagi kesulitan jawab. Coba lagi sebentar ya." }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="fade-up flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] max-h-[900px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-ochre"/> AI Coach
          </h1>
          <p className="text-stone-500 text-sm mt-1">Ngobrol soal keuanganmu — Hemat baca data kamu dan kasih saran konkret.</p>
        </div>
      </div>

      <Card className="flex-1 rounded-2xl warm-border bg-white overflow-hidden flex flex-col">
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} data-testid={`coach-msg-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-stone-900 text-white rounded-tr-md"
                  : "bg-amber-50 border border-amber-100 text-stone-800 rounded-tl-md"
              }`}>
                {m.role === "assistant" && (
                  <div className="text-[10px] uppercase tracking-widest text-ochre font-bold mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3"/> Hemat AI
                  </div>
                )}
                <div className="text-sm">{renderMd(m.text)}</div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-amber-50 border border-amber-100 rounded-2xl rounded-tl-md px-4 py-3 flex gap-1.5">
                <span className="w-2 h-2 bg-ochre rounded-full pulse-dot"/>
                <span className="w-2 h-2 bg-ochre rounded-full pulse-dot" style={{ animationDelay: "0.2s" }}/>
                <span className="w-2 h-2 bg-ochre rounded-full pulse-dot" style={{ animationDelay: "0.4s" }}/>
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="px-5 pb-3 flex gap-2 flex-wrap">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} data-testid={`coach-suggestion-${i}`} onClick={() => send(s)} disabled={busy}
                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full px-3 py-1.5 border border-stone-200">
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-stone-100 p-3 flex gap-2">
          <Input data-testid="coach-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Tanya apa saja: "kenapa bulan ini boros?"' className="h-11 rounded-xl"/>
          <Button data-testid="coach-send-btn" type="submit" disabled={busy || !q.trim()} className="bg-ochre hover:bg-ochre-hover text-white rounded-xl h-11 px-4">
            {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
          </Button>
        </form>
      </Card>
    </div>
  );
}
