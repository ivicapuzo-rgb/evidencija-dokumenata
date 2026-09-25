import os
import uuid
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Annotated

import jwt
import bcrypt
import httpx
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_DAYS = int(os.environ.get("ACCESS_TOKEN_DAYS", "30"))
ADMIN_USERNAME = os.environ["ADMIN_USERNAME"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
SUBSCRIPTION_PRICE_EUR = os.environ.get("SUBSCRIPTION_PRICE_EUR", "4")
SUBSCRIPTION_MONTHS = int(os.environ.get("SUBSCRIPTION_MONTHS", "6"))
SUBSCRIPTION_IBAN = os.environ.get("SUBSCRIPTION_IBAN", "")
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "14"))

# Object storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "evidencija-dokumenata"

# Push
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("evidencija")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)

# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def _validate_object_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


# ---------------------------------------------------------------------------
# Password + JWT
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user: dict) -> str:
    n = now_utc()
    payload = {
        "sub": str(user["_id"]),
        "username": user["username"],
        "is_admin": bool(user.get("is_admin", False)),
        "iat": n,
        "exp": n + timedelta(days=ACCESS_TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(token: Annotated[str, Depends(oauth2)]) -> dict:
    unauthorized = HTTPException(status_code=401, detail="Neispravan ili istekao token",
                                 headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.InvalidTokenError:
        raise unauthorized
    if not user_id:
        raise unauthorized
    try:
        doc = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise unauthorized
    if not doc or doc.get("deleted_at"):
        raise unauthorized
    # heartbeat for "online users"
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {"last_seen": now_utc()}})
    return doc


async def admin_user(user: Annotated[dict, Depends(current_user)]) -> dict:
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Потребан администраторски приступ")
    return user


# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
_storage_key = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Push
# ---------------------------------------------------------------------------
async def register_push_upstream(body: dict):
    resp = await _push_client.post("/api/v1/push/users/register", json=body)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PublicUser(BaseModel):
    id: str
    username: str
    email: EmailStr
    is_admin: bool
    subscription_expires_at: Optional[str] = None
    is_subscribed: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


class DocumentIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    doc_type: str = "custom"
    expires_at: str  # YYYY-MM-DD
    alarm_days: int = 5


class DocumentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    doc_type: Optional[str] = None
    expires_at: Optional[str] = None
    alarm_days: Optional[int] = None


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
def is_subscribed(user: dict) -> bool:
    exp = user.get("subscription_expires_at")
    if not exp:
        return False
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > now_utc()


def public_user(u: dict) -> dict:
    exp = u.get("subscription_expires_at")
    return {
        "id": str(u["_id"]),
        "username": u["username"],
        "email": u["email"],
        "is_admin": bool(u.get("is_admin", False)),
        "subscription_expires_at": iso(exp) if isinstance(exp, datetime) else exp,
        "is_subscribed": is_subscribed(u),
    }


def days_remaining(expires_at: str) -> int:
    try:
        d = date.fromisoformat(expires_at)
    except Exception:
        return 0
    return (d - date.today()).days


def serialize_document(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "doc_type": doc.get("doc_type", "custom"),
        "expires_at": doc["expires_at"],
        "alarm_days": doc.get("alarm_days", 5),
        "days_remaining": days_remaining(doc["expires_at"]),
        "created_at": iso(doc.get("created_at")),
    }


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    email = str(body.email).lower().strip()
    if await db.users.find_one({"email": email, "deleted_at": {"$exists": False}}):
        raise HTTPException(status_code=409, detail="Емаил адреса је већ регистрована")
    doc = {
        "username": body.username.strip(),
        "email": email,
        "hashed_password": hash_password(body.password),
        "is_admin": False,
        "subscription_expires_at": now_utc() + timedelta(days=TRIAL_DAYS),
        "created_at": now_utc(),
        "last_seen": now_utc(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"access_token": make_token(doc), "user": public_user(doc)}


@api_router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = str(body.email).lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or user.get("deleted_at") or not verify_password(body.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Погрешан емаил или лозинка")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen": now_utc()}})
    return {"access_token": make_token(user), "user": public_user(user)}


@api_router.get("/auth/me", response_model=PublicUser)
async def me(user: Annotated[dict, Depends(current_user)]):
    return public_user(user)


