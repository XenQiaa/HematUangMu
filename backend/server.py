"""HematUangMu - Rekap Keuangan Telegram backend."""
from fastapi import FastAPI, APIRouter, Request, HTTPException, Response, Cookie, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, io, csv, json, uuid, random, string, base64, logging, tempfile, re, subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any
from pydantic import BaseModel, Field, EmailStr
import httpx, bcrypt, jwt, resend, asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_WEBHOOK_SECRET = os.environ.get('TELEGRAM_WEBHOOK_SECRET', 'secret')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change_me')
JWT_ALG = "HS256"
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api = APIRouter(prefix="/api")

logger = logging.getLogger("hematuangmu")
logging.basicConfig(level=logging.INFO)

DEFAULT_CATEGORIES = [
    {"name": "Makanan & Minuman", "icon": "Utensils", "color": "#F59E0B", "type": "expense"},
    {"name": "Transportasi", "icon": "Car", "color": "#3B82F6", "type": "expense"},
    {"name": "Belanja", "icon": "ShoppingBag", "color": "#EC4899", "type": "expense"},
    {"name": "Tagihan & Utilitas", "icon": "Receipt", "color": "#8B5CF6", "type": "expense"},
    {"name": "Hiburan", "icon": "Film", "color": "#10B981", "type": "expense"},
    {"name": "Kesehatan", "icon": "HeartPulse", "color": "#EF4444", "type": "expense"},
    {"name": "Pendidikan", "icon": "BookOpen", "color": "#0EA5E9", "type": "expense"},
    {"name": "Lainnya", "icon": "MoreHorizontal", "color": "#78716C", "type": "expense"},
    {"name": "Gaji", "icon": "Wallet", "color": "#059669", "type": "income"},
    {"name": "Bonus", "icon": "Gift", "color": "#F97316", "type": "income"},
    {"name": "Investasi", "icon": "TrendingUp", "color": "#14B8A6", "type": "income"},
    {"name": "Pendapatan Lain", "icon": "Coins", "color": "#84CC16", "type": "income"},
]

# ---------------- Models ----------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None
    auth_method: Optional[str] = "google"
    created_at: Any = None

class Transaction(BaseModel):
    id: str
    user_id: str
    type: str  # expense | income
    amount: int  # in IDR (integer)
    category: str
    description: str = ""
    date: str  # ISO date YYYY-MM-DD
    source: str = "manual"  # manual | telegram_text | telegram_photo | telegram_voice | web_ai
    created_at: str

class TransactionCreate(BaseModel):
    type: str
    amount: int
    category: str
    description: Optional[str] = ""
    date: Optional[str] = None

class ParseTextIn(BaseModel):
    text: str

# ---------------- Helpers ----------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_jwt(user_id: str, days: int = 7) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=days), "type": "access"},
        JWT_SECRET, algorithm=JWT_ALG,
    )

def norm_phone(p: str) -> str:
    p = re.sub(r"[^\d+]", "", p or "")
    if p.startswith("0"): p = "+62" + p[1:]
    if p.startswith("62"): p = "+" + p
    return p

async def get_current_user(request: Request) -> User:
    # Try JWT access_token first
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            user_doc = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
            if user_doc:
                return User(**user_doc)
        except jwt.ExpiredSignatureError:
            pass
        except jwt.InvalidTokenError:
            pass
    # Fallback: session_token (Google OAuth)
    stoken = request.cookies.get("session_token")
    if not stoken:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            stoken = auth[7:]
    if stoken:
        session = await db.user_sessions.find_one({"session_token": stoken}, {"_id": 0})
        if session:
            expires_at = session["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at >= datetime.now(timezone.utc):
                user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
                if user_doc:
                    return User(**user_doc)
    raise HTTPException(401, "Not authenticated")

async def ensure_categories(user_id: str):
    exists = await db.categories.count_documents({"user_id": user_id})
    if exists == 0:
        docs = [{"id": str(uuid.uuid4()), "user_id": user_id, **c} for c in DEFAULT_CATEGORIES]
        await db.categories.insert_many(docs)

def gen_link_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))

def rupiah(n: int) -> str:
    return "Rp " + f"{int(n):,}".replace(",", ".")

# ---------------- Auth ----------------
@api.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id required")
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Failed to verify session")
    data = r.json()
    email = data["email"]
    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data["name"],
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await ensure_categories(user_id)
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 60 * 60,
    )
    return {"user_id": user_id, "email": email, "name": data["name"], "picture": data.get("picture")}

@api.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    return user.model_dump()

@api.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: EmailStr
    phone: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = None

class LoginIn(BaseModel):
    identifier: str
    password: str

def _set_access_cookie(response: Response, user_id: str):
    token = make_jwt(user_id)
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 60 * 60,
    )
    return token

@api.post("/auth/register")
async def auth_register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    username = payload.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_.]{3,32}", username):
        raise HTTPException(400, "Username hanya huruf kecil, angka, . dan _")
    phone = norm_phone(payload.phone)
    if not re.fullmatch(r"\+?\d{8,20}", phone):
        raise HTTPException(400, "Nomor HP tidak valid")
    # uniqueness
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email sudah terdaftar")
    if await db.users.find_one({"username": username}):
        raise HTTPException(409, "Username sudah dipakai")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(409, "Nomor HP sudah terdaftar")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "phone": phone,
        "name": payload.name or username,
        "picture": None,
        "password_hash": hash_pw(payload.password),
        "auth_method": "password",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await ensure_categories(user_id)
    _set_access_cookie(response, user_id)
    return {"user_id": user_id, "email": email, "username": username, "phone": phone, "name": doc["name"], "picture": None}

