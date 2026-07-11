"""
Design Portfolio Backend
- Emergent Google OAuth with admin allowlist
- Canva Connect API (multi-account OAuth with PKCE)
- Projects CRUD with provider-agnostic schema
- AI auto-categorization via Claude Sonnet 4.5
- Sync engine with dedup & delete detection
"""
import os
import re
import json
import uuid
import base64
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, Response, Cookie, Header, Query, UploadFile, File, Form
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ------------------- Setup -------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("portfolio")

app = FastAPI(title="Design Portfolio API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_EMAILS_ENV = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]

# ------------------- Status Workflow -------------------
STATUS_VALUES = ["imported", "needs_review", "draft", "published", "archived"]

# ------------------- Storage (provider-agnostic) -------------------
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
R2_CONFIGURED = bool(os.environ.get("R2_ACCOUNT_ID") and os.environ.get("R2_ACCESS_KEY_ID")
                     and os.environ.get("R2_SECRET_ACCESS_KEY") and os.environ.get("R2_BUCKET"))

class Storage:
    """Provider-agnostic storage. Local by default; R2 when configured."""
    async def put(self, key: str, data: bytes, content_type: str) -> str:
        if R2_CONFIGURED:
            return await self._put_r2(key, data, content_type)
        p = UPLOAD_DIR / key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return f"/api/assets/file/{key}"

    async def delete(self, key: str) -> None:
        if R2_CONFIGURED:
            await self._delete_r2(key); return
        p = UPLOAD_DIR / key
        if p.exists():
            p.unlink()

    async def _put_r2(self, key: str, data: bytes, content_type: str) -> str:
        import boto3  # lazy import
        s3 = boto3.client("s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        s3.put_object(Bucket=os.environ["R2_BUCKET"], Key=key, Body=data, ContentType=content_type, ACL="public-read")
        public_base = os.environ.get("R2_PUBLIC_BASE_URL")
        return f"{public_base.rstrip('/')}/{key}" if public_base else f"/api/assets/file/{key}"

    async def _delete_r2(self, key: str) -> None:
        import boto3
        s3 = boto3.client("s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        s3.delete_object(Bucket=os.environ["R2_BUCKET"], Key=key)

storage = Storage()

# ------------------- Helpers -------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.isoformat()

def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", (text or "untitled").lower())
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text or f"design-{uuid.uuid4().hex[:8]}"

async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.canva_accounts.create_index([("user_id", 1), ("canva_user_id", 1)], unique=True)
    # Partial unique index: only enforce uniqueness when external_id is a string
    # (manual projects set external_id=None and multiple such rows must coexist).
    try:
        await db.projects.create_index(
            [("provider", 1), ("external_id", 1)],
            unique=True,
            name="provider_external_id_unique",
            partialFilterExpression={"external_id": {"$type": "string"}},
        )
    except Exception:
        # Legacy (non-partial) index exists — drop and recreate.
        try:
            await db.projects.drop_index("provider_1_external_id_1")
        except Exception:
            pass
        await db.projects.create_index(
            [("provider", 1), ("external_id", 1)],
            unique=True,
            name="provider_external_id_unique",
            partialFilterExpression={"external_id": {"$type": "string"}},
        )
    await db.projects.create_index("slug", unique=True, sparse=True)
    await db.projects.create_index("status")
    await db.projects.create_index("organization")
    await db.projects.create_index([("title", "text"), ("description", "text"), ("tags", "text")])
    await db.admin_allowlist.create_index("email", unique=True)
    await db.assets.create_index("id", unique=True)
    await db.assets.create_index("project_id")

@app.on_event("startup")
async def startup():
    await ensure_indexes()
    # Seed admin allowlist from env
    for email in ADMIN_EMAILS_ENV:
        await db.admin_allowlist.update_one(
            {"email": email},
            {"$setOnInsert": {"email": email, "role": "owner", "enabled": True, "created_at": iso(now_utc())}},
            upsert=True,
        )
    logger.info(f"Seeded admin allowlist: {ADMIN_EMAILS_ENV}")

# ------------------- Auth -------------------
async def is_email_allowed(email: str) -> bool:
    if not email:
        return False
    doc = await db.admin_allowlist.find_one({"email": email.lower(), "enabled": True}, {"_id": 0})
    return doc is not None

async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    exp = sess.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not await is_email_allowed(user.get("email", "")):
        raise HTTPException(status_code=403, detail="Access denied — not in admin allowlist")
    return user

@api.post("/auth/session")
async def create_session(payload: Dict[str, Any], response: Response):
    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = (data.get("email") or "").lower()
    if not await is_email_allowed(email):
        raise HTTPException(status_code=403, detail=f"Access denied for {email}. Not in admin allowlist.")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture"), "last_login": iso(now_utc())}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "is_admin": True,
            "created_at": iso(now_utc()),
        })

    session_token = data.get("session_token") or f"tok_{uuid.uuid4().hex}"
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": iso(expires_at),
        "created_at": iso(now_utc()),
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return {"user_id": user_id, "email": email, "name": data.get("name"), "picture": data.get("picture")}

@api.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return {"user_id": user["user_id"], "email": user["email"], "name": user.get("name"), "picture": user.get("picture")}

@api.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ------------------- Admin Allowlist -------------------
@api.get("/admin/allowlist")
async def list_allowlist(user=Depends(get_current_user)):
    items = await db.admin_allowlist.find({}, {"_id": 0}).to_list(500)
    return {"items": items}

@api.post("/admin/allowlist")
async def add_allowlist(payload: Dict[str, Any], user=Depends(get_current_user)):
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "email required")
    await db.admin_allowlist.update_one(
        {"email": email},
        {"$set": {"email": email, "role": payload.get("role", "editor"), "enabled": True, "created_at": iso(now_utc())}},
        upsert=True,
    )
    return {"ok": True}

