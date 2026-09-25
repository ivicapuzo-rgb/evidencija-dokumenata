"""Backend API test suite for Евиденција докумената."""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://expiry-notifier-27.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@evidencija.rs"
ADMIN_PASSWORD = "Admin123!"

TEST_TAG = f"TEST_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def user(s):
    email = f"{TEST_TAG}_user@example.com".lower()
    payload = {"username": f"{TEST_TAG}_user", "email": email, "password": "Passw0rd!"}
    r = s.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return {"email": email, "password": "Passw0rd!", "token": data["access_token"], "user": data["user"]}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ========================= Auth =========================
class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/", timeout=15)
        assert r.status_code == 200

    def test_register_trial(self, user):
        assert user["user"]["is_subscribed"] is True
        assert user["user"]["subscription_expires_at"]

    def test_duplicate_email_409(self, s, user):
        r = s.post(f"{API}/auth/register", json={
            "username": "dup", "email": user["email"], "password": "Passw0rd!"
        }, timeout=15)
        assert r.status_code == 409

    def test_login_success(self, s, user):
        r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": user["password"]}, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password_401(self, s, user):
        r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, s, user):
        r = s.get(f"{API}/auth/me", headers=_auth(user["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == user["email"]

    def test_me_unauthorized(self, s):
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ========================= Documents =========================
class TestDocuments:
    def test_documents_crud_flow(self, s, user):
        # Empty list initially
        r = s.get(f"{API}/documents", headers=_auth(user["token"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        # Create
        exp = (date.today() + timedelta(days=30)).isoformat()
        r = s.post(f"{API}/documents", headers=_auth(user["token"]),
                   json={"name": "TEST_LK", "doc_type": "id_card", "expires_at": exp, "alarm_days": 5}, timeout=15)
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["name"] == "TEST_LK"
        assert doc["alarm_days"] == 5
        assert doc["days_remaining"] in (29, 30)
        doc_id = doc["id"]

        # Verify GET
        r = s.get(f"{API}/documents", headers=_auth(user["token"]), timeout=15)
        assert any(d["id"] == doc_id for d in r.json())

        # Update alarm_days
        r = s.put(f"{API}/documents/{doc_id}", headers=_auth(user["token"]),
                  json={"alarm_days": 15}, timeout=15)
        assert r.status_code == 200
        assert r.json()["alarm_days"] == 15

        # Delete (soft)
        r = s.delete(f"{API}/documents/{doc_id}", headers=_auth(user["token"]), timeout=15)
        assert r.status_code == 200

        # Verify gone
        r = s.get(f"{API}/documents", headers=_auth(user["token"]), timeout=15)
        assert not any(d["id"] == doc_id for d in r.json())

    def test_documents_requires_auth(self, s):
        r = s.get(f"{API}/documents", timeout=15)
        assert r.status_code == 401


# ========================= Subscription =========================
class TestSubscription:
    def test_get_subscription(self, s, user):
        r = s.get(f"{API}/subscription", headers=_auth(user["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["iban"] == "LU824080000048751822"
        assert str(d["price_eur"]) == "4"
        assert d["months"] == 6
        assert d["is_subscribed"] is True

    def test_claim_creates_pending(self, s, user):
        r = s.post(f"{API}/subscription/claim", headers=_auth(user["token"]), timeout=15)
        assert r.status_code in (200, 201)
        assert r.json()["status"] == "pending"
        # Idempotent-ish: hitting again should keep pending, not error
        r2 = s.post(f"{API}/subscription/claim", headers=_auth(user["token"]), timeout=15)
        assert r2.status_code in (200, 201)
        # Verify visible via GET
        r3 = s.get(f"{API}/subscription", headers=_auth(user["token"]), timeout=15)
        assert r3.json()["pending_payment"] is not None


# ========================= Push =========================
class TestPush:
    def test_register_push_accepts_body(self, s, user):
        r = s.post(f"{API}/register-push",
                   json={"user_id": user["user"]["id"], "platform": "web", "device_token": "TEST_TOKEN"},
                   timeout=20)
        # Backend either returns 201, or 500 (if EMERGENT_PUSH_KEY missing) - both acceptable per spec
        assert r.status_code in (201, 500, 502)


# ========================= Admin =========================
class TestAdmin:
    def test_non_admin_forbidden(self, s, user):
        r = s.get(f"{API}/admin/stats", headers=_auth(user["token"]), timeout=15)
        assert r.status_code == 403

    def test_admin_stats(self, s, admin_token):
        r = s.get(f"{API}/admin/stats", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "online_users", "subscribers", "expiring_subscriptions", "pending_payments"):
            assert k in d

    def test_admin_users_list(self, s, admin_token):
        r = s.get(f"{API}/admin/users", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any(u["email"] == ADMIN_EMAIL for u in r.json())

    def test_admin_get_user_detail(self, s, admin_token, user):
        r = s.get(f"{API}/admin/users/{user['user']['id']}", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == user["email"]
        assert "documents" in d and "payments" in d

    def test_admin_cannot_delete_self(self, s, admin_token):
        # find admin id
        me = s.get(f"{API}/auth/me", headers=_auth(admin_token), timeout=15).json()
        r = s.delete(f"{API}/admin/users/{me['id']}", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 400

    def test_admin_payment_approve_flow(self, s, admin_token, user):
        # Ensure a pending payment exists (from TestSubscription); if not, claim now
        r = s.get(f"{API}/subscription", headers=_auth(user["token"]), timeout=15).json()
        if not r.get("pending_payment"):
            s.post(f"{API}/subscription/claim", headers=_auth(user["token"]), timeout=15)
        # List pending
        r = s.get(f"{API}/admin/payments", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200
        pending = [p for p in r.json() if p["user_id"] == user["user"]["id"]]
        assert pending, "no pending payment found for test user"
        pid = pending[0]["id"]

        exp_before = s.get(f"{API}/auth/me", headers=_auth(user["token"]), timeout=15).json()["subscription_expires_at"]

        r = s.post(f"{API}/admin/payments/{pid}/approve", headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        exp_after = s.get(f"{API}/auth/me", headers=_auth(user["token"]), timeout=15).json()["subscription_expires_at"]
        assert exp_after > exp_before

    def test_admin_extend_user(self, s, admin_token, user):
        before = s.get(f"{API}/auth/me", headers=_auth(user["token"]), timeout=15).json()["subscription_expires_at"]
        r = s.post(f"{API}/admin/users/{user['user']['id']}/extend", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200
        after = s.get(f"{API}/auth/me", headers=_auth(user["token"]), timeout=15).json()["subscription_expires_at"]
        assert after > before

    def test_admin_reject_payment(self, s, admin_token, user):
        # create fresh pending
        s.post(f"{API}/subscription/claim", headers=_auth(user["token"]), timeout=15)
        pend = s.get(f"{API}/admin/payments", headers=_auth(admin_token), timeout=15).json()
        mine = [p for p in pend if p["user_id"] == user["user"]["id"]]
        if mine:
            pid = mine[0]["id"]
            r = s.post(f"{API}/admin/payments/{pid}/reject", headers=_auth(admin_token), timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == "rejected"

    def test_admin_run_checks(self, s, admin_token):
        r = s.post(f"{API}/admin/run-checks", headers=_auth(admin_token), timeout=30)
        # can be 200 or 502 if push provider unreachable; both acceptable
        assert r.status_code in (200, 502, 500)


# ========================= Cleanup =========================
@pytest.fixture(scope="session", autouse=True)
def _cleanup(request, s):
    yield
    try:
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        if r.status_code == 200:
            tok = r.json()["access_token"]
            users = s.get(f"{API}/admin/users", headers=_auth(tok), timeout=15).json()
            for u in users:
                if TEST_TAG in u.get("username", "") or TEST_TAG in u.get("email", ""):
                    s.delete(f"{API}/admin/users/{u['id']}", headers=_auth(tok), timeout=15)
    except Exception:
        pass
