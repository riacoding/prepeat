import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const q = event.queryStringParameters ?? {}
  const url = q.url
  if (!url) return { statusCode: 400, body: 'Missing url' }

  const title = q.title || 'Scan to view menu'
  const subtitle = q.subtitle || ''

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
