# 第三方声明

## KawaiiPhysics

`src/kawaii/` 是 KawaiiPhysics v1.21.0（提交 `feee5fe727261ba9cfe725c4af280aa9e381c31d`）解算逻辑的 TypeScript 移植，与原版不同之处在代码里以 `ours:` 标出。

<https://github.com/pafuhana1213/KawaiiPhysics>

```
MIT License

Copyright (c) 2019-2026 pafuhana1213

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 霞鹜文楷（LXGW WenKai）

`src/figures/hane-kai.woff2` 是霞鹜文楷 v1.530 Medium 的子集，只留页面用到的字，改名 Hane Kai。按 SIL Open Font License 1.1 使用。

<https://github.com/lxgw/LxgwWenKai>

```
Copyright 2021-2026 LXGW (https://github.com/lxgw/LxgwWenKai), with Reserved Font Name '霞鹜', '霞鶩', '落霞孤鹜', '落霞孤鶩' and 'LXGW'.
Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is available with a FAQ at: https://openfontlicense.org
```

## OpenTracks 的配乐

页面的配乐是 OpenTracks（旧 DOVA-SYNDROME）的三首曲子，按它的[音源利用ライセンス](https://opentracks.com/help/articles/license/)使用：

| 曲名 | 作曲 |
|---|---|
| 白の民話 | 秦暁 |
| 雨情 | のる |
| Rising sun 開明 | 田中芳典 |

<https://opentracks.com/>

`public/sound/` 里是这三首调过响度、转成 MP3、再套上密钥流（`src/key.ts`）的数据，只供这个页面播放时用。曲子的权利属于各位作曲者，不要把它们取出来当素材用，也不要单独再发布。