# ---------------------------------------------------------------------------
# Documents (cards)
# ---------------------------------------------------------------------------
@api_router.get("/documents")
async def list_documents(user: Annotated[dict, Depends(current_user)]):
    cursor = db.documents.find({"user_id": str(user["_id"]), "deleted_at": {"$exists": False}})
    docs = await cursor.to_list(500)
    docs.sort(key=lambda d: days_remaining(d["expires_at"]))
    return [serialize_document(d) for d in docs]


@api_router.post("/documents", status_code=201)
async def create_document(body: DocumentIn, user: Annotated[dict, Depends(current_user)]):
    doc = {
        "user_id": str(user["_id"]),
        "name": body.name.strip(),
        "doc_type": body.doc_type,
        "expires_at": body.expires_at,
        "alarm_days": body.alarm_days,
        "created_at": now_utc(),
        "last_notified_at": None,
    }
    result = await db.documents.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_document(doc)


@api_router.put("/documents/{doc_id}")
async def update_document(doc_id: str, body: DocumentUpdate, user: Annotated[dict, Depends(current_user)]):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc or doc.get("deleted_at") or doc["user_id"] != str(user["_id"]):
        raise HTTPException(404, "Документ није пронађен")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        updates["last_notified_at"] = None  # reset notification if data changed
        await db.documents.update_one({"_id": doc["_id"]}, {"$set": updates})
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    return serialize_document(doc)


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: Annotated[dict, Depends(current_user)]):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc or doc.get("deleted_at") or doc["user_id"] != str(user["_id"]):
        raise HTTPException(404, "Документ није пронађен")
    await db.documents.update_one({"_id": doc["_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------
@api_router.get("/subscription")
async def get_subscription(user: Annotated[dict, Depends(current_user)]):
    pending = await db.payments.find_one(
        {"user_id": str(user["_id"]), "status": "pending"}, sort=[("created_at", -1)]
    )
    return {
        "price_eur": SUBSCRIPTION_PRICE_EUR,
        "months": SUBSCRIPTION_MONTHS,
        "iban": SUBSCRIPTION_IBAN,
        "beneficiary": "Евиденција докумената",
        "subscription_expires_at": iso(user.get("subscription_expires_at")) if isinstance(user.get("subscription_expires_at"), datetime) else user.get("subscription_expires_at"),
        "is_subscribed": is_subscribed(user),
        "pending_payment": {
            "id": str(pending["_id"]),
            "status": pending["status"],
            "proof_url": pending.get("proof_url"),
            "created_at": iso(pending.get("created_at")),
        } if pending else None,
    }


@api_router.post("/subscription/claim", status_code=201)
async def claim_payment(user: Annotated[dict, Depends(current_user)], proof_url: Optional[str] = Query(None)):
    existing = await db.payments.find_one({"user_id": str(user["_id"]), "status": "pending"})
    if existing:
        if proof_url:
            await db.payments.update_one({"_id": existing["_id"]}, {"$set": {"proof_url": proof_url}})
        return {"status": "pending", "id": str(existing["_id"])}
    payment = {
        "user_id": str(user["_id"]),
        "username": user["username"],
        "email": user["email"],
        "amount_eur": SUBSCRIPTION_PRICE_EUR,
        "proof_url": proof_url,
        "status": "pending",
        "created_at": now_utc(),
    }
    result = await db.payments.insert_one(payment)
    return {"status": "pending", "id": str(result.inserted_id)}


@api_router.post("/upload")
async def upload_file(user: Annotated[dict, Depends(current_user)], file: UploadFile = File(...)):
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    content = await file.read()
    path = f"{APP_NAME}/uploads/{str(user['_id'])}/{uuid.uuid4()}.{ext}"
    result = await run_in_threadpool(put_object, path, content, file.content_type or "image/jpeg")
    stored_path = result["path"]
    await db.uploads.insert_one({
        "owner_id": str(user["_id"]),
        "storage_path": stored_path,
        "created_at": now_utc(),
    })
    return {"path": stored_path, "url": f"/api/files/{stored_path}"}


@api_router.get("/files/{path:path}")
async def get_file(path: str):
    rec = await db.uploads.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(404, "Датотека није пронађена")
    content, content_type = await run_in_threadpool(get_object, path)
    return Response(content=content, media_type=content_type)


# ---------------------------------------------------------------------------
# Push registration
# ---------------------------------------------------------------------------
@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    return await register_push_upstream(body.model_dump())


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
def _extend_subscription(user: dict) -> datetime:
    current = user.get("subscription_expires_at")
    if isinstance(current, str):
        try:
            current = datetime.fromisoformat(current)
        except Exception:
            current = None
    if isinstance(current, datetime) and current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    base = current if (isinstance(current, datetime) and current > now_utc()) else now_utc()
    return base + timedelta(days=SUBSCRIPTION_MONTHS * 30)


@api_router.get("/admin/stats")
async def admin_stats(_: Annotated[dict, Depends(admin_user)]):
    total_users = await db.users.count_documents({"deleted_at": {"$exists": False}})
    online_cutoff = now_utc() - timedelta(minutes=5)
    online = await db.users.count_documents({"deleted_at": {"$exists": False}, "last_seen": {"$gte": online_cutoff}})
    all_users = await db.users.find({"deleted_at": {"$exists": False}}).to_list(5000)
    subscribers = sum(1 for u in all_users if is_subscribed(u))
    soon = now_utc() + timedelta(days=7)
    expiring = 0
    for u in all_users:
        exp = u.get("subscription_expires_at")
        if isinstance(exp, datetime):
            e = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            if now_utc() < e <= soon:
                expiring += 1
    pending_payments = await db.payments.count_documents({"status": "pending"})
    return {
        "total_users": total_users,
        "online_users": online,
        "subscribers": subscribers,
        "expiring_subscriptions": expiring,
        "pending_payments": pending_payments,
    }


@api_router.get("/admin/users")
async def admin_users(_: Annotated[dict, Depends(admin_user)]):
    users = await db.users.find({"deleted_at": {"$exists": False}}).sort("created_at", -1).to_list(5000)
    return [public_user(u) for u in users]


@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, _: Annotated[dict, Depends(admin_user)]):
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u or u.get("deleted_at"):
        raise HTTPException(404, "Корисник није пронађен")
    docs = await db.documents.find({"user_id": user_id, "deleted_at": {"$exists": False}}).to_list(500)
    payments = await db.payments.find({"user_id": user_id}).sort("created_at", -1).to_list(100)
    return {
        "user": public_user(u),
        "documents": [serialize_document(d) for d in docs],
        "payments": [{
            "id": str(p["_id"]),
            "status": p["status"],
            "amount_eur": p.get("amount_eur"),
            "proof_url": p.get("proof_url"),
            "created_at": iso(p.get("created_at")),
        } for p in payments],
    }


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: Annotated[dict, Depends(admin_user)]):
    if str(admin["_id"]) == user_id:
        raise HTTPException(400, "Не можете обрисати сопствени налог")
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u or u.get("deleted_at"):
        raise HTTPException(404, "Корисник није пронађен")
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"status": "deleted"}


