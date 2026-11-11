// placement() must put an item at the same on-screen spot for every page rotation and crop-box offset.
// Checks the drawn image's corners (as pdf-lib rotates them about x/y) back through pdf.js's own viewport.
import assert from 'node:assert'
import { PDFDocument, degrees } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { placement } from '../src/placement.js'

const near = (a, b, msg) => assert.ok(Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01, `${msg}: got ${a} want ${b}`)

for (const crop of [null, [40, 30, 700, 500]]) {
  for (const rot of [0, 90, 180, 270]) {
    const d = await PDFDocument.create()
    const p = d.addPage([842, 595])
    p.setRotation(degrees(rot))
    if (crop) p.setCropBox(...crop)
    const pdf = await pdfjs.getDocument({ data: await d.save() }).promise
    const vp = (await pdf.getPage(1)).getViewport({ scale: 1 })

    const it = { x: 50, y: 20, w: 120, h: 40 } // on-screen box, y down
    const o = placement(vp, it)
    const t = (o.rotate * Math.PI) / 180
    const corner = (dx, dy) => vp.convertToViewportPoint(o.x + dx * Math.cos(t) - dy * Math.sin(t), o.y + dx * Math.sin(t) + dy * Math.cos(t))
    const tag = `rotate ${rot}${crop ? ' + crop' : ''}`
    near(corner(0, 0), [it.x, it.y + it.h], tag + ' bottom-left')
    near(corner(it.w, 0), [it.x + it.w, it.y + it.h], tag + ' bottom-right')
    near(corner(0, it.h), [it.x, it.y], tag + ' top-left')
  }
}
console.log('placement ok: rotations 0/90/180/270, with and without crop offset')
