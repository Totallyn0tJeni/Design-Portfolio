"""Phase 2 backend tests: status workflow, bulk actions, AI, assets, dashboard v2."""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://canva-project-sync.preview.emergentagent.com").rstrip("/")
SESSION_TOKEN = os.environ.get("TEST_SESSION_TOKEN", "test_session_1783738416695")

HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}"}


@pytest.fixture(scope="session")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {SESSION_TOKEN}"})
    return ss


@pytest.fixture(scope="session")
def created_ids():
    ids = []
    yield ids
    # cleanup
    for pid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/projects/{pid}", headers=HEADERS, timeout=10)
        except Exception:
            pass


# ---------- Sanity ----------
def test_auth_me(s):
    r = s.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text
    assert r.json()["email"].endswith("@gmail.com")


def test_seed_wiped():
    r = requests.get(f"{BASE_URL}/api/projects", timeout=10)
    assert r.status_code == 200
    assert r.json()["total"] == 0


# ---------- Manual project + status ----------
def test_create_manual_project(s, created_ids):
    r = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_Manual Project 1", "description": "hello"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    pid = body["project"]["id"]
    created_ids.append(pid)
    # visible in admin listing
    r2 = s.get(f"{BASE_URL}/api/projects", params={"include_hidden": True, "limit": 100})
    assert r2.status_code == 200
    ids = [p["id"] for p in r2.json()["items"]]
    assert pid in ids


def test_put_updates_new_fields(s, created_ids):
    pid = created_ids[0]
    payload = {
        "status": "published",
        "case_study": {"challenge": "c1", "goal": "g1", "process": "p1", "outcome": "o1", "impact": "i1", "timeline": "2 weeks"},
        "skills": ["Brand"],
        "order": 1,
        "project_date": "2025-01-15",
    }
    r = s.put(f"{BASE_URL}/api/projects/{pid}", json=payload)
    assert r.status_code == 200, r.text
    # verify via GET
    g = requests.get(f"{BASE_URL}/api/projects/{pid}", timeout=10)
    assert g.status_code == 200
    p = g.json()["project"]
    assert p["status"] == "published"
    assert p["case_study"]["challenge"] == "c1"
    assert p["skills"] == ["Brand"]
    assert p["order"] == 1
    assert p["project_date"] == "2025-01-15"


def test_status_filter(s, created_ids):
    r = s.get(f"{BASE_URL}/api/projects", params={"status": "published", "include_hidden": True})
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert created_ids[0] in ids
    # draft should not include it
    r2 = s.get(f"{BASE_URL}/api/projects", params={"status": "draft", "include_hidden": True})
    ids2 = [p["id"] for p in r2.json()["items"]]
    assert created_ids[0] not in ids2


def test_public_excludes_non_published(s, created_ids):
    # public listing shows the published project
    r = requests.get(f"{BASE_URL}/api/projects", timeout=10)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert created_ids[0] in ids
    # move to draft and check disappears
    s.put(f"{BASE_URL}/api/projects/{created_ids[0]}", json={"status": "draft"})
    r2 = requests.get(f"{BASE_URL}/api/projects", timeout=10)
    ids2 = [p["id"] for p in r2.json()["items"]]
    assert created_ids[0] not in ids2
    # restore
    s.put(f"{BASE_URL}/api/projects/{created_ids[0]}", json={"status": "published"})


# ---------- Bulk actions ----------
@pytest.fixture(scope="module")
def bulk_ids(s):
    ids = []
    for i in range(3):
        r = s.post(f"{BASE_URL}/api/projects", json={"title": f"TEST_Bulk {i}"})
        assert r.status_code == 200
        ids.append(r.json()["project"]["id"])
    yield ids
    for pid in ids:
        requests.delete(f"{BASE_URL}/api/projects/{pid}", headers=HEADERS, timeout=10)


def test_bulk_set_status(s, bulk_ids):
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": bulk_ids, "action": "set_status", "value": "published"})
    assert r.status_code == 200, r.text
    assert r.json()["affected"] == 3


def test_bulk_set_organization(s, bulk_ids):
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": bulk_ids, "action": "set_organization", "value": "FIRST Robotics"})
    assert r.status_code == 200
    assert r.json()["affected"] == 3
    g = requests.get(f"{BASE_URL}/api/projects/{bulk_ids[0]}", timeout=10).json()["project"]
    assert g["organization"] == "FIRST Robotics"


def test_bulk_add_tags(s, bulk_ids):
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": bulk_ids, "action": "add_tags", "value": ["test", "bulk"]})
    assert r.status_code == 200
    g = requests.get(f"{BASE_URL}/api/projects/{bulk_ids[0]}", timeout=10).json()["project"]
    assert "test" in g["tags"] and "bulk" in g["tags"]


def test_bulk_set_featured(s, bulk_ids):
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": bulk_ids, "action": "set_featured", "value": True})
    assert r.status_code == 200
    assert r.json()["affected"] == 3


