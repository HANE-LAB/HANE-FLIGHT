# HANE Flight · 云中千本鸟居

火羽ひのめ的非官方直播可视化。她是一只長鳴鳥，从 2021 年飞到今天：云里一座座鸟居是她播过的夜，柱上写着那些夜里弹幕真有人说过的话；每位舰长化作一只小鸟跟在她身边。天气是那些年弹幕的情绪：春暖、雷暴、长长的寒冬，到 2026 年 10 月几千只鸟一夜飞上来，太阳升起。

[在线浏览](https://hane-lab.github.io/HANE-FLIGHT/) · [公开源码](https://github.com/HANE-LAB/HANE-FLIGHT) · [离线版下载](https://github.com/HANE-LAB/HANE-FLIGHT/releases/download/offline/HANE-Flight-offline.zip) · [Windows 桌面版](https://github.com/HANE-LAB/HANE-FLIGHT/releases/download/offline/HANE-Flight-setup.exe)

数据每天日本时间 04:30 由 GitHub Actions 自动更新：Danmakus 的开播记录，加上 HANE Voyage 的大航海人数，不需要登录。来源和格式见[数据](docs/DATA.md)。

## 使用方式

- **直接浏览**：打开在线网站。打开时停在今天，「从头飞起」从 2021 年飞到今天。
- **离线浏览**：下载 `HANE-Flight-offline.zip`，解压后用 Chrome 或 Edge 打开 `index.html`。
- **桌面版**：`HANE-Flight-setup.exe` 是 Windows 安装版，`HANE-Flight.exe` 免安装，都在 Releases 的「offline」里。
- **本地开发**：运行 `npm install` 和 `npm run dev`，打开 `http://127.0.0.1:8780/`。`npm run build` 生成 `dist/`。
- **操作**：铜镜或空格暂停，停下来可以近看门柱、借一道闪电；「寻声」按四魂找夜；拖动绕着她转，滚轮或双指拉近；方向键逐日，按住 Shift 一次 30 天；「电影模式」去掉界面从头放映，最后飞向太阳。碰一下页面后才有声音，可以关。

## 文档导航

| 想做什么 | 文档 |
|---|---|
| 准备环境、找代码、调试 | [开发指南](docs/DEVELOPMENT.md) |
| 数据来源、格式和每日更新 | [数据](docs/DATA.md) |
| 发布网站、离线版和桌面版 | [部署](docs/DEPLOY.md) |

## 数据说明

门柱上的字取自弹幕，不带昵称和 UID；风波那几周的负面话是放大写的。小鸟只按人数和陪伴天数分档，不对应具体的人。配乐是 OpenTracks 的三首（秦暁《白の民話》、のる《雨情》、田中芳典《Rising sun 開明》），字体是霞鹜文楷的子集，许可见[第三方声明](THIRD_PARTY_NOTICES.md)。
