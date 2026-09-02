"""Iteration 4 tests: Budgets, Recurring, Wrapped."""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

mdb = MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    tag = uuid.uuid4().hex[:8]
    payload = {
        "username": f"tst_i4_{tag}",
        "email": f"tst_i4_{tag}@gmail.com",
        "phone": f"+628{uuid.uuid4().int % 10**10:010d}",
        "password": "TestPass123",
        "name": f"Test I4 {tag}",
    }
    r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    token = s.cookies.get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    yield {"session": s, "user_id": uid}
    # cleanup
    mdb.users.delete_one({"user_id": uid})
    mdb.transactions.delete_many({"user_id": uid})
    mdb.categories.delete_many({"user_id": uid})
    mdb.budgets.delete_many({"user_id": uid})
    mdb.budget_alerts.delete_many({"user_id": uid})
    mdb.recurring.delete_many({"user_id": uid})


# ==================== BUDGETS ====================
class TestBudgets:
    def test_create_budget(self, user):
        s = user["session"]
        r = s.post(f"{BASE_URL}/api/budgets", json={"category": "Makanan & Minuman", "monthly_limit": 1000000})
        assert r.status_code == 200
        d = r.json()
        assert d["category"] == "Makanan & Minuman"
        assert d["monthly_limit"] == 1000000

    def test_upsert_updates_same_category(self, user):
        s = user["session"]
        s.post(f"{BASE_URL}/api/budgets", json={"category": "Hiburan", "monthly_limit": 500000})
        r = s.post(f"{BASE_URL}/api/budgets", json={"category": "Hiburan", "monthly_limit": 700000})
        assert r.status_code == 200
        assert r.json()["monthly_limit"] == 700000
        count = mdb.budgets.count_documents({"user_id": user["user_id"], "category": "Hiburan"})
        assert count == 1

    def test_list_budgets_has_spent_and_percent(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/budgets")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2
        for row in rows:
            assert "spent" in row
            assert "percent" in row
            assert isinstance(row["spent"], int)
            assert isinstance(row["percent"], int)

    def test_expense_updates_spent(self, user):
        s = user["session"]
        # create a fresh category budget for isolation
        s.post(f"{BASE_URL}/api/budgets", json={"category": "Belanja", "monthly_limit": 1000000})
        # add expense
        r = s.post(f"{BASE_URL}/api/transactions", json={
            "type": "expense", "amount": 200000, "category": "Belanja", "description": "TEST_shopping"
        })
        assert r.status_code == 200
        rows = s.get(f"{BASE_URL}/api/budgets").json()
        belanja = next(x for x in rows if x["category"] == "Belanja")
        assert belanja["spent"] >= 200000
        assert belanja["percent"] >= 20

    def test_budget_alert_thresholds(self, user):
        s = user["session"]
        uid = user["user_id"]
        # Fresh cat, no prior spend
        cat = "Kesehatan"
        mdb.budget_alerts.delete_many({"user_id": uid})
        mdb.transactions.delete_many({"user_id": uid, "category": cat})
        s.post(f"{BASE_URL}/api/budgets", json={"category": cat, "monthly_limit": 100000})
        # 80% threshold
        s.post(f"{BASE_URL}/api/transactions", json={"type": "expense", "amount": 80000, "category": cat, "description": "t1"})
        ym = datetime.now(timezone.utc).date().isoformat()[:7]
        a80 = mdb.budget_alerts.find_one({"user_id": uid, "key": f"{cat}|{ym}|80"})
        assert a80 is not None
        # Idempotent: another small expense still at 80% level should NOT create a new alert row
        before = mdb.budget_alerts.count_documents({"user_id": uid})
        s.post(f"{BASE_URL}/api/transactions", json={"type": "expense", "amount": 5000, "category": cat, "description": "t2"})
        after = mdb.budget_alerts.count_documents({"user_id": uid})
        assert after == before, "80% alert must be idempotent"
        # Push over 100
        s.post(f"{BASE_URL}/api/transactions", json={"type": "expense", "amount": 20000, "category": cat, "description": "t3"})
        assert mdb.budget_alerts.find_one({"user_id": uid, "key": f"{cat}|{ym}|100"}) is not None
        # Push over 120
        s.post(f"{BASE_URL}/api/transactions", json={"type": "expense", "amount": 30000, "category": cat, "description": "t4"})
        assert mdb.budget_alerts.find_one({"user_id": uid, "key": f"{cat}|{ym}|120"}) is not None

    def test_delete_budget(self, user):
        s = user["session"]
        s.post(f"{BASE_URL}/api/budgets", json={"category": "Transportasi", "monthly_limit": 100000})
        r = s.delete(f"{BASE_URL}/api/budgets/Transportasi")
        assert r.status_code == 200
        rows = s.get(f"{BASE_URL}/api/budgets").json()
        assert not any(x["category"] == "Transportasi" for x in rows)


# ==================== RECURRING ====================
class TestRecurring:
    def test_create_recurring(self, user):
        s = user["session"]
        r = s.post(f"{BASE_URL}/api/recurring", json={
            "type": "expense", "amount": 65000, "category": "Hiburan",
            "description": "Netflix", "day_of_month": 15, "active": True,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["amount"] == 65000
        assert d["day_of_month"] == 15
        # next_run should be YYYY-MM-15 in future or today
        today = datetime.now(timezone.utc).date().isoformat()
        assert d["next_run"] >= today
        assert d["next_run"].endswith("-15")
        user["rec_id"] = d["id"]

    def test_list_recurring_sorted(self, user):
        s = user["session"]
        s.post(f"{BASE_URL}/api/recurring", json={
            "type": "expense", "amount": 500000, "category": "Tagihan & Utilitas",
            "description": "Kos", "day_of_month": 5, "active": True,
        })
        rows = s.get(f"{BASE_URL}/api/recurring").json()
        days = [x["day_of_month"] for x in rows]
        assert days == sorted(days)

    def test_update_recurring(self, user):
        s = user["session"]
        rid = user["rec_id"]
        r = s.put(f"{BASE_URL}/api/recurring/{rid}", json={
            "type": "expense", "amount": 99000, "category": "Hiburan",
            "description": "Netflix Premium", "day_of_month": 20, "active": True,
        })
        assert r.status_code == 200
        assert r.json()["amount"] == 99000
        assert r.json()["day_of_month"] == 20
        assert r.json()["next_run"].endswith("-20")

    def test_lazy_materialization(self, user):
        s = user["session"]
        uid = user["user_id"]
        # Create rule directly with past next_run
        rid = str(uuid.uuid4())
        mdb.recurring.insert_one({
            "id": rid, "user_id": uid, "type": "expense", "amount": 45000,
            "category": "Hiburan", "description": "TEST_past", "day_of_month": 1,
            "active": True, "next_run": "2026-01-01",
            "last_run": None, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        tx_before = mdb.transactions.count_documents({"user_id": uid, "recurring_id": rid})
        # Trigger lazy run via GET
        r = s.get(f"{BASE_URL}/api/recurring")
        assert r.status_code == 200
        tx_after = mdb.transactions.count_documents({"user_id": uid, "recurring_id": rid})
        assert tx_after > tx_before, "expected at least one materialized transaction"
        # next_run advanced past today
        today = datetime.now(timezone.utc).date().isoformat()
        rule = mdb.recurring.find_one({"id": rid})
        assert rule["next_run"] > today

    def test_delete_recurring(self, user):
        s = user["session"]
        rid = user["rec_id"]
        r = s.delete(f"{BASE_URL}/api/recurring/{rid}")
        assert r.status_code == 200
        assert mdb.recurring.find_one({"id": rid}) is None


# ==================== WRAPPED ====================
class TestWrapped:
    def test_empty_month(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/wrapped", params={"year": 2020, "month": 3})
        assert r.status_code == 200
        d = r.json()
        assert d["tx_count"] == 0
        assert d["income"] == 0
        assert d["expense"] == 0

    def test_invalid_month(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/wrapped", params={"year": 2026, "month": 13})
        assert r.status_code == 400

    def test_populated_month(self, user):
        s = user["session"]
        uid = user["user_id"]
        # Seed txns in a specific month
        target_ym = "2025-06"
        mdb.transactions.delete_many({"user_id": uid, "date": {"$regex": f"^{target_ym}"}})
        seed = [
            {"id": str(uuid.uuid4()), "user_id": uid, "type": "expense", "amount": 150000, "category": "Makanan & Minuman", "description": "TEST_lunch nasi padang", "date": "2025-06-05", "source": "manual", "created_at": "x"},
            {"id": str(uuid.uuid4()), "user_id": uid, "type": "expense", "amount": 500000, "category": "Belanja", "description": "TEST_big sepatu nike", "date": "2025-06-10", "source": "telegram_text", "created_at": "x"},
            {"id": str(uuid.uuid4()), "user_id": uid, "type": "expense", "amount": 50000, "category": "Hiburan", "description": "TEST_bioskop", "date": "2025-06-12", "source": "telegram_photo", "created_at": "x"},
            {"id": str(uuid.uuid4()), "user_id": uid, "type": "income", "amount": 3000000, "category": "Gaji", "description": "TEST_gaji", "date": "2025-06-01", "source": "manual", "created_at": "x"},
        ]
        mdb.transactions.insert_many(seed)
        r = s.get(f"{BASE_URL}/api/wrapped", params={"year": 2025, "month": 6})
        assert r.status_code == 200
        d = r.json()
        assert d["tx_count"] == 4
        assert d["income"] == 3000000
        assert d["expense"] == 700000
        assert d["balance"] == 2300000
        assert d["active_days"] == 4
        assert len(d["top_categories"]) >= 1
        # biggest should be the 500000 Belanja
        assert d["biggest_expense"]["amount"] == 500000
        assert d["telegram_count"] == 2
        assert d["peak_day"] is not None
        # story: may be str or None (LLM tolerant)
        assert d["story"] is None or isinstance(d["story"], str)
        if d["story"]:
            assert len(d["story"]) <= 250


# ==================== REGRESSION ====================
class TestRegression:
    def test_auth_me(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200

    def test_transactions_list(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/transactions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analytics_summary(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/analytics/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("income", "expense", "balance", "count", "by_category", "daily"):
            assert k in d

    def test_telegram_status(self, user):
        s = user["session"]
        r = s.get(f"{BASE_URL}/api/telegram/status")
        assert r.status_code == 200
        assert "linked" in r.json()

    def test_unauth_budgets(self):
        r = requests.get(f"{BASE_URL}/api/budgets")
        assert r.status_code == 401
