import { useEffect, useState } from "react";
import { http } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Send, Check, Unlink, RefreshCcw, AlertTriangle, MessageCircle, Camera, Mic } from "lucide-react";
import { toast } from "sonner";

export default function TelegramPage() {
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await http.get("/telegram/status");
    setStatus(data);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 4000);
    return () => clearInterval(iv);
  }, []);

  const generate = async () => {
    const { data } = await http.post("/telegram/link-code");
    setCode(data.code);
    toast.success("Kode dibuat. Kirim ke bot dalam 15 menit.");
  };

  const unlink = async () => {
    await http.post("/telegram/unlink");
    setCode(null);
    refresh();
    toast.success("Akun Telegram diputus");
  };

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success("Kode disalin");
  };

  if (loading) return <div className="text-stone-500">Memuat…</div>;

  const botConfigured = status?.bot_configured;
  const botUsername = status?.bot_username;
  const linked = status?.linked;

  return (
    <div className="space-y-6 fade-up max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hubungkan Telegram</h1>
        <p className="text-stone-500 text-sm mt-1">Catat transaksi langsung dari WhatsApp-nya orang efisien: Telegram.</p>
      </div>

      {!botConfigured && (
        <Card className="rounded-2xl border border-amber-300 bg-amber-50">
          <CardContent className="p-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
            <div className="text-sm text-amber-900">
              <div className="font-semibold">Bot Telegram belum dikonfigurasi</div>
              <div className="mt-1 text-amber-800/90">Admin perlu menambahkan <code className="bg-white px-1 rounded">TELEGRAM_BOT_TOKEN</code> di <code className="bg-white px-1 rounded">/app/backend/.env</code>. Buat bot lewat <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, lalu set webhook ke <code className="bg-white px-1 rounded">{`${process.env.REACT_APP_BACKEND_URL}/api/telegram/webhook/<secret>`}</code>. Sementara itu, kamu tetap bisa mencatat cepat via kotak AI di Dashboard.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-tg-blue/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-tg-blue"/>
              </div>
              <div>
                <h3 className="font-bold text-lg">Status Koneksi</h3>
                <div className="text-xs text-stone-500">Refresh otomatis tiap 4 detik</div>
              </div>
            </div>
            {linked ? (
              <div>
                <Badge className="bg-emerald-100 text-emerald-700 border-0 rounded-full">
                  <Check className="w-3 h-3 mr-1"/> Terhubung
                </Badge>
                <div className="mt-3 text-sm text-stone-600">Chat ID: <code className="font-mono">{status?.link?.chat_id}</code></div>
                <Button data-testid="unlink-btn" onClick={unlink} variant="outline" className="mt-4 rounded-full">
                  <Unlink className="w-4 h-4 mr-1.5"/> Putuskan
                </Button>
              </div>
            ) : (
              <div>
                <Badge className="bg-stone-100 text-stone-700 border-0 rounded-full">Belum Terhubung</Badge>
                <div className="mt-3 text-sm text-stone-600">Buat kode, kirim ke bot, selesai dalam 10 detik.</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-6">
            <h3 className="font-bold text-lg mb-3">Kode Hubung</h3>
            {code ? (
              <div>
                <div data-testid="link-code-display" className="font-mono text-4xl font-extrabold tracking-widest text-ochre bg-amber-50 border border-amber-200 rounded-2xl py-6 text-center">
                  {code}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button data-testid="copy-code-btn" onClick={copy} variant="outline" className="flex-1 rounded-full">
                    <Copy className="w-4 h-4 mr-1.5"/> Salin
                  </Button>
                  <Button onClick={generate} variant="ghost" className="rounded-full"><RefreshCcw className="w-4 h-4 mr-1.5"/> Baru</Button>
                </div>
                <p className="mt-3 text-xs text-stone-500">Kadaluarsa dalam 15 menit. Kirim ke bot untuk menautkan.</p>
              </div>
            ) : (
              <Button data-testid="generate-code-btn" onClick={generate} disabled={linked} className="w-full h-12 bg-ochre hover:bg-ochre-hover text-white rounded-xl">
                Buat Kode
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl warm-border bg-white">
        <CardContent className="p-6">
          <h3 className="font-bold text-lg">Cara menghubungkan</h3>
          <ol className="mt-4 space-y-3">
            {[
              { t: `Buka bot Telegram ${botUsername ? `@${botUsername}` : "(setelah dikonfigurasi)"}`, d: botUsername ? <a className="text-tg-blue underline" href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">Buka di Telegram</a> : "Set token dulu di server" },
              { t: "Kirim /start", d: "Bot akan meminta kode 6-digit" },
              { t: "Kirim kode di atas", d: "Bot akan mengonfirmasi keberhasilan" },
              { t: "Mulai catat!", d: "Kirim teks, foto struk, atau voice note kapan saja" },
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-ochre text-white text-xs font-bold flex items-center justify-center shrink-0">{i+1}</div>
                <div><div className="font-semibold text-stone-900">{s.t}</div><div className="text-sm text-stone-500">{s.d}</div></div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        {[
          { i: MessageCircle, t: "Teks natural", d: '"jajan 15k", "bensin 50rb"' },
          { i: Camera, t: "Foto Struk", d: "Kirim foto, AI baca total otomatis" },
          { i: Mic, t: "Voice Note", d: "Rekam suara, transkrip + parsing" },
        ].map((f, i) => (
          <Card key={i} className="rounded-2xl warm-border bg-white">
            <CardContent className="p-5">
              <f.i className="w-5 h-5 text-ochre"/>
              <div className="font-semibold mt-3">{f.t}</div>
              <div className="text-xs text-stone-500 mt-1">{f.d}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
