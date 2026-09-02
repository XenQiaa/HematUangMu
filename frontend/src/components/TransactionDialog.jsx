import { useEffect, useState } from "react";
import { http } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export default function TransactionDialog({ open, onOpenChange, editing, onSaved }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { http.get("/categories").then(r => setCategories(r.data)); }, []);

  useEffect(() => {
    if (editing) {
      setType(editing.type); setAmount(String(editing.amount));
      setCategory(editing.category); setDescription(editing.description || "");
      setDate(editing.date);
    } else {
      setType("expense"); setAmount(""); setCategory(""); setDescription("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [editing, open]);

  const filteredCats = categories.filter(c => c.type === type);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseInt(String(amount).replace(/[^0-9]/g, ""), 10);
    if (!amt || amt <= 0) { toast.error("Jumlah harus positif"); return; }
    setBusy(true);
    try {
      const payload = { type, amount: amt, category: category || filteredCats[0]?.name || "Lainnya", description, date };
      if (editing) await http.put(`/transactions/${editing.id}`, payload);
      else await http.post("/transactions", payload);
      toast.success(editing ? "Transaksi diperbarui" : "Transaksi ditambahkan");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error("Gagal menyimpan", { description: err.response?.data?.detail || err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="transaction-dialog" className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaksi" : "Tambah Transaksi"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <RadioGroup value={type} onValueChange={(v) => { setType(v); setCategory(""); }} className="grid grid-cols-2 gap-2">
            <label className={`flex items-center gap-2 border rounded-xl p-3 cursor-pointer ${type === "expense" ? "border-rose-400 bg-rose-50" : "border-stone-200"}`}>
              <RadioGroupItem data-testid="type-expense" value="expense" />
              <span className="font-medium text-rose-600">Pengeluaran</span>
            </label>
            <label className={`flex items-center gap-2 border rounded-xl p-3 cursor-pointer ${type === "income" ? "border-emerald-400 bg-emerald-50" : "border-stone-200"}`}>
              <RadioGroupItem data-testid="type-income" value="income" />
              <span className="font-medium text-emerald-600">Pemasukan</span>
            </label>
          </RadioGroup>
          <div>
            <Label>Jumlah (Rp)</Label>
            <Input data-testid="amount-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="15000" className="mt-1.5"/>
          </div>
          <div>
            <Label>Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="category-select" className="mt-1.5"><SelectValue placeholder="Pilih kategori"/></SelectTrigger>
              <SelectContent>{filteredCats.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Deskripsi</Label>
            <Textarea data-testid="description-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kopi susu gula aren, dsb." className="mt-1.5" rows={2}/>
          </div>
          <div>
            <Label>Tanggal</Label>
            <Input data-testid="date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5"/>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button data-testid="save-tx-btn" type="submit" disabled={busy} className="bg-ochre hover:bg-ochre-hover text-white">
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
