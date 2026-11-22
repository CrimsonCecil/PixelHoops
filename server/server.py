#!/usr/bin/env python3
"""PIXEL HOOPS 调参台配置存储（只用标准库）。
数据：data/tune.db（SQLite）。表 profiles(id, name, data JSON 覆盖项, updated)；meta(k, v) 存默认配置 id。
首次启动且库为空时，从 seed_profiles.json（发布前从线上导出）恢复；库非空时绝不覆盖。
"""
import json, os, sqlite3, time, re, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get('PIXELHOOPS_DATA_DIR', os.path.join(ROOT, 'data')); os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, 'tune.db')
SEED = os.path.join(ROOT, 'seed_profiles.json')
LOCK = threading.Lock()
db = sqlite3.connect(DB, check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated REAL NOT NULL)')
db.execute('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS replays (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, meta TEXT, size INT, created REAL)')
db.execute('CREATE TABLE IF NOT EXISTS replay_chunks (id TEXT, seq INT, data TEXT, PRIMARY KEY(id,seq))')
db.execute('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL, players INTEGER NOT NULL, capacity INTEGER NOT NULL, updated REAL NOT NULL)')
db.commit()

def export():
    rows = db.execute('SELECT id, name, data, updated FROM profiles ORDER BY updated').fetchall()
    d = db.execute("SELECT v FROM meta WHERE k='default'").fetchone()
    return {'profiles': [{'id': r[0], 'name': r[1], 'data': json.loads(r[2]), 'updated': r[3]} for r in rows], 'default': d[0] if d else 'official'}

def seed():
    if db.execute('SELECT COUNT(*) FROM profiles').fetchone()[0] or not os.path.exists(SEED): return
    try: s = json.load(open(SEED, encoding='utf-8'))
    except Exception: return
    for p in s.get('profiles', []):
        db.execute('INSERT OR IGNORE INTO profiles VALUES (?,?,?,?)', (p['id'], p['name'], json.dumps(p.get('data', {}), ensure_ascii=False), p.get('updated', time.time())))
    if s.get('default'): db.execute("INSERT OR REPLACE INTO meta VALUES ('default', ?)", (s['default'],))
    db.commit()
seed()

db.execute('CREATE TABLE IF NOT EXISTS history (id TEXT, name TEXT, data TEXT, updated REAL, op TEXT)'); db.commit()
FROZEN = [0.0]   # 发版期间冻结写入，避免导出后新保存丢失（客户端会显示保存失败并保留未保存状态）
def frozen(): return time.time() < FROZEN[0]

ID_RE = re.compile(r'^[a-zA-Z0-9_-]{1,40}$')

