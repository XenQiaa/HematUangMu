import { useEffect, useState, useCallback } from "react";
import { http, rupiah, shortDate, today, daysAgo, API } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Plus, Trash2, Pencil, MessageCircle, Camera, Mic, Sparkles } from "lucide-react";
import TransactionDialog from "@/components/TransactionDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const SOURCE_ICON = {
  telegram_text: MessageCircle, telegram_photo: Camera, telegram_voice: Mic,
  web_ai: Sparkles, web_ai_photo: Camera, manual: null,
};

export default function Transactions() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [start, setStart] = useState(daysAgo(29));
  const [end, setEnd] = useState(today());
  const [editing, setEditing] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    const { data } = await http.get("/transactions", { params: { start, end, type: typeFilter, category: catFilter, q } });
    setRows(data);
  }, [q, typeFilter, catFilter, start, end]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { http.get("/categories").then(r => setCategories(r.data)); }, []);

  const doDelete = async () => {
    try {
      await http.delete(`/transactions/${toDelete.id}`);
      toast.success("Transaksi dihapus");
      setToDelete(null); load();
    } catch { toast.error("Gagal menghapus"); }
  };

  const openEdit = (t) => { setEditing(t); setOpenDialog(true); };
  const openNew = () => { setEditing(null); setOpenDialog(true); };

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaksi</h1>
          <p className="text-stone-500 text-sm mt-1">{rows.length} data ditampilkan</p>
        </div>
        <div className="flex gap-2">
          <a data-testid="export-csv-btn" href={`${API}/transactions/export`} className="inline-flex">
            <Button variant="outline" className="rounded-full">
              <Download className="w-4 h-4 mr-1.5"/> Export CSV
            </Button>
          </a>
          <Button data-testid="new-transaction-btn" onClick={openNew} className="bg-stone-900 hover:bg-stone-800 rounded-full">
            <Plus className="w-4 h-4 mr-1"/> Tambah
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl warm-border bg-white">
        <CardContent className="p-4 md:p-5">
          <div className="grid md:grid-cols-6 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
              <Input data-testid="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari deskripsi…" className="pl-9 h-10"/>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="filter-type-select" className="h-10"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                <SelectItem value="expense">Pengeluaran</SelectItem>
                <SelectItem value="income">Pemasukan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger data-testid="filter-category-select" className="h-10"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input data-testid="filter-start-date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10"/>
            <Input data-testid="filter-end-date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10"/>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl warm-border bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-stone-500" data-testid="empty-state">
            <div className="text-4xl mb-3">📭</div>
            <p>Belum ada transaksi pada rentang & filter ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {rows.map(t => {
              const Icon = SOURCE_ICON[t.source] || Plus;
              return (
                <div key={t.id} data-testid={`tx-row-${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-stone-50">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === "expense" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
                    <Icon className="w-4 h-4"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-stone-900 truncate">{t.description || t.category}</div>
                    <div className="text-xs text-stone-500 flex gap-2 items-center">
                      <span>{shortDate(t.date)}</span>
                      <span>·</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded">{t.category}</Badge>
                      {t.source !== "manual" && <span className="text-[10px] text-stone-400">via {t.source.replace("_", " ")}</span>}
                    </div>
                  </div>
                  <div className={`font-bold text-right whitespace-nowrap ${t.type === "expense" ? "text-rose-500" : "text-emerald-600"}`}>
                    {t.type === "expense" ? "-" : "+"}{rupiah(t.amount)}
                  </div>
                  <div className="flex gap-1">
                    <Button data-testid={`edit-tx-${t.id}`} onClick={() => openEdit(t)} size="icon" variant="ghost" className="rounded-lg"><Pencil className="w-4 h-4 text-stone-400"/></Button>
                    <Button data-testid={`delete-tx-${t.id}`} onClick={() => setToDelete(t)} size="icon" variant="ghost" className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400"/></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TransactionDialog open={openDialog} onOpenChange={setOpenDialog} editing={editing} onSaved={load}/>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak bisa dibatalkan. &quot;{toDelete?.description}&quot; akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-btn">Batal</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-btn" onClick={doDelete} className="bg-rose-500 hover:bg-rose-600">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
