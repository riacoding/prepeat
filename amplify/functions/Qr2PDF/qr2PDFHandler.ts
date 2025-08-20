import type { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2 } from 'aws-lambda'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('event:', event)
  function getParams(event: APIGatewayProxyEventV2): Record<string, string> {
    const method = event.requestContext?.http?.method ?? 'GET'
    const headers = event.headers || {}
    const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()

    // POST: JSON
    if (method === 'POST' && ct.includes('application/json')) {
      let body: unknown = {}
      try {
        body = JSON.parse(event.body || '{}')
      } catch {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v
        else if (v != null) out[k] = String(v)
      }
      return out
    }

    // POST: x-www-form-urlencoded
    if (method === 'POST' && ct.includes('application/x-www-form-urlencoded')) {
      const sp = new URLSearchParams(event.body || '')
      const out: Record<string, string> = {}
      sp.forEach((v, k) => (out[k] = v))
      return out
    }

    // GET (queryStringParameters)
    const qs = event.queryStringParameters ?? {}
    const out: Record<string, string> = {}
    for (const k in qs) {
      const v = qs[k]
      if (v !== undefined) out[k] = v
    }
    return out
  }

  const params = getParams(event)
  console.log('params:', params)
  const url = params.url
  const title = params.title || 'Scan to view menu'
  const subtitle = params.subtitle || ''

  if (!url) return { statusCode: 400, body: 'Missing url' }

  // QR as PNG bytes (no filesystem deps)
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'Q', margin: 0, scale: 10 })
  const pngBytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // US Letter
  const helv = await pdf.embedFont(StandardFonts.Helvetica)

  const { width, height } = page.getSize()
  page.drawText(title, { x: 72, y: height - 72 - 24, size: 24, font: helv })
  if (subtitle)
    page.drawText(subtitle, { x: 72, y: height - 72 - 24 - 18, size: 12, font: helv, color: rgb(0.4, 0.4, 0.4) })

  const qr = await pdf.embedPng(pngBytes)
  const qrSize = 256
  const x = (width - qrSize) / 2
  const y = (height - qrSize) / 2 - 24
  page.drawImage(qr, { x, y, width: qrSize, height: qrSize })

  const bytes = await pdf.save()
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="menu-qr.pdf"',
      'Cache-Control': 'no-store',
    },
    isBase64Encoded: true,
    body: Buffer.from(bytes).toString('base64'),
  }
}
