import csv
import hashlib
import hmac
import io
import json
import math
import mimetypes
import os
import secrets
import shutil
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
mimetypes.add_type("application/manifest+json", ".webmanifest")

STATIC_FILES = {"index.html", "manifest.webmanifest", "service-worker.js"}
STATIC_DIRS = {"src", "assets"}


def load_dotenv():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv()

DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.db"
BACKUP_DIR = DATA_DIR / "backups"
HOST = os.environ.get("KXSL_HOST", "0.0.0.0").strip() or "0.0.0.0"
PORT = int(os.environ.get("KXSL_PORT", "4173"))
AMAP_KEY = os.environ.get("AMAP_KEY", "").strip()
ADMIN_USERNAME = os.environ.get("KXSL_ADMIN_USER", "admin").strip() or "admin"
ADMIN_PASSWORD = os.environ.get("KXSL_ADMIN_PASSWORD", "admin123").strip() or "admin123"
SESSION_DAYS = int(os.environ.get("KXSL_SESSION_DAYS", "14"))
ADMIN_USER_ENV_SET = "KXSL_ADMIN_USER" in os.environ
ADMIN_PASSWORD_ENV_SET = "KXSL_ADMIN_PASSWORD" in os.environ
COOKIE_SECURE = os.environ.get("KXSL_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes", "on"}


DEFAULT_SITES = [
    {
        "id": 1,
        "name": "郑东新区顺丰众意西路站",
        "brand": "顺丰",
        "district": "郑东新区",
        "address": "众意西路与农业东路附近",
        "status": "intent",
        "contact": "王老板",
        "phone": "13800001111",
        "currentVehicles": 12,
        "competitorVehicles": 5,
        "potentialVehicles": 3,
        "intentLevel": "高",
        "lastVisit": "2026-05-01",
        "nextFollow": "2026-05-08",
        "concerns": ["维修响应", "押金"],
        "note": "下次带维修保障方案和报价单。",
        "lat": 34.7872,
        "lng": 113.7247,
    },
    {
        "id": 2,
        "name": "金水区中通丰庆路站",
        "brand": "中通",
        "district": "金水区",
        "address": "丰庆路与北三环附近",
        "status": "active",
        "contact": "刘站长",
        "phone": "13900002222",
        "currentVehicles": 18,
        "competitorVehicles": 0,
        "potentialVehicles": 4,
        "intentLevel": "高",
        "lastVisit": "2026-04-26",
        "nextFollow": "2026-05-06",
        "concerns": ["增租价格"],
        "note": "老客户，关注续租和增租。",
        "lat": 34.8154,
        "lng": 113.6442,
    },
    {
        "id": 3,
        "name": "二七区韵达大学路站",
        "brand": "韵达",
        "district": "二七区",
        "address": "大学路与航海路附近",
        "status": "target",
        "contact": "待确认",
        "phone": "",
        "currentVehicles": 0,
        "competitorVehicles": 0,
        "potentialVehicles": 8,
        "intentLevel": "未知",
        "lastVisit": "",
        "nextFollow": "2026-05-05",
        "concerns": [],
        "note": "未拜访目标站点。",
        "lat": 34.7217,
        "lng": 113.6388,
    },
    {
        "id": 4,
        "name": "管城区极兔紫荆山路站",
        "brand": "极兔",
        "district": "管城区",
        "address": "紫荆山路与陇海路附近",
        "status": "key",
        "contact": "赵经理",
        "phone": "13700003333",
        "currentVehicles": 25,
        "competitorVehicles": 16,
        "potentialVehicles": 6,
        "intentLevel": "中",
        "lastVisit": "2026-04-29",
        "nextFollow": "2026-05-04",
        "concerns": ["竞品合同未到期", "维修速度"],
        "note": "可争取 2 台试租。",
        "lat": 34.7438,
        "lng": 113.6831,
    },
    {
        "id": 5,
        "name": "高新区圆通科学大道站",
        "brand": "圆通",
        "district": "高新区",
        "address": "科学大道与长椿路附近",
        "status": "intent",
        "contact": "孙老板",
        "phone": "13600004444",
        "currentVehicles": 9,
        "competitorVehicles": 9,
        "potentialVehicles": 2,
        "intentLevel": "中",
        "lastVisit": "2026-04-22",
        "nextFollow": "2026-05-09",
        "concerns": ["价格"],
        "note": "等对方确认价格区间。",
        "lat": 34.8146,
        "lng": 113.5359,
    },
    {
        "id": 6,
        "name": "惠济区申通迎宾路站",
        "brand": "申通",
        "district": "惠济区",
        "address": "迎宾路附近",
        "status": "paused",
        "contact": "李老板",
        "phone": "13500005555",
        "currentVehicles": 6,
        "competitorVehicles": 6,
        "potentialVehicles": 1,
        "intentLevel": "低",
        "lastVisit": "2026-03-19",
        "nextFollow": "2026-06-01",
        "concerns": ["暂不换车"],
        "note": "短期不推进，月底后轻触达。",
        "lat": 34.8705,
        "lng": 113.6351,
    },
]


DEFAULT_VISITS = [
    {
        "id": 1,
        "siteId": 1,
        "time": "2026-05-01 15:20",
        "result": "有意向",
        "summary": "客户认可月租价格，担心维修响应。下次带维修保障方案。",
        "needs": "可能先换 3 台。",
        "concerns": ["维修响应", "押金"],
        "quote": "月租 480 元/台",
        "nextAction": "带维修保障方案复访",
        "nextFollowDate": "2026-05-08",
    },
    {
        "id": 2,
        "siteId": 4,
        "time": "2026-04-29 10:40",
        "result": "报价中",
        "summary": "现有竞品合同未到期，可先争取 2 台试租。",
        "needs": "试租 2 台",
        "concerns": ["竞品合同未到期", "维修速度"],
        "quote": "待补充",
        "nextAction": "跟进合同到期时间",
        "nextFollowDate": "2026-05-04",
    },
]


def db():
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_text():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def today_text():
    return time.strftime("%Y-%m-%d")


def as_json(value):
    return json.dumps(value, ensure_ascii=False)


