# 开发指南

[文档目录](README.md)

## 环境

浏览构建好的页面只需要 Chrome 或 Edge。开发需要 Node.js 24 和 npm，在项目根目录运行：

```powershell
npm install        # 第一次，或 package-lock.json 变化后
npm run dev        # 开发服务器 http://127.0.0.1:8780/
npm run check      # TypeScript 类型检查
npm run build      # 类型检查后构建 dist/
npm run preview    # 在 http://127.0.0.1:8781/ 预览构建结果
```

`dist/index.html` 是一个独立文件：脚本、样式、着色器、three.js 和字体都在里面。配乐在旁边的 `dist/sound/`，观众碰过页面才下载。

Windows PowerShell 默认不让运行 `npm.ps1`，改用 `npm.cmd`，或执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。

桌面版用 [Tauri 2](https://v2.tauri.app/) 把同一个 `dist/` 装进 WebView2 窗口。本机构建需要 Rust（用 rustup 安装）和 Visual Studio 的 C++ 生成工具：

```powershell
npm run tauri dev      # 开发服务器加桌面窗口
npm run tauri build    # 免安装 exe 在 src-tauri/target/release/，安装包在 src-tauri/target/release/bundle/nsis/
```

数据用 [uv](https://docs.astral.sh/uv/) 运行：`uv run python -X utf8 -m flight update`，见[数据](DATA.md)。改了数据要重新 `npm run build`。

## 代码结构

`src/main.ts` 的导入顺序就是场景的创建顺序，three.js 用它决定并列物体的先后。

| 文件 | 管什么 |
|---|---|
| `main.ts` | 每帧的顺序、播放与输入、「今天」那一层的按钮 |
| `sequencer.ts` | 她飞到哪（`seq.u`，单位是天）、配速和放慢、跳转 |
| `data.ts`、`voices.ts` | 读 `data/flight.json` 和 `data/writing.json` |
| `climate.ts`、`season.ts` | 气候时间线、当夜的天气、月相、闪电的时刻 |
| `path.ts` | 航线 |
| `gates.ts`、`toriimodel.ts`、`plaque.ts`、`writing.ts`、`spill.ts` | 鸟居和它凝成时的云、神額上的日期、门柱上的字 |
| `bird.ts`、`age.ts`、`models.ts`、`plume.ts`、`trail.ts`、`kawaii/` | 她：飞法、长大和换羽、模型和火羽、掉的羽毛、羽毛的物理（KawaiiPhysics 的移植） |
| `flock.ts` | 舰长化成的小鸟 |
| `clouds.ts`、`weather.ts`、`lightning.ts`、`wind.ts` | 云和雾、雪雨花瓣、闪电、风 |
| `sky.ts`、`optics.ts` | 天空和月、太阳在镜头里 |
| `camera.ts` | 三个视角和近看门柱 |
| `renderer.ts`、`uniforms.ts`、`post.ts`、`bloom.ts` | 渲染器、共享的 uniform、后期 |
| `ui.ts`、`down.ts`、`fonts.ts`、`style.css` | 界面、竖写的字、内嵌的字体 |
| `sound.ts`、`key.ts` | 配乐和风雨雷的声音 |
| `shaders/` | GLSL，`chunks/` 是共用的片段 |

## 时间模型

画面只由她飞到哪里（`seq.u`）决定，所以暂停、跳转、任何帧率和速度下，同一位置的画面都一样。不跟着位置走的只有不影响构图的东西：云和空中东西的漂移、翅膀和羽毛的动作、掉的羽毛、灯笼的摆动、闪电和月光的强弱。

## 调试

地址参数：`d=天` 或 `from=YYYY-MM-DD` 从哪天开始，`film` 电影模式，`pause` 暂停，`speed=` 速度，`view=0|1|2` 视角（跟随、仰望、远望），`noui` 不要界面，`writing=0` 关掉门柱上的字。

控制台：`flight.seek('2022-10-12')`、`flight.play(false)`、`flight.speed(2)`、`flight.view(2)`、`flight.state()`；`__dbg` 上有场景、相机、`seq`、天气 `W` 和正在放的配乐 `sound`。

提交前 `npm run build` 要通过。