@api.post("/auth/login")
async def auth_login(payload: LoginIn, response: Response):
    ident = payload.identifier.strip()
    ident_l = ident.lower()
    # Match by email, username, or phone
    q_or = [{"email": ident_l}, {"username": ident_l}]
    phone_try = norm_phone(ident)
    if phone_try:
        q_or.append({"phone": phone_try})
    user_doc = await db.users.find_one({"$or": q_or})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(401, "Akun tidak ditemukan atau belum punya password. Coba login Google.")
    if not verify_pw(payload.password, user_doc["password_hash"]):
        raise HTTPException(401, "Password salah")
    _set_access_cookie(response, user_doc["user_id"])
    await ensure_categories(user_doc["user_id"])
    return {
        "user_id": user_doc["user_id"], "email": user_doc["email"],
        "username": user_doc.get("username"), "phone": user_doc.get("phone"),
        "name": user_doc.get("name"), "picture": user_doc.get("picture"),
    }


class ForgotIn(BaseModel):
    identifier: str  # email or username or phone

class ResetIn(BaseModel):
    email: EmailStr
    otp: str
    new_password: str = Field(min_length=6, max_length=128)


def _otp_email_html(name: str, otp: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,Helvetica,sans-serif;color:#1C1917">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E7E2D8;border-radius:16px;overflow:hidden">
        <tr><td style="padding:32px 32px 8px">
          <div style="display:inline-block;background:#D97706;color:#fff;font-weight:800;padding:6px 12px;border-radius:8px;font-size:14px">HematUangMu</div>
        </td></tr>
        <tr><td style="padding:12px 32px 8px">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#1C1917">Kode Reset Password</h1>
          <p style="margin:8px 0 0;color:#57534E;font-size:14px;line-height:1.6">Halo <b>{name}</b>, kamu meminta reset password. Masukkan kode 6 digit di bawah ke halaman reset password.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px" align="center">
          <div style="background:#FFF7ED;border:2px dashed #F59E0B;border-radius:12px;padding:20px 12px;margin:16px 0">
            <div style="font-family:'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:12px;color:#D97706">{otp}</div>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;color:#78716C;font-size:13px;line-height:1.6">Kode ini berlaku <b>15 menit</b>. Jangan bagikan ke siapa pun. Kalau kamu tidak minta reset, abaikan email ini — akunmu tetap aman.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;border-top:1px solid #F5F5F4">
          <p style="margin:0;color:#A8A29E;font-size:12px">© 2026 HematUangMu · Rekap keuangan tanpa ribet</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def _send_otp_email(to_email: str, name: str, otp: str) -> bool:
    if not RESEND_API_KEY:
        logger.warning(f"[DEV] OTP for {to_email}: {otp} (RESEND_API_KEY not set)")
        return False
    params = {
        "from": f"HematUangMu <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"Kode Reset Password: {otp}",
        "html": _otp_email_html(name, otp),
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"OTP email sent to {to_email}: {result.get('id')}")
        return True
    except Exception as e:
        logger.error(f"Resend send error: {e}")
        return False


@api.post("/auth/forgot-password")
async def auth_forgot(payload: ForgotIn):
    ident = payload.identifier.strip()
    ident_l = ident.lower()
    q_or = [{"email": ident_l}, {"username": ident_l}]
    phone_try = norm_phone(ident)
    if phone_try:
        q_or.append({"phone": phone_try})
    user_doc = await db.users.find_one({"$or": q_or}, {"_id": 0})
    # Rate limit: 1 OTP per minute per user
    if user_doc:
        latest = await db.password_resets.find_one(
            {"user_id": user_doc["user_id"]},
            {"_id": 0}, sort=[("created_at", -1)],
        )
        if latest:
            created = latest.get("created_at")
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created and (datetime.now(timezone.utc) - created).total_seconds() < 60:
                return {"ok": True, "message": "Kode sudah dikirim. Cek email kamu."}
        otp = "".join(random.choices(string.digits, k=6))
        now = datetime.now(timezone.utc)
        await db.password_resets.insert_one({
            "user_id": user_doc["user_id"],
            "email": user_doc["email"],
            "otp_hash": hash_pw(otp),
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=15)).isoformat(),
            "used": False,
            "attempts": 0,
        })
        await _send_otp_email(user_doc["email"], user_doc.get("name") or user_doc.get("username") or "kamu", otp)
    # Always return generic message (no user enumeration)
    return {"ok": True, "message": "Jika akun ditemukan, kode 6-digit telah dikirim ke email terdaftar."}


