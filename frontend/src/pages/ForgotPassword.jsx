import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "@/lib/api";
import { formatApiError, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Wallet, Loader2, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [step, setStep] = useState(1); // 1: identifier, 2: otp + new password
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { refresh } = useAuth();
  const nav = useNavigate();

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await http.post("/auth/forgot-password", { identifier });
      // Assume identifier is either email (use as-is) or ask user to enter their email
      // We ask user to confirm email in step 2 so backend can look up the reset row.
      const looksLikeEmail = identifier.includes("@");
      setEmail(looksLikeEmail ? identifier.toLowerCase().trim() : "");
      setStep(2);
      toast.success("Cek email kamu untuk kode 6-digit");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || "Gagal kirim kode");
    } finally { setBusy(false); }
  };

  const doReset = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await http.post("/auth/reset-password", { email: email.toLowerCase().trim(), otp, new_password: pw });
      toast.success("Password berhasil direset");
      await refresh();
      nav("/dashboard");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || "Gagal reset password");
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setErr("");
    try {
      await http.post("/auth/forgot-password", { identifier: email || identifier });
      toast.success("Kode baru dikirim");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || "Gagal kirim ulang");
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
            <Link to="/login" className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mb-4">
              <ArrowLeft className="w-3.5 h-3.5"/> Kembali ke Masuk
            </Link>

            {step === 1 ? (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Lupa Password</h1>
                <p className="text-sm text-stone-500 mt-1">Masukkan email, username, atau nomor HP. Kami kirim kode 6-digit ke email terdaftar.</p>
                <form onSubmit={sendCode} className="mt-6 space-y-4">
                  <div>
                    <Label>Email / Username / No. HP</Label>
                    <Input data-testid="forgot-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="kamu@email.com" className="mt-1.5 h-11" required/>
                  </div>
                  {err && <div data-testid="forgot-error" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{err}</div>}
                  <Button data-testid="forgot-send-btn" type="submit" disabled={busy || !identifier.trim()} className="w-full h-11 bg-ochre hover:bg-ochre-hover text-white rounded-xl">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Mail className="w-4 h-4 mr-1.5"/> Kirim Kode</>}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Masukkan Kode</h1>
                <p className="text-sm text-stone-500 mt-1">Kami sudah kirim kode 6-digit ke email <b>{email || "terdaftar"}</b>. Berlaku 15 menit.</p>
                <form onSubmit={doReset} className="mt-6 space-y-4">
                  {!email && (
                    <div>
                      <Label>Email Terdaftar</Label>
                      <Input data-testid="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kamu@email.com" className="mt-1.5 h-11" required/>
                    </div>
                  )}
                  <div>
                    <Label>Kode OTP</Label>
                    <div data-testid="reset-otp" className="mt-2 flex justify-center">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="reset-otp-input">
                        <InputOTPGroup>
                          <InputOTPSlot index={0}/><InputOTPSlot index={1}/><InputOTPSlot index={2}/>
                        </InputOTPGroup>
                        <InputOTPSeparator/>
                        <InputOTPGroup>
                          <InputOTPSlot index={3}/><InputOTPSlot index={4}/><InputOTPSlot index={5}/>
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  <div>
                    <Label>Password Baru</Label>
                    <div className="relative mt-1.5">
                      <Input data-testid="reset-new-password" type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Minimal 6 karakter" className="h-11 pr-10" required minLength={6}/>
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                        {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>
                  {err && <div data-testid="reset-error" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{err}</div>}
                  <Button data-testid="reset-submit-btn" type="submit" disabled={busy || otp.length !== 6 || pw.length < 6} className="w-full h-11 bg-ochre hover:bg-ochre-hover text-white rounded-xl">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : "Simpan Password Baru"}
                  </Button>
                  <div className="text-center text-sm text-stone-500">
                    Tidak dapat kode? <button type="button" data-testid="resend-otp-btn" onClick={resend} disabled={busy} className="text-ochre font-semibold hover:underline">Kirim ulang</button>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
