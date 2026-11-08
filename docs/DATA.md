# 数据

[返回首页](../README.md)

页面读两份数据，都在构建时导入：`data/flight.json` 每天自动更新，`data/writing.json` 是门柱上的字。

## data/flight.json

`src/data.ts` 读它：

```js
{
  day0: "2021-02-03",
  ndays: 2099,                        // 每天增长
  total: [每天的大航海总数],          // 来自 HANE Voyage 的 voyage.json，每人一只小鸟
  nights: [[day, startMin, durH, dm, online, title, special]],
    // day       第几天（北京时间）
    // startMin  当夜最早开播的时刻，从 00:00 起的分钟数；凌晨 6 点前开播算前一晚，写成 1440+
    // durH      当夜播了几小时（几场相加）
    // dm        弹幕数
    // online    同接峰值（2026 年以前存档里是 0）
    // title     直播标题，去掉了【B限】
    // special   1 = 大事的夜：门更高，插火羽
  ghosts: [只有预告、没有直播记录的日子],
  gap: [存档缺口的首日, 末日],       // 页面在这一段进雾
  roster: { sou: [...], tei: [...], vets: [...] },
    // 今天名单的分档：总督、提督、满 30 天的舰长各自的陪伴天数，从长到短。没有名字和 ID
  meta: { built_at, archived, ghost, special, danmaku_total, rule }
}
```

- 每座门是 `nights` 里的一夜或 `ghosts` 里的一天，按日期排好后按气候挑（`src/data.ts` 的 `SLOTS`）：大事的夜和情绪突出的夜都留，其余每隔几天留弹幕最多的那一夜（`src/climate.ts` 的 `everyOf`）。
- `total` 决定她身边有多少只小鸟、云谷多宽，以及太阳在哪一夜升起：人数涨得最多的那一夜（`src/data.ts` 的 `JUMP`）。

## data/writing.json

门柱上的字和每夜的情绪，`src/voices.ts` 读它：

```js
{
  stages: [{ from, name, front: [中文, 日文], back: [中文, 日文], neg?: [中文, 日文] }],
    // from   从第几天起用这一组句子
    // 每句是 [句子, 权重, 魂]，魂是这句话的情绪：0 平常、1 担心、2 温暖、4 难过或不满
    // neg    负面的话，借来的闪电里亮起来
  moments: { "<day>": { front, back, neg? } },   // 大事之夜自己的句子，都是当夜真有人说过的
  nights: [[day, kept, people, night, gold, kana, hidden, warm, worry, neg, souls, beat, rain]],
    // kept    1 = 有逐条弹幕；0 = 只有人数，其余是相近的夜估的
    // people、night  当夜说话的人数、说晚安的人数，门柱正面、背面各写这么多句
    // gold    一年以上老观众的比例，写成金字
    // kana    带假名的句子的比例，这么多句写日文
    // hidden  写成负面的话的比例，风波那几周放大
    // warm、worry、neg  温暖、担心、难过和不满，千分之几
    // souls   这一夜哪几样比前后 30 夜高得多，寻声用
    // beat    她为这一夜放慢多少：0 不放慢，1 放慢，2 几乎停下
    // rain    0 到 9，这一夜下多大的雨
  said: { "<day>": [序号, 人数, ...] }   // 当夜的话：挑过的句子里当夜真有人说过的
}
```

这份由逐条弹幕分析得到（情绪模型加人工挑句子），不在每日更新里，分析程序也不在这个仓库。还没分析过的新夜，门柱上按最近两周的比例估算（`src/writing.ts` 的 `guess`）。

## 来源

全部在线获取，不用登录，不放任何凭据。

| 数据 | 来源 |
|---|---|
| 逐场直播记录，今天名单的分档和陪伴天数 | Danmakus 的公开接口 `api.ukamnads.icu/api/v2/channel` |
| 每天的大航海总数，档案缺的日子她开没开播 | HANE Voyage 公开仓库的 `data/voyage.json` |
| 门柱上的字 | 同一个 Danmakus 接口的逐条弹幕 |

## 每日自动更新

[update-data.yml](../.github/workflows/update-data.yml) 每天日本时间 04:30 运行，也可以在 Actions 里手动运行：取上面两份在线数据，合成 `data/flight.json`；有变化就提交到 `main`，再重建网站、离线版和桌面版。

- Voyage 取不到或合成失败：不提交，网站保留前一天的数据。
- 直播记录取不到或对不上：门和夜不动，人数照常更新，Actions 页上有一条警告。
- 门到她播完的最后一夜；人数到 Voyage 最后更新的那一天，通常早一天。

## 合成

```powershell
uv run python -X utf8 -m flight update     # 联网取数据再合成
uv run python -X utf8 -m flight build      # 不联网，用上次取回的数据（data/raw/，不进仓库）再合成
```

`flight/build.py` 只用标准库：

- 北京时间 06:00 以前开始的场次算前一晚；一晚几场时弹幕、时长相加，同接取最大，标题取最早那场的。
- 从上一次的 `flight.json` 接着合，新数据盖旧数据，来源不再给的夜留着。
- Voyage 说那天开播、这里又没有记录的日子，是只有预告的夜，门是素木的。
- 大事的夜：标题和前一夜不同且含纪念、生日、周年等关键词；或弹幕超过前后 30 夜中位数的 2.5 倍且不少于 3000；或弹幕不少于 30000；或播了 8 小时以上。规则在 `flight/build.py` 顶部。
- 存档缺口：相邻两夜之间最长的空白，现在是 2023-09-01 到 2025-07-25。

## 没存什么

- 观众的名字和 UID：一读到就丢。
- 逐条弹幕的原文：仓库里只有每夜的数字和挑过的句子。
- 她写的动态和评论区的文字：要登录才抓得稳，不收。

## 已知问题

- Danmakus 有一场 2022 年的记录长 34 小时，应是合并出错。
- 同接峰值在 2026 年以前都是 0。