@api.delete("/admin/allowlist/{email}")
async def remove_allowlist(email: str, user=Depends(get_current_user)):
    await db.admin_allowlist.delete_one({"email": email.lower()})
    return {"ok": True}

# ------------------- Canva OAuth -------------------
CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
CANVA_REVOKE_URL = "https://api.canva.com/rest/v1/oauth/revoke"
CANVA_SCOPES = "profile:read design:meta:read design:content:read folder:read asset:read"

def canva_basic_auth() -> str:
    cid = os.environ.get("CANVA_CLIENT_ID", "")
    sec = os.environ.get("CANVA_CLIENT_SECRET", "")
    return "Basic " + base64.b64encode(f"{cid}:{sec}".encode()).decode()

def canva_configured() -> bool:
    return bool(os.environ.get("CANVA_CLIENT_ID") and os.environ.get("CANVA_CLIENT_SECRET") and os.environ.get("CANVA_REDIRECT_URI"))

@api.get("/canva/status")
async def canva_status(user=Depends(get_current_user)):
    accounts = await db.canva_accounts.find({"user_id": user["user_id"]}, {"_id": 0, "access_token": 0, "refresh_token": 0}).to_list(50)
    return {"configured": canva_configured(), "accounts": accounts}

@api.get("/canva/connect")
async def canva_connect(user=Depends(get_current_user)):
    if not canva_configured():
        raise HTTPException(400, "Canva integration not configured. Set CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI in backend/.env")
    code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip("=")
    state = uuid.uuid4().hex
    await db.canva_oauth_states.insert_one({
        "state": state, "code_verifier": code_verifier,
        "user_id": user["user_id"], "created_at": iso(now_utc()),
    })
    url = (
        f"{CANVA_AUTH_URL}?response_type=code"
        f"&client_id={os.environ['CANVA_CLIENT_ID']}"
        f"&redirect_uri={os.environ['CANVA_REDIRECT_URI']}"
        f"&scope={CANVA_SCOPES.replace(' ', '%20')}"
        f"&state={state}&code_challenge={code_challenge}&code_challenge_method=s256"
    )
    return {"url": url}

@api.get("/canva/callback")
async def canva_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    frontend = os.environ.get("FRONTEND_URL", "/")
    if error or not code or not state:
        return RedirectResponse(url=f"{frontend}/admin?canva=error")
    st = await db.canva_oauth_states.find_one_and_delete({"state": state})
    if not st:
        return RedirectResponse(url=f"{frontend}/admin?canva=invalid_state")

    async with httpx.AsyncClient(timeout=30.0) as hc:
        r = await hc.post(
            CANVA_TOKEN_URL,
            headers={"Authorization": canva_basic_auth(), "Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code", "code": code,
                "code_verifier": st["code_verifier"],
                "redirect_uri": os.environ["CANVA_REDIRECT_URI"],
            },
        )
        if r.status_code != 200:
            logger.error(f"Canva token exchange failed: {r.text}")
            return RedirectResponse(url=f"{frontend}/admin?canva=token_failed")
        tok = r.json()
        pr = await hc.get("https://api.canva.com/rest/v1/users/me", headers={"Authorization": f"Bearer {tok['access_token']}"})
        pdata = pr.json()
        prof = pdata.get("user", pdata) if isinstance(pdata, dict) else {}
        canva_uid = prof.get("id") or prof.get("user_id") or uuid.uuid4().hex
        display = prof.get("display_name") or prof.get("email") or "Canva Account"

    expires_at = now_utc() + timedelta(seconds=int(tok.get("expires_in", 3600)))
    await db.canva_accounts.update_one(
        {"user_id": st["user_id"], "canva_user_id": canva_uid},
        {"$set": {
            "user_id": st["user_id"], "canva_user_id": canva_uid, "display_name": display,
            "access_token": tok["access_token"], "refresh_token": tok.get("refresh_token"),
            "expires_at": iso(expires_at), "connected_at": iso(now_utc()), "last_sync": None,
        }},
        upsert=True,
    )
    return RedirectResponse(url=f"{frontend}/admin?canva=connected")

