# 部署

[文档目录](README.md) · [开发指南](DEVELOPMENT.md)

和 HANE Voyage 一样发三样东西：网站（GitHub Pages）、网页离线版、Windows 桌面版（Tauri 打的 exe）。三样都来自同一个 `dist/`：单文件的 `index.html`，加上旁边放配乐的 `sound/`。

## 仓库

代码在 GitHub 的公开仓库 [HANE-LAB/HANE-FLIGHT](https://github.com/HANE-LAB/HANE-FLIGHT)，默认分支 `main`。`.gitattributes` 把所有文本文件统一成 LF：Git for Windows 默认 `core.autocrlf=true`，没有它检出时会改成 CRLF。

网站：<https://hane-lab.github.io/HANE-FLIGHT/>。Pages 的来源是 GitHub Actions。工作流会先看 Pages 有没有开：开着就发布网站；在 Settings → Pages 里关掉以后，只构建并发布 Release，不再发网站。网站路径由仓库名决定；页面里没有写死的绝对路径，换仓库名或 fork 以后不用改代码。

## 工作流与触发条件

两个工作流：建站 [deploy.yml](../.github/workflows/deploy.yml) 和每日数据更新 [update-data.yml](../.github/workflows/update-data.yml)（见下面「数据」）。

推送 `main` 且改动涉及 `index.html`、`src/`、`public/`、`data/flight.json`、`data/writing.json`、`src-tauri/`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json` 或工作流时自动发布，也可以手动运行。纯 README 或 `docs/` 修改不会重建网站。手动运行时勾选 `site_only` 只重建网站，跳过 `desktop` 和 `release`。

| Job | 运行环境 | 内容 |
|---|---|---|
| `build` | Ubuntu | 用 Node.js 24 运行 `npm ci` 和 `npm run build`（先做类型检查），把 `dist/index.html` 打成离线包；Pages 已开启时把 `dist/` 上传为 Pages artifact |
| `deploy` | Ubuntu | 在 `build` 成功、且 Pages 已开启时发布网站 |
| `desktop` | Windows | 用 Tauri 构建桌面版：免安装的 exe 和 NSIS 安装包。Rust 用 GitHub 机器上预装的版本，依赖和编译结果按 `src-tauri/Cargo.lock` 缓存 |
| `release` | Ubuntu | 在 `build` 和 `desktop` 都成功后，把三个文件上传到 Release「offline」，替换旧文件，并更新下载说明 |

类型检查或构建失败时，对应的发布会停止，网站和下载文件保持上一版。工作流默认权限是 `contents: read`、`pages: write`、`id-token: write`；只有 `release` 用 `contents: write` 更新 Release。不需要配置 Secrets。

Windows 上第一次构建要编译全部 Rust 依赖，约需 10 到 20 分钟；有缓存后会快很多。`src-tauri/Cargo.lock` 沿用 Voyage 已经发布过的那套依赖版本。

## 数据

和 Voyage 一样每天自动更新：`update-data.yml` 在日本时间 04:30 从公开来源取数据、合成 `data/flight.json`，有变化就提交到 `main`，再把网站、离线版和桌面版一起重建，详情见[数据](DATA.md#每日自动更新)。工作流只在 `HANE-LAB/HANE-FLIGHT` 上运行，fork 不会每天去取数据。

用 `GITHUB_TOKEN` 推送不会触发别的工作流，所以数据提交本身不会启动 `deploy.yml`，由 `update-data.yml` 用 `gh workflow run` 显式触发。

## 发布内容

网站上线 `dist/index.html` 和 `dist/sound/`。脚本、样式、着色器、three.js 和字体都打包在 `index.html` 里，不依赖外部资源。配乐是 `public/sound/` 里的脚本：OpenTracks 的三首曲子套上密钥流（`src/key.ts`），每首切成几段，页面在内存里解开播放，第一段到了就开始放。OpenTracks 不许让人用普通操作拿到音频文件，所以哪里都不放音频文件。Vite 把它们原样复制到 `dist/sound/`，页面碰过以后才去取；离线包把它和 `index.html` 一起打进去（`deploy.yml` 里「打包离线版」那一行），桌面版也带着。文档和 Python 脚本不进入网站。

Release「offline」里的文件名固定，下载地址是 `https://github.com/HANE-LAB/HANE-FLIGHT/releases/download/offline/<文件名>`：

| 文件 | 内容 |
|---|---|
| `HANE-Flight-setup.exe` | Windows 安装版。装在当前用户下，不需要管理员权限，开始菜单里有快捷方式；缺少 WebView2 时会先下载安装 |
| `HANE-Flight.exe` | Windows 免安装版，双击运行。需要 Microsoft Edge WebView2，Windows 11 已自带 |
| `HANE-Flight-offline.zip` | 网页离线版，里面是 `index.html` 和配乐 `sound/`，解压后用 Chrome 或 Edge 打开 `index.html` |

两个 exe 都没有代码签名，Windows 可能提示「Windows 已保护你的电脑」，需要点「更多信息」再点「仍要运行」。

## 桌面版的文件

| 文件 | 内容 |
|---|---|
| `src-tauri/tauri.conf.json` | 窗口标题「HANE Flight」、1280×800；开发时连 `http://127.0.0.1:8780`，构建时装 `../dist`；只打 NSIS 安装包，界面简体中文 |
| `src-tauri/Cargo.toml` | 包名 `hane-flight`（exe 就叫这个名字）；release 按体积优化 |
| `src-tauri/src/main.rs` | 只开一个窗口显示页面，release 不带控制台窗口 |
| `src-tauri/app-icon.svg` | 图标原稿，和 `index.html` 的 favicon 同一张 |
| `src-tauri/icons/` | 由图标原稿生成的 PNG、ICO、ICNS |

改了图标原稿后重新生成图标：`npm run tauri icon src-tauri/app-icon.svg`，它会多生成一些移动端和商店用的文件，只保留 `tauri.conf.json` 里列出的那几个。