def parse_json_text(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def int_or_none(value):
    if value in (None, ""):
        return None
    return int(value)


def int_value(value, default=0):
    if value in (None, ""):
        return default
    return int(value)


def float_value(value, default=0):
    if value in (None, ""):
        return default
    return float(value)


def date_after(days):
    return time.strftime("%Y-%m-%d", time.localtime(time.time() + days * 86400))


def hash_password(password, salt=None, iterations=160000):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password, stored_hash):
    try:
        method, iterations, salt, digest = stored_hash.split("$", 3)
        if method != "pbkdf2_sha256":
            return False
        expected = hash_password(password, salt=salt, iterations=int(iterations)).split("$", 3)[3]
        return hmac.compare_digest(expected, digest)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sites (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              brand TEXT NOT NULL DEFAULT '',
              district TEXT NOT NULL DEFAULT '',
              address TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'target',
              contact TEXT NOT NULL DEFAULT '',
              phone TEXT NOT NULL DEFAULT '',
              current_vehicles INTEGER NOT NULL DEFAULT 0,
              competitor_vehicles INTEGER NOT NULL DEFAULT 0,
              potential_vehicles INTEGER NOT NULL DEFAULT 0,
              intent_level TEXT NOT NULL DEFAULT '未知',
              last_visit TEXT NOT NULL DEFAULT '',
              next_follow TEXT NOT NULL DEFAULT '',
              concerns TEXT NOT NULL DEFAULT '[]',
              note TEXT NOT NULL DEFAULT '',
              lat REAL NOT NULL DEFAULT 34.7466,
              lng REAL NOT NULL DEFAULT 113.6254,
              source TEXT NOT NULL DEFAULT 'manual',
              external_id TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS visits (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              site_id INTEGER NOT NULL,
              time TEXT NOT NULL,
              result TEXT NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '',
              needs TEXT NOT NULL DEFAULT '',
              concerns TEXT NOT NULL DEFAULT '[]',
              quote TEXT NOT NULL DEFAULT '',
              next_action TEXT NOT NULL DEFAULT '',
              next_follow_date TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'owner',
              name TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS vehicles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              code TEXT NOT NULL,
              plate TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'idle',
              site_id INTEGER,
              monthly_rent REAL NOT NULL DEFAULT 0,
              purchase_date TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS contracts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              site_id INTEGER NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              vehicle_count INTEGER NOT NULL DEFAULT 0,
              start_date TEXT NOT NULL DEFAULT '',
              end_date TEXT NOT NULL DEFAULT '',
              monthly_rent REAL NOT NULL DEFAULT 0,
              deposit REAL NOT NULL DEFAULT 0,
              payment_cycle TEXT NOT NULL DEFAULT 'monthly',
              status TEXT NOT NULL DEFAULT 'active',
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              contract_id INTEGER,
              site_id INTEGER NOT NULL,
              due_date TEXT NOT NULL DEFAULT '',
              amount REAL NOT NULL DEFAULT 0,
              paid_amount REAL NOT NULL DEFAULT 0,
              paid_date TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'unpaid',
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
              FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS service_tickets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              site_id INTEGER NOT NULL,
              vehicle_id INTEGER,
              title TEXT NOT NULL DEFAULT '',
              priority TEXT NOT NULL DEFAULT 'normal',
              status TEXT NOT NULL DEFAULT 'open',
              reported_at TEXT NOT NULL DEFAULT '',
              resolved_at TEXT NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE,
              FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
            );
            """
        )

        ensure_site_columns(conn)
        ensure_admin_user(conn)
        count = conn.execute("SELECT COUNT(*) FROM sites").fetchone()[0]
        if count == 0:
            for site in DEFAULT_SITES:
                insert_site(conn, site, explicit_id=True)
            for visit in DEFAULT_VISITS:
                insert_visit(conn, visit, explicit_id=True, update_site=False)
            set_setting(conn, "route_ids", [4, 2, 1])
            conn.commit()


def ensure_site_columns(conn):
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(sites)")}
    if "source" not in columns:
        conn.execute("ALTER TABLE sites ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")
    if "external_id" not in columns:
        conn.execute("ALTER TABLE sites ADD COLUMN external_id TEXT NOT NULL DEFAULT ''")
    conn.commit()


def ensure_admin_user(conn):
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if not count:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, role, name, created_at, updated_at)
            VALUES (?, ?, 'owner', '管理员', ?, ?)
            """,
            (ADMIN_USERNAME, hash_password(ADMIN_PASSWORD), now_text(), now_text()),
        )
        conn.commit()
        return

    if not (ADMIN_USER_ENV_SET or ADMIN_PASSWORD_ENV_SET):
        return

    row = conn.execute("SELECT * FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
    password_hash = hash_password(ADMIN_PASSWORD) if ADMIN_PASSWORD_ENV_SET else None
    if row:
        if password_hash:
            conn.execute(
                "UPDATE users SET password_hash = ?, role = 'owner', updated_at = ? WHERE id = ?",
                (password_hash, now_text(), row["id"]),
            )
        else:
            conn.execute("UPDATE users SET role = 'owner', updated_at = ? WHERE id = ?", (now_text(), row["id"]))
        conn.commit()
        return

    default_admin = conn.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
    if default_admin and ADMIN_USER_ENV_SET:
        conn.execute(
            """
            UPDATE users SET username = ?, password_hash = ?, role = 'owner', updated_at = ?
            WHERE id = ?
            """,
            (ADMIN_USERNAME, password_hash or default_admin["password_hash"], now_text(), default_admin["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, role, name, created_at, updated_at)
            VALUES (?, ?, 'owner', '管理员', ?, ?)
            """,
            (ADMIN_USERNAME, password_hash or hash_password(ADMIN_PASSWORD), now_text(), now_text()),
        )
    conn.commit()


def user_from_row(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "name": row["name"],
    }


def authenticate_user(conn, username, password):
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return user_from_row(row)


def list_users(conn):
    return [user_from_row(row) for row in conn.execute("SELECT * FROM users ORDER BY id")]


def create_user(conn, data):
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()
    role = str(data.get("role", "sales")).strip() or "sales"
    name = str(data.get("name", "")).strip()
    if not username:
        raise ValueError("账号不能为空")
    if len(password) < 6:
        raise ValueError("密码至少 6 位")
    if role not in ("owner", "sales", "viewer"):
        raise ValueError("角色不合法")
    conn.execute(
        """
        INSERT INTO users (username, password_hash, role, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (username, hash_password(password), role, name, now_text(), now_text()),
    )
    return user_from_row(conn.execute("SELECT * FROM users WHERE id = last_insert_rowid()").fetchone())


def create_session(conn, user_id):
    raw_token = secrets.token_urlsafe(32)
    expires_at = date_after(SESSION_DAYS)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (token_hash(raw_token), user_id, expires_at, now_text()),
    )
    conn.commit()
    return raw_token


def get_session_user(conn, raw_token):
    if not raw_token:
        return None
    row = conn.execute(
        """
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at >= ?
        """,
        (token_hash(raw_token), today_text()),
    ).fetchone()
    return user_from_row(row)


def delete_session(conn, raw_token):
    if raw_token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(raw_token),))
        conn.commit()


def site_from_row(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "brand": row["brand"],
        "district": row["district"],
        "address": row["address"],
        "status": row["status"],
        "contact": row["contact"],
        "phone": row["phone"],
        "currentVehicles": row["current_vehicles"],
        "competitorVehicles": row["competitor_vehicles"],
        "potentialVehicles": row["potential_vehicles"],
        "intentLevel": row["intent_level"],
        "lastVisit": row["last_visit"],
        "nextFollow": row["next_follow"],
        "concerns": parse_json_text(row["concerns"], []),
        "note": row["note"],
        "lat": row["lat"],
        "lng": row["lng"],
        "source": row["source"],
        "externalId": row["external_id"],
    }


def visit_from_row(row):
    return {
        "id": row["id"],
        "siteId": row["site_id"],
        "time": row["time"],
        "result": row["result"],
        "summary": row["summary"],
        "needs": row["needs"],
        "concerns": parse_json_text(row["concerns"], []),
        "quote": row["quote"],
        "nextAction": row["next_action"],
        "nextFollowDate": row["next_follow_date"],
    }


def normalize_site(data):
    return {
        "name": str(data.get("name", "")).strip(),
        "brand": str(data.get("brand", "")).strip(),
        "district": str(data.get("district", "")).strip(),
        "address": str(data.get("address", "")).strip(),
        "status": str(data.get("status", "target")).strip() or "target",
        "contact": str(data.get("contact", "")).strip(),
        "phone": str(data.get("phone", "")).strip(),
        "currentVehicles": int(data.get("currentVehicles") or 0),
        "competitorVehicles": int(data.get("competitorVehicles") or 0),
        "potentialVehicles": int(data.get("potentialVehicles") or 0),
        "intentLevel": str(data.get("intentLevel", "未知")).strip() or "未知",
        "lastVisit": str(data.get("lastVisit", "")).strip(),
        "nextFollow": str(data.get("nextFollow", "")).strip(),
        "concerns": data.get("concerns") if isinstance(data.get("concerns"), list) else [],
        "note": str(data.get("note", "")).strip(),
        "lat": float(data.get("lat") or 34.7466),
        "lng": float(data.get("lng") or 113.6254),
        "source": str(data.get("source", "manual")).strip() or "manual",
        "externalId": str(data.get("externalId", "")).strip(),
    }


def insert_site(conn, data, explicit_id=False):
    site = normalize_site(data)
    columns = [
        "name",
        "brand",
        "district",
        "address",
        "status",
        "contact",
        "phone",
        "current_vehicles",
        "competitor_vehicles",
        "potential_vehicles",
        "intent_level",
        "last_visit",
        "next_follow",
        "concerns",
        "note",
        "lat",
        "lng",
        "source",
        "external_id",
        "created_at",
        "updated_at",
    ]
    values = [
        site["name"],
        site["brand"],
        site["district"],
        site["address"],
        site["status"],
        site["contact"],
        site["phone"],
        site["currentVehicles"],
        site["competitorVehicles"],
        site["potentialVehicles"],
        site["intentLevel"],
        site["lastVisit"],
        site["nextFollow"],
        as_json(site["concerns"]),
        site["note"],
        site["lat"],
        site["lng"],
        site["source"],
        site["externalId"],
        now_text(),
        now_text(),
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    placeholders = ",".join("?" for _ in values)
    conn.execute(f"INSERT INTO sites ({','.join(columns)}) VALUES ({placeholders})", values)
    site_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_site(conn, site_id)


def update_site(conn, site_id, data):
    site = normalize_site(data)
    conn.execute(
        """
        UPDATE sites SET
          name = ?, brand = ?, district = ?, address = ?, status = ?, contact = ?, phone = ?,
          current_vehicles = ?, competitor_vehicles = ?, potential_vehicles = ?,
          intent_level = ?, last_visit = ?, next_follow = ?, concerns = ?, note = ?,
          lat = ?, lng = ?, source = ?, external_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            site["name"],
            site["brand"],
            site["district"],
            site["address"],
            site["status"],
            site["contact"],
            site["phone"],
            site["currentVehicles"],
            site["competitorVehicles"],
            site["potentialVehicles"],
            site["intentLevel"],
            site["lastVisit"],
            site["nextFollow"],
            as_json(site["concerns"]),
            site["note"],
            site["lat"],
            site["lng"],
            site["source"],
            site["externalId"],
            now_text(),
            site_id,
        ),
    )
    return get_site(conn, site_id)


def get_site(conn, site_id):
    row = conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone()
    return site_from_row(row) if row else None


def list_sites(conn):
    return [site_from_row(row) for row in conn.execute("SELECT * FROM sites ORDER BY id")]


def guess_brand(text, fallback=""):
    brands = ["京东", "顺丰", "中通", "圆通", "极兔", "韵达", "申通", "菜鸟", "德邦", "邮政", "EMS"]
    for brand in brands:
        if brand and brand in text:
            return brand
    return fallback


def poi_already_imported(conn, poi):
    external_id = str(poi.get("id") or poi.get("externalId") or "").strip()
    if external_id:
        row = conn.execute(
            "SELECT id FROM sites WHERE source = 'amap-poi' AND external_id = ?",
            (external_id,),
        ).fetchone()
        if row:
            return True
    name = str(poi.get("name", "")).strip()
    address = str(poi.get("address", "")).strip()
    if name and address:
        row = conn.execute(
            "SELECT id FROM sites WHERE name = ? OR (address = ? AND brand = ?)",
            (name, address, str(poi.get("brand", "")).strip()),
        ).fetchone()
        if row:
            return True
    lat = poi.get("lat")
    lng = poi.get("lng")
    if lat not in (None, "") and lng not in (None, ""):
        row = conn.execute(
            """
            SELECT id FROM sites
            WHERE ABS(lat - ?) < 0.00015 AND ABS(lng - ?) < 0.00015
            """,
            (float(lat), float(lng)),
        ).fetchone()
        if row:
            return True
    return False


def list_visits(conn):
    return [
        visit_from_row(row)
        for row in conn.execute("SELECT * FROM visits ORDER BY time DESC, id DESC")
    ]


def normalize_visit(data):
    return {
        "siteId": int(data.get("siteId") or 0),
        "time": str(data.get("time") or time.strftime("%Y-%m-%d %H:%M")),
        "result": str(data.get("result", "")).strip(),
        "summary": str(data.get("summary", "")).strip(),
        "needs": str(data.get("needs", "")).strip(),
        "concerns": data.get("concerns") if isinstance(data.get("concerns"), list) else [],
        "quote": str(data.get("quote", "")).strip(),
        "nextAction": str(data.get("nextAction", "")).strip(),
        "nextFollowDate": str(data.get("nextFollowDate", "")).strip(),
        "contactName": str(data.get("contactName", "")).strip(),
        "currentVehicles": data.get("currentVehicles"),
        "competitorVehicles": data.get("competitorVehicles"),
        "potentialVehicles": data.get("potentialVehicles"),
        "intentLevel": str(data.get("intentLevel", "")).strip(),
    }


def insert_visit(conn, data, explicit_id=False, update_site=True):
    visit = normalize_visit(data)
    columns = [
        "site_id",
        "time",
        "result",
        "summary",
        "needs",
        "concerns",
        "quote",
        "next_action",
        "next_follow_date",
        "created_at",
    ]
    values = [
        visit["siteId"],
        visit["time"],
        visit["result"],
        visit["summary"],
        visit["needs"],
        as_json(visit["concerns"]),
        visit["quote"],
        visit["nextAction"],
        visit["nextFollowDate"],
        now_text(),
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    conn.execute(f"INSERT INTO visits ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})", values)
    visit_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    if update_site:
        sync_site_after_visit(conn, visit)
    row = conn.execute("SELECT * FROM visits WHERE id = ?", (visit_id,)).fetchone()
    return visit_from_row(row)


def sync_site_after_visit(conn, visit):
    site = get_site(conn, visit["siteId"])
    if not site:
        return
    current = site["currentVehicles"] if visit["currentVehicles"] in (None, "") else int(visit["currentVehicles"])
    competitor = site["competitorVehicles"] if visit["competitorVehicles"] in (None, "") else int(visit["competitorVehicles"])
    potential = site["potentialVehicles"] if visit["potentialVehicles"] in (None, "") else int(visit["potentialVehicles"])
    intent = visit["intentLevel"] or site["intentLevel"]
    status = site["status"]
    if status == "target" and intent in ("高", "中"):
        status = "intent"
    concerns = visit["concerns"] or site["concerns"]
    conn.execute(
        """
        UPDATE sites SET
          contact = COALESCE(NULLIF(?, ''), contact),
          current_vehicles = ?,
          competitor_vehicles = ?,
          potential_vehicles = ?,
          intent_level = ?,
          status = ?,
          concerns = ?,
          last_visit = ?,
          next_follow = COALESCE(NULLIF(?, ''), next_follow),
          updated_at = ?
        WHERE id = ?
        """,
        (
            visit["contactName"],
            current,
            competitor,
            potential,
            intent,
            status,
            as_json(concerns),
            time.strftime("%Y-%m-%d"),
            visit["nextFollowDate"],
            now_text(),
            visit["siteId"],
        ),
    )


def vehicle_from_row(row):
    return {
        "id": row["id"],
        "code": row["code"],
        "plate": row["plate"],
        "model": row["model"],
        "status": row["status"],
        "siteId": row["site_id"],
        "monthlyRent": row["monthly_rent"],
        "purchaseDate": row["purchase_date"],
        "note": row["note"],
    }


def contract_from_row(row):
    return {
        "id": row["id"],
        "siteId": row["site_id"],
        "title": row["title"],
        "vehicleCount": row["vehicle_count"],
        "startDate": row["start_date"],
        "endDate": row["end_date"],
        "monthlyRent": row["monthly_rent"],
        "deposit": row["deposit"],
        "paymentCycle": row["payment_cycle"],
        "status": row["status"],
        "note": row["note"],
    }


def payment_from_row(row):
    return {
        "id": row["id"],
        "contractId": row["contract_id"],
        "siteId": row["site_id"],
        "dueDate": row["due_date"],
        "amount": row["amount"],
        "paidAmount": row["paid_amount"],
        "paidDate": row["paid_date"],
        "status": row["status"],
        "note": row["note"],
    }


def service_ticket_from_row(row):
    return {
        "id": row["id"],
        "siteId": row["site_id"],
        "vehicleId": row["vehicle_id"],
        "title": row["title"],
        "priority": row["priority"],
        "status": row["status"],
        "reportedAt": row["reported_at"],
        "resolvedAt": row["resolved_at"],
        "summary": row["summary"],
    }


def list_vehicles(conn):
    return [vehicle_from_row(row) for row in conn.execute("SELECT * FROM vehicles ORDER BY id DESC")]


def list_contracts(conn):
    return [contract_from_row(row) for row in conn.execute("SELECT * FROM contracts ORDER BY end_date, id DESC")]


def list_payments(conn):
    return [payment_from_row(row) for row in conn.execute("SELECT * FROM payments ORDER BY due_date, id DESC")]


def list_service_tickets(conn):
    return [
        service_ticket_from_row(row)
        for row in conn.execute("SELECT * FROM service_tickets ORDER BY status, reported_at DESC, id DESC")
    ]


def normalize_vehicle(data):
    return {
        "code": str(data.get("code", "")).strip(),
        "plate": str(data.get("plate", "")).strip(),
        "model": str(data.get("model", "")).strip(),
        "status": str(data.get("status", "idle")).strip() or "idle",
        "siteId": int_or_none(data.get("siteId")),
        "monthlyRent": float_value(data.get("monthlyRent")),
        "purchaseDate": str(data.get("purchaseDate", "")).strip(),
        "note": str(data.get("note", "")).strip(),
    }


def insert_vehicle(conn, data, explicit_id=False):
    item = normalize_vehicle(data)
    if not item["code"]:
        raise ValueError("车辆编号不能为空")
    columns = ["code", "plate", "model", "status", "site_id", "monthly_rent", "purchase_date", "note", "created_at", "updated_at"]
    values = [
        item["code"],
        item["plate"],
        item["model"],
        item["status"],
        item["siteId"],
        item["monthlyRent"],
        item["purchaseDate"],
        item["note"],
        now_text(),
        now_text(),
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    conn.execute(f"INSERT INTO vehicles ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})", values)
    item_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return vehicle_from_row(conn.execute("SELECT * FROM vehicles WHERE id = ?", (item_id,)).fetchone())


def update_vehicle(conn, item_id, data):
    item = normalize_vehicle(data)
    if not item["code"]:
        raise ValueError("车辆编号不能为空")
    conn.execute(
        """
        UPDATE vehicles SET code = ?, plate = ?, model = ?, status = ?, site_id = ?,
          monthly_rent = ?, purchase_date = ?, note = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            item["code"],
            item["plate"],
            item["model"],
            item["status"],
            item["siteId"],
            item["monthlyRent"],
            item["purchaseDate"],
            item["note"],
            now_text(),
            item_id,
        ),
    )
    row = conn.execute("SELECT * FROM vehicles WHERE id = ?", (item_id,)).fetchone()
    return vehicle_from_row(row) if row else None


def normalize_contract(data):
    return {
        "siteId": int(data.get("siteId") or 0),
        "title": str(data.get("title", "")).strip(),
        "vehicleCount": int_value(data.get("vehicleCount")),
        "startDate": str(data.get("startDate", "")).strip(),
        "endDate": str(data.get("endDate", "")).strip(),
        "monthlyRent": float_value(data.get("monthlyRent")),
        "deposit": float_value(data.get("deposit")),
        "paymentCycle": str(data.get("paymentCycle", "monthly")).strip() or "monthly",
        "status": str(data.get("status", "active")).strip() or "active",
        "note": str(data.get("note", "")).strip(),
    }


def insert_contract(conn, data, explicit_id=False):
    item = normalize_contract(data)
    if not item["siteId"]:
        raise ValueError("合同必须关联站点")
    columns = [
        "site_id", "title", "vehicle_count", "start_date", "end_date", "monthly_rent",
        "deposit", "payment_cycle", "status", "note", "created_at", "updated_at"
    ]
    values = [
        item["siteId"], item["title"], item["vehicleCount"], item["startDate"], item["endDate"],
        item["monthlyRent"], item["deposit"], item["paymentCycle"], item["status"], item["note"],
        now_text(), now_text()
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    conn.execute(f"INSERT INTO contracts ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})", values)
    item_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return contract_from_row(conn.execute("SELECT * FROM contracts WHERE id = ?", (item_id,)).fetchone())


def update_contract(conn, item_id, data):
    item = normalize_contract(data)
    conn.execute(
        """
        UPDATE contracts SET site_id = ?, title = ?, vehicle_count = ?, start_date = ?, end_date = ?,
          monthly_rent = ?, deposit = ?, payment_cycle = ?, status = ?, note = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            item["siteId"],
            item["title"],
            item["vehicleCount"],
            item["startDate"],
            item["endDate"],
            item["monthlyRent"],
            item["deposit"],
            item["paymentCycle"],
            item["status"],
            item["note"],
            now_text(),
            item_id,
        ),
    )
    row = conn.execute("SELECT * FROM contracts WHERE id = ?", (item_id,)).fetchone()
    return contract_from_row(row) if row else None


def normalize_payment(data):
    return {
        "contractId": int_or_none(data.get("contractId")),
        "siteId": int(data.get("siteId") or 0),
        "dueDate": str(data.get("dueDate", "")).strip(),
        "amount": float_value(data.get("amount")),
        "paidAmount": float_value(data.get("paidAmount")),
        "paidDate": str(data.get("paidDate", "")).strip(),
        "status": str(data.get("status", "unpaid")).strip() or "unpaid",
        "note": str(data.get("note", "")).strip(),
    }


def insert_payment(conn, data, explicit_id=False):
    item = normalize_payment(data)
    if not item["siteId"]:
        raise ValueError("收款记录必须关联站点")
    columns = ["contract_id", "site_id", "due_date", "amount", "paid_amount", "paid_date", "status", "note", "created_at", "updated_at"]
    values = [
        item["contractId"], item["siteId"], item["dueDate"], item["amount"], item["paidAmount"],
        item["paidDate"], item["status"], item["note"], now_text(), now_text()
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    conn.execute(f"INSERT INTO payments ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})", values)
    item_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return payment_from_row(conn.execute("SELECT * FROM payments WHERE id = ?", (item_id,)).fetchone())


def update_payment(conn, item_id, data):
    item = normalize_payment(data)
    conn.execute(
        """
        UPDATE payments SET contract_id = ?, site_id = ?, due_date = ?, amount = ?, paid_amount = ?,
          paid_date = ?, status = ?, note = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            item["contractId"],
            item["siteId"],
            item["dueDate"],
            item["amount"],
            item["paidAmount"],
            item["paidDate"],
            item["status"],
            item["note"],
            now_text(),
            item_id,
        ),
    )
    row = conn.execute("SELECT * FROM payments WHERE id = ?", (item_id,)).fetchone()
    return payment_from_row(row) if row else None


def normalize_service_ticket(data):
    return {
        "siteId": int(data.get("siteId") or 0),
        "vehicleId": int_or_none(data.get("vehicleId")),
        "title": str(data.get("title", "")).strip(),
        "priority": str(data.get("priority", "normal")).strip() or "normal",
        "status": str(data.get("status", "open")).strip() or "open",
        "reportedAt": str(data.get("reportedAt", "")).strip() or today_text(),
        "resolvedAt": str(data.get("resolvedAt", "")).strip(),
        "summary": str(data.get("summary", "")).strip(),
    }


def insert_service_ticket(conn, data, explicit_id=False):
    item = normalize_service_ticket(data)
    if not item["siteId"]:
        raise ValueError("售后记录必须关联站点")
    if not item["title"]:
        raise ValueError("售后标题不能为空")
    columns = ["site_id", "vehicle_id", "title", "priority", "status", "reported_at", "resolved_at", "summary", "created_at", "updated_at"]
    values = [
        item["siteId"], item["vehicleId"], item["title"], item["priority"], item["status"],
        item["reportedAt"], item["resolvedAt"], item["summary"], now_text(), now_text()
    ]
    if explicit_id:
        columns.insert(0, "id")
        values.insert(0, int(data["id"]))
    conn.execute(f"INSERT INTO service_tickets ({','.join(columns)}) VALUES ({','.join('?' for _ in values)})", values)
    item_id = int(data["id"]) if explicit_id else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return service_ticket_from_row(conn.execute("SELECT * FROM service_tickets WHERE id = ?", (item_id,)).fetchone())


def update_service_ticket(conn, item_id, data):
    item = normalize_service_ticket(data)
    conn.execute(
        """
        UPDATE service_tickets SET site_id = ?, vehicle_id = ?, title = ?, priority = ?, status = ?,
          reported_at = ?, resolved_at = ?, summary = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            item["siteId"],
            item["vehicleId"],
            item["title"],
            item["priority"],
            item["status"],
            item["reportedAt"],
            item["resolvedAt"],
            item["summary"],
            now_text(),
            item_id,
        ),
    )
    row = conn.execute("SELECT * FROM service_tickets WHERE id = ?", (item_id,)).fetchone()
    return service_ticket_from_row(row) if row else None


def get_setting(conn, key, fallback):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return parse_json_text(row["value"], fallback) if row else fallback


def set_setting(conn, key, value):
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, as_json(value)),
    )


def export_data(conn):
    return {
        "version": 3,
        "exportedAt": now_text(),
        "sites": list_sites(conn),
        "visits": list_visits(conn),
        "vehicles": list_vehicles(conn),
        "contracts": list_contracts(conn),
        "payments": list_payments(conn),
        "serviceTickets": list_service_tickets(conn),
        "routeIds": get_setting(conn, "route_ids", []),
    }


def import_data(conn, payload):
    if not isinstance(payload.get("sites"), list) or not isinstance(payload.get("visits"), list):
        raise ValueError("导入文件缺少 sites 或 visits")
    conn.execute("DELETE FROM service_tickets")
    conn.execute("DELETE FROM payments")
    conn.execute("DELETE FROM contracts")
    conn.execute("DELETE FROM vehicles")
    conn.execute("DELETE FROM visits")
    conn.execute("DELETE FROM sites")
    conn.execute("DELETE FROM settings")
    for site in payload["sites"]:
        insert_site(conn, site, explicit_id=bool(site.get("id")))
    for visit in payload["visits"]:
        insert_visit(conn, visit, explicit_id=bool(visit.get("id")), update_site=False)
    for vehicle in payload.get("vehicles", []):
        insert_vehicle(conn, vehicle, explicit_id=bool(vehicle.get("id")))
    for contract in payload.get("contracts", []):
        insert_contract(conn, contract, explicit_id=bool(contract.get("id")))
    for payment in payload.get("payments", []):
        insert_payment(conn, payment, explicit_id=bool(payment.get("id")))
    for ticket in payload.get("serviceTickets", []):
        insert_service_ticket(conn, ticket, explicit_id=bool(ticket.get("id")))
    set_setting(conn, "route_ids", payload.get("routeIds", []))


def create_database_backup(reason="manual"):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        return None
    safe_reason = "".join(char for char in reason if char.isalnum() or char in ("-", "_"))[:32] or "manual"
    filename = f"app-{time.strftime('%Y%m%d-%H%M%S')}-{safe_reason}.db"
    target = BACKUP_DIR / filename
    shutil.copy2(DB_PATH, target)
    return {
        "name": filename,
        "path": str(target.relative_to(ROOT)),
        "size": target.stat().st_size,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(target.stat().st_mtime)),
    }


def list_backups():
    if not BACKUP_DIR.exists():
        return []
    rows = []
    for item in BACKUP_DIR.glob("*.db"):
        stat = item.stat()
        rows.append(
            {
                "name": item.name,
                "path": str(item.relative_to(ROOT)),
                "size": stat.st_size,
                "createdAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
            }
        )
    return sorted(rows, key=lambda row: row["createdAt"], reverse=True)[:12]


def health_snapshot():
    checks = {
        "database": "missing",
        "schema": "unknown",
        "static": "ok",
    }
    status = "ok"
    if DB_PATH.exists():
        checks["database"] = "ok"
        try:
            with db() as conn:
                conn.execute("SELECT 1 FROM sites LIMIT 1").fetchone()
                conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
            checks["schema"] = "ok"
        except sqlite3.Error:
            checks["schema"] = "error"
            status = "error"
    else:
        status = "error"
    if not (ROOT / "manifest.webmanifest").exists() or not (ROOT / "service-worker.js").exists():
        checks["static"] = "error"
        status = "error"
    return {
        "status": status,
        "time": now_text(),
        "version": "1.0",
        "checks": checks,
    }


def request_json(url):
    request = Request(
        url,
        headers={
            "User-Agent": "KXSL-CRM/1.0 (+local)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def amap_search(query, city):
    if not AMAP_KEY:
        return []
    common = {"key": AMAP_KEY, "city": city, "output": "json"}
    poi_url = "https://restapi.amap.com/v3/place/text?" + urlencode(
        {**common, "keywords": query, "offset": 8, "page": 1, "extensions": "base"}
    )
    results = []
    poi_data = request_json(poi_url)
    if poi_data.get("status") == "1":
        for item in poi_data.get("pois", [])[:8]:
            location = item.get("location") or ""
            if "," not in location:
                continue
            lng, lat = [float(part) for part in location.split(",", 1)]
            address_parts = [item.get("pname"), item.get("cityname"), item.get("adname"), item.get("address")]
            results.append(
                {
                    "name": item.get("name") or query,
                    "address": "".join(str(part) for part in address_parts if part and part != []),
                    "lat": lat,
                    "lng": lng,
                    "source": "amap-poi",
                }
            )
    if results:
        return results

    geo_url = "https://restapi.amap.com/v3/geocode/geo?" + urlencode({**common, "address": query})
    geo_data = request_json(geo_url)
    if geo_data.get("status") != "1":
        return []
    for item in geo_data.get("geocodes", [])[:8]:
        location = item.get("location") or ""
        if "," not in location:
            continue
        lng, lat = [float(part) for part in location.split(",", 1)]
        results.append(
            {
                "name": item.get("formatted_address") or query,
                "address": item.get("formatted_address") or "",
                "lat": lat,
                "lng": lng,
                "source": "amap-geocode",
            }
        )
    return results


def amap_discover_sites(data):
    if not AMAP_KEY:
        raise ValueError("未配置 AMAP_KEY，无法使用高德站点发现")
    city = str(data.get("city", "郑州")).strip() or "郑州"
    district = str(data.get("district", "")).strip()
    brand = str(data.get("brand", "")).strip()
    keyword = str(data.get("keyword", "")).strip() or brand
    if not keyword:
        raise ValueError("请先输入品牌或关键词")
    pages = max(1, min(int(data.get("pages") or 2), 10))
    search_keyword = keyword
    results = []
    seen = set()
    for page in range(1, pages + 1):
        params = {
            "key": AMAP_KEY,
            "keywords": search_keyword,
            "city": city,
            "citylimit": "true",
            "offset": 20,
            "page": page,
            "extensions": "base",
            "output": "json",
        }
        url = "https://restapi.amap.com/v3/place/text?" + urlencode(params)
        payload = request_json(url)
        if payload.get("status") != "1":
            raise ValueError(f"高德搜索失败：{payload.get('info') or payload}")
        pois = payload.get("pois") or []
        if not pois:
            break
        for item in pois:
            poi_id = str(item.get("id") or "").strip()
            if poi_id and poi_id in seen:
                continue
            if poi_id:
                seen.add(poi_id)
            location = item.get("location") or ""
            if "," not in location:
                continue
            lng, lat = [float(part) for part in location.split(",", 1)]
            adname = item.get("adname") or ""
            if district and district not in str(adname):
                continue
            name = item.get("name") or keyword
            address_parts = [item.get("pname"), item.get("cityname"), item.get("adname"), item.get("address")]
            address = "".join(str(part) for part in address_parts if part and part != [])
            tel = item.get("tel") if item.get("tel") not in ([], None) else ""
            results.append(
                {
                    "id": poi_id,
                    "name": name,
                    "brand": guess_brand(f"{brand} {name}", brand),
                    "district": adname,
                    "address": address,
                    "phone": str(tel or ""),
                    "type": item.get("type") or "",
                    "lat": lat,
                    "lng": lng,
                    "source": "amap-poi",
                }
            )
    with db() as conn:
        for item in results:
            item["imported"] = poi_already_imported(conn, item)
    return results


def import_discovered_sites(conn, items):
    if not isinstance(items, list) or not items:
        raise ValueError("请选择要导入的站点")
    imported = []
    skipped = []
    for item in items:
        poi = {
            "id": str(item.get("id") or item.get("externalId") or "").strip(),
            "name": str(item.get("name", "")).strip(),
            "brand": str(item.get("brand", "")).strip() or guess_brand(str(item.get("name", "")), "快递"),
            "district": str(item.get("district", "")).strip(),
            "address": str(item.get("address", "")).strip(),
            "phone": str(item.get("phone", "")).strip(),
            "lat": float(item.get("lat") or 34.7466),
            "lng": float(item.get("lng") or 113.6254),
        }
        if not poi["name"]:
            skipped.append({"name": "", "reason": "缺少名称"})
            continue
        if poi_already_imported(conn, poi):
            skipped.append({"name": poi["name"], "reason": "已存在或疑似重复"})
            continue
        site = insert_site(
            conn,
            {
                "name": poi["name"],
                "brand": poi["brand"],
                "district": poi["district"],
                "address": poi["address"],
                "status": "target",
                "contact": "",
                "phone": poi["phone"],
                "currentVehicles": 0,
                "competitorVehicles": 0,
                "potentialVehicles": 0,
                "intentLevel": "未知",
                "lastVisit": "",
                "nextFollow": "",
                "concerns": [],
                "note": "来源：高德 POI 站点发现，导入后请人工确认是否为有效快递站点。",
                "lat": poi["lat"],
                "lng": poi["lng"],
                "source": "amap-poi",
                "externalId": poi["id"],
            },
        )
        imported.append(site)
    return imported, skipped


def nominatim_search(query, city):
    params = {
        "format": "jsonv2",
        "limit": 8,
        "countrycodes": "cn",
        "addressdetails": 1,
        "q": f"{city} {query}".strip(),
    }
    url = "https://nominatim.openstreetmap.org/search?" + urlencode(params)
    data = request_json(url)
    results = []
    for item in data[:8]:
        lat = float(item["lat"])
        lng = float(item["lon"])
        gcj_lat, gcj_lng = wgs84_to_gcj02(lat, lng)
        results.append(
            {
                "name": item.get("name") or item.get("display_name") or query,
                "address": item.get("display_name") or "",
                "lat": gcj_lat,
                "lng": gcj_lng,
                "source": "nominatim",
            }
        )
    return results


def coord_pair(point):
    lat = float(point.get("lat"))
    lng = float(point.get("lng"))
    return f"{lng:.6f},{lat:.6f}"


def parse_amap_polyline(value):
    points = []
    for item in str(value or "").split(";"):
        if "," not in item:
            continue
        lng_text, lat_text = item.split(",", 1)
        try:
            points.append([round(float(lat_text), 6), round(float(lng_text), 6)])
        except ValueError:
            continue
    return points


def amap_driving_leg(origin, destination):
    params = {
        "key": AMAP_KEY,
        "origin": coord_pair(origin),
        "destination": coord_pair(destination),
        "strategy": "10",
        "extensions": "all",
        "output": "json",
    }
    url = "https://restapi.amap.com/v3/direction/driving?" + urlencode(params)
    payload = request_json(url)
    if payload.get("status") != "1":
        raise ValueError(f"高德驾车规划失败：{payload.get('info') or payload}")
    paths = ((payload.get("route") or {}).get("paths") or [])
    if not paths:
        raise ValueError("高德没有返回可用驾车路线")
    path = paths[0]
    steps = path.get("steps") or []
    polyline = []
    roads = []
    for step in steps:
        polyline.extend(parse_amap_polyline(step.get("polyline")))
        road = str(step.get("road") or "").strip()
        if road and road not in roads:
            roads.append(road)
    return {
        "distanceMeters": int(float(path.get("distance") or 0)),
        "durationSeconds": int(float(path.get("duration") or 0)),
        "polyline": polyline[:1200],
        "roads": roads[:4],
    }


def amap_driving_plan(data):
    if not AMAP_KEY:
        raise ValueError("未配置 AMAP_KEY，无法使用高德驾车路线规划")
    origin = data.get("origin") or {}
    stops = data.get("stops") if isinstance(data.get("stops"), list) else []
    if not stops:
        raise ValueError("路线至少需要 1 个站点")
    stops = stops[:8]
    points = [origin] + stops
    legs = []
    total_distance = 0
    total_duration = 0
    for index in range(1, len(points)):
        start = points[index - 1]
        end = points[index]
        leg = amap_driving_leg(start, end)
        leg.update(
            {
                "fromName": start.get("name") or ("我的位置" if index == 1 else "上一站"),
                "toName": end.get("name") or f"第 {index} 站",
                "siteId": end.get("id"),
            }
        )
        total_distance += leg["distanceMeters"]
        total_duration += leg["durationSeconds"]
        legs.append(leg)
    return {
        "source": "amap-driving",
        "routeIds": [stop.get("id") for stop in stops if stop.get("id") is not None],
        "origin": origin,
        "distanceKm": round(total_distance / 1000, 1),
        "durationMinutes": max(1, math.ceil(total_duration / 60)),
        "durationHours": round(total_duration / 3600, 1),
        "legs": legs,
    }


def geocode(query, city="郑州"):
    query = (query or "").strip()
    city = (city or "郑州").strip()
    if not query:
        return []
    try:
        results = amap_search(query, city)
        if results:
            return results
    except Exception as error:
        print(f"AMap geocode failed: {error}", file=sys.stderr)
    try:
        return nominatim_search(query, city)
    except Exception as error:
        print(f"Nominatim geocode failed: {error}", file=sys.stderr)
        return []


def out_of_china(lat, lng):
    return lng < 72.004 or lng > 137.8347 or lat < 0.8293 or lat > 55.8271


def transform_lat(x, y):
    value = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    value += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    value += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    value += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return value


def transform_lng(x, y):
    value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    value += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    value += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    value += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return value


def wgs84_to_gcj02(lat, lng):
    if out_of_china(lat, lng):
        return lat, lng
    a = 6378245.0
    ee = 0.00669342162296594323
    dlat = transform_lat(lng - 105.0, lat - 35.0)
    dlng = transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - ee * magic * magic
    sqrt_magic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrt_magic) * math.pi)
    dlng = (dlng * 180.0) / (a / sqrt_magic * math.cos(radlat) * math.pi)
    return lat + dlat, lng + dlng


class Handler(BaseHTTPRequestHandler):
    server_version = "KXSLCRM/1.0"

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def dispatch(self, method):
        try:
            if method == "GET":
                self.handle_get()
            elif method == "POST":
                self.handle_post()
            elif method == "PUT":
                self.handle_put()
            elif method == "DELETE":
                self.handle_delete()
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)
        except json.JSONDecodeError:
            self.send_json({"error": "请求 JSON 格式错误"}, status=400)
        except Exception as error:
            print(f"Request failed: {error}", file=sys.stderr)
            self.send_json({"error": "服务器处理失败"}, status=500)

    def handle_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self.send_json(health_snapshot())
            return
        if path == "/api/me":
            self.send_json({"user": self.current_user()})
            return
        if path.startswith("/api/") and not self.require_user():
            return
        if path == "/api/bootstrap":
            self.send_json(self.bootstrap())
            return
        if path == "/api/geocode":
            params = parse_qs(parsed.query)
            query = params.get("q", [""])[0]
            city = params.get("city", ["郑州"])[0]
            self.send_json({"results": geocode(query, city)})
            return
        if path == "/api/export.json":
            with db() as conn:
                payload = as_json(export_data(conn)).encode("utf-8")
            self.send_bytes(payload, "application/json; charset=utf-8", "知兔市场地图备份.json")
            return
        if path == "/api/export/visits.csv":
            self.send_visits_csv()
            return
        if path.startswith("/api/"):
            self.send_error(404)
            return
        self.send_static(path)

    def handle_post(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            payload = self.read_json()
            with db() as conn:
                user = authenticate_user(conn, str(payload.get("username", "")).strip(), str(payload.get("password", "")))
                if not user:
                    self.send_json({"error": "账号或密码错误"}, status=401)
                    return
                token = create_session(conn, user["id"])
            self.send_json({"user": user}, headers={"Set-Cookie": self.session_cookie(token)})
            return
        if path == "/api/logout":
            with db() as conn:
                delete_session(conn, self.session_token())
            self.send_json({"ok": True}, headers={"Set-Cookie": self.clear_session_cookie()})
            return
        if not self.require_user():
            return
        payload = self.read_json()
        if path == "/api/sites":
            with db() as conn:
                site = insert_site(conn, payload)
                conn.commit()
            self.send_json({"site": site})
            return
        if path == "/api/visits":
            with db() as conn:
                visit = insert_visit(conn, payload)
                site = get_site(conn, visit["siteId"])
                conn.commit()
            self.send_json({"visit": visit, "site": site})
            return
        if path == "/api/users":
            user = self.require_owner()
            if not user:
                return
            with db() as conn:
                created_user = create_user(conn, payload)
                conn.commit()
                users = list_users(conn)
            self.send_json({"user": created_user, "users": users})
            return
        if path == "/api/discovery/search":
            results = amap_discover_sites(payload)
            self.send_json({"results": results})
            return
        if path == "/api/discovery/import":
            with db() as conn:
                imported, skipped = import_discovered_sites(conn, payload.get("items"))
                conn.commit()
            data = self.bootstrap()
            data["imported"] = imported
            data["skipped"] = skipped
            self.send_json(data)
            return
        if path == "/api/route/driving":
            self.send_json(amap_driving_plan(payload))
            return
        if path == "/api/vehicles":
            with db() as conn:
                item = insert_vehicle(conn, payload)
                conn.commit()
            self.send_json({"vehicle": item})
            return
        if path == "/api/contracts":
            with db() as conn:
                item = insert_contract(conn, payload)
                conn.commit()
            self.send_json({"contract": item})
            return
        if path == "/api/payments":
            with db() as conn:
                item = insert_payment(conn, payload)
                conn.commit()
            self.send_json({"payment": item})
            return
        if path == "/api/service-tickets":
            with db() as conn:
                item = insert_service_ticket(conn, payload)
                conn.commit()
            self.send_json({"serviceTicket": item})
            return
        if path == "/api/backup":
            backup = create_database_backup("manual")
            self.send_json({"backup": backup, "backups": list_backups()})
            return
        if path == "/api/import":
            backup = create_database_backup("before-import")
            with db() as conn:
                import_data(conn, payload)
                conn.commit()
            data = self.bootstrap()
            data["backupBeforeImport"] = backup
            self.send_json(data)
            return
        self.send_error(404)

    def handle_put(self):
        path = urlparse(self.path).path
        if not self.require_user():
            return
        payload = self.read_json()
        if path.startswith("/api/sites/"):
            site_id = self.path_id(path, "/api/sites/")
            with db() as conn:
                site = update_site(conn, site_id, payload)
                conn.commit()
            if not site:
                self.send_error(404)
                return
            self.send_json({"site": site})
            return
        if path == "/api/route":
            route_ids = payload.get("routeIds") if isinstance(payload.get("routeIds"), list) else []
            with db() as conn:
                set_setting(conn, "route_ids", route_ids)
                conn.commit()
            self.send_json({"routeIds": route_ids})
            return
        if path.startswith("/api/vehicles/"):
            self.update_resource(path, "/api/vehicles/", update_vehicle, "vehicle", payload)
            return
        if path.startswith("/api/contracts/"):
            self.update_resource(path, "/api/contracts/", update_contract, "contract", payload)
            return
        if path.startswith("/api/payments/"):
            self.update_resource(path, "/api/payments/", update_payment, "payment", payload)
            return
        if path.startswith("/api/service-tickets/"):
            self.update_resource(path, "/api/service-tickets/", update_service_ticket, "serviceTicket", payload)
            return
        self.send_error(404)

    def handle_delete(self):
        path = urlparse(self.path).path
        if not self.require_user():
            return
        if path.startswith("/api/sites/"):
            site_id = self.path_id(path, "/api/sites/")
            with db() as conn:
                conn.execute("DELETE FROM sites WHERE id = ?", (site_id,))
                route_ids = [item for item in get_setting(conn, "route_ids", []) if item != site_id]
                set_setting(conn, "route_ids", route_ids)
                conn.commit()
            self.send_json({"ok": True, "routeIds": route_ids})
            return
        delete_map = {
            "/api/vehicles/": "vehicles",
            "/api/contracts/": "contracts",
            "/api/payments/": "payments",
            "/api/service-tickets/": "service_tickets",
        }
        for prefix, table in delete_map.items():
            if path.startswith(prefix):
                item_id = self.path_id(path, prefix)
                with db() as conn:
                    conn.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
                    conn.commit()
                self.send_json({"ok": True})
                return
        self.send_error(404)

    def update_resource(self, path, prefix, updater, key, payload):
        item_id = self.path_id(path, prefix)
        with db() as conn:
            item = updater(conn, item_id, payload)
            conn.commit()
        if not item:
            self.send_error(404)
            return
        self.send_json({key: item})

    def bootstrap(self):
        user = self.current_user()
        with db() as conn:
            return {
                "user": user,
                "users": list_users(conn) if user and user["role"] == "owner" else [],
                "sites": list_sites(conn),
                "visits": list_visits(conn),
                "vehicles": list_vehicles(conn),
                "contracts": list_contracts(conn),
                "payments": list_payments(conn),
                "serviceTickets": list_service_tickets(conn),
                "backups": list_backups(),
                "routeIds": get_setting(conn, "route_ids", []),
            }

    def send_visits_csv(self):
        with db() as conn:
            data = export_data(conn)
        sites = {site["id"]: site for site in data["sites"]}
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["拜访时间", "站点", "结果", "需求", "顾虑", "报价", "下次动作", "下次跟进", "摘要"])
        for visit in data["visits"]:
            writer.writerow(
                [
                    visit["time"],
                    sites.get(visit["siteId"], {}).get("name", ""),
                    visit["result"],
                    visit["needs"],
                    "、".join(visit["concerns"]),
                    visit["quote"],
                    visit["nextAction"],
                    visit["nextFollowDate"],
                    visit["summary"],
                ]
            )
        self.send_bytes(("\ufeff" + output.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", "知兔拜访记录.csv")

    def current_user(self):
        with db() as conn:
            return get_session_user(conn, self.session_token())

    def require_user(self):
        user = self.current_user()
        if not user:
            self.send_json({"error": "未登录"}, status=401)
            return None
        return user

    def require_owner(self):
        user = self.require_user()
        if not user:
            return None
        if user["role"] != "owner":
            self.send_json({"error": "只有老板/管理员账号可以管理用户"}, status=403)
            return None
        return user

    def session_token(self):
        raw_cookie = self.headers.get("Cookie", "")
        for part in raw_cookie.split(";"):
            key, _, value = part.strip().partition("=")
            if key == "kxsl_session":
                return value
        return ""

    def session_cookie(self, token):
        max_age = SESSION_DAYS * 86400
        secure = "; Secure" if COOKIE_SECURE else ""
        return f"kxsl_session={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"

    def clear_session_cookie(self):
        secure = "; Secure" if COOKIE_SECURE else ""
        return f"kxsl_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}"

    def path_id(self, path, prefix):
        return int(path[len(prefix):].strip("/"))

    def send_static(self, path):
        if path == "/":
            path = "/index.html"
        relative = Path(unquote(path.lstrip("/")))
        target = (ROOT / relative).resolve()
        try:
            safe_relative = target.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return
        parts = safe_relative.parts
        allowed = safe_relative.as_posix() in STATIC_FILES or (parts and parts[0] in STATIC_DIRS)
        hidden = any(part.startswith(".") for part in parts)
        if not allowed or hidden or not target.exists() or target.is_dir():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        headers = {"Cache-Control": "public, max-age=3600"}
        if target.name in {"index.html", "manifest.webmanifest", "service-worker.js"}:
            headers["Cache-Control"] = "no-cache"
        if target.name == "service-worker.js":
            headers["Service-Worker-Allowed"] = "/"
        self.send_bytes(target.read_bytes(), content_type, headers=headers)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def send_json(self, payload, status=200, headers=None):
        response_headers = {"Cache-Control": "no-store"}
        response_headers.update(headers or {})
        self.send_bytes(
            as_json(payload).encode("utf-8"),
            "application/json; charset=utf-8",
            status=status,
            headers=response_headers,
        )

    def send_bytes(self, payload, content_type, filename=None, status=200, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        if filename:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(filename)}")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    init_db()
    if "--init-db" in sys.argv:
        print(f"Database ready: {DB_PATH}")
        print(f"Admin user: {ADMIN_USERNAME}")
        if ADMIN_USERNAME == "admin" and ADMIN_PASSWORD == "admin123":
            print("WARNING: default admin password is active. Set KXSL_ADMIN_PASSWORD before delivery.")
        return
    if "--backup" in sys.argv:
        reason_index = sys.argv.index("--backup") + 1
        reason = sys.argv[reason_index] if reason_index < len(sys.argv) else "cli"
        backup = create_database_backup(reason)
        if backup:
            print(f"Backup created: {backup['path']} ({backup['size']} bytes)")
        else:
            print("Backup skipped: database file does not exist")
        return
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving KXSL CRM on http://{HOST}:{PORT}/")
    print(f"SQLite database: {DB_PATH}")
    print(f"Admin user: {ADMIN_USERNAME}")
    if ADMIN_USERNAME == "admin" and ADMIN_PASSWORD == "admin123":
        print("WARNING: default admin password is active. Set KXSL_ADMIN_PASSWORD before delivery.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