async def canva_valid_token(canva_uid: str) -> str:
    acc = await db.canva_accounts.find_one({"canva_user_id": canva_uid}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Canva account not found")
    exp = datetime.fromisoformat(acc["expires_at"]) if isinstance(acc["expires_at"], str) else acc["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp > now_utc() + timedelta(seconds=30):
        return acc["access_token"]
    # refresh
    async with httpx.AsyncClient(timeout=30.0) as hc:
        r = await hc.post(
            CANVA_TOKEN_URL,
            headers={"Authorization": canva_basic_auth(), "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "refresh_token", "refresh_token": acc.get("refresh_token", "")},
        )
        if r.status_code != 200:
            await db.canva_accounts.update_one({"canva_user_id": canva_uid}, {"$set": {"status": "expired"}})
            raise HTTPException(401, "Canva token expired. Please reconnect.")
        t = r.json()
        new_exp = now_utc() + timedelta(seconds=int(t.get("expires_in", 3600)))
        await db.canva_accounts.update_one(
            {"canva_user_id": canva_uid},
            {"$set": {"access_token": t["access_token"], "refresh_token": t.get("refresh_token", acc.get("refresh_token")), "expires_at": iso(new_exp)}},
        )
        return t["access_token"]

@api.delete("/canva/accounts/{canva_uid}")
async def canva_disconnect(canva_uid: str, user=Depends(get_current_user)):
    acc = await db.canva_accounts.find_one({"canva_user_id": canva_uid, "user_id": user["user_id"]})
    if not acc:
        raise HTTPException(404, "Not found")
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            await hc.post(CANVA_REVOKE_URL,
                          headers={"Authorization": canva_basic_auth(), "Content-Type": "application/x-www-form-urlencoded"},
                          data={"token": acc["access_token"]})
    except Exception as e:
        logger.warning(f"Canva revoke error: {e}")
    await db.canva_accounts.delete_one({"canva_user_id": canva_uid})
    return {"ok": True}

# ------------------- AI Classification -------------------
ORGANIZATIONS = [
    "FIRST Robotics", "Zebra Robotics", "WolfHacks", "Superposition Toronto",
    "Founders Den", "Brampton FBLC", "Ching Scholars", "STEM Organizations",
    "Volunteer Work", "School Projects", "Personal Projects",
]
CATEGORIES = [
    "Branding", "Logo", "Poster", "Flyer", "Presentation", "Certificate",
    "Social Media", "Photography", "Marketing", "Website", "UI Design", "App Design",
    "Infographic", "Banner", "Merchandise", "Print", "Motion Graphics", "Miscellaneous",
]

async def ai_classify(design: Dict[str, Any]) -> Dict[str, Any]:
    """Classify a design using Claude Sonnet 4.5 via emergentintegrations."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"emergentintegrations not available: {e}")
        return {"organization": "Personal Projects", "category": "Miscellaneous", "tags": [], "featured": False, "ai_source": "fallback"}

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return {"organization": "Personal Projects", "category": "Miscellaneous", "tags": [], "featured": False, "ai_source": "no_key"}

    system = (
        "You classify design portfolio projects. "
        f"Organizations: {', '.join(ORGANIZATIONS)}. "
        f"Categories: {', '.join(CATEGORIES)}. "
        "Return ONLY valid JSON with keys: organization (one from list), category (one from list), "
        "tags (array of 3-6 short lowercase strings), featured (boolean — true only for outstanding polished work), "
        "description (1 sentence, <120 chars). No prose."
    )
    payload = {
        "title": design.get("title"), "folder": design.get("folder"),
        "canva_tags": design.get("tags"), "design_type": design.get("design_type"),
        "dimensions": design.get("dimensions"),
    }
    chat = LlmChat(api_key=api_key, session_id=f"classify-{uuid.uuid4().hex[:8]}", system_message=system).with_model("anthropic", "claude-sonnet-4-5-20250929")
    try:
        resp = await chat.send_message(UserMessage(text=f"Classify this design:\n{json.dumps(payload)}"))
        text = resp if isinstance(resp, str) else str(resp)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
            return {
                "organization": data.get("organization") if data.get("organization") in ORGANIZATIONS else "Personal Projects",
                "category": data.get("category") if data.get("category") in CATEGORIES else "Miscellaneous",
                "tags": [str(t).lower() for t in (data.get("tags") or [])][:6],
                "featured": bool(data.get("featured", False)),
                "description": data.get("description", ""),
                "ai_source": "claude-sonnet-4-5",
            }
    except Exception as e:
        logger.error(f"AI classify error: {e}")
    return {"organization": "Personal Projects", "category": "Miscellaneous", "tags": [], "featured": False, "ai_source": "error"}

@api.post("/ai/classify/{project_id}")
async def reclassify_project(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    result = await ai_classify(p)
    await db.projects.update_one({"id": project_id}, {"$set": {**result, "updated_at": iso(now_utc())}})
    return {"ok": True, "result": result}

# ------------------- Canva Sync -------------------
async def fetch_canva_designs(access_token: str) -> List[Dict[str, Any]]:
    designs = []
    url = "https://api.canva.com/rest/v1/designs?limit=100"
    async with httpx.AsyncClient(timeout=60.0) as hc:
        while url:
            r = await hc.get(url, headers={"Authorization": f"Bearer {access_token}"})
            if r.status_code != 200:
                logger.error(f"Canva designs fetch failed: {r.status_code} {r.text[:200]}")
                break
            data = r.json()
            designs.extend(data.get("items", []))
            cont = data.get("continuation")
            url = f"https://api.canva.com/rest/v1/designs?limit=100&continuation={cont}" if cont else None
    return designs

def build_project_from_canva(item: Dict[str, Any], canva_account: Dict[str, Any]) -> Dict[str, Any]:
    thumb = (item.get("thumbnail") or {}).get("url", "")
    urls = item.get("urls") or {}
    return {
        "id": f"proj_{uuid.uuid4().hex[:12]}",
        "provider": "canva",
        "external_id": item.get("id"),
        "source_account": {"canva_user_id": canva_account["canva_user_id"], "display_name": canva_account.get("display_name")},
        "title": item.get("title") or "Untitled Design",
        "slug": slugify(item.get("title") or ""),
        "description": "",
        "organization": None, "category": None, "subcategory": None,
        "project_type": item.get("design_type", {}).get("name") if isinstance(item.get("design_type"), dict) else None,
        "tags": [], "featured": False, "draft": False, "archived": False, "hidden": False,
        "status": "needs_review",
        "thumbnail": thumb, "preview_images": [thumb] if thumb else [],
        "canva_url": urls.get("edit_url"), "view_url": urls.get("view_url"),
        "created_at_source": item.get("created_at"),
        "updated_at_source": item.get("updated_at"),
        "folder": (item.get("folder") or {}).get("name") if isinstance(item.get("folder"), dict) else None,
        "canva_tags": item.get("tags") or [],
        "design_type": (item.get("design_type") or {}).get("name") if isinstance(item.get("design_type"), dict) else None,
        "dimensions": item.get("page_size") or item.get("dimensions"),
        "tools_used": ["Canva"], "role": None,
        "skills": [], "project_date": item.get("created_at"),
        "case_study": {"challenge": "", "goal": "", "process": "", "outcome": "", "impact": "", "timeline": ""},
        "ai_suggestions": None,
        "color_palette": [], "typography": [], "order": 0,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }

@api.post("/canva/sync")
async def sync_canva(body: Optional[Dict[str, Any]] = None, user=Depends(get_current_user)):
    body = body or {}
    target_account = body.get("canva_user_id")
    use_ai = body.get("ai_classify", True)

    accounts = await db.canva_accounts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    if target_account:
        accounts = [a for a in accounts if a["canva_user_id"] == target_account]
    if not accounts:
        raise HTTPException(404, "No Canva account connected")

    log = {"id": f"sync_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "started_at": iso(now_utc()),
           "accounts": [a["canva_user_id"] for a in accounts], "status": "running",
           "created": 0, "updated": 0, "deleted": 0, "errors": []}
    await db.sync_logs.insert_one(log)

    total_created = total_updated = total_deleted = 0
    seen_external_ids = set()

    for acc in accounts:
        try:
            token = await canva_valid_token(acc["canva_user_id"])
            items = await fetch_canva_designs(token)
            for item in items:
                ext = item.get("id")
                if not ext:
                    continue
                seen_external_ids.add(ext)
                existing = await db.projects.find_one({"provider": "canva", "external_id": ext}, {"_id": 0})
                proj = build_project_from_canva(item, acc)
                if existing:
                    # preserve manual overrides
                    preserve = {k: existing[k] for k in ("organization", "category", "tags", "featured", "description",
                                                        "role", "color_palette", "typography", "manual_overrides",
                                                        "status", "case_study", "skills", "order", "project_date")
                                if k in existing and existing.get(k) not in (None, "", [])}
                    proj.update({k: v for k, v in preserve.items()})
                    proj["id"] = existing["id"]
                    proj["created_at"] = existing.get("created_at", proj["created_at"])
                    await db.projects.update_one({"id": existing["id"]}, {"$set": proj})
                    total_updated += 1
                else:
                    if use_ai:
                        ai = await ai_classify(proj)
                        proj.update(ai)
                    await db.projects.insert_one(proj)
                    total_created += 1
            await db.canva_accounts.update_one({"canva_user_id": acc["canva_user_id"]}, {"$set": {"last_sync": iso(now_utc())}})
        except HTTPException as e:
            log["errors"].append({"account": acc["canva_user_id"], "error": e.detail})
        except Exception as e:
            log["errors"].append({"account": acc["canva_user_id"], "error": str(e)})

    # detect deleted (only for full syncs)
    if not target_account and seen_external_ids:
        db_projs = await db.projects.find({"provider": "canva"}, {"_id": 0, "external_id": 1, "id": 1}).to_list(5000)
        for p in db_projs:
            if p["external_id"] not in seen_external_ids:
                await db.projects.update_one({"id": p["id"]}, {"$set": {"archived": True, "deleted_at_source": iso(now_utc())}})
                total_deleted += 1

    await db.sync_logs.update_one({"id": log["id"]}, {"$set": {
        "status": "completed", "finished_at": iso(now_utc()),
        "created": total_created, "updated": total_updated, "deleted": total_deleted,
        "errors": log["errors"],
    }})
    return {"created": total_created, "updated": total_updated, "deleted": total_deleted, "errors": log["errors"]}

@api.get("/sync/logs")
async def sync_logs(user=Depends(get_current_user)):
    logs = await db.sync_logs.find({}, {"_id": 0}).sort("started_at", -1).limit(20).to_list(20)
    return {"items": logs}

# ------------------- Projects Public API -------------------
@api.get("/projects")
async def list_projects(
    q: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    year: Optional[int] = None,
    project_type: Optional[str] = None,
    featured: Optional[bool] = None,
    tag: Optional[str] = None,
    status: Optional[str] = None,
    sort: str = "newest",
    limit: int = 60,
    skip: int = 0,
    include_hidden: bool = False,
):
    match: Dict[str, Any] = {}
    if status:
        match["status"] = status
    if not include_hidden:
        # Public listing: only show published (and legacy projects without status field that aren't draft/hidden/archived)
        match["$and"] = [
            {"$or": [{"status": "published"}, {"status": {"$exists": False}}]},
            {"archived": {"$ne": True}},
            {"hidden": {"$ne": True}},
            {"draft": {"$ne": True}},
        ]
    if organization: match["organization"] = organization
    if category: match["category"] = category
    if project_type: match["project_type"] = project_type
    if featured is not None: match["featured"] = featured
    if tag: match["tags"] = tag
    if q:
        match.setdefault("$and", []).append({"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
            {"organization": {"$regex": q, "$options": "i"}},
            {"skills": {"$regex": q, "$options": "i"}},
        ]}) if "$and" in match else match.update({"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
            {"organization": {"$regex": q, "$options": "i"}},
            {"skills": {"$regex": q, "$options": "i"}},
        ]})
    if year:
        match["$expr"] = {"$eq": [{"$year": {"$dateFromString": {"dateString": "$created_at", "onError": None}}}, year]}

    sort_map = {
        "newest": [("created_at", -1)],
        "oldest": [("created_at", 1)],
        "alphabetical": [("title", 1)],
        "recently_updated": [("updated_at", -1)],
        "manual": [("order", 1), ("created_at", -1)],
    }
    cursor = db.projects.find(match, {"_id": 0}).sort(sort_map.get(sort, sort_map["newest"])).skip(skip).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.projects.count_documents(match)
    return {"items": items, "total": total, "limit": limit, "skip": skip}

@api.get("/projects/stats")
async def project_stats():
    total = await db.projects.count_documents({"archived": {"$ne": True}})
    featured = await db.projects.count_documents({"featured": True, "archived": {"$ne": True}})
    by_org = await db.projects.aggregate([
        {"$match": {"archived": {"$ne": True}, "organization": {"$ne": None}}},
        {"$group": {"_id": "$organization", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(30)
    by_cat = await db.projects.aggregate([
        {"$match": {"archived": {"$ne": True}, "category": {"$ne": None}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(30)
    last_sync = await db.sync_logs.find_one({"status": "completed"}, {"_id": 0}, sort=[("finished_at", -1)])
    return {
        "total": total, "featured": featured,
        "by_organization": [{"name": x["_id"], "count": x["count"]} for x in by_org],
        "by_category": [{"name": x["_id"], "count": x["count"]} for x in by_cat],
        "last_sync": last_sync,
    }

@api.get("/projects/{project_id}")
async def get_project(project_id: str):
    p = await db.projects.find_one({"$or": [{"id": project_id}, {"slug": project_id}]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    # related: same org or same category
    related = await db.projects.find({
        "id": {"$ne": p["id"]}, "archived": {"$ne": True}, "hidden": {"$ne": True},
        "$or": [{"organization": p.get("organization")}, {"category": p.get("category")}],
    }, {"_id": 0}).limit(4).to_list(4)
    return {"project": p, "related": related}

@api.put("/projects/{project_id}")
async def update_project(project_id: str, payload: Dict[str, Any], user=Depends(get_current_user)):
    allowed = {"title", "description", "organization", "category", "subcategory", "project_type",
               "tags", "featured", "draft", "archived", "hidden", "thumbnail", "preview_images",
               "role", "tools_used", "color_palette", "typography", "dimensions", "slug",
               "status", "case_study", "skills", "order", "project_date"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if "title" in update and "slug" not in update:
        update["slug"] = slugify(update["title"])
    update["updated_at"] = iso(now_utc())
    # track manual overrides
    update.setdefault("manual_overrides", True)
    r = await db.projects.update_one({"id": project_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user=Depends(get_current_user)):
    r = await db.projects.delete_one({"id": project_id})
    return {"ok": r.deleted_count > 0}

@api.post("/projects")
async def create_project(payload: Dict[str, Any], user=Depends(get_current_user)):
    proj = {
        "id": f"proj_{uuid.uuid4().hex[:12]}",
        "provider": payload.get("provider", "manual"),
        "external_id": None,
        "title": payload.get("title", "Untitled"),
        "slug": slugify(payload.get("title", "")),
        "description": payload.get("description", ""),
        "organization": payload.get("organization"),
        "category": payload.get("category"),
        "project_type": payload.get("project_type"),
        "tags": payload.get("tags", []),
        "featured": payload.get("featured", False),
        "draft": payload.get("draft", False),
        "archived": False, "hidden": False,
        "thumbnail": payload.get("thumbnail", ""),
        "preview_images": payload.get("preview_images", []),
        "canva_url": payload.get("canva_url"),
        "view_url": payload.get("view_url"),
        "role": payload.get("role"),
        "tools_used": payload.get("tools_used", []),
        "color_palette": payload.get("color_palette", []),
        "typography": payload.get("typography", []),
        "dimensions": payload.get("dimensions"),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.projects.insert_one(proj)
    return {"ok": True, "project": {k: v for k, v in proj.items() if k != "_id"}}

# ------------------- Admin Dashboard -------------------
@api.get("/admin/dashboard")
async def admin_dashboard(user=Depends(get_current_user)):
    total = await db.projects.count_documents({})
    featured = await db.projects.count_documents({"featured": True})
    uncategorized = await db.projects.count_documents({"$or": [{"category": None}, {"organization": None}]})
    by_status = {}
    for s in STATUS_VALUES:
        by_status[s] = await db.projects.count_documents({"status": s})
    needing_review = by_status.get("needs_review", 0) + await db.projects.count_documents({"draft": True, "status": {"$exists": False}})
    published = by_status.get("published", 0)
    archived = by_status.get("archived", 0) + await db.projects.count_documents({"archived": True, "status": {"$exists": False}})
    accounts = await db.canva_accounts.find({"user_id": user["user_id"]},
                                            {"_id": 0, "access_token": 0, "refresh_token": 0}).to_list(50)
    last_sync = await db.sync_logs.find_one({}, {"_id": 0}, sort=[("started_at", -1)])
    recent_errors = await db.sync_logs.find({"errors": {"$ne": []}}, {"_id": 0}).sort("started_at", -1).limit(5).to_list(5)
    asset_count = await db.assets.count_documents({})
    return {
        "totals": {"projects": total, "featured": featured, "uncategorized": uncategorized,
                   "needing_review": needing_review, "published": published, "archived": archived,
                   "assets": asset_count},
        "by_status": by_status,
        "canva_accounts": accounts, "canva_configured": canva_configured(),
        "storage": {"r2_configured": R2_CONFIGURED, "local_path": str(UPLOAD_DIR)},
        "last_sync": last_sync, "recent_errors": recent_errors,
        "api_status": "ok", "db_status": "ok",
    }

# ------------------- Bulk Actions -------------------
@api.post("/projects/bulk")
async def bulk_projects(payload: Dict[str, Any], user=Depends(get_current_user)):
    ids = payload.get("ids") or []
    action = payload.get("action")
    if not ids or not action:
        raise HTTPException(400, "ids and action required")
    q = {"id": {"$in": ids}}
    if action == "delete":
        r = await db.projects.delete_many(q)
        return {"ok": True, "affected": r.deleted_count}
    if action == "archive":
        r = await db.projects.update_many(q, {"$set": {"status": "archived", "archived": True, "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "publish":
        r = await db.projects.update_many(q, {"$set": {"status": "published", "draft": False, "hidden": False, "archived": False, "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "set_status":
        v = payload.get("value")
        if v not in STATUS_VALUES: raise HTTPException(400, "invalid status")
        r = await db.projects.update_many(q, {"$set": {"status": v, "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "set_organization":
        r = await db.projects.update_many(q, {"$set": {"organization": payload.get("value"), "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "set_category":
        r = await db.projects.update_many(q, {"$set": {"category": payload.get("value"), "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "set_featured":
        r = await db.projects.update_many(q, {"$set": {"featured": bool(payload.get("value")), "updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "add_tags":
        tags = payload.get("value") or []
        r = await db.projects.update_many(q, {"$addToSet": {"tags": {"$each": tags}}, "$set": {"updated_at": iso(now_utc())}})
        return {"ok": True, "affected": r.modified_count}
    if action == "reorder":
        # value = [{"id": "...", "order": 0}, ...]
        for item in payload.get("value", []):
            await db.projects.update_one({"id": item["id"]}, {"$set": {"order": int(item.get("order", 0))}})
        return {"ok": True, "affected": len(payload.get("value", []))}
    raise HTTPException(400, f"unknown action: {action}")

# ------------------- AI Suggestions (non-destructive) -------------------
async def _llm_json(system: str, prompt: str, model: str = "claude-sonnet-4-5-20250929") -> Optional[Dict[str, Any]]:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"emergentintegrations not available: {e}")
        return None
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key: return None
    chat = LlmChat(api_key=api_key, session_id=f"ai-{uuid.uuid4().hex[:8]}", system_message=system).with_model("anthropic", model)
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        return json.loads(m.group(0)) if m else None
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return None

@api.post("/ai/suggest/{project_id}")
async def ai_suggest(project_id: str, user=Depends(get_current_user)):
    """Generate AI suggestions for a project. Does NOT apply changes — returns suggestions with confidence."""
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    system = (
        "You suggest metadata for a design portfolio project. "
        f"Valid organizations: {', '.join(ORGANIZATIONS)}. "
        f"Valid categories: {', '.join(CATEGORIES)}. "
        "Return ONLY JSON with keys: title (improved title), description (2-3 sentences), "
        "organization (from list), category (from list), tags (array 4-8 lowercase), "
        "skills (array of 3-6 skills demonstrated, e.g. 'Brand Identity', 'Typography', 'Layout Design'), "
        "tools_used (array), featured (boolean), "
        "confidence (object: {organization: 0-1, category: 0-1, overall: 0-1}), "
        "reasoning (1 sentence). No prose."
    )
    ctx = {"title": p.get("title"), "folder": p.get("folder"), "current_description": p.get("description"),
           "current_org": p.get("organization"), "current_cat": p.get("category"),
           "current_tags": p.get("tags"), "design_type": p.get("design_type"),
           "canva_tags": p.get("canva_tags"), "dimensions": p.get("dimensions")}
    result = await _llm_json(system, f"Suggest metadata for this project:\n{json.dumps(ctx)}")
    if not result:
        raise HTTPException(503, "AI service unavailable")
    # sanitize
    out = {
        "title": result.get("title"),
        "description": result.get("description"),
        "organization": result.get("organization") if result.get("organization") in ORGANIZATIONS else None,
        "category": result.get("category") if result.get("category") in CATEGORIES else None,
        "tags": [str(t).lower() for t in (result.get("tags") or [])][:8],
        "skills": [str(s) for s in (result.get("skills") or [])][:6],
        "tools_used": [str(t) for t in (result.get("tools_used") or [])][:8],
        "featured": bool(result.get("featured", False)),
        "confidence": result.get("confidence") or {},
        "reasoning": result.get("reasoning", ""),
        "generated_at": iso(now_utc()), "model": "claude-sonnet-4-5",
    }
    await db.projects.update_one({"id": project_id}, {"$set": {"ai_suggestions": out, "updated_at": iso(now_utc())}})
    return {"ok": True, "suggestions": out}

@api.post("/ai/case-study/{project_id}")
async def ai_case_study(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    system = (
        "You draft a case study for a design portfolio. Return ONLY JSON with keys: "
        "challenge (2-3 sentences), goal (1-2 sentences), process (3-4 sentences), "
        "outcome (1-2 sentences), impact (metric-oriented, 1-2 sentences), timeline (e.g. '2 weeks'). "
        "Be specific, realistic, and grounded in the project details. Do not invent metrics."
    )
    ctx = {"title": p.get("title"), "organization": p.get("organization"), "category": p.get("category"),
           "description": p.get("description"), "tags": p.get("tags"), "role": p.get("role"),
           "tools_used": p.get("tools_used")}
    result = await _llm_json(system, f"Draft a case study for:\n{json.dumps(ctx)}")
    if not result:
        raise HTTPException(503, "AI service unavailable")
    cs = {k: result.get(k, "") for k in ("challenge", "goal", "process", "outcome", "impact", "timeline")}
    cs["generated_at"] = iso(now_utc())
    return {"ok": True, "case_study": cs}

@api.post("/ai/improve-description/{project_id}")
async def ai_improve_description(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    system = ("Improve a design portfolio project description. Return ONLY JSON: {\"description\": \"...\"}. "
              "2-3 sentences, warm-professional tone, focused on impact, no fluff.")
    ctx = {"title": p.get("title"), "description": p.get("description"), "organization": p.get("organization"),
           "category": p.get("category"), "tags": p.get("tags")}
    result = await _llm_json(system, f"Improve:\n{json.dumps(ctx)}")
    if not result: raise HTTPException(503, "AI service unavailable")
    return {"ok": True, "description": result.get("description", "")}

@api.post("/projects/{project_id}/apply-suggestions")
async def apply_suggestions(project_id: str, payload: Dict[str, Any], user=Depends(get_current_user)):
    """Apply specific AI-suggested fields. payload = {fields: ['title', 'tags', ...]}"""
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    sug = p.get("ai_suggestions") or {}
    fields = payload.get("fields") or []
    upd: Dict[str, Any] = {}
    for f in fields:
        if f in sug and sug[f] not in (None, ""):
            upd[f] = sug[f]
    if not upd:
        return {"ok": True, "applied": []}
    upd["updated_at"] = iso(now_utc())
    upd["manual_overrides"] = True
    if "title" in upd:
        upd["slug"] = slugify(upd["title"])
    await db.projects.update_one({"id": project_id}, {"$set": upd})
    return {"ok": True, "applied": list(upd.keys())}

# ------------------- Assets (uploads) -------------------
@api.post("/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    MAX = 1024 * 1024 * 1024  # 1 GB soft ceiling
    ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
               "video/mp4", "video/quicktime", "video/webm"}
    ct = file.content_type or "application/octet-stream"
    data = await file.read()
    if len(data) > MAX:
        raise HTTPException(413, "File too large (max 1 GB)")
    if ct not in ALLOWED and not (ct.startswith("image/") or ct.startswith("video/")):
        raise HTTPException(415, f"Unsupported content type: {ct}")

    asset_id = f"ast_{uuid.uuid4().hex[:12]}"
    ext = (file.filename or "").split(".")[-1].lower()[:8] or "bin"
    key = f"assets/{asset_id}.{ext}"
    url = await storage.put(key, data, ct)

    doc = {
        "id": asset_id, "key": key, "url": url, "filename": file.filename,
        "content_type": ct, "size": len(data), "project_id": project_id,
        "uploaded_by": user["user_id"], "uploaded_at": iso(now_utc()),
        "storage": "r2" if R2_CONFIGURED else "local",
    }
    await db.assets.insert_one(doc)
    if project_id:
        await db.projects.update_one({"id": project_id},
            {"$push": {"preview_images": url}, "$set": {"updated_at": iso(now_utc())}})
    return {"ok": True, "asset": {k: v for k, v in doc.items() if k != "_id"}}

@api.get("/assets")
async def list_assets(project_id: Optional[str] = None, unused_only: bool = False, limit: int = 100, skip: int = 0, user=Depends(get_current_user)):
    match: Dict[str, Any] = {}
    if project_id: match["project_id"] = project_id
    if unused_only: match["project_id"] = None
    items = await db.assets.find(match, {"_id": 0}).sort("uploaded_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.assets.count_documents(match)
    return {"items": items, "total": total}

@api.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user=Depends(get_current_user)):
    a = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not a: raise HTTPException(404, "Not found")
    try: await storage.delete(a["key"])
    except Exception as e: logger.warning(f"asset delete failed: {e}")
    if a.get("project_id"):
        await db.projects.update_one({"id": a["project_id"]}, {"$pull": {"preview_images": a["url"]}})
    await db.assets.delete_one({"id": asset_id})
    return {"ok": True}

@api.get("/assets/file/{path:path}")
async def serve_asset(path: str):
    p = UPLOAD_DIR / path
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(str(p))

@api.get("/")
async def root():
    return {"service": "Design Portfolio API", "status": "ok"}

app.include_router(api)

@app.on_event("shutdown")
async def shutdown():
    client.close()