@api_router.get("/admin/payments")
async def admin_payments(_: Annotated[dict, Depends(admin_user)]):
    payments = await db.payments.find({"status": "pending"}).sort("created_at", 1).to_list(1000)
    return [{
        "id": str(p["_id"]),
        "user_id": p["user_id"],
        "username": p.get("username"),
        "email": p.get("email"),
        "amount_eur": p.get("amount_eur"),
        "proof_url": p.get("proof_url"),
        "created_at": iso(p.get("created_at")),
    } for p in payments]


@api_router.post("/admin/payments/{payment_id}/approve")
async def admin_approve_payment(payment_id: str, admin: Annotated[dict, Depends(admin_user)]):
    p = await db.payments.find_one({"_id": ObjectId(payment_id)})
    if not p:
        raise HTTPException(404, "Уплата није пронађена")
    u = await db.users.find_one({"_id": ObjectId(p["user_id"])})
    if not u:
        raise HTTPException(404, "Корисник није пронађен")
    new_exp = _extend_subscription(u)
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"subscription_expires_at": new_exp, "sub_notified_at": None}})
    await db.payments.update_one({"_id": p["_id"]}, {"$set": {"status": "approved", "approved_at": now_utc()}})
    try:
        await send_push(
            recipients=[str(u["_id"])],
            data={"title": "Претплата активирана", "message": f"Ваша претплата важи до {new_exp.strftime('%d.%m.%Y')}.", "action_url": "/subscription"},
        )
    except Exception as e:
        logger.warning(f"Push failed (non-blocking): {e}")
    return {"status": "approved", "subscription_expires_at": iso(new_exp)}


