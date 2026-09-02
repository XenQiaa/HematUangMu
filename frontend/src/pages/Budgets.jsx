import { useEffect, useState, useCallback } from "react";
import { http, rupiah } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Target, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Budgets() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([http.get("/budgets"), http.get("/categories")]);
    setRows(b.data);
    setCats(c.data.filter((x) => x.type === "expense"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const n = parseInt(String(limit).replace(/[^0-9]/g, ""), 10);
    if (!category || !n) { toast.error("Kategori & limit wajib"); return; }
    setBusy(true);
    try {
      await http.post("/budgets", { category, monthly_limit: n });
      toast.success("Budget tersimpan");
      setCategory(""); setLimit(""); load();
    } catch (e) { toast.error("Gagal menyimpan"); }
    finally { setBusy(false); }
  };

  const del = async (cat) => {
    await http.delete(`/budgets/${encodeURIComponent(cat)}`);
    toast.success("Budget dihapus"); load();
  };

  const totalLimit = rows.reduce((s, r) => s + (r.monthly_limit || 0), 0);
  const totalSpent = rows.reduce((s, r) => s + (r.spent || 0), 0);

  return (
    <div className="space-y-6 fade-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Budget Bulanan</h1>
        <p className="text-stone-500 text-sm mt-1">Tetapkan limit per kategori. Bot Telegram akan ingatkan saat mendekati batas.</p>
      </div>

      {rows.length > 0 && (
        <Card className="rounded-2xl warm-border bg-gradient-to-br from-stone-900 to-stone-800 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60 font-semibold flex items-center gap-2"><Target className="w-3.5 h-3.5"/> Total Budget</div>
                <div data-testid="budget-total-spent" className="text-3xl font-extrabold mt-2">{rupiah(totalSpent)}</div>
                <div className="text-xs text-white/60 mt-1">dari {rupiah(totalLimit)}</div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-extrabold">{totalLimit ? Math.round(totalSpent * 100 / totalLimit) : 0}<span className="text-xl">%</span></div>
              </div>
            </div>
            <Progress value={totalLimit ? Math.min(100, totalSpent * 100 / totalLimit) : 0} className="mt-4 bg-white/10"/>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl warm-border bg-white">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4"/> Tambah / Ubah Budget</h3>
          <form onSubmit={save} className="grid md:grid-cols-3 gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="budget-category-select" className="h-11"><SelectValue placeholder="Pilih kategori"/></SelectTrigger>
              <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input data-testid="budget-limit-input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Limit Rp (contoh: 1000000)" className="h-11"/>
            <Button data-testid="budget-save-btn" type="submit" disabled={busy} className="bg-ochre hover:bg-ochre-hover text-white h-11 rounded-xl">Simpan</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <Card className="rounded-2xl warm-border bg-white">
            <CardContent className="p-10 text-center text-stone-500">
              <Target className="w-8 h-8 mx-auto mb-2 text-stone-300"/>
              Belum ada budget. Tetapkan limit pertama supaya bot bisa bantu ingatkan.
            </CardContent>
          </Card>
        ) : (
          rows.map(r => {
            const pct = r.percent || 0;
            const color = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <Card key={r.category} data-testid={`budget-row-${r.category}`} className="rounded-2xl warm-border bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-stone-900">{r.category}</div>
                      <div className="text-xs text-stone-500 mt-0.5">{rupiah(r.spent || 0)} dari {rupiah(r.monthly_limit)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-xl font-bold ${pct >= 100 ? "text-rose-500" : pct >= 80 ? "text-amber-600" : "text-stone-800"}`}>{pct}%</div>
                      <Button data-testid={`budget-delete-${r.category}`} size="icon" variant="ghost" onClick={() => del(r.category)} className="text-stone-400 hover:text-rose-500">
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }}/>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
