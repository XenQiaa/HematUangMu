import { useEffect, useState, useCallback } from "react";
import { http, rupiah } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Pencil, Plus, Repeat, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Recurring() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "", description: "", day_of_month: 1, active: true });

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([http.get("/recurring"), http.get("/categories")]);
    setRows(r.data); setCats(c.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ type: "expense", amount: "", category: "", description: "", day_of_month: 1, active: true });
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ type: r.type, amount: String(r.amount), category: r.category, description: r.description || "", day_of_month: r.day_of_month, active: r.active });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const amt = parseInt(String(form.amount).replace(/[^0-9]/g, ""), 10);
    if (!amt) { toast.error("Jumlah wajib"); return; }
    const payload = { ...form, amount: amt, day_of_month: parseInt(form.day_of_month, 10) };
    try {
      if (editing) await http.put(`/recurring/${editing.id}`, payload);
      else await http.post("/recurring", payload);
      toast.success(editing ? "Diperbarui" : "Berhasil dibuat");
      setOpen(false); load();
    } catch (e) { toast.error("Gagal", { description: e.response?.data?.detail }); }
  };

  const toggle = async (r) => {
    await http.put(`/recurring/${r.id}`, { ...r, active: !r.active });
    load();
  };

  const del = async () => {
    await http.delete(`/recurring/${toDelete.id}`);
    setToDelete(null); toast.success("Dihapus"); load();
  };

  const filteredCats = cats.filter(c => c.type === form.type);

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tagihan Berulang</h1>
          <p className="text-stone-500 text-sm mt-1">Sekali set, otomatis tercatat tiap bulan.</p>
        </div>
        <Button data-testid="new-recurring-btn" onClick={openNew} className="bg-stone-900 hover:bg-stone-800 rounded-full">
          <Plus className="w-4 h-4 mr-1"/> Baru
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-10 text-center text-stone-500">
            <Repeat className="w-8 h-8 mx-auto mb-2 text-stone-300"/>
            Belum ada tagihan berulang. Coba tambah "Netflix Rp 65.000 tiap tanggal 15".
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map(r => (
            <Card key={r.id} data-testid={`recurring-row-${r.id}`} className="rounded-2xl warm-border bg-white">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex w-8 h-8 rounded-lg items-center justify-center ${r.type === "expense" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
                        <Repeat className="w-4 h-4"/>
                      </span>
                      <div>
                        <div className="font-semibold">{r.description || r.category}</div>
                        <div className="text-xs text-stone-500">{r.category}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-sm">
                      <span className={`font-bold ${r.type === "expense" ? "text-rose-500" : "text-emerald-600"}`}>{rupiah(r.amount)}</span>
                      <span className="text-stone-400">·</span>
                      <span className="text-stone-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> Tanggal {r.day_of_month}</span>
                    </div>
                    <div className="mt-2 text-xs text-stone-400">Berikutnya: {r.next_run}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch data-testid={`recurring-toggle-${r.id}`} checked={r.active} onCheckedChange={() => toggle(r)}/>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4 text-stone-400"/></Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(r)}><Trash2 className="w-4 h-4 text-stone-400"/></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl" data-testid="recurring-dialog">
          <DialogHeader><DialogTitle>{editing ? "Ubah Tagihan Berulang" : "Tagihan Berulang Baru"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <RadioGroup value={form.type} onValueChange={(v) => setForm({ ...form, type: v, category: "" })} className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 border rounded-xl p-3 cursor-pointer ${form.type === "expense" ? "border-rose-400 bg-rose-50" : "border-stone-200"}`}>
                <RadioGroupItem value="expense"/> <span className="font-medium text-rose-600">Pengeluaran</span>
              </label>
              <label className={`flex items-center gap-2 border rounded-xl p-3 cursor-pointer ${form.type === "income" ? "border-emerald-400 bg-emerald-50" : "border-stone-200"}`}>
                <RadioGroupItem value="income"/> <span className="font-medium text-emerald-600">Pemasukan</span>
              </label>
            </RadioGroup>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Jumlah (Rp)</Label>
                <Input data-testid="rec-amount" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="65000" className="mt-1.5" required/>
              </div>
              <div><Label>Tanggal (1-28)</Label>
                <Input data-testid="rec-day" type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} className="mt-1.5" required/>
              </div>
            </div>
            <div><Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="rec-category" className="mt-1.5"><SelectValue placeholder="Pilih kategori"/></SelectTrigger>
                <SelectContent>{filteredCats.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Deskripsi</Label>
              <Textarea data-testid="rec-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Netflix, Sewa Kos, Cicilan Motor" className="mt-1.5" rows={2}/>
            </div>
            <div className="flex items-center gap-3">
              <Switch data-testid="rec-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })}/>
              <span className="text-sm">Aktifkan sekarang</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button data-testid="rec-save-btn" type="submit" className="bg-ochre hover:bg-ochre-hover text-white">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus tagihan berulang?</AlertDialogTitle>
            <AlertDialogDescription>Riwayat transaksi tetap ada, tapi tidak akan dibuat lagi tiap bulan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={del} className="bg-rose-500 hover:bg-rose-600">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
