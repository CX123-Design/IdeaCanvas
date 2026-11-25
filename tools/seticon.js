// 为打包后的 exe 设置图标与版本信息（纯 JS，无需下载 rcedit）
const fs = require('fs')
const ResEdit = require('resedit')

const exePath = process.argv[2]
const icoPath = process.argv[3]
const version = process.argv[4] || ''
if (!exePath || !icoPath) { console.error('usage: node tools/seticon.js exe ico [version]'); process.exit(1) }

const exeData = fs.readFileSync(exePath)
const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true })
const res = ResEdit.NtExecutableResource.from(exe)
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath))

const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
console.log('icon groups:', groups.map(g => g.id + '/' + g.lang).join(','))
for (const g of groups) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map(i => i.data))
}
if (!groups.length) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map(i => i.data))
}

const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
for (const vi of vis) {
  try {
    const strVals = {
      ProductName: 'IdeaCanvas',
      FileDescription: 'IdeaCanvas 文件思路工作台',
      CompanyName: 'IdeaCanvas',
      OriginalFilename: 'IdeaCanvas.exe',
      InternalName: 'IdeaCanvas',
      LegalCopyright: 'IdeaCanvas'
    }
    if (version) {
      strVals.ProductVersion = version
      strVals.FileVersion = version
    }
    for (const l of vi.getAllLanguagesForStringValues()) {
      vi.setStringValues({ lang: l.lang, codepage: l.codepage }, strVals)
    }
    if (version) {
      const [a, b, c, d] = version.split('.').map(x => Number(x) || 0)
      try { vi.setFileVersion(a || 0, b || 0, c || 0, d || 0, 1033, 1200) } catch (_) {}
      try { vi.setProductVersion(a || 0, b || 0, c || 0, d || 0, 1033, 1200) } catch (_) {}
    }
    vi.outputToResourceEntries(res.entries)
  } catch (err) { console.log('version info skipped:', err.message) }
}

res.outputResource(exe)
fs.writeFileSync(exePath, Buffer.from(exe.generate()))
console.log('done', exePath, fs.statSync(exePath).size)

