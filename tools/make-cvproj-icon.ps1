$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'D:\我的文件\豆包文件\程序开发\IdeaCanvas'
$outIco = Join-Path $root 'assets\cvproj.ico'
$outPng = Join-Path $root 'assets\cvproj.png'
$masterSize = 1024
$design = 256
$k = $masterSize / $design

function S([double]$v) { return [single]($v * $k) }

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single]($r * 2)
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc([single]($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc([single]($x + $w - $d), [single]($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, [single]($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$master = New-Object System.Drawing.Bitmap($masterSize, $masterSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$bgPath = New-RoundedPath (S 8) (S 8) (S 240) (S 240) (S 27)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#121310'))
$g.FillPath($bgBrush, $bgPath)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#C6F24A'), (S 1.8))
$g.DrawPath($borderPen, $bgPath)

# 细网格点，放大时能看出“画布”
$dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(42, 198, 242, 74))
for ($x = 26; $x -le 230; $x += 18) {
  for ($y = 26; $y -le 230; $y += 18) {
    $g.FillEllipse($dotBrush, (S ($x - 0.9)), (S ($y - 0.9)), (S 1.8), (S 1.8))
  }
}

# 连通线
$linePen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#C6F24A'), (S 2.2))
$linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLine($linePen, (S 96), (S 154), (S 128), (S 144))
$g.DrawLine($linePen, (S 128), (S 100), (S 160), (S 88))

# 三张有前后关系的卡片
function Draw-Card([single]$x, [single]$y, [single]$w, [single]$h, [string]$stroke, [string]$accent, [bool]$head) {
  $path = New-RoundedPath (S $x) (S $y) (S $w) (S $h) (S 7)
  $fill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#1E201C'))
  $g.FillPath($fill, $path)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($stroke), (S 1.6))
  $g.DrawPath($pen, $path)
  if ($head) {
    $hp = New-RoundedPath (S ($x + 7)) (S ($y + 7)) (S ($w - 14)) (S 5) (S 2.5)
    $hb = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($accent))
    $g.FillPath($hb, $hp)
    $hp.Dispose(); $hb.Dispose()
  } else {
    $bar = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($accent))
    $g.FillRectangle($bar, (S ($x + 7)), (S ($y + 10)), (S ($w - 14)), (S 4))
    $bar.Dispose()
  }
  $fill.Dispose(); $pen.Dispose(); $path.Dispose()
}

Draw-Card 34 154 68 44 '#4B4D46' '#7C8BFF' $true
Draw-Card 94 99 68 44 '#4B4D46' '#8FA0C8' $true
Draw-Card 154 44 68 44 '#C6F24A' '#C6F24A' $true

# 连接点
$nodeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#C6F24A'))
$g.FillEllipse($nodeBrush, (S 91.5), (S 151.5), (S 9), (S 9))
$g.FillEllipse($nodeBrush, (S 123.5), (S 140.5), (S 9), (S 9))
$g.FillEllipse($nodeBrush, (S 123.5), (S 96.5), (S 9), (S 9))
$g.FillEllipse($nodeBrush, (S 155.5), (S 84.5), (S 9), (S 9))

$master.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$frames = @()
foreach ($sz in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gg.DrawImage($master, 0, 0, $sz, $sz)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames += ,$ms.ToArray()
  $ms.Dispose(); $gg.Dispose(); $bmp.Dispose()
}

$fs = [System.IO.File]::Create($outIco)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz = $sizes[$i]
  $bw.Write([byte]$(if ($sz -ge 256) { 0 } else { $sz }))
  $bw.Write([byte]$(if ($sz -ge 256) { 0 } else { $sz }))
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$frames[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $frames[$i].Length
}
foreach ($f in $frames) { $bw.Write($f) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()

$g.Dispose(); $master.Dispose()
$bgPath.Dispose(); $bgBrush.Dispose(); $borderPen.Dispose(); $dotBrush.Dispose(); $linePen.Dispose(); $nodeBrush.Dispose()
Get-Item $outIco, $outPng | Select-Object Name, Length
