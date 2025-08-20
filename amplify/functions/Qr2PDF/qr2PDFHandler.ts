import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import QRCode from 'qrcode'
import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

// Optional: if you want to pull merchant/menu text from Amplify Data
// import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime'
// import { env } from '$amplify/env/menuQrPdf'
// import { generateClient } from 'aws-amplify/data'
// import type { Schema } from '../../data/resource'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const qp = event.queryStringParameters || {}
  const url = qp.url
  if (!url) return { statusCode: 400, body: 'Missing ?url=' }

  // Optional: look up merchant/menu to fill title/subtitle
  // const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env)
  // const client = generateClient<Schema>({ resourceConfig, libraryOptions, authMode: 'iam' })
  // const merchantId = qp.merchantId
  // const { data: merchant } = merchantId ? await client.models.Merchant.get({ id: merchantId }) : { data: null }

  const title = qp.title || 'Scan to view menu'
  const subtitle = qp.subtitle || '' // e.g., merchant?.name || ''

  // Vector QR as SVG (no external calls)
  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 0,
  })

  // Build PDF
  const doc = new PDFDocument({ size: 'LETTER', margin: 36 })
  const chunks: Buffer[] = []
  doc.on('data', (c) => chunks.push(c))

  doc.fontSize(28).text(title, { align: 'center' })
  if (subtitle) doc.moveDown(0.25).fontSize(14).fillColor('#666').text(subtitle, { align: 'center' }).fillColor('#000')

  doc.moveDown(1.5)

  const qrSize = 256 // px on page (~3.5")
  const x = (doc.page.width - qrSize) / 2
  const y = doc.y

  // Draw the SVG *as vector* into the PDF
  SVGtoPDF(doc as any, qrSvg, x, y, { width: qrSize, height: qrSize })

  doc
    .moveDown(2)
    .fontSize(12)
    .fillColor('#333')
    .text('Scan with your phone camera', { align: 'center' })
    .fillColor('#000')

  doc.end()
  const pdf = await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="menu-qr.pdf"',
      'Cache-Control': 'no-store',
    },
    isBase64Encoded: true,
    body: pdf.toString('base64'),
  }
}
