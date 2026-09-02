"""HematUangMu iter2: JWT register/login + regression on Google session + transactions smoke."""
import os, uuid, time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback read frontend/.env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                break
API = f"{BASE_URL}/api"

# Unique test identity per run
SUFFIX = uuid.uuid4().hex[:8]
USERNAME = f"tst_{SUFFIX}"
EMAIL = f"tst_{SUFFIX}@gmail.com"
PHONE_LOCAL = f"0812{SUFFIX[:8]}"  # 12 chars
PASSWORD = "SecretPass123"
NAME = "Test User"

state = {}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ----- Register -----
def test_register_success(s):
    r = s.post(f"{API}/auth/register", json={
        "username": USERNAME, "email": EMAIL, "phone": PHONE_LOCAL,
        "password": PASSWORD, "name": NAME
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["username"] == USERNAME
    assert data["email"] == EMAIL.lower()
    assert data["phone"].startswith("+62")
    assert data["name"] == NAME
    assert "access_token" in s.cookies.get_dict(), f"cookies={s.cookies.get_dict()}"
    state["user_id"] = data["user_id"]
    state["access_token"] = s.cookies.get("access_token")


def test_me_with_cookie(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == state["user_id"]


def test_me_with_bearer():
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {state['access_token']}"})
    assert r.status_code == 200
    assert r.json()["email"] == EMAIL.lower()


def test_register_dup_username():
    r = requests.post(f"{API}/auth/register", json={
        "username": USERNAME, "email": f"other_{SUFFIX}@gmail.com",
        "phone": f"0813{SUFFIX[:8]}", "password": PASSWORD
    })
    assert r.status_code == 409


def test_register_dup_email():
    r = requests.post(f"{API}/auth/register", json={
        "username": f"other_{SUFFIX}", "email": EMAIL,
        "phone": f"0814{SUFFIX[:8]}", "password": PASSWORD
    })
    assert r.status_code == 409


def test_register_dup_phone():
    r = requests.post(f"{API}/auth/register", json={
        "username": f"another_{SUFFIX}", "email": f"another_{SUFFIX}@gmail.com",
        "phone": PHONE_LOCAL, "password": PASSWORD
    })
    assert r.status_code == 409


def test_register_short_password():
    r = requests.post(f"{API}/auth/register", json={
        "username": f"short_{SUFFIX}", "email": f"short_{SUFFIX}@gmail.com",
        "phone": f"0815{SUFFIX[:8]}", "password": "12"
    })
    assert r.status_code in (400, 422)


def test_register_short_username():
    r = requests.post(f"{API}/auth/register", json={
        "username": "ab", "email": f"su_{SUFFIX}@gmail.com",
        "phone": f"0816{SUFFIX[:8]}", "password": PASSWORD
    })
    assert r.status_code in (400, 422)


# ----- Login -----
def test_login_with_username():
    r = requests.post(f"{API}/auth/login", json={"identifier": USERNAME, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == state["user_id"]
    assert r.cookies.get("access_token")


def test_login_with_phone_local():
    r = requests.post(f"{API}/auth/login", json={"identifier": PHONE_LOCAL, "password": PASSWORD})
    assert r.status_code == 200


def test_login_with_phone_plus62():
    plus_phone = "+62" + PHONE_LOCAL[1:]
    r = requests.post(f"{API}/auth/login", json={"identifier": plus_phone, "password": PASSWORD})
    assert r.status_code == 200


def test_login_with_uppercase_email():
    r = requests.post(f"{API}/auth/login", json={"identifier": EMAIL.upper(), "password": PASSWORD})
    assert r.status_code == 200, r.text


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"identifier": USERNAME, "password": "wrongpass"})
    assert r.status_code == 401


# ----- Google session_token regression -----
def test_google_session_token_fallback():
    """Insert a fake user_sessions doc and verify get_current_user accepts Bearer session_token."""
    from pymongo import MongoClient
    from datetime import datetime, timezone, timedelta
    mongo = MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
    dbname = os.environ.get('DB_NAME', 'test_database')
    db = mongo[dbname]
    # create a google-style user
    guser_id = f"user_g{uuid.uuid4().hex[:10]}"
    gemail = f"g_{SUFFIX}@gmail.com"
    db.users.insert_one({
        "user_id": guser_id, "email": gemail, "name": "G User",
        "picture": None, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    stoken = f"stok_{uuid.uuid4().hex}"
    db.user_sessions.insert_one({
        "user_id": guser_id, "session_token": stoken,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    })
    state["g_user_id"] = guser_id
    state["g_stoken"] = stoken
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {stoken}"})
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == guser_id


# ----- Existing endpoints smoke with JWT -----
def test_categories_seeded(s):
    r = s.get(f"{API}/categories")
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) >= 12
    names = {c["name"] for c in cats}
    assert "Makanan & Minuman" in names


def test_transaction_create_and_read(s):
    r = s.post(f"{API}/transactions", json={
        "type": "expense", "amount": 12345,
        "category": "Makanan & Minuman", "description": "TEST_tx"
    })
    assert r.status_code == 200, r.text
    tx = r.json()
    state["tx_id"] = tx["id"]
    assert tx["amount"] == 12345
    # read back
    r2 = s.get(f"{API}/transactions")
    assert r2.status_code == 200
    ids = {t["id"] for t in r2.json()}
    assert state["tx_id"] in ids


def test_analytics_summary(s):
    r = s.get(f"{API}/analytics/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["expense"] >= 12345


def test_telegram_status(s):
    r = s.get(f"{API}/telegram/status")
    assert r.status_code == 200
    assert "bot_configured" in r.json()


def test_parse_text(s):
    r = s.post(f"{API}/parse/text", json={"text": "jajan siomay 15rb"}, timeout=45)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["amount"] == 15000
    assert data["type"] == "expense"


# ----- Cleanup -----
def test_zz_cleanup():
    from pymongo import MongoClient
    mongo = MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
    db = mongo[os.environ.get('DB_NAME', 'test_database')]
    if state.get("user_id"):
        db.users.delete_one({"user_id": state["user_id"]})
        db.transactions.delete_many({"user_id": state["user_id"]})
        db.categories.delete_many({"user_id": state["user_id"]})
    if state.get("g_user_id"):
        db.users.delete_one({"user_id": state["g_user_id"]})
        db.user_sessions.delete_many({"user_id": state["g_user_id"]})
        db.categories.delete_many({"user_id": state["g_user_id"]})
