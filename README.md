# IdeaCanvas 2.5.3

纯本地、离线的文件思路画布。把文件拖进来当卡片，用连线记录文件之间的流转、参考、对照、校核与反馈，再用便签写下创作思路。

## 下载即用

前往 [Releases](https://github.com/CX123-Design/IdeaCanvas/releases/latest) 下载：

```text
IdeaCanvas-2.5.3-便携版.zip
```

解压后双击 `IdeaCanvas.exe` 即可运行，不需要安装。整个 `IdeaCanvas-win32-x64` 文件夹一起使用，`data` 会自动生成在程序旁边。

## 2.5.3 更新

- 导入只记录原文件绝对路径，不复制到程序目录或 C 盘。
- 导入提示明确显示「已引用 N 个原文件（未复制）」。
- 图片直接读取原图，不再生成磁盘缩略图副本。
- 设置、便签、剪贴板、恢复文件和拖出临时文件全部在程序旁的 `data` 目录。
- 启动时自动清理旧版留在 C 盘的 `AppData\Roaming\IdeaCanvas` 和 `Temp\IdeaCanvas-drag`。

## 功能

- 无限画布：滚轮缩放、空格拖动、框选、迷你导航
- 文件卡片：拖入文件或整个文件夹，自动识别类型、大小、摘要与图片
- 五种关系连线：流转、参考、对照、校核、反馈，可悬停双击删除
- 工作模式：把卡片长按拖到微信、QQ、桌面或资源管理器
- 画布工程：保存为 `.cvproj`，只记录卡片位置、连线和便签，不复制文件本身
- 多标签：同时打开多个画布
- 不调用模型、不读取网络，所有数据留在本机

## 源码运行

需要 Node.js 18+ 与 Windows。

```powershell
npm install
npm start
```

## 打包 Windows 便携版

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File build.ps1
```

产物在 `dist\IdeaCanvas-win32-x64\IdeaCanvas.exe`。

## 目录

- `main.js`：Electron 主进程、窗口、文件读取、拖拽与注册表
- `preload.js`：渲染进程安全桥
- `renderer/`：界面、画布、交互与样式
- `app/`：文件描述、摘要与文本抽取
- `assets/`：应用图标与 `.cvproj` 文件图标
- `tools/`：图标与 exe 版本信息脚本
- `使用说明.md`：完整使用文档
- `CHANGELOG.md`：版本记录

## 版本管理

根目录只保留当前 2.5.3 一套源码，不再把 2.5.1、2.5.2 的文件混在一起。旧版本保留在 Git 提交历史中，版本差异统一记录在 [CHANGELOG.md](CHANGELOG.md)；成品安装包统一放在 [Releases](https://github.com/CX123-Design/IdeaCanvas/releases)。

## 许可

MIT
