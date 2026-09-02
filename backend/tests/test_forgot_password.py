"""HematUangMu iter3: Forgot password / reset password (OTP via Resend)."""
import os, uuid, time
from datetime import datetime, timezone, timedelta

import pytest
import requests
import bcrypt
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                break
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


def _bcrypt_hash(s: str) -> str:
    return bcrypt.hashpw(s.encode(), bcrypt.gensalt()).decode()


@pytest.fixture(scope="module")
def user():
    """Register a fresh user via API."""
    suf = uuid.uuid4().hex[:8]
    email = f"tst_fp_{suf}@gmail.com"
    username = f"tstfp_{suf}"
    phone = f"0812{suf[:8]}"
    password = "OriginalPass123"
    r = requests.post(f"{API}/auth/register", json={
        "username": username, "email": email, "phone": phone,
        "password": password, "name": "Reset User",
    })
    assert r.status_code == 200, r.text
    u = r.json()
    yield {"user_id": u["user_id"], "email": email, "username": username,
           "phone": phone, "password": password}
    # cleanup
    db.users.delete_one({"user_id": u["user_id"]})
    db.password_resets.delete_many({"user_id": u["user_id"]})
    db.categories.delete_many({"user_id": u["user_id"]})
    db.transactions.delete_many({"user_id": u["user_id"]})


# ---- 1: forgot-password for existing user creates a row ----
def test_forgot_existing_user_creates_row(user):
    db.password_resets.delete_many({"user_id": user["user_id"]})
    r = requests.post(f"{API}/auth/forgot-password", json={"identifier": user["email"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert "message" in body
    rows = list(db.password_resets.find({"user_id": user["user_id"]}))
    assert len(rows) == 1, f"expected 1 reset row, got {len(rows)}"
    assert rows[0]["used"] is False
    assert rows[0]["attempts"] == 0
    assert "otp_hash" in rows[0]


# ---- 2: forgot-password for non-existent user returns 200 but no row ----
def test_forgot_nonexistent_user_no_row():
    fake_email = f"nouser_{uuid.uuid4().hex[:8]}@nowhere.example"
    r = requests.post(f"{API}/auth/forgot-password", json={"identifier": fake_email})
    assert r.status_code == 200
    assert r.json().get("ok") is True
    rows = list(db.password_resets.find({"email": fake_email.lower()}))
    assert len(rows) == 0


# ---- 3: rate limit: two calls within 60s produce only 1 row ----
def test_forgot_rate_limit(user):
    db.password_resets.delete_many({"user_id": user["user_id"]})
    r1 = requests.post(f"{API}/auth/forgot-password", json={"identifier": user["username"]})
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/auth/forgot-password", json={"identifier": user["username"]})
    assert r2.status_code == 200
    rows = list(db.password_resets.find({"user_id": user["user_id"]}))
    assert len(rows) == 1, f"rate limit failed: got {len(rows)} rows"


def _seed_reset(user_id: str, email: str, otp: str = "123456",
                minutes_to_expiry: int = 15, attempts: int = 0, used: bool = False):
    """Directly insert password_resets doc with known OTP."""
    db.password_resets.delete_many({"user_id": user_id})
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id, "email": email,
        "otp_hash": _bcrypt_hash(otp),
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=minutes_to_expiry)).isoformat(),
        "used": used, "attempts": attempts,
    }
    db.password_resets.insert_one(doc)


# ---- 4: reset with wrong OTP -> 400 + attempts incremented ----
def test_reset_wrong_otp_increments_attempts(user):
    _seed_reset(user["user_id"], user["email"], otp="111111")
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": user["email"], "otp": "999999", "new_password": "NewPass456"
    })
    assert r.status_code == 400, r.text
    row = db.password_resets.find_one({"user_id": user["user_id"]})
    assert row["attempts"] == 1


# ---- 5: after 5 wrong attempts -> 429 ----
def test_reset_lockout_after_5_attempts(user):
    _seed_reset(user["user_id"], user["email"], otp="111111", attempts=5)
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": user["email"], "otp": "999999", "new_password": "NewPass456"
    })
    assert r.status_code == 429, r.text


# ---- 6: expired OTP -> 400 ----
def test_reset_expired_otp(user):
    _seed_reset(user["user_id"], user["email"], otp="111111", minutes_to_expiry=-1)
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": user["email"], "otp": "111111", "new_password": "NewPass456"
    })
    assert r.status_code == 400
    assert "kadaluarsa" in r.text.lower() or "salah" in r.text.lower()


# ---- 7: non-6-digit OTP -> 400 ----
def test_reset_invalid_otp_format(user):
    _seed_reset(user["user_id"], user["email"], otp="111111")
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": user["email"], "otp": "12", "new_password": "NewPass456"
    })
    assert r.status_code == 400


# ---- 8: successful reset flow + old password fails + new password works ----
def test_reset_success_and_old_password_fails(user):
    known_otp = "246810"
    new_password = "BrandNewPass789"
    _seed_reset(user["user_id"], user["email"], otp=known_otp)

    s = requests.Session()
    r = s.post(f"{API}/auth/reset-password", json={
        "email": user["email"], "otp": known_otp, "new_password": new_password
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    # access_token cookie set
    assert s.cookies.get("access_token"), f"missing access_token cookie: {s.cookies.get_dict()}"
    # OTP row marked used
    row = db.password_resets.find_one({"user_id": user["user_id"]})
    assert row["used"] is True
    # /auth/me works via that cookie
    rme = s.get(f"{API}/auth/me")
    assert rme.status_code == 200
    assert rme.json()["user_id"] == user["user_id"]

    # Old password should now fail
    r_old = requests.post(f"{API}/auth/login", json={
        "identifier": user["email"], "password": user["password"]
    })
    assert r_old.status_code == 401

    # New password should work
    r_new = requests.post(f"{API}/auth/login", json={
        "identifier": user["email"], "password": new_password
    })
    assert r_new.status_code == 200
    # persist for downstream tests
    user["password"] = new_password


# ---- 9: google-only user can set password via reset ----
def test_google_only_user_can_set_password():
    suf = uuid.uuid4().hex[:8]
    guser_id = f"user_g{suf}"
    gemail = f"g_fp_{suf}@gmail.com"
    db.users.insert_one({
        "user_id": guser_id, "email": gemail, "name": "G User",
        "picture": None, "auth_method": "google",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        # forgot-password should still create a reset row
        r = requests.post(f"{API}/auth/forgot-password", json={"identifier": gemail})
        assert r.status_code == 200
        rows = list(db.password_resets.find({"user_id": guser_id}))
        assert len(rows) == 1

        # Seed a known OTP for deterministic reset
        known_otp = "135791"
        _seed_reset(guser_id, gemail, otp=known_otp)

        new_pw = "GoogleReset123"
        r2 = requests.post(f"{API}/auth/reset-password", json={
            "email": gemail, "otp": known_otp, "new_password": new_pw
        })
        assert r2.status_code == 200, r2.text
        # user updated
        u = db.users.find_one({"user_id": guser_id})
        assert u["auth_method"] == "password"
        assert u.get("password_hash")
        # login by password works
        r3 = requests.post(f"{API}/auth/login", json={
            "identifier": gemail, "password": new_pw
        })
        assert r3.status_code == 200
    finally:
        db.users.delete_one({"user_id": guser_id})
        db.password_resets.delete_many({"user_id": guser_id})
        db.categories.delete_many({"user_id": guser_id})
