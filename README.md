# IdeaCanvas

纯本地、离线的文件思路画布。把文件拖进来当卡片，用连线记录文件之间的流转、参考、对照、校核与反馈，再用便签写下创作思路。

- 无限画布：滚轮缩放、空格拖动、框选、迷你导航
- 文件卡片：拖入文件或整个文件夹，自动识别类型、大小、摘要与缩略图
- 五种关系连线：流转、参考、对照、校核、反馈，可悬停双击删除
- 工作模式：把卡片长按拖到微信、QQ、桌面或资源管理器
- 画布工程：保存为 `.cvproj`，只记录卡片位置、连线和便签，不复制文件本身
- 多标签：同时打开多个画布
- 不调用模型、不读取网络，所有数据留在本机

> 当前版本：2.5.2

## 本地运行

需要 Node.js 18+ 与 Windows。

```powershell
npm install
npm start
```

## 打包 Windows 便携版

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File build.ps1
```

产物在 `dist\IdeaCanvas-win32-x64\IdeaCanvas.exe`，整个 `IdeaCanvas-win32-x64` 文件夹可拷走使用。

## 目录

- `main.js`：Electron 主进程、窗口、文件读取、拖拽与注册表
- `preload.js`：渲染进程安全桥
- `renderer/`：界面、画布、交互与样式
- `app/`：文件描述、摘要、缩略图
- `assets/`：应用图标与 `.cvproj` 文件图标
- `tools/`：图标与 exe 版本信息脚本
- `使用说明.md`：完整使用文档

## 许可

MIT
