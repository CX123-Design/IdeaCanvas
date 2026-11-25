$ErrorActionPreference = 'Stop'
$root = 'D:\我的文件\豆包文件\程序开发\IdeaCanvas'
$out  = Join-Path $root 'dist\IdeaCanvas-win32-x64'
$stage = Join-Path $root 'build\app'
$ver = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
Write-Output ("版本 " + $ver)

Write-Output '1/6 清理旧产物'
Remove-Item (Join-Path $root 'dist') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root 'build') -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $root 'dist') | Out-Null

Write-Output '2/6 复制 Electron 运行时'
Copy-Item (Join-Path $root 'node_modules\electron\dist') $out -Recurse
Rename-Item (Join-Path $out 'electron.exe') 'IdeaCanvas.exe'
Remove-Item (Join-Path $out 'resources\default_app.asar') -ErrorAction SilentlyContinue

# 精简运行时：只保留中英文语言包，删掉 Chromium 许可长文档
$loc = Join-Path $out 'locales'
if (Test-Path $loc) {
  Get-ChildItem $loc -Filter *.pak | Where-Object { $_.BaseName -notin @('zh-CN', 'zh-TW', 'en-US', 'en-GB') } | Remove-Item -Force
}
Remove-Item (Join-Path $out 'LICENSES.chromium.html') -ErrorAction SilentlyContinue

Write-Output '3/6 组装应用文件'
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $root 'main.js') $stage
Copy-Item (Join-Path $root 'preload.js') $stage
Copy-Item (Join-Path $root 'assets') (Join-Path $stage 'assets') -Recurse
Copy-Item (Join-Path $root 'app') (Join-Path $stage 'app') -Recurse
Copy-Item (Join-Path $root 'renderer') (Join-Path $stage 'renderer') -Recurse
New-Item -ItemType Directory -Force (Join-Path $stage 'node_modules') | Out-Null
Copy-Item (Join-Path $root 'node_modules\adm-zip') (Join-Path $stage 'node_modules\adm-zip') -Recurse
Copy-Item (Join-Path $root 'node_modules\pdfjs-dist') (Join-Path $stage 'node_modules\pdfjs-dist') -Recurse
# pdfjs 只用到 legacy 构建与 cmaps/字体，删掉多余的 web/类型/非 legacy 构建
$pdf = Join-Path $stage 'node_modules\pdfjs-dist'
Remove-Item (Join-Path $pdf 'web') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $pdf 'types') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $pdf 'build') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $pdf 'lib') -Recurse -Force -ErrorAction SilentlyContinue

$pkg = @"
{
  "name": "ideacanvas",
  "productName": "IdeaCanvas",
  "version": "$ver",
  "description": "本地文件思路画布 - 记录文件之间的创作关系",
  "main": "main.js",
  "author": "IdeaCanvas"
}
"@
Set-Content -Path (Join-Path $stage 'package.json') -Value $pkg -Encoding utf8

Write-Output '4/6 生成 app.asar'
& node (Join-Path $root 'node_modules\@electron\asar\bin\asar.js') pack $stage (Join-Path $out 'resources\app.asar')

Copy-Item (Join-Path $root '使用说明.md') $out

Write-Output '5/6 写入 exe 图标与版本信息'
& node (Join-Path $root 'tools\seticon.js') (Join-Path $out 'IdeaCanvas.exe') (Join-Path $root 'assets\icon.ico') $ver
# 让 Windows 资源管理器能给 .cvproj 显示专用图标
New-Item -ItemType Directory -Force (Join-Path $out 'assets') | Out-Null
Copy-Item (Join-Path $root 'assets\cvproj.ico') (Join-Path $out 'assets\cvproj.ico') -Force

Write-Output '6/6 完成'
Get-Item (Join-Path $out 'IdeaCanvas.exe') | Select-Object Name,Length
