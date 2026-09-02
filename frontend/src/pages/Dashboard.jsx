import { useEffect, useState, useCallback, useRef } from "react";
import { http, rupiah, today, daysAgo, shortDate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Sparkles, Plus, Send, Camera, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import TransactionDialog from "@/components/TransactionDialog";

const COLORS = ["#D97706", "#E06D53", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6", "#F97316", "#14B8A6"];

const RANGES = [
  { label: "7 Hari", days: 6 },
  { label: "30 Hari", days: 29 },
  { label: "90 Hari", days: 89 },
];

export default function Dashboard() {
  const [range, setRange] = useState(RANGES[1]);
  const [summary, setSummary] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef(null);
  const nav = useNavigate();
  const now = new Date();
  const wrapYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const wrapMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // last completed month

  const load = useCallback(async () => {
    const start = daysAgo(range.days);
    const { data } = await http.get("/analytics/summary", { params: { start, end: today() } });
    setSummary(data);
  }, [range]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const bump = () => setRefreshKey(k => k + 1);

  const submitAI = async (e) => {
    e?.preventDefault();
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await http.post("/parse/text", { text: aiText });
      toast.success(`✅ ${data.description || "Tercatat"} · ${rupiah(data.amount)}`, { description: data.category });
      setAiText("");
      bump();
    } catch (err) {
      toast.error("Gagal parse", { description: err.response?.data?.detail || err.message });
    } finally { setAiLoading(false); }
  };

  const submitPhoto = async (f) => {
    if (!f) return;
    setImgLoading(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await http.post("/parse/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`📸 ${data.description} · ${rupiah(data.amount)}`, { description: data.category });
      bump();
    } catch (err) {
      toast.error("Gagal baca struk", { description: err.response?.data?.detail || err.message });
    } finally { setImgLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  if (!summary) return <div className="p-8 text-stone-500">Memuat…</div>;
  const catData = summary.by_category.slice(0, 8);
  const daily = summary.daily;

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rekap Keuangan</h1>
          <p className="text-stone-500 text-sm mt-1">Ringkasan {range.days + 1} hari terakhir</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range.label} onValueChange={(v) => setRange(RANGES.find(r => r.label === v))}>
            <TabsList data-testid="range-tabs" className="bg-white warm-border">
              {RANGES.map(r => <TabsTrigger key={r.label} value={r.label} data-testid={`range-${r.days}`}>{r.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <Button data-testid="add-transaction-btn" onClick={() => setOpenDialog(true)} className="bg-stone-900 hover:bg-stone-800 rounded-full">
            <Plus className="w-4 h-4 mr-1"/> Tambah
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="rounded-2xl warm-border overflow-hidden bg-gradient-to-br from-stone-900 to-stone-800 text-white">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-wider text-white/60 font-semibold flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5"/> Saldo Bersih
            </div>
            <div data-testid="summary-balance" className="mt-3 text-3xl font-extrabold">{rupiah(summary.balance)}</div>
            <div className="mt-2 text-xs text-white/60">{summary.count} transaksi</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500"/> Pemasukan
            </div>
            <div data-testid="summary-income" className="mt-3 text-3xl font-extrabold text-emerald-600">{rupiah(summary.income)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500"/> Pengeluaran
            </div>
            <div data-testid="summary-expense" className="mt-3 text-3xl font-extrabold text-rose-500">{rupiah(summary.expense)}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI quick-add */}
      <Card className="rounded-2xl warm-border bg-gradient-to-br from-amber-50 to-rose-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
            <Sparkles className="w-4 h-4 text-ochre"/> Catat Cepat dengan AI
            <Badge className="bg-ochre/10 text-ochre border-0">Gemini 3 Flash</Badge>
          </div>
          <form onSubmit={submitAI} className="mt-3 flex flex-col sm:flex-row gap-2">
            <Input
              data-testid="ai-text-input"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder='Contoh: "kopi susu 22rb" atau "gaji bulanan 8.5jt"'
              className="bg-white h-11 rounded-xl"
            />
            <Button data-testid="ai-submit-btn" type="submit" disabled={aiLoading || !aiText.trim()} className="bg-ochre hover:bg-ochre-hover text-white rounded-xl h-11 px-5">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Send className="w-4 h-4 mr-1.5"/> Catat</>}
            </Button>
            <label className="inline-flex">
              <input ref={fileRef} data-testid="ai-photo-input" type="file" accept="image/*" className="hidden" onChange={(e) => submitPhoto(e.target.files?.[0])} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={imgLoading} variant="outline" className="rounded-xl h-11 bg-white">
                {imgLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Camera className="w-4 h-4 mr-1.5"/> Foto Struk</>}
              </Button>
            </label>
          </form>
          <div className="mt-2 flex gap-2 flex-wrap text-xs">
            {["nasi padang 25rb", "grab ke kantor 18k", "bayar listrik 350rb", "gaji april 8jt"].map(s => (
              <button key={s} data-testid={`ai-sample-${s.slice(0,4)}`} onClick={() => setAiText(s)} className="bg-white border border-stone-200 text-stone-600 rounded-full px-3 py-1 hover:bg-stone-50">{s}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 rounded-2xl warm-border bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Tren Harian</h3>
            </div>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.35}/><stop offset="100%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F43F5E" stopOpacity={0.35}/><stop offset="100%" stopColor="#F43F5E" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D8"/>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d?.slice(5) || ""}/>
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1e6 ? `${v/1e6}jt` : v >= 1e3 ? `${v/1e3}k` : v}/>
                  <Tooltip formatter={(v) => rupiah(v)} labelFormatter={(d) => shortDate(d)}/>
                  <Area type="monotone" dataKey="income" stroke="#10B981" fill="url(#inc)" strokeWidth={2}/>
                  <Area type="monotone" dataKey="expense" stroke="#F43F5E" fill="url(#exp)" strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-2xl warm-border bg-white">
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg">Kategori Pengeluaran</h3>
            {catData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-stone-400 text-sm">Belum ada pengeluaran</div>
            ) : (
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={catData} dataKey="amount" nameKey="category" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v) => rupiah(v)}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card onClick={() => nav(`/wrapped/${wrapYear}/${wrapMonth}`)} data-testid="wrapped-cta-card" className="rounded-2xl warm-border overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white cursor-pointer hover:scale-[1.01] transition-transform">
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Trophy className="w-6 h-6"/>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-white/70 font-semibold">Wrapped</div>
              <div className="text-xl font-black">Cerita uangmu di {new Date(wrapYear, wrapMonth-1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</div>
              <div className="text-sm text-white/80 mt-0.5">Ketuk untuk lihat rangkuman visual + share ke teman</div>
            </div>
          </div>
          <Sparkles className="w-5 h-5 opacity-80 shrink-0"/>
        </CardContent>
      </Card>

      <TransactionDialog open={openDialog} onOpenChange={setOpenDialog} onSaved={bump}/>
    </div>
  );
}