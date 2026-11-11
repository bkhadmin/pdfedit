import { useState } from 'react'

// Collects a .p12/.pfx certificate + password; onSign does the signing and throws on failure.
export default function CertModal({ onSign, onCancel }) {
  const [cert, setCert] = useState(null)
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!cert) return setError('กรุณาเลือกไฟล์ใบรับรอง')
    setBusy(true)
    setError('')
    try {
      await onSign({ p12: new Uint8Array(await cert.arrayBuffer()), password, reason })
    } catch (err) {
      setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) // strip Electron IPC prefix
      setBusy(false)
    }
  }

  return (
    <div className="modal" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form className="pad edit-modal" onSubmit={submit}>
        <h3>บันทึกพร้อมลายเซ็นดิจิทัล</h3>
        <p className="note">
          เซ็นเอกสารด้วยใบรับรองอิเล็กทรอนิกส์ (.p12 / .pfx) ลายเซ็น/ข้อความที่วางไว้จะถูกรวมเข้าไฟล์ก่อนเซ็น
          ถ้าแก้ไฟล์ทีหลัง ลายเซ็นดิจิทัลจะไม่ถูกต้อง
        </p>
        <label className="field">
          ไฟล์ใบรับรอง
          <input type="file" accept=".p12,.pfx" onChange={(e) => setCert(e.target.files[0] || null)} />
        </label>
        <label className="field">
          รหัสผ่านใบรับรอง
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          เหตุผล (ไม่บังคับ)
          <input value={reason} placeholder="เช่น อนุมัติ" onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="row end">
          <button type="button" onClick={onCancel}>ยกเลิก</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'กำลังเซ็น…' : 'เซ็นและบันทึก'}</button>
        </div>
      </form>
    </div>
  )
}
