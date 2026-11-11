const { PDFDocument } = require('pdf-lib')
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib')
const { P12Signer } = require('@signpdf/signer-p12')
const signpdf = require('@signpdf/signpdf').default

// Invisible certificate signature (PKCS#7 detached) from a .p12/.pfx file. Any later edit to the file breaks it.
async function signPdf({ pdf, p12, password, reason }) {
  const doc = await PDFDocument.load(pdf)
  pdflibAddPlaceholder({ pdfDoc: doc, reason: reason || '', contactInfo: '', name: '', location: '', appName: 'PDF Edit' })
  const bytes = Buffer.from(await doc.save({ useObjectStreams: false })) // signpdf needs a classic xref
  return signpdf.sign(bytes, new P12Signer(Buffer.from(p12), { passphrase: password || '' }))
}

module.exports = { signPdf }
