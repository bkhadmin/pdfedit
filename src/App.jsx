import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'
import SignaturePad from './SignaturePad'
import CertModal from './CertModal'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const SCALE = 1.5 // screen px per PDF point
const FALLBACK_FONTS = ['Tahoma', 'Leelawadee UI', 'Angsana New', 'Cordia New', 'TH Sarabun New', 'Arial']
const ICONS = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  add: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15h6',
  sign: 'M3 21c3-6 5-6 6-3s3 0 4-2 2-1 3 1M15 4l5 5-8 8H7v-5z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  print: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  save: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  cert: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4',
  scan: 'M7 3h10v6H7zM3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 15h4',
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
)

const Tool = ({ icon, label, onClick, off, primary }) => (
  <button className={'tool' + (primary ? ' primary' : '')} onClick={onClick} disabled={off} title={label}>
    <Icon name={icon} />
    <span>{label}</span>
  </button>
)

// Text becomes a PNG so any installed font works, Thai included (pdf-lib standard fonts have no Thai glyphs).
// shortcut: text isn't selectable/searchable in the output, embed the TTF via @pdf-lib/fontkit if needed.
// Baseline sits at 1.1 * size from the stamp's top. bg = optional solid background color.
function textToStamp(text, family, size, color = '#000000', bg) {
  const px = size * 3 // render at 3x for print quality
  const font = `${px}px "${family}"`
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = font
  c.width = Math.ceil(ctx.measureText(text).width + px * 0.2)
  c.height = Math.ceil(px * 1.5)
  if (bg) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.fillStyle = color
  ctx.font = font
  ctx.fillText(text, px * 0.1, px * 1.1)
  return { src: c.toDataURL('image/png'), w: c.width / 3, h: c.height / 3 }
}

// One page per JPG/PNG. dpi known (scans): the page is the paper's real size. Otherwise the image is
// fitted, never enlarged, into A4 (landscape if wider than tall) inside 10 mm margins, centered.
async function addImagePage(doc, { bytes, dpi }) {
  const img = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes) // PNG files start with 0x89
  let [w, h] = [img.width, img.height]
  let W, H
  if (dpi) {
    W = w = (w * 72) / dpi
    H = h = (h * 72) / dpi
  } else {
    ;[W, H] = w > h ? [841.89, 595.28] : [595.28, 841.89]
    const s = Math.min(1, (W - 56.7) / w, (H - 56.7) / h)
    ;[w, h] = [w * s, h * s]
  }
  doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h })
}

