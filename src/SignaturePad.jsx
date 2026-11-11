import { useEffect, useRef, useState } from 'react'

const KEY = 'pdfedit.signatures' // localStorage persists in Electron's userData, across PDFs and restarts

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

// Stamp is 160pt wide; height follows the image's aspect ratio.
const toStamp = (src, iw, ih) => ({ src, w: 160, h: (160 * ih) / iw })

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่ได้'))
    img.src = URL.createObjectURL(file)
  })
}

// Uploaded scans/photos: shrink to <=800px wide (keeps storage small) and make paper transparent:
// pixels whose R, G and B are all above `threshold` are treated as paper.
function cutPaper(img, threshold, c = document.createElement('canvas')) {
  const k = Math.min(1, 800 / img.width)
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const p = d.data
  for (let i = 0; i < p.length; i += 4) if (p[i] > threshold && p[i + 1] > threshold && p[i + 2] > threshold) p[i + 3] = 0
  ctx.putImageData(d, 0, 0)
  return c
}

// Drawing canvas is 400x150, transparent background.
export default function SignaturePad({ onDone, onCancel }) {
  const ref = useRef(null)
  const preview = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [saved, setSaved] = useState(loadSaved)
  const [keep, setKeep] = useState(true)
  const [upload, setUpload] = useState(null) // { img, threshold } while adjusting an uploaded image

  useEffect(() => {
    if (upload) cutPaper(upload.img, upload.threshold, preview.current)
  }, [upload])

  function persist(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
      setSaved(list)
    } catch {
      alert('พื้นที่เก็บลายเซ็นเต็ม กรุณาลบลายเซ็นเก่าก่อน')
    }
  }

  function use(stamp) {
    if (keep) persist([...saved, { ...stamp, id: crypto.randomUUID() }])
    onDone(stamp)
  }

  async function pick(e) {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    try {
      setUpload({ img: await loadImage(f), threshold: 200 })
    } catch (err) {
      alert(err.message)
    }
  }

  function useUpload() {
    const c = cutPaper(upload.img, upload.threshold)
    URL.revokeObjectURL(upload.img.src)
    use(toStamp(c.toDataURL('image/png'), c.width, c.height))
  }

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    return [((e.clientX - r.left) * ref.current.width) / r.width, ((e.clientY - r.top) * ref.current.height) / r.height]
  }
  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = ref.current.getContext('2d')
    ctx.lineWidth = 3
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0a2a8a'
    ctx.beginPath()
    ctx.moveTo(...pos(e))
    drawing.current = true
  }
  function move(e) {
    if (!drawing.current) return
    const ctx = ref.current.getContext('2d')
    ctx.lineTo(...pos(e))
    ctx.stroke()
    dirty.current = true
  }
  function clear() {
    ref.current.getContext('2d').clearRect(0, 0, 400, 150)
    dirty.current = false
  }

  const keepBox = (
    <label className="keep">
      <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> บันทึกลายเซ็นไว้ใช้ครั้งหน้า
    </label>
  )

  if (upload)
    return (
      <div className="modal" onKeyDown={(e) => e.key === 'Escape' && setUpload(null)}>
        <div className="pad">
          <h3>ปรับรูปลายเซ็น</h3>
          <canvas ref={preview} className="checker" style={{ maxWidth: 400, maxHeight: 220, cursor: 'default' }} />
          <label className="field">
            ความไวในการตัดพื้นหลัง: {255 - upload.threshold}
            <input
              type="range"
              min="0"
              max="120"
              value={255 - upload.threshold}
              onChange={(e) => setUpload({ ...upload, threshold: 255 - +e.target.value })}
            />
          </label>
          <p className="note">เลื่อนไปทางขวา ถ้ายังเห็นกรอบหรือเงาของกระดาษ · ลายเซ็นจางหายให้เลื่อนกลับ</p>
          {keepBox}
          <div className="row end">
            <button onClick={() => setUpload(null)}>ย้อนกลับ</button>
            <button className="primary" onClick={useUpload}>ใช้รูปนี้</button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="modal" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="pad">
        {saved.length > 0 && (
          <>
            <h3>ลายเซ็นที่บันทึกไว้ (คลิกเพื่อใช้)</h3>
            <div className="saved">
              {saved.map((s) => (
                <div key={s.id} className="sig">
                  <img src={s.src} alt="ลายเซ็นที่บันทึกไว้" onClick={() => onDone(s)} />
                  <button title="ลบลายเซ็นนี้" onClick={() => confirm('ลบลายเซ็นนี้?') && persist(saved.filter((o) => o.id !== s.id))}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
        <h3>เซ็นใหม่</h3>
        <canvas ref={ref} width={400} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} />
        {keepBox}
        <div className="row end">
          <label className="btn upload">
            อัปโหลดรูปลายเซ็น
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
          </label>
          <button onClick={clear}>ล้าง</button>
          <button onClick={onCancel}>ยกเลิก</button>
          <button className="primary" onClick={() => dirty.current && use(toStamp(ref.current.toDataURL('image/png'), 400, 150))}>ใช้ลายเซ็นนี้</button>
        </div>
      </div>
    </div>
  )
}
