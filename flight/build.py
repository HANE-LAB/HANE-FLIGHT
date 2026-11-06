"""合成页面用的 data/flight.json。

数据全部在线自动获取，不用登录，也不放任何凭据（python -m flight update，每日更新的工作流跑的也是这一句）：
  Danmakus 的直播统计   nailv 用的公开接口：逐场的标题、开播、时长、弹幕数、同接……
  HANE Voyage 的日表    公开仓库的 data/voyage.json：每天的大航海人数；直播统计没有的日子她开没开播；今天名单的分档和陪伴天数

输出结构见 docs/DATA.md。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import statistics
import time
import urllib.request
from pathlib import Path

CST = dt.timezone(dt.timedelta(hours=8))
DAY0 = dt.date(2021, 2, 3)
UID = 2094031249
LIVES_URL = f"https://api.ukamnads.icu/api/v2/channel?uid={UID}"
VOYAGE_URL = "https://raw.githubusercontent.com/HANE-LAB/HANE-VOYAGE/main/data/voyage.json"
RAW = Path("data/raw")   # 取回来的原样存在这里，不进仓库

# 「大事的夜」：门更高、插一对火羽，鸟滑翔着穿过的夜。规则写在这里，页面只读旗标。
KEYWORDS = re.compile(r"夢|約束|伝説|誕生|生日|艦|記念|周年|万人|復活|境目|最終回|ラスト|歌回")
DM_RATIO = 2.5      # 弹幕数超过前后 30 夜中位数的倍数
DM_FLOOR = 3000     # 且不少于这个数
DM_BIG = 30000      # 或者绝对值超过这个数
DUR_LONG = 8.0      # 或者播了这么多小时以上
VET_DAYS = 30       # 舰长里陪伴满这么多天的才单独记下（老资历的最低一档，和 Voyage 一样）


def fetch(url: str, path: Path) -> None:
    """取回一份公开的 JSON，原样存下。失败时再试两次，还不行就抛出去。"""
    req = urllib.request.Request(url, headers={"User-Agent": "HaneFlight/1.0 (public live statistics)", "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            json.loads(body)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
            return
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(10 * (attempt + 1))


def read_lives(path: Path) -> list[dict]:
    """直播统计的逐场记录。响应不对就抛出去：宁可今天的门不更新，也不把错的数据合进去。"""
    body = json.loads(path.read_text(encoding="utf-8"))
    data = body.get("data") if isinstance(body, dict) and body.get("code") == 200 else None
    if not isinstance(data, dict) or not isinstance(data.get("channel"), dict) or not isinstance(data.get("lives"), list):
        raise ValueError("响应结构不完整")
    channel, lives = data["channel"], data["lives"]
    if str(channel.get("uId")) != str(UID):
        raise ValueError("返回的不是她的记录")
    ids = [it["liveId"] for it in lives]
    if not lives or len(set(ids)) != len(ids) or channel.get("totalLiveCount") != len(lives):
        raise ValueError(f"场次对不上：{len(lives)} 场，来源说有 {channel.get('totalLiveCount')} 场")
    return lives


def load_nights(lives: list[dict]):
    """逐场记录归并成夜：北京时间 06:00 以前开始的场次算前一晚。另外记下每场开始的日期，Voyage 的开播日是按它算的。"""
    nights: dict[dt.date, dict] = {}
    started: set[dt.date] = set()
    for it in lives:
        start = it["startDate"] / 1000
        stop = (it.get("stopDate") or it["startDate"]) / 1000
        sd = dt.datetime.fromtimestamp(start, CST)
        started.add(sd.date())
        night = sd.date() if sd.hour >= 6 else sd.date() - dt.timedelta(days=1)
        n = nights.setdefault(night, {"dm": 0, "on": 0, "dur": 0.0, "title": "", "min": None})
        n["dm"] += it.get("danmakusCount", 0)
        n["on"] = max(n["on"], it.get("maxOnlineCount", 0))
        n["dur"] += (stop - start) / 3600
        minute = sd.hour * 60 + sd.minute + (1440 if sd.hour < 6 else 0)
        if n["min"] is None or minute < n["min"]:
            n["min"] = minute
            n["title"] = (it.get("title") or "").replace("【B限】", "").strip()
    return nights, started


def mark_special(rows: list[list]) -> None:
    """标出大事的夜（每行最后一格）。"""
    prev_title = ""
    dms = [r[3] for r in rows]
    for i, r in enumerate(rows):
        window = dms[max(0, i - 15): i + 16]
        med = statistics.median(window) or 1
        title = r[5]
        special = (
            (title != prev_title and bool(KEYWORDS.search(title)))
            or (r[3] > DM_RATIO * med and r[3] > DM_FLOOR)
            or r[3] >= DM_BIG
            or r[2] >= DUR_LONG
        )
        r[6] = 1 if special else 0
        prev_title = title


def build(voyage: Path, lives: Path | None, out: Path) -> None:
    """lives 为 None：直播统计今天取不到，门照旧，只更新舰长数。"""
    voy = json.loads(voyage.read_text(encoding="utf-8"))
    live = voy["live"]
    ndays = len(live)
    old = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}

    if lives is None:
        rows = old["nights"]
        ghosts = old["ghosts"]
    else:
        # 从上一次的结果接着合：来源哪天不再给某一夜了，这一夜也不会丢
        by_day = {r[0]: r[:6] + [0] for r in old.get("nights", [])}
        nights, started = load_nights(read_lives(lives))
        for day, n in nights.items():
            idx = (day - DAY0).days
            if 0 <= idx < ndays:
                by_day[idx] = [idx, n["min"], round(n["dur"], 2), n["dm"], n["on"], n["title"], 0]
        rows = [by_day[d] for d in sorted(by_day)]
        mark_special(rows)
        # 只有预告的夜：Voyage 说那天开播，这里却没有那一夜。午夜后才开始的一场，记在前一晚，也算在它开始的那一天，不是两夜
        have = {r[0] for r in rows} | {(d - DAY0).days for d in started}
        ghosts = [d for d, l in enumerate(live) if l and d not in have]

    # 今天名单里的分档和陪伴天数，从长到短；不带名字和 ID，也不和任何人对得上，页面只用它决定谁飞在哪、长什么样
    named = voy.get("named") or []
    days = lambda level: sorted((n.get("acc") or 0 for n in named if n["level"] == level), reverse=True)
    roster = {"sou": days(1), "tei": days(2), "vets": [a for a in days(3) if a >= VET_DAYS]}

    # 直播存档缺口：两场有存档的夜之间最长的一段空白，页面在这一段进雾
    gap = [0, 0]
    for a, b in zip(rows, rows[1:]):
        if b[0] - a[0] - 1 > gap[1] - gap[0]:
            gap = [a[0] + 1, b[0] - 1]

    data = {
        "day0": DAY0.isoformat(),
        "ndays": ndays,
        "total": voy["total"],
        "nights": rows,
        "ghosts": ghosts,
        "gap": gap,
        "roster": roster,
        "meta": {
            "built_at": dt.datetime.now(CST).isoformat(timespec="seconds"),
            "archived": len(rows),
            "ghost": len(ghosts),
            "special": sum(r[6] for r in rows),
            "danmaku_total": sum(r[3] for r in rows),
            "rule": {"keywords": KEYWORDS.pattern, "dm_ratio": DM_RATIO, "dm_floor": DM_FLOOR, "dm_big": DM_BIG, "dur_long": DUR_LONG},
        },
    }
    # 内容没变就不动文件：只有合成时间不同，不值得每天提交一次、重建一次网站
    m = data["meta"]
    kept = old.get("meta", {}).get("built_at")
    if kept and {**old, "meta": {**old["meta"], "built_at": ""}} == {**data, "meta": {**m, "built_at": ""}}:
        print(f"{out} 没有变化")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"写入 {out}：共 {ndays} 天，有记录 {m['archived']} 夜，只有预告 {m['ghost']} 夜，大事 {m['special']} 夜，弹幕 {m['danmaku_total']:,} 条，最后一天舰长 {voy['total'][-1]} 人，总督 {len(roster['sou'])}、提督 {len(roster['tei'])}、老资历 {len(roster['vets'])}，存档缺口 {data['gap']}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="flight")
    ap.add_argument("cmd", choices=["update", "build"], help="update：联网取数据再合成；build：不联网，用 data/raw 里上次取回的合成")
    ap.add_argument("--out", default="data/flight.json")
    a = ap.parse_args(argv)
    lives: Path | None = RAW / "lives.json"
    voyage = RAW / "voyage.json"
    if a.cmd == "update":
        # Voyage 取不到就整个失败，网站保留前一天的数据；直播统计取不到只是今天的门不更新，舰长数照常
        fetch(VOYAGE_URL, voyage)
        try:
            fetch(LIVES_URL, lives)
            read_lives(lives)
        except (OSError, ValueError, KeyError) as e:
            print(f"::warning::直播统计取不到（{e}），今天只更新舰长数")
            lives = None
    build(voyage, lives, Path(a.out))


if __name__ == "__main__":
    main()
