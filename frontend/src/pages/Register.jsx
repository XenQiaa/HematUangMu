import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, loginWithGoogle, formatApiError } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const [form, setForm] = useState({ name: "", username: "", email: "", phone: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { register } = useAuth();
  const nav = useNavigate();

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await register({
        name: form.name || form.username,
        username: form.username.toLowerCase(),
        email: form.email.toLowerCase(),
        phone: form.phone,
        password: form.password,
      });
      toast.success("Akun berhasil dibuat");
      nav("/dashboard");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || "Gagal daftar");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded-lg bg-ochre flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-xl">HematUangMu<span className="text-ochre">.</span></span>
        </Link>
        <Card className="rounded-2xl warm-border bg-white">
          <CardContent className="p-7">
            <h1 className="text-2xl font-bold tracking-tight">Daftar Gratis</h1>
            <p className="text-sm text-stone-500 mt-1">Bikin akun untuk mulai mencatat.</p>

            <Button data-testid="register-google-btn" onClick={loginWithGoogle} variant="outline" className="w-full mt-6 h-11 rounded-xl border-stone-300">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Daftar dengan Google
            </Button>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-stone-200 flex-1"/><span className="text-xs text-stone-400">atau isi form</span><div className="h-px bg-stone-200 flex-1"/>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Username</Label>
                  <Input data-testid="reg-username" value={form.username} onChange={setF("username")} placeholder="budi_h" className="mt-1.5 h-11" required minLength={3}/>
                </div>
                <div>
                  <Label>Nama Lengkap</Label>
                  <Input data-testid="reg-name" value={form.name} onChange={setF("name")} placeholder="Budi H." className="mt-1.5 h-11"/>
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input data-testid="reg-email" type="email" value={form.email} onChange={setF("email")} placeholder="budi@email.com" className="mt-1.5 h-11" required/>
              </div>
              <div>
                <Label>No. HP</Label>
                <Input data-testid="reg-phone" value={form.phone} onChange={setF("phone")} placeholder="08123456789" className="mt-1.5 h-11" required/>
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative mt-1.5">
                  <Input data-testid="reg-password" type={show ? "text" : "password"} value={form.password} onChange={setF("password")} placeholder="Minimal 6 karakter" className="h-11 pr-10" required minLength={6}/>
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                    {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
              {err && <div data-testid="register-error" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{err}</div>}
              <Button data-testid="register-submit-btn" type="submit" disabled={busy} className="w-full h-11 bg-ochre hover:bg-ochre-hover text-white rounded-xl">
                {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : "Buat Akun"}
              </Button>
            </form>

            <p className="text-sm text-stone-500 mt-5 text-center">
              Sudah punya akun? <Link data-testid="register-to-login-link" to="/login" className="text-ochre font-semibold">Masuk</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