class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def _body(self, limit=512 * 1024):
        n = int(self.headers.get('Content-Length') or 0)
        if n < 0 or n > limit: raise ValueError('too large')
        return json.loads(self.rfile.read(n) or b'{}')
    def _path(self):
        p = self.path.split('?')[0]
        i = p.find('/api/')
        return p[i:] if i >= 0 else p
    def log_message(self, *a): pass
    def do_OPTIONS(self): self._send(204, {})
    def do_GET(self):
        p = self._path()
        if p == '/api/rooms':
            with LOCK:
                rows = db.execute('SELECT code,name,mode,players,capacity FROM rooms WHERE updated>? AND players<capacity ORDER BY updated DESC LIMIT 100', (time.time() - 60,)).fetchall()
            return self._send(200, {'rooms': [dict(zip(('code', 'name', 'mode', 'players', 'capacity'), r)) for r in rows]})
        if p == '/api/replays' or p.startswith('/api/replays/'):
            with LOCK:
                if p == '/api/replays':
                    rows = db.execute('SELECT * FROM replays ORDER BY created DESC').fetchall()
                    return self._send(200, {'replays': [dict(id=r[0], name=r[1], meta=json.loads(r[2]), size=r[3], created=r[4]) for r in rows]})
                key = unquote(p[len('/api/replays/'):])
                r = db.execute('SELECT * FROM replays WHERE id=? OR name=? ORDER BY (id=?) DESC LIMIT 1', (key, key, key)).fetchone()
                if not r: return self._send(404, {'error': 'not found'})
                data = ''.join(c[0] for c in db.execute('SELECT data FROM replay_chunks WHERE id=? ORDER BY seq', (r[0],)))
                return self._send(200, dict(id=r[0], name=r[1], meta=json.loads(r[2]), size=r[3], created=r[4], data=data))
        if p in ('/api/profiles', '/api/export'):
            with LOCK: return self._send(200, export())
        if p == '/api/health': return self._send(200, {'ok': True, 'frozen': frozen()})
        if p == '/api/history':
            with LOCK:
                rows = db.execute('SELECT id, name, data, updated, op FROM history ORDER BY updated DESC LIMIT 200').fetchall()
            return self._send(200, {'history': [{'id': r[0], 'name': r[1], 'data': json.loads(r[2]), 'updated': r[3], 'op': r[4]} for r in rows]})
        self._send(404, {'error': 'not found'})
    def do_PUT(self):
        if self._path().startswith('/api/rooms/'):
            return self._room_write(False)
        if self._path().startswith('/api/replays/'):
            return self._replay_write(False)
        p = self._path(); m = re.match(r'^/api/profiles/([^/]+)$', p)
        if frozen(): return self._send(503, {'error': 'frozen', 'msg': '正在发布新版本，请稍后再保存'})
        if not m or not ID_RE.match(m.group(1)) or m.group(1) == 'official': return self._send(400, {'error': 'bad id'})
        try: b = self._body()
        except Exception: return self._send(400, {'error': 'bad body'})
        name = str(b.get('name') or '未命名')[:30]; data = b.get('data') or {}
        if not isinstance(data, dict): return self._send(400, {'error': 'bad data'})
        data = {str(k)[:60]: v for k, v in data.items() if isinstance(v, (int, float, bool, str))}
        with LOCK:
            now = time.time(); js = json.dumps(data, ensure_ascii=False)
            db.execute('INSERT OR REPLACE INTO profiles VALUES (?,?,?,?)', (m.group(1), name, js, now))
            db.execute('INSERT INTO history VALUES (?,?,?,?,?)', (m.group(1), name, js, now, 'put')); db.commit()
            return self._send(200, export())
    def do_DELETE(self):
        if self._path().startswith('/api/rooms/'):
            return self._room_write(True)
        if self._path().startswith('/api/replays/'):
            return self._replay_write(True)
        p = self._path(); m = re.match(r'^/api/profiles/([^/]+)$', p)
        if not m: return self._send(404, {'error': 'not found'})
        if frozen(): return self._send(503, {'error': 'frozen', 'msg': '正在发布新版本，请稍后再操作'})
        with LOCK:
            r = db.execute('SELECT id, name, data, updated FROM profiles WHERE id=?', (m.group(1),)).fetchone()
            if r: db.execute('INSERT INTO history VALUES (?,?,?,?,?)', (r[0], r[1], r[2], time.time(), 'delete'))
            db.execute('DELETE FROM profiles WHERE id=?', (m.group(1),))
            d = db.execute("SELECT v FROM meta WHERE k='default'").fetchone()
            if d and d[0] == m.group(1): db.execute("DELETE FROM meta WHERE k='default'")
            db.commit(); return self._send(200, export())
    def _replay_write(self, delete):
        if frozen(): return self._send(503, {'error': 'frozen'})
        id = self._path()[len('/api/replays/'):]
        if not ID_RE.fullmatch(id): return self._send(400, {'error': 'bad id'})
        if not delete:
            try: b = self._body(90 * 1024 * 1024)
            except Exception: return self._send(400, {'error': 'bad body'})
            if not isinstance(b, dict): return self._send(400, {'error': 'bad body'})
            name = b.get('name'); data = b.get('data')
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40: return self._send(400, {'error': 'bad name'})
            name = name.strip()
            if not isinstance(data, str): return self._send(400, {'error': 'bad data'})
        with LOCK:
            if not delete and db.execute('SELECT 1 FROM replays WHERE name=? AND id<>?', (name, id)).fetchone(): return self._send(409, {'error': 'name taken'})
            with db:
                db.execute('DELETE FROM replay_chunks WHERE id=?', (id,))
                if delete:
                    db.execute('DELETE FROM replays WHERE id=?', (id,))
                else:
                    row = dict(id=id, name=name, meta=b.get('meta'), size=len(data.encode('utf-8')), created=time.time())
                    db.execute('INSERT OR REPLACE INTO replays VALUES (?,?,?,?,?)', (id, name, json.dumps(row['meta'], ensure_ascii=False), row['size'], row['created']))
                    db.executemany('INSERT INTO replay_chunks VALUES (?,?,?)', [(id, n // 900000, data[n:n+900000]) for n in range(0, len(data), 900000)])
            return self._send(200, {'ok': True} if delete else row)
    def _room_write(self, delete):
        code = self._path()[len('/api/rooms/'):]
        if not re.fullmatch(r'[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}', code): return self._send(400, {'error': 'bad code'})
        try: b = self._body(2048)
        except Exception: return self._send(400, {'error': 'bad body'})
        if not isinstance(b, dict) or not isinstance(b.get('token'), str) or not re.fullmatch(r'[a-zA-Z0-9_-]{20,80}', b['token']): return self._send(400, {'error': 'bad token'})
        with LOCK:
            if delete:
                db.execute('DELETE FROM rooms WHERE code=? AND token=?', (code, b['token'])); db.commit()
                return self._send(200, {'ok': True})
            name, mode, players, capacity = (b.get(k) for k in ('name', 'mode', 'players', 'capacity'))
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 24 or mode not in ('online', 't3') or type(players) is not int or type(capacity) is not int or not 1 <= players <= capacity or not (2 if mode == 'online' else 1) <= capacity <= (2 if mode == 'online' else 6): return self._send(400, {'error': 'bad room'})
            now = time.time()
            db.execute('DELETE FROM rooms WHERE updated<?', (now - 60,))
            cur = db.execute('INSERT INTO rooms VALUES (?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,mode=excluded.mode,players=excluded.players,capacity=excluded.capacity,updated=excluded.updated WHERE rooms.token=excluded.token', (code, b['token'], name.strip(), mode, players, capacity, now))
            db.commit()
            return self._send(200, {'ok': True, 'ttl': 60}) if cur.rowcount else self._send(409, {'error': 'room already owned'})

    def do_POST(self):
        p = self._path()
        if p == '/api/freeze':
            try: b = self._body()
            except Exception: b = {}
            FROZEN[0] = time.time() + max(0, min(900, float(b.get('sec') or 0)))
            return self._send(200, {'frozen': frozen(), 'until': FROZEN[0]})
        if frozen(): return self._send(503, {'error': 'frozen', 'msg': '正在发布新版本，请稍后再操作'})
        if p == '/api/default':
            try: b = self._body()
            except Exception: return self._send(400, {'error': 'bad body'})
            i = str(b.get('id') or 'official')
            with LOCK:
                if i != 'official' and not db.execute('SELECT 1 FROM profiles WHERE id=?', (i,)).fetchone(): return self._send(404, {'error': 'no profile'})
                db.execute("INSERT OR REPLACE INTO meta VALUES ('default', ?)", (i,)); db.commit()
                return self._send(200, export())
        self._send(404, {'error': 'not found'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    ThreadingHTTPServer(('0.0.0.0', port), H).serve_forever()
