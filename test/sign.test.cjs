const forge = require('node-forge')
const assert = require('node:assert')
const crypto = require('node:crypto')
const { PDFDocument } = require('pdf-lib')
const { signPdf } = require('../electron/sign.cjs')
;(async () => {
  // self-signed test certificate
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey; cert.serialNumber = '01'
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 864e5)
  const attrs = [{ name: 'commonName', value: 'Test Signer' }]
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12 = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'pw1234')).getBytes(), 'binary')

  const d = await PDFDocument.create(); d.addPage([300, 300])
  const out = await signPdf({ pdf: await d.save(), p12, password: 'pw1234', reason: 'อนุมัติ' })

  // verify: digest inside the PKCS#7 must equal sha256 of the ByteRange-covered bytes
  const s = out.toString('latin1')
  const br = s.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/).slice(1).map(Number)
  const signed = Buffer.concat([out.subarray(br[0], br[0] + br[1]), out.subarray(br[2], br[2] + br[3])])
  const hex = s.slice(br[0] + br[1] + 1, br[2] - 1).replace(/0+$/, '')
  const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.hexToBytes(hex.length % 2 ? hex + '0' : hex)))
  const md = p7.rawCapture.authenticatedAttributes.find((a) => forge.asn1.derToOid(a.value[0].value) === forge.pki.oids.messageDigest).value[1].value[0].value
  assert.strictEqual(Buffer.from(md, 'binary').toString('hex'), crypto.createHash('sha256').update(signed).digest('hex'))
  assert.strictEqual(p7.certificates[0].subject.getField('CN').value, 'Test Signer')
  console.log('signature ok: digest matches, signer =', p7.certificates[0].subject.getField('CN').value)

  await assert.rejects(signPdf({ pdf: await d.save(), p12, password: 'wrong' }))
  console.log('wrong password rejected')
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
