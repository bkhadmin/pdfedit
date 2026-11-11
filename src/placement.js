// Where to draw an overlay item on a PDF page so it lands exactly where it was placed on screen.
// vp = pdf.js viewport at scale 1 (handles the page's /Rotate and crop-box offset); the item box is in
// those on-screen points (y down). Returns pdf-lib drawImage options: the item's visual bottom-left corner
// in PDF user space, rotated counter-clockwise by the page rotation so it reads upright when displayed.
export function placement(vp, { x, y, w, h }) {
  const [px, py] = vp.convertToPdfPoint(x, y + h)
  return { x: px, y: py, width: w, height: h, rotate: vp.rotation % 360 }
}
