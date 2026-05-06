import csv
import io
import json
import math
import mimetypes
import os
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.db"
HOST = "127.0.0.1"
PORT = 4173
AMAP_KEY = os.environ.get("AMAP_KEY", "").strip()


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


def as_json(value):
    return json.dumps(value, ensure_ascii=False)


def parse_json_text(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


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
            """
        )

        count = conn.execute("SELECT COUNT(*) FROM sites").fetchone()[0]
        if count == 0:
            for site in DEFAULT_SITES:
                insert_site(conn, site, explicit_id=True)
            for visit in DEFAULT_VISITS:
                insert_visit(conn, visit, explicit_id=True, update_site=False)
            set_setting(conn, "route_ids", [4, 2, 1])
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
          lat = ?, lng = ?, updated_at = ?
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
        "version": 2,
        "exportedAt": now_text(),
        "sites": list_sites(conn),
        "visits": list_visits(conn),
        "routeIds": get_setting(conn, "route_ids", []),
    }


def import_data(conn, payload):
    if not isinstance(payload.get("sites"), list) or not isinstance(payload.get("visits"), list):
        raise ValueError("导入文件缺少 sites 或 visits")
    conn.execute("DELETE FROM visits")
    conn.execute("DELETE FROM sites")
    conn.execute("DELETE FROM settings")
    for site in payload["sites"]:
        insert_site(conn, site, explicit_id=bool(site.get("id")))
    for visit in payload["visits"]:
        insert_visit(conn, visit, explicit_id=bool(visit.get("id")), update_site=False)
    set_setting(conn, "route_ids", payload.get("routeIds", []))


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
        parsed = urlparse(self.path)
        path = parsed.path
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
        self.send_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/sites":
            payload = self.read_json()
            with db() as conn:
                site = insert_site(conn, payload)
                conn.commit()
            self.send_json({"site": site})
            return
        if path == "/api/visits":
            payload = self.read_json()
            with db() as conn:
                visit = insert_visit(conn, payload)
                site = get_site(conn, visit["siteId"])
                conn.commit()
            self.send_json({"visit": visit, "site": site})
            return
        if path == "/api/import":
            payload = self.read_json()
            with db() as conn:
                import_data(conn, payload)
                conn.commit()
            self.send_json(self.bootstrap())
            return
        self.send_error(404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/sites/"):
            site_id = int(path.rsplit("/", 1)[1])
            payload = self.read_json()
            with db() as conn:
                site = update_site(conn, site_id, payload)
                conn.commit()
            if not site:
                self.send_error(404)
                return
            self.send_json({"site": site})
            return
        if path == "/api/route":
            payload = self.read_json()
            route_ids = payload.get("routeIds") if isinstance(payload.get("routeIds"), list) else []
            with db() as conn:
                set_setting(conn, "route_ids", route_ids)
                conn.commit()
            self.send_json({"routeIds": route_ids})
            return
        self.send_error(404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/sites/"):
            site_id = int(path.rsplit("/", 1)[1])
            with db() as conn:
                conn.execute("DELETE FROM sites WHERE id = ?", (site_id,))
                route_ids = [item for item in get_setting(conn, "route_ids", []) if item != site_id]
                set_setting(conn, "route_ids", route_ids)
                conn.commit()
            self.send_json({"ok": True, "routeIds": route_ids})
            return
        self.send_error(404)

    def bootstrap(self):
        with db() as conn:
            return {
                "sites": list_sites(conn),
                "visits": list_visits(conn),
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

    def send_static(self, path):
        if path == "/":
            path = "/index.html"
        relative = Path(unquote(path.lstrip("/")))
        target = (ROOT / relative).resolve()
        if not str(target).startswith(str(ROOT)) or not target.exists() or target.is_dir():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_bytes(target.read_bytes(), content_type)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def send_json(self, payload, status=200):
        self.send_bytes(as_json(payload).encode("utf-8"), "application/json; charset=utf-8", status=status)

    def send_bytes(self, payload, content_type, filename=None, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
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
        return
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving KXSL CRM on http://{HOST}:{PORT}/")
    print(f"SQLite database: {DB_PATH}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