function download(bytes, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function App() {
  const [file, setFile] = useState(null) // { name, bytes }
  const [pages, setPages] = useState([]) // [{ w, h }] in PDF points
  const [items, setItems] = useState([]) // [{ id, page, x, y, w, h, src, text?, font?, size?, color?, cover? }] PDF points, y from top
  const [stamp, setStamp] = useState(null) // stamp waiting to be placed by click
  const [fonts, setFonts] = useState(FALLBACK_FONTS)
  // last-used text settings, shown in the text modal
  const [font, setFont] = useState('Tahoma')
  const [size, setSize] = useState(16)
  const [color, setColor] = useState('#000000')
  const [cover, setCover] = useState(false) // opaque text background matching the PDF underneath
  const [editing, setEditing] = useState(null) // { id (null = new text), value }
  const [padOpen, setPadOpen] = useState(false)
  const [certOpen, setCertOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [busy, setBusy] = useState('')
  const [undoCount, setUndoCount] = useState(0)
  const pdfRef = useRef(null)
  const canvases = useRef([])
  const thumbs = useRef([])
  const dragPage = useRef(null)
  const drag = useRef(null)
  const mainRef = useRef(null)
  const openRef = useRef(null)
  const appendRef = useRef(null)
  const imageRef = useRef(null)
  const history = useRef([]) // snapshots of { file, items } taken before each change
  const lastSnap = useRef({})
  const [appUpdate, setAppUpdate] = useState(null) // { version, percent?, ready? } — desktop auto-update
  const updateClicked = useRef(false)

  useEffect(
    () =>
      window.pdfedit?.onUpdate((u) => {
        if (u.type === 'available') setAppUpdate({ version: u.version })
        else if (u.type === 'progress') setAppUpdate((x) => x && { ...x, percent: u.percent })
        else if (u.type === 'downloaded') setAppUpdate((x) => x && { ...x, ready: true })
        else if (u.type === 'error') {
          // startup check failures (offline, no releases) are normal: only report errors after the user clicked
          console.log('update error:', u.message)
          if (updateClicked.current) alert('อัปเดตไม่สำเร็จ กรุณาลองใหม่ภายหลัง')
          updateClicked.current = false
          setAppUpdate(null)
        }
      }),
    [],
  )

  const runUpdate = () => {
    if (appUpdate.ready) return window.pdfedit.installUpdate()
    updateClicked.current = true
    setAppUpdate({ ...appUpdate, percent: 0 })
    window.pdfedit.downloadUpdate().catch(() => {}) // failures also arrive as an 'error' event
  }

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

  useEffect(() => {
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // snapshot before a change; same key within 1s (e.g. wheel ticks) collapses into one undo step
  function snap(key) {
    const now = Date.now()
    const last = lastSnap.current
    lastSnap.current = { key, t: now }
    if (key && key === last.key && now - last.t < 1000) return
    history.current.push({ file, items })
    if (history.current.length > 50) history.current.shift()
    setUndoCount(history.current.length)
  }

  async function undo() {
    const s = history.current.pop()
    setUndoCount(history.current.length)
    if (!s) return
    if (s.file !== file) await loadPdf(s.file)
    setItems(s.items)
  }

  async function openFiles(e, append) {
    // sort by name: the OS file picker returns multi-selections in no reliable order
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
    e.target.value = '' // let the same file be picked again
    addFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), append)
  }

  // files: [{ name, bytes, dpi? }], PDFs or JPG/PNG images (one page each).
  // append = add them after the current document's pages (placed items keep their pages)
  async function addFiles(files, append) {
    if (!files.length) return
    const isPdf = ({ bytes: b }) => !(b[0] === 0x89 && b[1] === 0x50) && !(b[0] === 0xff && b[1] === 0xd8) // not PNG/JPEG
    try {
      let bytes
      if (!append && files.length === 1 && isPdf(files[0])) bytes = files[0].bytes
      else {
        const doc = append ? await PDFDocument.load(file.bytes) : await PDFDocument.create()
        for (const f of files) {
          if (!isPdf(f)) {
            await addImagePage(doc, f)
            continue
          }
          const src = await PDFDocument.load(f.bytes)
          for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p)
        }
        bytes = await doc.save()
      }
      if (append) snap()
      await loadPdf({ name: append ? file.name : files[0].name.replace(/\.(jpe?g|png)$/i, '.pdf'), bytes })
      if (!append) {
        setItems([])
        history.current = []
        setUndoCount(0)
      }
    } catch (err) {
      alert('เปิดไฟล์ไม่ได้: ' + err.message)
    }
  }

  async function scan() {
    if (busy) return
    setBusy('กำลังสแกน… ทำต่อในหน้าต่างของเครื่องสแกน')
    try {
      const pages = await window.pdfedit.scan()
      const name = `scan-${new Date().toLocaleDateString('sv')}.pdf` // sv = YYYY-MM-DD
      await addFiles(pages.map((p) => ({ ...p, name })), !!file)
    } catch (err) {
      alert(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) // strip Electron IPC prefix
    }
    setBusy('')
  }

  async function loadPdf(f) {
    const pdf = await pdfjs.getDocument({ data: f.bytes.slice() }).promise // pdf.js detaches its buffer
    const out = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
      out.push({ w: vp.width, h: vp.height })
    }
    pdfRef.current = pdf
    setFile(f)
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
      const bytes = await doc.save()
      snap()
      await loadPdf({ name: file.name, bytes })
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

  const add = (it) => setItems((old) => [...old, { ...it, id: crypto.randomUUID() }])
  const update = (id, fn) => setItems((its) => its.map((it) => (it.id === id ? { ...it, ...fn(it) } : it)))
  const remove = (id) => {
    snap()
    setItems((its) => its.filter((o) => o.id !== id))
  }

  function onPageClick(e, page) {
    if (!stamp) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / SCALE
    const py = (e.clientY - r.top) / SCALE
    const it = { ...stamp, page, x: px - stamp.w / 2, y: py - stamp.h / 2 }
    snap()
    add(it.cover ? { ...it, ...renderText(it) } : it) // background color is only known once placed
    setStamp(null)
  }

  // Most common color of the rendered page under a box (PDF points) — the paper, since glyphs cover little area.
  function sampleBg(page, x, y, w, h) {
    const c = canvases.current[page]
    const x0 = Math.max(0, Math.floor(x * SCALE))
    const y0 = Math.max(0, Math.floor(y * SCALE))
    const x1 = Math.min(c.width, Math.ceil((x + w) * SCALE))
    const y1 = Math.min(c.height, Math.ceil((y + h) * SCALE))
    if (x1 <= x0 || y1 <= y0) return '#fff'
    const p = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data
    const count = new Map()
    let best = 0
    let bg = '#fff'
    for (let i = 0; i < p.length; i += 4) {
      const key = ((p[i] >> 3) << 10) | ((p[i + 1] >> 3) << 5) | (p[i + 2] >> 3) // bucket near-identical shades
      const n = (count.get(key) || 0) + 1
      count.set(key, n)
      if (n > best) [best, bg] = [n, `rgb(${p[i]},${p[i + 1]},${p[i + 2]})`]
    }
    return bg
  }

  // PNG fields for a text item; with cover on, background = the PDF's color at the item's current spot
  function renderText(o) {
    const s = textToStamp(o.text, o.font, o.size, o.color)
    return o.cover ? textToStamp(o.text, o.font, o.size, o.color, sampleBg(o.page, o.x, o.y, s.w, s.h)) : s
  }

  function startEdit(it) {
    setFont(it.font)
    setSize(it.size)
    setColor(it.color || '#000000')
    setCover(!!it.cover)
    setEditing({ id: it.id, value: it.text })
  }

  function commitEdit() {
    const { id, value } = editing
    const props = { text: value, font, size, color, cover }
    setEditing(null)
    if (!id) {
      if (value.trim()) setStamp({ ...textToStamp(value, font, size, color), ...props }) // placed by the next page click
    } else if (!value.trim()) remove(id)
    else {
      snap()
      update(id, (o) => {
        const n = { ...o, ...props } // keeps x/y
        return { ...n, ...renderText(n) }
      })
    }
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
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true // a real drag shouldn't also open the edit modal
      snap()
    }
    if (d.moved) update(d.id, () => ({ x: d.x + dx / SCALE, y: d.y + dy / SCALE }))
  }
  function onPointerUp() {
    const d = drag.current
    if (!d || d.done) return
    d.done = true
    if (d.moved) update(d.id, (o) => (o.cover ? renderText(o) : {})) // re-sample background at the new spot
  }

  function onWheel(e, it) {
    const up = e.deltaY < 0
    snap('wheel:' + it.id)
    update(it.id, (o) => {
      if (!o.text) return { w: o.w * (up ? 1.1 : 1 / 1.1), h: o.h * (up ? 1.1 : 1 / 1.1) }
      // text: re-render at the new size instead of stretching the PNG, so it stays sharp
      const s = Math.min(200, Math.max(4, o.size + (up ? 1 : -1)))
      return { ...renderText({ ...o, size: s }), size: s }
    })
  }

  // The document with every placed signature/text flattened into it.
  async function buildPdf() {
    const doc = await PDFDocument.load(file.bytes)
    for (const it of items) {
      const page = doc.getPage(it.page)
      // shortcut: assumes no page rotation / cropbox offset, map through page.getRotation() if such PDFs show up
      const box = { x: it.x, y: page.getHeight() - it.y - it.h, width: it.w, height: it.h }
      page.drawImage(await doc.embedPng(it.src), box)
    }
    return doc.save()
  }

  const outName = (suffix) => file.name.replace(/\.pdf$/i, '') + suffix + '.pdf'

  async function save() {
    try {
      download(await buildPdf(), outName('-edited'))
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    }
  }

  // Prints the flattened output (not the screen), rendered at 144 dpi into a hidden frame.
  async function print() {
    setBusy('กำลังเตรียมพิมพ์…')
    try {
      const pdf = await pdfjs.getDocument({ data: await buildPdf() }).promise
      const imgs = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const vp = page.getViewport({ scale: 2 })
        const c = document.createElement('canvas')
        c.width = vp.width
        c.height = vp.height
        await page.render({ canvas: c, viewport: vp }).promise
        imgs.push(c.toDataURL('image/jpeg', 0.92))
      }
      const frame = document.createElement('iframe')
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
      document.body.appendChild(frame)
      const d = frame.contentDocument
      d.open()
      d.write(
        '<style>@page{margin:0}body{margin:0}img{display:block;width:100%;height:100vh;object-fit:contain;break-after:page}</style>' +
          imgs.map((s) => `<img src="${s}">`).join(''),
      )
      d.close()
      await Promise.all([...d.images].map((im) => im.decode()))
      frame.contentWindow.onafterprint = () => frame.remove()
      setBusy('')
      frame.contentWindow.print()
    } catch (err) {
      setBusy('')
      alert('พิมพ์ไม่สำเร็จ: ' + err.message)
    }
  }

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setStamp(null)
      if (!e.ctrlKey || editing || padOpen || certOpen) return
      const k = e.key.toLowerCase()
      if (k === 'o') openRef.current.click()
      else if (k === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) undo()
      else if (k === 's' && file) save()
      else if (k === 'p' && file) print()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const canCert = !!window.pdfedit // desktop app only (signing runs in Electron's main process)
  const canScan = !!window.pdfedit?.scan // desktop app only (Windows WIA)
  const newText = () => setEditing({ id: null, value: '' })
  const menus = {
    ไฟล์: [
      { label: 'เปิด PDF…', kbd: 'Ctrl+O', run: () => openRef.current.click() },
      { label: 'เพิ่ม PDF ต่อท้าย…', run: () => appendRef.current.click(), off: !file },
      { label: 'นำเข้ารูปภาพ…', run: () => imageRef.current.click() },
      '-',
      { label: 'บันทึก', kbd: 'Ctrl+S', run: save, off: !file },
      { label: canCert ? 'บันทึกพร้อมลายเซ็นดิจิทัล…' : 'ลายเซ็นดิจิทัล (เฉพาะโปรแกรม Windows)', run: () => setCertOpen(true), off: !file || !canCert },
      '-',
      { label: 'พิมพ์…', kbd: 'Ctrl+P', run: print, off: !file },
    ],
    แก้ไข: [{ label: 'ย้อนกลับ', kbd: 'Ctrl+Z', run: undo, off: !undoCount }],
    แทรก: [
      { label: 'ลายเซ็น…', run: () => setPadOpen(true), off: !file },
      { label: 'ข้อความ…', run: newText, off: !file },
      ...(canScan ? ['-', { label: 'สแกนเอกสาร…', run: scan, off: !!busy }] : []),
    ],
  }

  const hint = busy
    ? busy
    : stamp
      ? 'คลิกบนหน้าเอกสารเพื่อวาง · Esc = ยกเลิก'
      : file
        ? 'คลิกข้อความเพื่อแก้ · ลากเพื่อย้าย · หมุนล้อเมาส์เพื่อปรับขนาด · ดับเบิลคลิกลายเซ็นเพื่อลบ'
        : ''

  return (
    <div className="app">
      <input ref={openRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => openFiles(e, false)} />
      <input ref={appendRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => openFiles(e, true)} />
      <input ref={imageRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => openFiles(e, !!file)} />

      <header>
        <div className="titlebar">
          <img src="./icon.png" alt="" className="logo" />
          <b>PDF Edit</b>
          <nav className="menubar">
            {Object.entries(menus).map(([name, list]) => (
              <div key={name} className="menu">
                <button
                  className={menu === name ? 'open' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu(menu === name ? null : name)
                  }}
                  onMouseEnter={() => menu && setMenu(name)}
                >
                  {name}
                </button>
                {menu === name && (
                  <div className="dropdown">
                    {list.map((m, i) =>
                      m === '-' ? (
                        <hr key={i} />
                      ) : (
                        <button key={i} disabled={m.off} onClick={m.run}>
                          <span>{m.label}</span>
                          <kbd>{m.kbd}</kbd>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>
          {appUpdate && (
            <button className="update" onClick={runUpdate} disabled={appUpdate.percent !== undefined && !appUpdate.ready}>
              {appUpdate.ready ? 'ติดตั้งและเปิดใหม่' : appUpdate.percent !== undefined ? `กำลังดาวน์โหลด ${appUpdate.percent}%` : `อัปเดตเป็น v${appUpdate.version}`}
            </button>
          )}
          {file && <span className="filename">{file.name}</span>}
        </div>
        <div className="toolbar">
          <Tool icon="open" label="เปิด" onClick={() => openRef.current.click()} />
          <Tool icon="add" label="เพิ่ม PDF" onClick={() => appendRef.current.click()} off={!file} />
          {canScan && <Tool icon="scan" label="สแกน" onClick={scan} off={!!busy} />}
          <span className="sep" />
          <Tool icon="sign" label="เซ็นชื่อ" onClick={() => setPadOpen(true)} off={!file} />
          <Tool icon="text" label="ข้อความ" onClick={newText} off={!file} />
          <span className="sep" />
          <Tool icon="undo" label="ย้อนกลับ" onClick={undo} off={!undoCount} />
          <span className="grow" />
          <Tool icon="print" label="พิมพ์" onClick={print} off={!file} />
          {canCert && <Tool icon="cert" label="ลายเซ็นดิจิทัล" onClick={() => setCertOpen(true)} off={!file} />}
          <Tool icon="save" label="บันทึก" onClick={save} off={!file} primary />
        </div>
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
        <main ref={mainRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          {!file && (
            <div className="empty">
              <img src="./icon.png" alt="" />
              <h2>เปิดไฟล์ PDF เพื่อเริ่มต้น</h2>
              <p>เซ็นชื่อ · ใส่ข้อความ · รวมไฟล์ · จัดหน้า · พิมพ์</p>
              <button className="tool primary" onClick={() => openRef.current.click()}>
                <Icon name="open" />
                <span>เปิด PDF</span>
              </button>
            </div>
          )}
          {pages.map((p, i) => (
            <div key={i} id={'page-' + i} className={'page' + (stamp ? ' placing' : '')} style={{ width: p.w * SCALE, height: p.h * SCALE }} onClick={(e) => onPageClick(e, i)}>
              <canvas ref={(el) => (canvases.current[i] = el)} />
              {items.filter((it) => it.page === i).map((it) => (
                <img
                  key={it.id}
                  src={it.src}
                  alt=""
                  draggable={false}
                  className={'item' + (it.text ? ' text' : '')}
                  title={it.text ? 'คลิกเพื่อแก้' : 'ดับเบิลคลิกเพื่อลบ'}
                  style={{ left: it.x * SCALE, top: it.y * SCALE, width: it.w * SCALE, height: it.h * SCALE }}
                  onPointerDown={(e) => onPointerDown(e, it)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (it.text && !drag.current?.moved) startEdit(it)
                  }}
                  onWheel={(e) => onWheel(e, it)}
                  onDoubleClick={() => !it.text && remove(it.id)}
                />
              ))}
            </div>
          ))}
        </main>
      </div>

      <footer>
        <span>{file ? `${pages.length} หน้า` : 'ยังไม่ได้เปิดไฟล์'}</span>
        <span className="hint">{hint}</span>
      </footer>

      {editing && (
        <div className="modal" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
          <form className="pad edit-modal" onSubmit={(e) => { e.preventDefault(); commitEdit() }}>
            <h3>{editing.id ? 'แก้ข้อความ' : 'แทรกข้อความ'}</h3>
            <div className="row">
              <select value={font} onChange={(e) => setFont(e.target.value)} title="ฟอนต์">
                {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" min="4" max="200" value={size} onChange={(e) => setSize(Math.max(4, +e.target.value || 4))} title="ขนาด (pt)" style={{ width: 60 }} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="สีตัวอักษร" />
              <label className="keep" title="ปิดของเดิมใต้ข้อความ ด้วยสีพื้นของเอกสารตรงจุดที่วาง">
                <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> พื้นหลังทึบ
              </label>
            </div>
            <input
              autoFocus
              className="text-input"
              placeholder="พิมพ์ข้อความ"
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              style={{ font: `${size * SCALE}px "${font}"`, color }}
            />
            <div className="row end">
              {editing.id && (
                <button type="button" className="danger" onClick={() => { remove(editing.id); setEditing(null) }}>ลบ</button>
              )}
              <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button type="submit" className="primary">{editing.id ? 'ตกลง' : 'วางบนเอกสาร'}</button>
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

      {certOpen && (
        <CertModal
          onCancel={() => setCertOpen(false)}
          onSign={async ({ p12, password, reason }) => {
            const out = await window.pdfedit.signPdf({ pdf: await buildPdf(), p12, password, reason })
            download(out, outName('-signed'))
            setCertOpen(false)
          }}
        />
      )}
    </div>
  )
}
