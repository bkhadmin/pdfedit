// Publishes a GitHub release with this project's own token from .release-token (gitignored),
// so a machine-wide GH_TOKEN belonging to another project is never used by accident.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const file = path.join(__dirname, '..', '.release-token')
let token = ''
try {
  token = fs.readFileSync(file, 'utf8').trim()
} catch {}
if (!token) {
  console.error(`ไม่พบ token ของ pdfedit — ใส่ GitHub token (สิทธิ์ Contents: Read and write บน bkhadmin/pdfedit) ไว้ในไฟล์:\n  ${file}`)
  process.exit(1)
}
execSync('vite build && electron-builder --win --publish always', { stdio: 'inherit', env: { ...process.env, GH_TOKEN: token } })
