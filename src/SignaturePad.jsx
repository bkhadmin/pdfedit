import { useRef, useState } from 'react'

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

// Uploaded scans/photos: shrink to <=800px wide (keeps storage small) and make near-white paper transparent.
// shortcut: fixed white threshold, add a slider if photos with gray/shadowed paper leave a box.
function imageToStamp(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const k = Math.min(1, 800 / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, c.width, c.height)
      const d = ctx.getImageData(0, 0, c.width, c.height)
      const p = d.data
      for (let i = 0; i < p.length; i += 4) if (p[i] > 200 && p[i + 1] > 200 && p[i + 2] > 200) p[i + 3] = 0
      ctx.putImageData(d, 0, 0)
      resolve(toStamp(c.toDataURL('image/png'), c.width, c.height))
    }
    img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่ได้'))
    img.src = URL.createObjectURL(file)
  })
}

// Drawing canvas is 400x150, transparent background.
export default function SignaturePad({ onDone, onCancel }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [saved, setSaved] = useState(loadSaved)
  const [keep, setKeep] = useState(true)

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

  async function upload(e) {
    const f = e.target.files[0]
    if (!f) return
    try {
      use(await imageToStamp(f))
    } catch (err) {
      alert(err.message)
    }
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

  return (
    <div className="modal" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="pad">
        {saved.length > 0 && (
          <>
            <b>ลายเซ็นที่บันทึกไว้ (คลิกเพื่อใช้)</b>
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
        <b>เซ็นใหม่</b>
        <canvas ref={ref} width={400} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} />
        <label className="keep">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> บันทึกลายเซ็นไว้ใช้ครั้งหน้า
        </label>
        <div>
          <label className="btn upload">
            อัปโหลดรูปลายเซ็น
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
          </label>
          <button onClick={clear}>ล้าง</button>
          <button onClick={onCancel}>ยกเลิก</button>
          <button onClick={() => dirty.current && use(toStamp(ref.current.toDataURL('image/png'), 400, 150))}>ใช้ลายเซ็นนี้</button>
        </div>
      </div>
    </div>
  )
}
