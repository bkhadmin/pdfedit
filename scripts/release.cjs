// Publishes a GitHub release with this project's own token from .release-token (gitignored),
// so a machine-wide GH_TOKEN belonging to another project is never used by accident.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const pkg = require('../package.json')

const file = path.join(__dirname, '..', '.release-token')
let token = ''
try {
  token = fs.readFileSync(file, 'utf8').trim()
} catch {}
if (!token) {
  console.error(`ไม่พบ token ของ pdfedit — ใส่ GitHub token (สิทธิ์ Contents: Read and write บน bkhadmin/pdfedit) ไว้ในไฟล์:\n  ${file}`)
  process.exit(1)
}

;(async () => {
  // electron-builder uploads files in parallel and each upload creates its own draft when none exists
  // (we got two drafts for 25691111.1.0), so create the draft once up front.
  const { owner, repo } = pkg.build.publish
  const api = `https://api.github.com/repos/${owner}/${repo}/releases`
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const tag = 'v' + pkg.version
  const list = await (await fetch(api, { headers })).json()
  if (!Array.isArray(list)) throw new Error('อ่านรายการ release ไม่ได้: ' + list.message)
  if (!list.some((r) => r.tag_name === tag)) {
    const res = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ tag_name: tag, name: pkg.version, draft: true }) })
    if (!res.ok) throw new Error(`สร้าง draft release ไม่สำเร็จ (${res.status}): ${(await res.json()).message}`)
  }
  execSync('vite build && electron-builder --win --publish always', { stdio: 'inherit', env: { ...process.env, GH_TOKEN: token } })
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