def test_bulk_archive(s, bulk_ids):
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": bulk_ids, "action": "archive"})
    assert r.status_code == 200
    assert r.json()["affected"] == 3
    g = requests.get(f"{BASE_URL}/api/projects/{bulk_ids[0]}", timeout=10).json()["project"]
    assert g["status"] == "archived"


def test_bulk_delete(s):
    ids = []
    for i in range(2):
        r = s.post(f"{BASE_URL}/api/projects", json={"title": f"TEST_DeleteMe {i}"})
        ids.append(r.json()["project"]["id"])
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": ids, "action": "delete"})
    assert r.status_code == 200
    assert r.json()["affected"] == 2
    g = requests.get(f"{BASE_URL}/api/projects/{ids[0]}", timeout=10)
    assert g.status_code == 404


def test_bulk_reorder(s):
    a = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_ReorderA"}).json()["project"]["id"]
    b = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_ReorderB"}).json()["project"]["id"]
    # publish both so they appear in sort
    s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": [a, b], "action": "set_status", "value": "published"})
    r = s.post(f"{BASE_URL}/api/projects/bulk", json={
        "ids": [a, b], "action": "reorder",
        "value": [{"id": a, "order": 1}, {"id": b, "order": 0}],
    })
    assert r.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/projects", params={"sort": "manual", "include_hidden": True, "limit": 100})
    items = r2.json()["items"]
    ids_ordered = [p["id"] for p in items if p["id"] in (a, b)]
    assert ids_ordered[0] == b, f"Expected {b} first, got {ids_ordered}"
    # cleanup
    s.post(f"{BASE_URL}/api/projects/bulk", json={"ids": [a, b], "action": "delete"})


# ---------- AI endpoints (accept 503) ----------
def test_ai_suggest(s, created_ids):
    r = s.post(f"{BASE_URL}/api/ai/suggest/{created_ids[0]}")
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        sug = r.json()["suggestions"]
        for k in ("title", "description", "tags", "skills", "tools_used", "featured", "confidence", "generated_at"):
            assert k in sug
        assert sug["model"] == "claude-sonnet-4-5"
        # persistence
        g = requests.get(f"{BASE_URL}/api/projects/{created_ids[0]}", timeout=10).json()["project"]
        assert g["ai_suggestions"] is not None


def test_ai_case_study(s, created_ids):
    r = s.post(f"{BASE_URL}/api/ai/case-study/{created_ids[0]}")
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        cs = r.json()["case_study"]
        for k in ("challenge", "goal", "process", "outcome", "impact", "timeline"):
            assert k in cs


def test_ai_improve_description(s, created_ids):
    r = s.post(f"{BASE_URL}/api/ai/improve-description/{created_ids[0]}")
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        assert "description" in r.json()


def test_apply_suggestions(s, created_ids):
    # only run if suggestions were generated
    g = requests.get(f"{BASE_URL}/api/projects/{created_ids[0]}", timeout=10).json()["project"]
    if not g.get("ai_suggestions"):
        pytest.skip("no ai_suggestions to apply")
    r = s.post(f"{BASE_URL}/api/projects/{created_ids[0]}/apply-suggestions", json={"fields": ["title", "tags"]})
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------- Assets ----------
def _png_bytes():
    img = Image.new("RGB", (32, 32), (128, 64, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def uploaded_asset():
    files = {"file": ("test.png", _png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/assets/upload", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["asset"]


def test_asset_upload(uploaded_asset):
    assert uploaded_asset["url"].startswith("/api/assets/file/")
    assert uploaded_asset["storage"] == "local"


def test_asset_list(uploaded_asset):
    r = requests.get(f"{BASE_URL}/api/assets", headers=HEADERS, timeout=10)
    assert r.status_code == 200
    ids = [a["id"] for a in r.json()["items"]]
    assert uploaded_asset["id"] in ids


def test_asset_attached_to_project(s, created_ids):
    pid = created_ids[0]
    files = {"file": ("test2.png", _png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/assets/upload", files=files,
                      data={"project_id": pid}, headers=HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    url = r.json()["asset"]["url"]
    g = requests.get(f"{BASE_URL}/api/projects/{pid}", timeout=10).json()["project"]
    assert url in g["preview_images"]


def test_asset_file_serve(uploaded_asset):
    key = uploaded_asset["key"]
    r = requests.get(f"{BASE_URL}/api/assets/file/{key}", timeout=10)
    assert r.status_code == 200
    assert r.content[:8].startswith(b"\x89PNG")


def test_asset_delete(uploaded_asset):
    r = requests.delete(f"{BASE_URL}/api/assets/{uploaded_asset['id']}", headers=HEADERS, timeout=10)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_asset_upload_unauthorized():
    files = {"file": ("t.png", _png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/assets/upload", files=files, timeout=10)
    assert r.status_code == 401


# ---------- Admin dashboard ----------
def test_admin_dashboard_v2(s):
    r = s.get(f"{BASE_URL}/api/admin/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("projects", "published", "assets"):
        assert k in d["totals"]
    assert "by_status" in d
    assert d["storage"]["r2_configured"] is False
