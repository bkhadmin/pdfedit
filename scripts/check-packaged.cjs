// Smoke test of the PACKAGED app (release/win-unpacked): every runtime module must load from app.asar.
// Catches deps missing from the installer (e.g. peer deps like node-forge) that dev runs never see.
const path = require('path')
const { execFileSync } = require('child_process')
const pkg = require('../package.json')

const exe = path.join(__dirname, '..', 'release', 'win-unpacked', `${pkg.build.productName}.exe`)
const asar = path.join(path.dirname(exe), 'resources', 'app.asar')
const mods = ['electron/sign.cjs', ...Object.keys(pkg.dependencies).map((d) => 'node_modules/' + d)]
const files = ['electron/scan.ps1', 'dist/index.html'] // non-module files the app reads at runtime
const code = `const p = require('path'); for (const m of ${JSON.stringify(mods)}) require(p.join(${JSON.stringify(asar)}, m)); for (const f of ${JSON.stringify(files)}) require('fs').readFileSync(p.join(${JSON.stringify(asar)}, f)); console.log('ok')`
try {
  // ELECTRON_RUN_AS_NODE makes the packaged exe a plain Node that can read app.asar
  const out = execFileSync(exe, ['-e', code], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  if (!out.includes('ok')) throw new Error(out)
  console.log(`packaged app OK: ${mods.length} modules + ${files.length} files load from app.asar`)
} catch (err) {
  console.error('packaged app is BROKEN:\n' + (err.stderr || err.message))
  process.exit(1)
}
