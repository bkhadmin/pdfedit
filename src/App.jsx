import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'
import SignaturePad from './SignaturePad'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const SCALE = 1.5 // screen px per PDF point
const FALLBACK_FONTS = ['Tahoma', 'Leelawadee UI', 'Angsana New', 'Cordia New', 'TH Sarabun New', 'Arial']

// Text becomes a PNG so any installed font works, Thai included (pdf-lib standard fonts have no Thai glyphs).
// shortcut: text isn't selectable/searchable in the output, embed the TTF via @pdf-lib/fontkit if needed.
// Baseline sits at 1.1 * size from the stamp's top.
function textToStamp(text, family, size) {
  const px = size * 3 // render at 3x for print quality
  const font = `${px}px "${family}"`
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = font
  c.width = Math.ceil(ctx.measureText(text).width + px * 0.2)
  c.height = Math.ceil(px * 1.5)
  ctx.font = font
  ctx.fillText(text, px * 0.1, px * 1.1)
  return { src: c.toDataURL('image/png'), w: c.width / 3, h: c.height / 3 }
}

export default function App() {
  const [file, setFile] = useState(null) // { name, bytes }
  const [pages, setPages] = useState([]) // [{ w, h }] in PDF points
  const [items, setItems] = useState([]) // [{ id, page, x, y, w, h, src, text?, font?, size? }] PDF points, y from top; text set = editable text
  const [stamp, setStamp] = useState(null) // stamp waiting to be placed by click
  const [text, setText] = useState('')
  const [fonts, setFonts] = useState(FALLBACK_FONTS)
  const [font, setFont] = useState('Tahoma')
  const [size, setSize] = useState(16)
  const [editing, setEditing] = useState(null) // { id, value } of the text item open in the modal
  const [padOpen, setPadOpen] = useState(false)
  const pdfRef = useRef(null)
  const canvases = useRef([])
  const thumbs = useRef([])
  const dragPage = useRef(null)
  const drag = useRef(null)
  const mainRef = useRef(null)

  // React's onWheel is passive, so stop the page scrolling here while resizing an item
  useEffect(() => {
    const stop = (e) => e.target.closest('.item') && e.preventDefault()
    const el = mainRef.current
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    window.queryLocalFonts?.()
      .then((list) => list.length && setFonts([...new Set(list.map((f) => f.family))].sort()))
      .catch(() => {}) // keep fallback list (e.g. plain browser without permission)
  }, [])

  // append = add the chosen files after the current document's pages (placed items keep their pages)
  async function openFiles(e, append) {
    // sort by name: the OS file picker returns multi-selections in no reliable order
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
    e.target.value = '' // let the same file be picked again
    if (!files.length) return
    try {
      let bytes
      if (!append && files.length === 1) bytes = new Uint8Array(await files[0].arrayBuffer())
      else {
        const doc = append ? await PDFDocument.load(file.bytes) : await PDFDocument.create()
        for (const f of files) {
          const src = await PDFDocument.load(await f.arrayBuffer())
          for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p)
        }
        bytes = await doc.save()
      }
      await loadPdf(append ? file.name : files[0].name, bytes)
      if (!append) setItems([])
    } catch (err) {
      alert('เปิดไฟล์ไม่ได้: ' + err.message)
    }
  }

  async function loadPdf(name, bytes) {
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise // pdf.js detaches its buffer
    const out = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
      out.push({ w: vp.width, h: vp.height })
    }
    pdfRef.current = pdf
    setFile({ name, bytes })
    setEditing(null)
    setPages(out)
  }

  // order = old page indices in their new order; indices left out are deleted
  async function rearrange(order) {
    try {
      const doc = await PDFDocument.load(file.bytes)
      const all = doc.getPages()
      for (let i = all.length - 1; i >= 0; i--) doc.removePage(i)
      for (const o of order) doc.addPage(all[o]) // re-adding the same page objects keeps links/annotations
      await loadPdf(file.name, await doc.save())
      setItems((its) => its.filter((it) => order.includes(it.page)).map((it) => ({ ...it, page: order.indexOf(it.page) })))
    } catch (err) {
      alert('จัดหน้าไม่สำเร็จ: ' + err.message)
    }
  }

  function movePage(from, to) {
    if (from === to || to < 0 || to >= pages.length) return
    const order = pages.map((_, i) => i)
    order.splice(to, 0, order.splice(from, 1)[0])
    rearrange(order)
  }

  function deletePage(i) {
    if (confirm(`ลบหน้า ${i + 1}? (ลายเซ็น/ข้อความบนหน้านี้จะหายด้วย)`)) rearrange(pages.map((_, j) => j).filter((j) => j !== i))
  }

  useEffect(() => {
    const pdf = pdfRef.current
    if (!pdf) return
    let stale = false
    const tasks = []
    pages.forEach(async (_, i) => {
      const page = await pdf.getPage(i + 1)
      if (stale) return
      const vp = page.getViewport({ scale: SCALE })
      const c = canvases.current[i]
      c.width = vp.width
      c.height = vp.height
      const task = page.render({ canvas: c, viewport: vp })
      tasks.push(task)
      try {
        await task.promise
      } catch {
        return // cancelled by a newer render after reorder/append
      }
      const t = thumbs.current[i]
      t.width = 100
      t.height = Math.round((c.height * 100) / c.width)
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height)
    })
    return () => {
      stale = true
      tasks.forEach((t) => t.cancel())
    }
  }, [pages])

  const add = (...its) => setItems((old) => [...old, ...its.map((it) => ({ ...it, id: crypto.randomUUID() }))])
  const update = (id, fn) => setItems((its) => its.map((it) => (it.id === id ? { ...it, ...fn(it) } : it)))

  function onPageClick(e, page) {
    if (!stamp) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / SCALE
    const py = (e.clientY - r.top) / SCALE
    add({ ...stamp, page, x: px - stamp.w / 2, y: py - stamp.h / 2 })
    setStamp(null)
  }

  const textStamp = (value) => ({ ...textToStamp(value, font, size), text: value, font, size })
  const remove = (id) => setItems((its) => its.filter((o) => o.id !== id))

  function startEdit(it) {
    setFont(it.font)
    setSize(it.size)
    setEditing({ id: it.id, value: it.text })
  }

  function commitEdit() {
    const { id, value } = editing
    if (value.trim()) update(id, () => textStamp(value)) // keeps x/y, re-renders with new font/size
    else remove(id)
    setEditing(null)
  }

  function onPointerDown(e, it) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: it.id, sx: e.clientX, sy: e.clientY, x: it.x, y: it.y, moved: false }
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d || d.done) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.hypot(dx, dy) > 3) d.moved = true // a real drag shouldn't also open the edit modal
    update(d.id, () => ({ x: d.x + dx / SCALE, y: d.y + dy / SCALE }))
  }

  async function save() {
    try {
      const doc = await PDFDocument.load(file.bytes)
      for (const it of items) {
        const page = doc.getPage(it.page)
        // shortcut: assumes no page rotation / cropbox offset, map through page.getRotation() if such PDFs show up
        const box = { x: it.x, y: page.getHeight() - it.y - it.h, width: it.w, height: it.h }
        page.drawImage(await doc.embedPng(it.src), box)
      }
      const out = await doc.save()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }))
      a.download = file.name.replace(/\.pdf$/i, '') + '-signed.pdf'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    }
  }

  // shared by the toolbar and the edit modal
  const fontPicker = (
    <select value={font} onChange={(e) => setFont(e.target.value)} title="ฟอนต์">
      {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  )
  const sizePicker = (
    <input type="number" min="4" max="200" value={size} onChange={(e) => setSize(Math.max(4, +e.target.value || 4))} title="ขนาด (pt)" style={{ width: 56 }} />
  )

  const hint = stamp
    ? 'คลิกบนหน้าเอกสารเพื่อวาง'
    : file
      ? 'คลิกข้อความที่วางแล้วเพื่อแก้ · ลากเพื่อย้าย · หมุนล้อเมาส์เพื่อปรับขนาด · ดับเบิลคลิกลายเซ็นเพื่อลบ'
      : ''

  return (
    <div className="app">
      <header>
        <label className="btn">
          เปิด PDF
          <input type="file" accept="application/pdf" multiple hidden onChange={(e) => openFiles(e, false)} />
        </label>
        <label className={'btn' + (file ? '' : ' disabled')} title="ต่อไฟล์ PDF อื่นท้ายเอกสารนี้ (เลือกได้หลายไฟล์ เรียงตามชื่อไฟล์)">
          เพิ่ม PDF
          <input type="file" accept="application/pdf" multiple hidden disabled={!file} onChange={(e) => openFiles(e, true)} />
        </label>
        <button disabled={!file} onClick={() => setPadOpen(true)}>เซ็นชื่อ</button>
        {fontPicker}
        {sizePicker}
        <input disabled={!file} value={text} placeholder="ข้อความ" onChange={(e) => setText(e.target.value)} />
        <button disabled={!file || !text} onClick={() => setStamp(textStamp(text))}>วางข้อความ</button>
        <button disabled={!file} onClick={save}>บันทึก</button>
        <span className="hint">{hint}</span>
      </header>

      <div className="body">
      {pages.length > 0 && (
        <aside className="thumbs">
          {pages.map((_, i) => (
            <div
              key={i}
              className="thumb"
              draggable
              title="ลากเพื่อสลับลำดับ · คลิกเพื่อไปที่หน้านี้"
              onDragStart={() => (dragPage.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => movePage(dragPage.current, i)}
              onClick={() => document.getElementById('page-' + i).scrollIntoView({ behavior: 'smooth' })}
            >
              <canvas ref={(el) => (thumbs.current[i] = el)} />
              <div className="thumb-bar" onClick={(e) => e.stopPropagation()}>
                <span>{i + 1}</span>
                <button title="เลื่อนขึ้น" disabled={i === 0} onClick={() => movePage(i, i - 1)}>▲</button>
                <button title="เลื่อนลง" disabled={i === pages.length - 1} onClick={() => movePage(i, i + 1)}>▼</button>
                <button title="ลบหน้า" className="danger" disabled={pages.length === 1} onClick={() => deletePage(i)}>×</button>
              </div>
            </div>
          ))}
        </aside>
      )}
      <main ref={mainRef} onPointerMove={onPointerMove} onPointerUp={() => drag.current && (drag.current.done = true)}>
        {pages.map((p, i) => (
          <div key={i} id={'page-' + i} className={'page' + (stamp ? ' placing' : '')} style={{ width: p.w * SCALE, height: p.h * SCALE }} onClick={(e) => onPageClick(e, i)}>
            <canvas ref={(el) => (canvases.current[i] = el)} />
            {items.filter((it) => it.page === i).map((it) => (
              <img
                key={it.id}
                src={it.src}
                draggable={false}
                className={'item' + (it.text ? ' text' : '')}
                title={it.text ? 'คลิกเพื่อแก้' : undefined}
                style={{ left: it.x * SCALE, top: it.y * SCALE, width: it.w * SCALE, height: it.h * SCALE }}
                onPointerDown={(e) => onPointerDown(e, it)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (it.text && !drag.current?.moved) startEdit(it)
                }}
                onWheel={(e) => {
                  const up = e.deltaY < 0
                  update(it.id, (o) => {
                    if (!o.text) return { w: o.w * (up ? 1.1 : 1 / 1.1), h: o.h * (up ? 1.1 : 1 / 1.1) }
                    // text: re-render at the new size instead of stretching the PNG, so it stays sharp
                    const size = Math.min(200, Math.max(4, o.size + (up ? 1 : -1)))
                    return { ...textToStamp(o.text, o.font, size), size }
                  })
                }}
                onDoubleClick={() => !it.text && remove(it.id)}
              />
            ))}
          </div>
        ))}
      </main>
      </div>

      {editing && (
        <div className="modal" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
          <form className="pad edit-modal" onSubmit={(e) => { e.preventDefault(); commitEdit() }}>
            <b>แก้ข้อความ</b>
            <div>{fontPicker}{sizePicker}</div>
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              style={{ font: `${size * SCALE}px "${font}"` }}
            />
            <div>
              <button type="button" className="danger" onClick={() => { remove(editing.id); setEditing(null) }}>ลบ</button>
              <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button type="submit">ตกลง</button>
            </div>
          </form>
        </div>
      )}

      {padOpen && (
        <SignaturePad
          onCancel={() => setPadOpen(false)}
          onDone={({ src, w, h }) => {
            setPadOpen(false)
            setStamp({ src, w, h })
          }}
        />
      )}
    </div>
  )
}