@api.post("/auth/reset-password")
async def auth_reset(payload: ResetIn, response: Response):
    email = payload.email.lower().strip()
    otp = payload.otp.strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(400, "Kode OTP tidak valid")
    user_doc = await db.users.find_one({"email": email})
    if not user_doc:
        raise HTTPException(400, "Kode salah atau kadaluarsa")
    # Get latest unused OTP for this user
    reset = await db.password_resets.find_one(
        {"user_id": user_doc["user_id"], "used": False},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if not reset:
        raise HTTPException(400, "Kode salah atau kadaluarsa")
    expires = reset["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Kode kadaluarsa. Minta kode baru.")
    if reset.get("attempts", 0) >= 5:
        raise HTTPException(429, "Terlalu banyak percobaan. Minta kode baru.")
    if not verify_pw(otp, reset["otp_hash"]):
        await db.password_resets.update_one(
            {"user_id": user_doc["user_id"], "used": False, "created_at": reset["created_at"]},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(400, "Kode salah atau kadaluarsa")
    # Update password + mark OTP used + upgrade auth_method
    await db.users.update_one(
        {"user_id": user_doc["user_id"]},
        {"$set": {"password_hash": hash_pw(payload.new_password), "auth_method": "password"}},
    )
    await db.password_resets.update_many(
        {"user_id": user_doc["user_id"], "used": False},
        {"$set": {"used": True}},
    )
    _set_access_cookie(response, user_doc["user_id"])
    return {"ok": True, "message": "Password berhasil direset. Kamu sudah masuk."}

# ---------------- Categories ----------------
@api.get("/categories")
async def list_categories(request: Request):
    user = await get_current_user(request)
    await ensure_categories(user.user_id)
    cats = await db.categories.find({"user_id": user.user_id}, {"_id": 0}).to_list(200)
    return cats

# ---------------- Transactions ----------------
@api.get("/transactions")
async def list_transactions(request: Request, start: Optional[str] = None, end: Optional[str] = None,
                            type: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None):
    user = await get_current_user(request)
    query: dict = {"user_id": user.user_id}
    if start or end:
        query["date"] = {}
        if start: query["date"]["$gte"] = start
        if end: query["date"]["$lte"] = end
    if type and type != "all":
        query["type"] = type
    if category and category != "all":
        query["category"] = category
    if q:
        query["description"] = {"$regex": re.escape(q), "$options": "i"}
    rows = await db.transactions.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    return rows

@api.post("/transactions")
async def create_transaction(payload: TransactionCreate, request: Request):
    user = await get_current_user(request)
    if payload.type not in ("expense", "income"):
        raise HTTPException(400, "type must be expense or income")
    if payload.amount <= 0:
        raise HTTPException(400, "amount must be positive")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.user_id,
        "type": payload.type,
        "amount": int(payload.amount),
        "category": payload.category or "Lainnya",
        "description": payload.description or "",
        "date": payload.date or now.date().isoformat(),
        "source": "manual",
        "created_at": now.isoformat(),
    }
    await db.transactions.insert_one(doc)
    if doc["type"] == "expense":
        try: await check_budget_alert(user.user_id, doc["category"])
        except Exception: pass
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/transactions/{tx_id}")
async def update_transaction(tx_id: str, payload: TransactionCreate, request: Request):
    user = await get_current_user(request)
    update = {"type": payload.type, "amount": int(payload.amount),
              "category": payload.category, "description": payload.description or ""}
    if payload.date:
        update["date"] = payload.date
    res = await db.transactions.update_one({"id": tx_id, "user_id": user.user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    return doc

@api.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.transactions.delete_one({"id": tx_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

@api.get("/transactions/export")
async def export_csv(request: Request):
    user = await get_current_user(request)
    rows = await db.transactions.find({"user_id": user.user_id}, {"_id": 0}).sort("date", -1).to_list(10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Tanggal", "Jenis", "Kategori", "Deskripsi", "Jumlah (Rp)", "Sumber"])
    for r in rows:
        writer.writerow([r["date"], r["type"], r["category"], r["description"], r["amount"], r.get("source", "manual")])
    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hematuangmu_transaksi.csv"},
    )

# ---------------- Analytics ----------------
@api.get("/analytics/summary")
async def analytics_summary(request: Request, start: Optional[str] = None, end: Optional[str] = None):
    user = await get_current_user(request)
    q: dict = {"user_id": user.user_id}
    if start or end:
        q["date"] = {}
        if start: q["date"]["$gte"] = start
        if end: q["date"]["$lte"] = end
    rows = await db.transactions.find(q, {"_id": 0}).to_list(10000)
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    # by category
    by_cat: dict = {}
    for r in rows:
        if r["type"] == "expense":
            by_cat[r["category"]] = by_cat.get(r["category"], 0) + r["amount"]
    # daily
    daily: dict = {}
    for r in rows:
        d = r["date"]
        if d not in daily: daily[d] = {"income": 0, "expense": 0}
        daily[d][r["type"]] += r["amount"]
    daily_arr = [{"date": d, **v} for d, v in sorted(daily.items())]
    return {
        "income": income, "expense": expense, "balance": income - expense,
        "count": len(rows),
        "by_category": [{"category": k, "amount": v} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
        "daily": daily_arr,
    }

# ---------------- AI Parsing ----------------
async def parse_with_llm(text: str) -> dict:
    """Use Gemini 3 Flash to parse an Indonesian financial phrase into structured data."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    session_id = f"parse-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=(
            "Kamu adalah parser transaksi keuangan Indonesia. Ubah teks user menjadi JSON valid saja "
            "(tanpa penjelasan, tanpa markdown, tanpa backtick). Format: "
            '{"type":"expense"|"income","amount":<integer_rupiah>,"category":"<kategori>","description":"<deskripsi singkat>"}. '
            "Konversi 15k=15000, 50rb=50000, 1.5jt=1500000, 2juta=2000000. "
            "Kategori pengeluaran: Makanan & Minuman, Transportasi, Belanja, Tagihan & Utilitas, Hiburan, Kesehatan, Pendidikan, Lainnya. "
            "Kategori pemasukan: Gaji, Bonus, Investasi, Pendapatan Lain. "
            "Jika kata kunci: makan/jajan/kopi/nasi -> Makanan & Minuman. bensin/grab/gojek/ojek/taxi -> Transportasi. "
            "belanja/baju/sepatu -> Belanja. listrik/air/wifi/pulsa -> Tagihan & Utilitas. "
            "nonton/film/game -> Hiburan. obat/dokter/rumah sakit -> Kesehatan. buku/kursus/sekolah -> Pendidikan. "
            "gaji/salary -> Gaji (income). bonus/thr -> Bonus (income). dividen/saham -> Investasi (income). "
            "Default type=expense. Amount harus integer positif."
        ),
    ).with_model("gemini", "gemini-3-flash-preview")
    resp = await chat.send_message(UserMessage(text=text))
    raw = str(resp).strip()
    # strip code fences if any
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except Exception:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            raise HTTPException(422, f"Gagal parse: {raw[:200]}")
        data = json.loads(m.group(0))
    data["type"] = data.get("type", "expense")
    data["amount"] = int(data.get("amount", 0))
    data["category"] = data.get("category") or ("Gaji" if data["type"] == "income" else "Lainnya")
    data["description"] = data.get("description", "")
    return data

async def parse_receipt_image(image_bytes: bytes) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    session_id = f"receipt-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=(
            "Kamu adalah pembaca struk belanja Indonesia. Analisa gambar struk lalu keluarkan JSON saja "
            '{"type":"expense","amount":<total_rupiah_integer>,"category":"<kategori>","description":"<nama toko / item utama>"}. '
            "Ambil TOTAL akhir (bukan subtotal). Bulatkan ke integer. Kategori: Makanan & Minuman, Belanja, "
            "Transportasi, Tagihan & Utilitas, Kesehatan, Hiburan, Lainnya. Tanpa penjelasan."
        ),
    ).with_model("gemini", "gemini-3-flash-preview")
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    msg = UserMessage(text="Baca struk ini dan keluarkan JSON.", file_contents=[ImageContent(image_base64=b64)])
    resp = await chat.send_message(msg)
    raw = str(resp).strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    data = json.loads(m.group(0)) if m else {"type": "expense", "amount": 0, "category": "Lainnya", "description": "Struk"}
    data["type"] = "expense"
    data["amount"] = int(data.get("amount", 0))
    return data

async def transcribe_voice(audio_bytes: bytes, filename: str = "voice.ogg") -> str:
    """Transcribe voice note; convert OGG->MP3 first (Whisper doesn't support opus/oga)."""
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as f_in:
        f_in.write(audio_bytes)
        in_path = f_in.name
    out_path = in_path.replace(".ogg", ".mp3")
    try:
        subprocess.run(["ffmpeg", "-y", "-i", in_path, "-ar", "16000", "-ac", "1", out_path],
                       check=True, capture_output=True, timeout=30)
    except Exception as e:
        logger.error(f"ffmpeg error: {e}")
        raise HTTPException(500, "Konversi audio gagal")
    from emergentintegrations.llm.openai import OpenAISpeechToText
    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    with open(out_path, "rb") as af:
        r = await stt.transcribe(file=af, model="whisper-1", language="id", response_format="json")
    try:
        os.unlink(in_path); os.unlink(out_path)
    except Exception:
        pass
    return r.text

@api.post("/parse/text")
async def parse_text(payload: ParseTextIn, request: Request):
    user = await get_current_user(request)
    data = await parse_with_llm(payload.text)
    # save
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "user_id": user.user_id,
        "type": data["type"], "amount": data["amount"],
        "category": data["category"], "description": data["description"] or payload.text[:80],
        "date": now.date().isoformat(), "source": "web_ai",
        "created_at": now.isoformat(),
    }
    await db.transactions.insert_one(doc)
    if doc["type"] == "expense":
        try: await check_budget_alert(user.user_id, doc["category"])
        except Exception: pass
    return {k: v for k, v in doc.items() if k != "_id"}

@api.post("/parse/image")
async def parse_image(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "File terlalu besar (max 8MB)")
    data = await parse_receipt_image(content)
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "user_id": user.user_id,
        "type": "expense", "amount": data["amount"],
        "category": data.get("category", "Lainnya"), "description": data.get("description", "Struk"),
        "date": now.date().isoformat(), "source": "web_ai_photo",
        "created_at": now.isoformat(),
    }
    await db.transactions.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ---------------- Telegram ----------------
@api.get("/telegram/status")
async def tg_status(request: Request):
    user = await get_current_user(request)
    link = await db.telegram_links.find_one({"user_id": user.user_id}, {"_id": 0})
    bot_configured = bool(TELEGRAM_BOT_TOKEN)
    bot_username = None
    if bot_configured:
        try:
            async with httpx.AsyncClient(timeout=8) as hc:
                r = await hc.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe")
                if r.status_code == 200:
                    bot_username = r.json().get("result", {}).get("username")
        except Exception:
            pass
    return {"linked": bool(link and link.get("chat_id")), "link": link, "bot_configured": bot_configured, "bot_username": bot_username}

@api.post("/telegram/link-code")
async def tg_link_code(request: Request):
    user = await get_current_user(request)
    code = gen_link_code()
    await db.telegram_links.update_one(
        {"user_id": user.user_id},
        {"$set": {"user_id": user.user_id, "link_code": code, "code_expires": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
        upsert=True,
    )
    return {"code": code, "expires_in_min": 15}

@api.post("/telegram/unlink")
async def tg_unlink(request: Request):
    user = await get_current_user(request)
    await db.telegram_links.delete_one({"user_id": user.user_id})
    return {"ok": True}

async def tg_send(chat_id: int, text: str):
    if not TELEGRAM_BOT_TOKEN:
        return
    async with httpx.AsyncClient(timeout=10) as hc:
        await hc.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        )

async def tg_download_file(file_id: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile", params={"file_id": file_id})
        file_path = r.json()["result"]["file_path"]
        r2 = await hc.get(f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}")
        return r2.content

async def find_user_by_chat(chat_id: int) -> Optional[str]:
    link = await db.telegram_links.find_one({"chat_id": chat_id}, {"_id": 0})
    return link["user_id"] if link else None


async def _month_expense(user_id: str, category: str, ym: str) -> int:
    rows = await db.transactions.find(
        {"user_id": user_id, "type": "expense", "category": category, "date": {"$regex": f"^{ym}"}},
        {"_id": 0, "amount": 1},
    ).to_list(5000)
    return sum(r["amount"] for r in rows)


async def check_budget_alert(user_id: str, category: str):
    """After a new expense, check if budget crossed 80/100/120% thresholds; alert via Telegram once per level per month."""
    budget = await db.budgets.find_one({"user_id": user_id, "category": category}, {"_id": 0})
    if not budget:
        return
    limit = int(budget.get("monthly_limit", 0))
    if limit <= 0:
        return
    ym = datetime.now(timezone.utc).date().isoformat()[:7]
    spent = await _month_expense(user_id, category, ym)
    pct = int(spent * 100 / limit)
    level = None
    if pct >= 120:
        level = 120
    elif pct >= 100:
        level = 100
    elif pct >= 80:
        level = 80
    if not level:
        return
    key = f"{category}|{ym}|{level}"
    already = await db.budget_alerts.find_one({"user_id": user_id, "key": key})
    if already:
        return
    await db.budget_alerts.insert_one({"user_id": user_id, "key": key, "sent_at": datetime.now(timezone.utc).isoformat()})
    link = await db.telegram_links.find_one({"user_id": user_id, "chat_id": {"$exists": True}}, {"_id": 0})
    if link and link.get("chat_id"):
        emoji = "🚨" if level >= 100 else "⚠️"
        msg = (f"{emoji} <b>Budget {category}</b>\n"
               f"Terpakai: <b>{rupiah(spent)}</b> dari {rupiah(limit)} ({pct}%)\n"
               + ("Sudah lewat batas!" if level >= 100 else "Hampir habis, hati-hati ya."))
        try:
            await tg_send(link["chat_id"], msg)
        except Exception:
            pass


async def save_ai_transaction(user_id: str, data: dict, source: str) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "user_id": user_id,
        "type": data.get("type", "expense"),
        "amount": int(data.get("amount", 0)),
        "category": data.get("category", "Lainnya"),
        "description": data.get("description", ""),
        "date": now.date().isoformat(),
        "source": source, "created_at": now.isoformat(),
    }
    await db.transactions.insert_one(doc)
    if doc["type"] == "expense":
        try: await check_budget_alert(user_id, doc["category"])
        except Exception: pass
    return doc

@api.post("/telegram/webhook/{secret}")
async def tg_webhook(secret: str, request: Request):
    if secret != TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(403, "forbidden")
    update = await request.json()
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"ok": True}
    chat_id = msg["chat"]["id"]
    text = (msg.get("text") or "").strip()

    # Linking flow
    if text.startswith("/start"):
        await tg_send(chat_id, "<b>Halo! 👋</b>\nKirim kode 6-digit dari dashboard HematUangMu untuk menghubungkan akun.\nContoh: <code>AB12CD</code>\n\nSetelah terhubung, catat pengeluaran cukup dengan chat seperti: <i>jajan 15k</i>")
        return {"ok": True}
    if text.startswith("/help"):
        await tg_send(chat_id, "Perintah:\n/start - mulai\n/help - bantuan\n/coach - tanya AI coach (misal /coach kenapa aku boros?)\n/unlink - putuskan akun\n\nCatat transaksi: kirim teks (\"bensin 50rb\"), foto struk, atau voice note.\nTanya coach: cukup kirim pertanyaan seperti \"kenapa bulan ini boros?\"")
        return {"ok": True}
    if text.startswith("/unlink"):
        await db.telegram_links.update_one({"chat_id": chat_id}, {"$unset": {"chat_id": ""}})
        await tg_send(chat_id, "Akun diputus. Kirim kode baru untuk menghubungkan lagi.")
        return {"ok": True}

    # Try to match 6-digit link code
    if re.fullmatch(r"[A-Z0-9]{6}", text.upper()):
        code = text.upper()
        link = await db.telegram_links.find_one({"link_code": code}, {"_id": 0})
        if link:
            await db.telegram_links.update_one(
                {"user_id": link["user_id"]},
                {"$set": {"chat_id": chat_id, "linked_at": datetime.now(timezone.utc).isoformat()}, "$unset": {"link_code": "", "code_expires": ""}},
            )
            await tg_send(chat_id, "✅ <b>Terhubung!</b>\nSekarang catat transaksi dengan kirim teks, foto struk, atau voice note.")
            return {"ok": True}

    user_id = await find_user_by_chat(chat_id)
    if not user_id:
        await tg_send(chat_id, "Akun belum terhubung. Kirim kode 6-digit dari dashboard HematUangMu.")
        return {"ok": True}

    try:
        # Photo
        if msg.get("photo"):
            photo = msg["photo"][-1]
            img = await tg_download_file(photo["file_id"])
            data = await parse_receipt_image(img)
            doc = await save_ai_transaction(user_id, data, "telegram_photo")
            await tg_send(chat_id, f"📸 <b>Struk tercatat</b>\n{doc['description']}\n<b>{rupiah(doc['amount'])}</b> · {doc['category']}")
            return {"ok": True}
        # Voice
        if msg.get("voice") or msg.get("audio"):
            v = msg.get("voice") or msg.get("audio")
            audio = await tg_download_file(v["file_id"])
            transcript = await transcribe_voice(audio)
            data = await parse_with_llm(transcript)
            doc = await save_ai_transaction(user_id, data, "telegram_voice")
            await tg_send(chat_id, f"🎙️ <b>Voice note</b>\n<i>\"{transcript}\"</i>\n\n{doc['description']}\n<b>{rupiah(doc['amount'])}</b> · {doc['category']}")
            return {"ok": True}
        # Text
        if text:
            # Coach intent?
            if _is_coach_intent(text):
                q = text
                if q.lower().startswith("/coach") or q.lower().startswith("/tanya"):
                    q = q.split(" ", 1)[1] if " " in q else "Kasih ringkasan keuanganku bulan ini dan saran hemat."
                try:
                    answer = await ask_coach(user_id, q, 60)
                    await tg_send(chat_id, f"🧠 <b>Hemat AI</b>\n{answer}")
                except Exception as e:
                    await tg_send(chat_id, f"⚠️ Coach lagi sibuk: {str(e)[:100]}")
                return {"ok": True}
            data = await parse_with_llm(text)
            doc = await save_ai_transaction(user_id, data, "telegram_text")
            emoji = "💸" if doc["type"] == "expense" else "💰"
            await tg_send(chat_id, f"{emoji} <b>Tercatat</b>\n{doc['description']}\n<b>{rupiah(doc['amount'])}</b> · {doc['category']}")
            return {"ok": True}
    except Exception as e:
        logger.exception("telegram handler error")
        await tg_send(chat_id, f"⚠️ Gagal memproses: {str(e)[:100]}")
    return {"ok": True}

# ---------------- Budgets ----------------
class BudgetIn(BaseModel):
    category: str
    monthly_limit: int = Field(ge=0)

@api.get("/budgets")
async def list_budgets(request: Request):
    user = await get_current_user(request)
    rows = await db.budgets.find({"user_id": user.user_id}, {"_id": 0}).to_list(200)
    ym = datetime.now(timezone.utc).date().isoformat()[:7]
    for r in rows:
        r["spent"] = await _month_expense(user.user_id, r["category"], ym)
        r["percent"] = int(r["spent"] * 100 / r["monthly_limit"]) if r["monthly_limit"] > 0 else 0
    return rows

@api.post("/budgets")
async def upsert_budget(payload: BudgetIn, request: Request):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc).isoformat()
    await db.budgets.update_one(
        {"user_id": user.user_id, "category": payload.category},
        {"$set": {"user_id": user.user_id, "category": payload.category,
                  "monthly_limit": int(payload.monthly_limit), "updated_at": now},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
        upsert=True,
    )
    doc = await db.budgets.find_one({"user_id": user.user_id, "category": payload.category}, {"_id": 0})
    return doc

@api.delete("/budgets/{category}")
async def delete_budget(category: str, request: Request):
    user = await get_current_user(request)
    await db.budgets.delete_one({"user_id": user.user_id, "category": category})
    return {"ok": True}


# ---------------- Recurring ----------------
class RecurringIn(BaseModel):
    type: str
    amount: int = Field(gt=0)
    category: str
    description: Optional[str] = ""
    day_of_month: int = Field(ge=1, le=28)  # cap at 28 so it always runs
    active: bool = True

def _next_run(day_of_month: int, from_date: Optional[datetime] = None) -> str:
    d = (from_date or datetime.now(timezone.utc)).date()
    year, month = d.year, d.month
    if d.day >= day_of_month:
        month += 1
        if month > 12:
            month = 1; year += 1
    from datetime import date as _date
    return _date(year, month, day_of_month).isoformat()

async def run_due_recurring(user_id: str) -> int:
    """Materialize any due recurring rules into transactions. Returns count created."""
    today = datetime.now(timezone.utc).date().isoformat()
    rules = await db.recurring.find({"user_id": user_id, "active": True, "next_run": {"$lte": today}}, {"_id": 0}).to_list(200)
    created = 0
    MAX_PER_RULE = 12  # safety cap: never materialize more than 12 months at once
    for r in rules:
        iters = 0
        while r.get("next_run", today) <= today and iters < MAX_PER_RULE:
            iters += 1
            now = datetime.now(timezone.utc)
            tx = {
                "id": str(uuid.uuid4()), "user_id": user_id,
                "type": r["type"], "amount": int(r["amount"]),
                "category": r["category"], "description": r.get("description") or f"[Berulang] {r['category']}",
                "date": r["next_run"], "source": "recurring",
                "created_at": now.isoformat(), "recurring_id": r.get("id"),
            }
            await db.transactions.insert_one(tx)
            created += 1
            r["next_run"] = _next_run(int(r["day_of_month"]), datetime.fromisoformat(r["next_run"] + "T00:00:00+00:00"))
            if r["type"] == "expense":
                try: await check_budget_alert(user_id, r["category"])
                except Exception: pass
        await db.recurring.update_one({"id": r["id"]}, {"$set": {"next_run": r["next_run"], "last_run": today}})
    return created

@api.get("/recurring")
async def list_recurring(request: Request):
    user = await get_current_user(request)
    # opportunistically materialize due rules
    await run_due_recurring(user.user_id)
    rows = await db.recurring.find({"user_id": user.user_id}, {"_id": 0}).sort("day_of_month", 1).to_list(200)
    return rows

@api.post("/recurring")
async def create_recurring(payload: RecurringIn, request: Request):
    user = await get_current_user(request)
    if payload.type not in ("expense", "income"):
        raise HTTPException(400, "type must be expense or income")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "user_id": user.user_id,
        "type": payload.type, "amount": int(payload.amount),
        "category": payload.category, "description": payload.description or "",
        "day_of_month": int(payload.day_of_month), "active": payload.active,
        "next_run": _next_run(int(payload.day_of_month)),
        "last_run": None, "created_at": now.isoformat(),
    }
    await db.recurring.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/recurring/{rid}")
async def update_recurring(rid: str, payload: RecurringIn, request: Request):
    user = await get_current_user(request)
    existing = await db.recurring.find_one({"id": rid, "user_id": user.user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    upd = {"type": payload.type, "amount": int(payload.amount), "category": payload.category,
           "description": payload.description or "", "day_of_month": int(payload.day_of_month),
           "active": payload.active}
    # Only recompute next_run if the day changed; toggling active must NOT reset next_run
    if int(payload.day_of_month) != int(existing.get("day_of_month", 0)):
        upd["next_run"] = _next_run(int(payload.day_of_month))
    await db.recurring.update_one({"id": rid, "user_id": user.user_id}, {"$set": upd})
    return await db.recurring.find_one({"id": rid}, {"_id": 0})

@api.delete("/recurring/{rid}")
async def delete_recurring(rid: str, request: Request):
    user = await get_current_user(request)
    res = await db.recurring.delete_one({"id": rid, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------- Wrapped (Monthly Story) ----------------
@api.get("/wrapped")
async def wrapped(request: Request, year: int, month: int):
    user = await get_current_user(request)
    if month < 1 or month > 12:
        raise HTTPException(400, "invalid month")
    ym = f"{year:04d}-{month:02d}"
    rows = await db.transactions.find(
        {"user_id": user.user_id, "date": {"$regex": f"^{ym}"}},
        {"_id": 0},
    ).to_list(5000)
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    # By category (expense only)
    by_cat = {}
    for r in rows:
        if r["type"] == "expense":
            by_cat[r["category"]] = by_cat.get(r["category"], 0) + r["amount"]
    top_cats = sorted(by_cat.items(), key=lambda x: -x[1])[:3]
    # Biggest single tx
    biggest = None
    if rows:
        exp = [r for r in rows if r["type"] == "expense"]
        if exp:
            biggest = max(exp, key=lambda r: r["amount"])
    # Sources
    src_count = {}
    for r in rows:
        src_count[r.get("source", "manual")] = src_count.get(r.get("source", "manual"), 0) + 1
    telegram_count = sum(v for k, v in src_count.items() if k.startswith("telegram"))
    # Active days
    days = set(r["date"] for r in rows)
    # Weekday spending
    from datetime import date as _d
    wd_totals = [0] * 7
    for r in rows:
        if r["type"] == "expense":
            try:
                dt = _d.fromisoformat(r["date"])
                wd_totals[dt.weekday()] += r["amount"]
            except Exception:
                pass
    wd_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    peak_day = None
    if any(wd_totals):
        i = wd_totals.index(max(wd_totals))
        peak_day = {"name": wd_names[i], "amount": wd_totals[i]}
    # Frequent merchants (from description)
    from collections import Counter
    words = Counter()
    for r in rows:
        if r["type"] == "expense":
            for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", (r.get("description") or "")):
                words[w.lower()] += 1
    top_words = [w for w, _ in words.most_common(3)]

    # Fun one-liner via LLM (best-effort)
    story = None
    if top_cats and EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"wrapped-{user.user_id}-{ym}",
                system_message=(
                    "Kamu adalah copywriter Indonesia yang lucu & positif untuk aplikasi keuangan. "
                    "Buat SATU kalimat pendek (max 20 kata) dalam Bahasa Indonesia yang mengomentari kebiasaan pengguna "
                    "berdasarkan data. Nada: hangat, playful, tidak menghakimi. Sertakan emoji secukupnya. "
                    "JANGAN gunakan tanda kutip, backtick, atau markdown. Cukup satu kalimat mentah."
                ),
            ).with_model("gemini", "gemini-3-flash-preview")
            prompt = (f"Bulan {ym}. Pemasukan Rp{income}, pengeluaran Rp{expense}. "
                      f"Top 3 kategori: {top_cats}. Hari paling boros: {peak_day}. "
                      f"Aktif {len(days)} hari. {telegram_count} transaksi via Telegram.")
            resp = await chat.send_message(UserMessage(text=prompt))
            story = str(resp).strip().strip('"').strip()[:200]
        except Exception as e:
            logger.warning(f"wrapped story LLM err: {e}")

    return {
        "year": year, "month": month, "ym": ym,
        "income": income, "expense": expense, "balance": income - expense,
        "tx_count": len(rows), "active_days": len(days),
        "top_categories": [{"category": c, "amount": a} for c, a in top_cats],
        "biggest_expense": biggest,
        "telegram_count": telegram_count,
        "peak_day": peak_day,
        "top_keywords": top_words,
        "story": story,
    }


# ---------------- AI Coach ----------------
class CoachIn(BaseModel):
    question: str
    days: Optional[int] = 60

async def _build_finance_context(user_id: str, days: int = 60) -> str:
    """Aggregate the user's recent finance data as compact text for the LLM."""
    end = datetime.now(timezone.utc).date()
    start = (end - timedelta(days=max(7, min(180, int(days))))).isoformat()
    rows = await db.transactions.find(
        {"user_id": user_id, "date": {"$gte": start}},
        {"_id": 0},
    ).sort("date", 1).to_list(5000)
    if not rows:
        return "TIDAK ADA DATA TRANSAKSI di rentang ini."
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    # This month vs previous month
    ym_now = end.isoformat()[:7]
    prev = (end.replace(day=1) - timedelta(days=1))
    ym_prev = prev.isoformat()[:7]
    def sum_month(ym, t):
        return sum(r["amount"] for r in rows if r["date"].startswith(ym) and r["type"] == t)
    exp_now, exp_prev = sum_month(ym_now, "expense"), sum_month(ym_prev, "expense")
    inc_now, inc_prev = sum_month(ym_now, "income"), sum_month(ym_prev, "income")
    # By category this month
    cat_now, cat_prev = {}, {}
    for r in rows:
        if r["type"] != "expense": continue
        if r["date"].startswith(ym_now):
            cat_now[r["category"]] = cat_now.get(r["category"], 0) + r["amount"]
        elif r["date"].startswith(ym_prev):
            cat_prev[r["category"]] = cat_prev.get(r["category"], 0) + r["amount"]
    top_now = sorted(cat_now.items(), key=lambda x: -x[1])[:6]
    # Budgets & progress
    budgets = await db.budgets.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    bud_lines = []
    for b in budgets:
        spent = await _month_expense(user_id, b["category"], ym_now)
        pct = int(spent * 100 / b["monthly_limit"]) if b["monthly_limit"] else 0
        bud_lines.append(f"- {b['category']}: {spent}/{b['monthly_limit']} ({pct}%)")
    # Top individual expenses this month
    big_this = sorted([r for r in rows if r["date"].startswith(ym_now) and r["type"] == "expense"],
                      key=lambda r: -r["amount"])[:5]
    lines = [
        f"Rentang: {start} s/d {end.isoformat()}",
        f"Total pemasukan {days}h: Rp{income}",
        f"Total pengeluaran {days}h: Rp{expense}",
        f"Bulan ini ({ym_now}): pemasukan Rp{inc_now}, pengeluaran Rp{exp_now}",
        f"Bulan lalu ({ym_prev}): pemasukan Rp{inc_prev}, pengeluaran Rp{exp_prev}",
    ]
    if exp_prev > 0:
        diff = exp_now - exp_prev
        pct = int(diff * 100 / exp_prev)
        lines.append(f"Perubahan pengeluaran vs bulan lalu: Rp{diff:+d} ({pct:+d}%)")
    if top_now:
        lines.append("Top kategori bulan ini:")
        for c, a in top_now:
            prev_a = cat_prev.get(c, 0)
            delta = f" (vs {ym_prev}: Rp{prev_a})" if prev_a else ""
            lines.append(f"  - {c}: Rp{a}{delta}")
    if bud_lines:
        lines.append("Budget aktif:")
        lines.extend(bud_lines)
    if big_this:
        lines.append("Pengeluaran terbesar bulan ini:")
        for r in big_this:
            lines.append(f"  - {r['date']} · {r['category']} · {r.get('description','')} · Rp{r['amount']}")
    return "\n".join(lines)


async def ask_coach(user_id: str, question: str, days: int = 60) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI Coach tidak tersedia")
    ctx = await _build_finance_context(user_id, days)
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"coach-{user_id}",
        system_message=(
            "Kamu adalah AI Financial Coach Indonesia bernama Hemat. Nada hangat, empatik, ringkas, dan konkret. "
            "Jawab dalam Bahasa Indonesia. Gunakan angka dari DATA KEUANGAN yang diberikan (jangan mengarang). "
            "Kalau user tanya alasan boros/hemat/tips: sebutkan kategori spesifik + angka + saran aksi konkret "
            "(misal 'Kopi naik 40%, coba brew di rumah 2x/minggu bisa hemat Rp X'). "
            "Kalau user cuma sapa/tanya umum: balas singkat dan tawarkan hal-hal yang bisa kamu bantu. "
            "Format: gunakan poin bullet (- ) untuk lebih dari 1 saran, max 6 baris total, hindari markdown heading."
        ),
    ).with_model("gemini", "gemini-3-flash-preview")
    prompt = f"DATA KEUANGAN:\n{ctx}\n\nPERTANYAAN USER: {question}"
    resp = await chat.send_message(UserMessage(text=prompt))
    return str(resp).strip()


@api.post("/coach")
async def coach_endpoint(payload: CoachIn, request: Request):
    user = await get_current_user(request)
    q = payload.question.strip()
    if not q:
        raise HTTPException(400, "Pertanyaan kosong")
    answer = await ask_coach(user.user_id, q, payload.days or 60)
    return {"answer": answer}


COACH_KEYWORDS = re.compile(
    r"\b(kenapa|kok|gimana|bagaimana|tips|saran|rekomendasi|analisa|analisis|coach|tanya|"
    r"boros|hemat|rangkum|rekap|jelasin|jelaskan|kategori\s+apa|apa\s+yang|berapa\s+total)\b",
    re.IGNORECASE,
)

_AMOUNT_UNIT = re.compile(r"\b\d+([.,]\d+)?\s?(k|rb|ribu|jt|jutaan|juta|rp|m|milyar|miliar)\b", re.IGNORECASE)

def _is_coach_intent(text: str) -> bool:
    t = text.strip()
    tl = t.lower()
    if tl.startswith("/coach") or tl.startswith("/tanya") or tl.startswith("/rekap"):
        return True
    if tl in {"/help", "/start", "/unlink"}:
        return False
    # Message with monetary units almost always a transaction, not a coach question
    if _AMOUNT_UNIT.search(t):
        return False
    if t.endswith("?"):
        return True
    if COACH_KEYWORDS.search(t):
        return True
    return False


# ---------------- Register ----------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def _shutdown():
    client.close()