@api_router.post("/admin/payments/{payment_id}/reject")
async def admin_reject_payment(payment_id: str, _: Annotated[dict, Depends(admin_user)]):
    p = await db.payments.find_one({"_id": ObjectId(payment_id)})
    if not p:
        raise HTTPException(404, "Уплата није пронађена")
    await db.payments.update_one({"_id": p["_id"]}, {"$set": {"status": "rejected", "rejected_at": now_utc()}})
    return {"status": "rejected"}


@api_router.post("/admin/users/{user_id}/extend")
async def admin_extend_user(user_id: str, _: Annotated[dict, Depends(admin_user)]):
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u or u.get("deleted_at"):
        raise HTTPException(404, "Корисник није пронађен")
    new_exp = _extend_subscription(u)
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"subscription_expires_at": new_exp, "sub_notified_at": None}})
    return {"status": "extended", "subscription_expires_at": iso(new_exp)}


@api_router.post("/admin/run-checks")
async def admin_run_checks(_: Annotated[dict, Depends(admin_user)]):
    result = await run_expiry_checks()
    return result


# ---------------------------------------------------------------------------
# Expiry check job
# ---------------------------------------------------------------------------
async def run_expiry_checks() -> dict:
    sent_docs = 0
    sent_subs = 0
    # Document expiry reminders
    docs = await db.documents.find({"deleted_at": {"$exists": False}}).to_list(10000)
    today = date.today()
    for d in docs:
        rem = days_remaining(d["expires_at"])
        alarm = d.get("alarm_days", 5)
        # notify when within alarm window (and not already expired far) once per day
        if 0 <= rem <= alarm:
            last = d.get("last_notified_at")
            if isinstance(last, datetime) and last.date() == today:
                continue
            try:
                await send_push(
                    recipients=[d["user_id"]],
                    data={
                        "title": "Документ ускоро истиче",
                        "message": f"{d['name']} истиче за {rem} дана ({d['expires_at']}).",
                        "action_url": "/",
                    },
                    idempotency_key=f"doc-{str(d['_id'])}-{today.isoformat()}",
                )
                await db.documents.update_one({"_id": d["_id"]}, {"$set": {"last_notified_at": now_utc()}})
                sent_docs += 1
            except Exception as e:
                logger.warning(f"Doc push failed: {e}")
    # Subscription expiry reminders (within 5 days)
    users = await db.users.find({"deleted_at": {"$exists": False}}).to_list(10000)
    for u in users:
        exp = u.get("subscription_expires_at")
        if not isinstance(exp, datetime):
            continue
        e = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        days = (e.date() - today).days
        if 0 <= days <= 5:
            last = u.get("sub_notified_at")
            if isinstance(last, datetime) and last.date() == today:
                continue
            try:
                await send_push(
                    recipients=[str(u["_id"])],
                    data={
                        "title": "Претплата ускоро истиче",
                        "message": f"Ваша претплата истиче за {days} дана. Обновите је да не изгубите приступ.",
                        "action_url": "/subscription",
                    },
                    idempotency_key=f"sub-{str(u['_id'])}-{today.isoformat()}",
                )
                await db.users.update_one({"_id": u["_id"]}, {"$set": {"sub_notified_at": now_utc()}})
                sent_subs += 1
            except Exception as e:
                logger.warning(f"Sub push failed: {e}")
    return {"document_notifications": sent_docs, "subscription_notifications": sent_subs}


async def scheduler_loop():
    while True:
        try:
            await run_expiry_checks()
        except Exception as e:
            logger.warning(f"scheduler error: {e}")
        await asyncio.sleep(3600)  # hourly


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Евиденција докумената API"}


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email")
    await db.documents.create_index("user_id")
    # seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({
            "username": ADMIN_USERNAME,
            "email": ADMIN_EMAIL.lower(),
            "hashed_password": hash_password(ADMIN_PASSWORD),
            "is_admin": True,
            "subscription_expires_at": now_utc() + timedelta(days=3650),
            "created_at": now_utc(),
            "last_seen": now_utc(),
        })
        logger.info("Seeded admin user")
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logger.warning(f"storage init failed: {e}")
    asyncio.create_task(scheduler_loop())


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
    await _push_client.aclose()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
