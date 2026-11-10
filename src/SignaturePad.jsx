import { useRef } from 'react'

// Canvas is 400x150 (same ratio as the 160x60pt stamp in App), transparent background.
export default function SignaturePad({ onDone, onCancel }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

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
    <div className="modal">
      <div className="pad">
        <canvas ref={ref} width={400} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} />
        <div>
          <button onClick={clear}>ล้าง</button>
          <button onClick={onCancel}>ยกเลิก</button>
          <button onClick={() => dirty.current && onDone(ref.current.toDataURL('image/png'))}>ใช้ลายเซ็นนี้</button>
        </div>
      </div>
    </div>
  )
}
