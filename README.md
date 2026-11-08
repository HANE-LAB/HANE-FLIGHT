# HANE Flight · 云中千本鸟居

火羽ひのめ的直播可视化（非官方）。她播过的每一夜是云中的一座鸟居，门柱上写着那一夜弹幕里的话。

[在线浏览](https://hane-lab.github.io/HANE-FLIGHT/) · [离线版](https://github.com/HANE-LAB/HANE-FLIGHT/releases/download/offline/HANE-Flight-offline.zip) · [Windows 桌面版](https://github.com/HANE-LAB/HANE-FLIGHT/releases/download/offline/HANE-Flight-setup.exe) · [源码](https://github.com/HANE-LAB/HANE-FLIGHT)

## 功能

- 从 2021 年飞到今天，一夜一座鸟居；大事的夜门更高、插火羽
- 门柱上是那一夜弹幕里真有人说过的话，不带昵称
- 舰长化作小鸟跟在她身边，天气随那些夜里弹幕的情绪变化
- 「寻声」按情绪找夜；暂停时可以近看门柱
- 电影模式
- 数据每天日本时间 04:30 自动更新

画面里每样东西代表什么、按钮怎么用，见 [画面与操作](docs/GUIDE.md)。

## 运行

浏览：打开在线网站；或者解压离线版，用 Chrome 或 Edge 打开 `index.html`。

开发（Node.js 24）：

```powershell
npm install
npm run dev      # http://127.0.0.1:8780/
npm run build    # dist/
```

## 文档

| 文档 | 内容 |
|---|---|
| [画面与操作](docs/GUIDE.md) | 画面元素和数据的对应，按钮和快捷键 |
| [数据](docs/DATA.md) | 两份数据的格式、来源、每日更新、合成规则 |
| [开发指南](docs/DEVELOPMENT.md) | 环境、代码结构、时间模型、调试 |
| [部署](docs/DEPLOY.md) | 网站、离线版和桌面版的发布 |

## 数据与隐私

- 来源：Danmakus 的公开接口（直播记录和弹幕）、HANE Voyage 公开仓库（每天的大航海人数），都不需要登录。
- 门柱上的字不带昵称和 UID；风波那几周的负面话是放大写的。
- 小鸟只按人数和陪伴天数分档，不对应具体的人。

配乐：OpenTracks 的三首（秦暁《白の民話》、のる《雨情》、田中芳典《Rising sun 開明》）。字体：霞鹜文楷。许可见[第三方声明](THIRD_PARTY_NOTICES.md)。
