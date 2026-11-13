# -*- coding: utf-8 -*-
"""Автопроверка Threads-бота локально (эмулятор Apps Script + заглушка Threads API).

    node tools/gas-emulator.js 8791 &  python3 tools/devserver.py &  python3 tools/test_threads.py
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

BASE, GAS = "http://127.0.0.1:8790", "http://127.0.0.1:8791"
OK, BAD = [], []
TODAY = datetime.now(timezone(timedelta(hours=5)))


def check(name, cond, extra=""):
    (OK if cond else BAD).append(name)
    print(("OK   " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(extra)[:300]))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def http(method, url, body=None, headers=None, follow=True):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=dict({"Content-Type": "application/json"}, **(headers or {})))
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(req, timeout=60)
        return r.status, r.read().decode(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), e.headers


def gas(action, **kw):
    kw.update(action=action, secret="dev-secret")
    return json.loads(http("POST", GAS + "/exec", kw)[1])


def cron(auth="Bearer dev-cron"):
    st, body, _ = http("GET", BASE + "/api/threads_cron", headers={"Authorization": auth} if auth else {})
    try:
        return st, json.loads(body)
    except ValueError:
        return st, {"_raw": body[:200]}


def sheet():
    return json.loads(http("GET", GAS + "/__thsheet")[1])[0]["rows"]


def row(n):
    r = sheet()[n - 1]
    return {"status": r[6], "link": r[7], "err": r[9], "ok": r[5]}


def published():
    return [f for f in json.loads(http("GET", GAS + "/__fetch")[1]) if f["url"].endswith("/threads_publish")]


d = lambda k: (TODAY + timedelta(days=k)).strftime("%d.%m.%Y")
http("POST", GAS + "/__reset", {})

res = gas("threads.setup")
check("Таблица постов создана", res.get("ok") and res.get("created"), res)
check("Повторный setup не создаёт вторую таблицу", gas("threads.setup").get("created") is False)
LONG = "Очень длинный пост. " * 30
res = gas("threads.import", posts=[
    {"date": d(-1), "topic": "Вчерашний", "text": "ТЕСТ пост 1: вчерашний, одобрим вторым"},
    {"date": d(0), "topic": "Сегодня", "text": "ТЕСТ пост 2: сегодняшний"},
    {"date": d(3), "topic": "Будущее", "text": "ТЕСТ пост 3: через 3 дня"},
    {"date": d(0), "topic": "Длинный", "text": LONG},
])
check("Посты загружены в таблицу (4)", res.get("added") == 4, res)
r = sheet()
check("Заголовки и колонки на месте", r[0][:7] == ["№", "Дата публикации", "Тема", "Текст поста", "Знаков", "Одобрено", "Статус"], r[0])
check("Новые посты не одобрены и ждут", all(x[5] is False and x[6] == "Ожидает" for x in r[1:]), r[1:])
check("Знаков - формула", r[1][4] == "=LEN(D2)", r[1][4])
check("Лист «Как пользоваться» есть", any(s["name"] == "Как пользоваться" for s in json.loads(http("GET", GAS + "/__thsheet")[1])))

st, _ = cron(auth="")
check("Без ключа CRON_SECRET запуск запрещён (401)", st == 401)
st, _ = cron(auth="Bearer wrong")
check("С неверным ключом - 401", st == 401)
st, res = cron()
check("Без одобрения ничего не публикуется", st == 200 and res.get("post_row") is None and not published(), res)

http("GET", GAS + "/__thcell?row=3&col=6&v=true")
st, res = cron()
check("Аккаунт не подключён: пост помечен «Ошибка», письмо ушло", row(3)["status"] == "Ошибка" and "не подключён" in row(3)["err"]
      and any("Threads-бот" in m["subject"] for m in json.loads(http("GET", GAS + "/__mail")[1])), (res, row(3)))

st, _, hdr = http("GET", BASE + "/api/threads_auth?start=1", follow=False)
loc = hdr.get("Location", "")
qs = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(loc).query))
check("Ссылка входа ведёт в окно Threads с нужными правами", st == 302 and "/oauth/authorize" in loc and qs.get("scope") == "threads_basic,threads_content_publish"
      and qs.get("response_type") == "code" and qs.get("client_id") == "dev-app", loc)
st, body, _ = http("GET", BASE + "/api/threads_auth?code=abc&state=" + urllib.parse.quote("123.fake"))
check("Чужой или поддельный state отклоняется", st == 400 and "устарела" in body)
st, body, _ = http("GET", BASE + "/api/threads_auth?code=abc%23_&state=" + urllib.parse.quote(qs["state"]))
check("Вход: ключ получен, аккаунт @tmk.tech подключён", st == 200 and "@tmk.tech" in body, body[:200])
status = gas("threads.status")
check("Ключ сохранён в свойствах скрипта, не в таблице", status["connected"] and status["username"] == "tmk.tech"
      and "long-tok" not in json.dumps(sheet()), status)
ex = [f for f in json.loads(http("GET", GAS + "/__fetch")[1]) if f["url"] == "/__th/oauth/access_token"][-1]["params"]
check("Код обменян без хвоста #_ и с тем же redirect_uri", ex.get("code") == "abc" and ex.get("redirect_uri", "").endswith("/api/threads_auth"), ex)

st, res = cron()
check("Публикация: пост 2 вышел, ссылка в таблице", res.get("published") and row(3)["status"] == "Опубликован"
      and row(3)["link"].startswith("https://www.threads.com/@tmk.tech/post/"), (res, row(3)))
check("Опубликован ровно один пост", len(published()) == 1)
st, res = cron()
check("Второй запуск в тот же день: больше нечего публиковать", res.get("post_row") is None and len(published()) == 1, res)

http("GET", GAS + "/__thcell?row=2&col=6&v=true")
http("GET", GAS + "/__thcell?row=4&col=6&v=true")
st, res = cron()
check("Вчерашний одобренный пост выходит, будущий - нет", row(2)["status"] == "Опубликован" and row(4)["status"] == "Ожидает", (row(2), row(4)))

http("GET", GAS + "/__thcell?row=2&col=7&v=" + urllib.parse.quote("Ожидает"))
st, res = cron()
check("Защита от повтора: тот же текст не публикуется второй раз", res.get("duplicate_skipped") and len(published()) == 2
      and row(2)["status"] == "Опубликован", (res, len(published())))

http("GET", GAS + "/__thcell?row=5&col=6&v=true")
st, res = cron()
check("Слишком длинный пост не уходит, понятная ошибка", res.get("error") == "too_long" and row(5)["status"] == "Ошибка"
      and "длиннее 500" in row(5)["err"], (res, row(5)))
http("GET", GAS + "/__thcell?row=5&col=6&v=false")

old = (datetime.now(timezone.utc) - timedelta(days=31)).strftime("%Y-%m-%dT%H:%M:%SZ")
http("GET", GAS + "/__prop?k=THREADS_TOKEN_AT&v=" + old)
http("POST", GAS + "/exec", {"secret": "dev-secret", "action": "threads.import", "posts": [{"date": d(0), "topic": "Новый", "text": "ТЕСТ пост 5: после продления ключа"}]})
http("GET", GAS + "/__thcell?row=6&col=6&v=true")
st, res = cron()
fetch = json.loads(http("GET", GAS + "/__fetch")[1])
last_pub = [f for f in fetch if f["url"].endswith("/777/threads") and f["method"] == "POST"][-1]
check("Ключ старше 30 дней продлевается и сразу используется", res.get("token_refreshed") and last_pub["params"]["access_token"] == "long-tok-2"
      and row(6)["status"] == "Опубликован", (res, last_pub["params"].get("access_token")))

http("POST", GAS + "/exec", {"secret": "dev-secret", "action": "threads.import", "posts": [{"date": d(0), "topic": "Сбой", "text": "ТЕСТ пост 6: сбой API"}]})
http("GET", GAS + "/__thcell?row=7&col=6&v=true")
http("GET", GAS + "/__thfail?on=threads_publish")
st, res = cron()
check("Сбой Threads API: статус «Ошибка» с причиной", row(7)["status"] == "Ошибка" and "mock failure" in row(7)["err"], (res, row(7)))
http("GET", GAS + "/__thfail?on=")
st, res = cron()
check("На следующий запуск пост после ошибки выходит", row(7)["status"] == "Опубликован", (res, row(7)))

http("POST", GAS + "/exec", {"secret": "dev-secret", "action": "threads.import", "posts": [{"date": "2026-11-20", "text": "x"}]})
bad = gas("threads.import", posts=[{"date": "2026-11-20", "text": "x"}])
check("Дата не в формате ДД.ММ.ГГГГ отклоняется", bad.get("ok") is False and bad.get("error") == "bad_date", bad)

print("\nИтого: %d OK, %d FAIL" % (len(OK), len(BAD)))
sys.exit(1 if BAD else 0)
