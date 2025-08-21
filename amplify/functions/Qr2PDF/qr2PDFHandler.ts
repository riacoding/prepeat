import type { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2 } from 'aws-lambda'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('event:', event)

  function getParams(event: APIGatewayProxyEventV2): Record<string, string> {
    const method = event.requestContext?.http?.method ?? 'GET'
    const headers = event.headers || {}
    const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()

    // Helper: normalize (decode if base64)
    const bodyString = (() => {
      const raw = event.body ?? ''
      return event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
    })()

    // POST: JSON
    if (method === 'POST' && ct.includes('application/json')) {
      try {
        const obj = JSON.parse(bodyString || '{}') as Record<string, unknown>
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(obj)) if (v != null) out[k] = String(v)
        return out
      } catch {
        /* fall through */
      }
    }

    // POST: form-urlencoded (or unknown CT — be liberal)
    if (method === 'POST') {
      // Try URLSearchParams first
      const out: Record<string, string> = {}
      try {
        const sp = new URLSearchParams(bodyString || '')
        sp.forEach((v, k) => (out[k] = v))
        if (Object.keys(out).length) return out
      } catch {
        /* ignore */
      }

      // Fallback: manual parse (handles '+' as spaces)
      if (bodyString) {
        for (const pair of bodyString.split('&')) {
          if (!pair) continue
          const [k, v = ''] = pair.split('=')
          const key = decodeURIComponent(k.replace(/\+/g, ' '))
          const val = decodeURIComponent(v.replace(/\+/g, ' '))
          out[key] = val
        }
        if (Object.keys(out).length) return out
      }
    }

    // GET: query string
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
  const layout = params.layout || '2up'

  if (!url) return { statusCode: 400, body: 'Missing url' }

  if (layout === '2up') {
    return await makeTwoUpQrPdf(url, title, subtitle)
  }
  return await onePageQrPdf(url, title, subtitle)
}

export async function makeTwoUpQrPdf(url: string, title: string, subtitle?: string) {
  // QR as PNG bytes (no filesystem deps)
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'Q', margin: 0, scale: 10 })
  const pngBytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // US Letter portrait
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const qrImg = await pdf.embedPng(pngBytes)

  const width = page.getWidth() // 612
  const height = page.getHeight() // 792
  const halfH = height / 2 // 396

  // Layout constants
  const outerXPad = 48 // left/right padding inside each half
  const topPad = 36 // top padding inside each half
  const bottomPad = 36 // bottom padding inside each half
  const titleSize = 24
  const subtitleSize = 12
  const titleGap = 6 // gap between title and subtitle
  const blockGap = 14 // gap between text block and QR
  const maxQrDefault = 256 // preferred cap so QR isn't huge

  // helper: center text
  const drawCenteredText = (text: string, size: number, y: number, color = rgb(0, 0, 0)) => {
    const w = helv.widthOfTextAtSize(text, size)
    const x = (width - w) / 2
    page.drawText(text, { x, y, size, font: helv, color })
  }

  // Draw one half: region is [y0, y0 + halfH]
  const drawHalf = (y0: number) => {
    const yTop = y0 + halfH

    // Title + subtitle centered across the half
    let yCursor = yTop - topPad - titleSize
    drawCenteredText(title, titleSize, yCursor)

    if (subtitle) {
      yCursor -= subtitleSize + titleGap
      drawCenteredText(subtitle, subtitleSize, yCursor, rgb(0.4, 0.4, 0.4))
    }

    // Compute available space for QR below the text block
    const textBottomY = subtitle ? yCursor : yTop - topPad - titleSize
    const availBottom = y0 + bottomPad
    const availTop = textBottomY - blockGap
    const availHeight = Math.max(0, availTop - availBottom)

    // QR should fit within both width and available height of the half
    const maxQrWidth = width - outerXPad * 2
    const qrSize = Math.max(
      96, // minimum so it stays scannable
      Math.min(maxQrDefault, maxQrWidth, availHeight)
    )

    // Center QR in the remaining vertical space of the half (below text)
    const qrX = (width - qrSize) / 2
    const qrY = availBottom + (availHeight - qrSize) / 2

    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize })
  }

  // Top half then bottom half
  drawHalf(halfH) // top half (region bottom starts at half height)
  drawHalf(0) // bottom half

  // (Optional) faint cut line between halves
  // page.drawLine({ start: {x: 36, y: halfH}, end: {x: width-36, y: halfH}, thickness: 0.5, color: rgb(0.8,0.8,0.8) })

  const bytes = await pdf.save()

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="menu-qr-2up.pdf"',
      'Cache-Control': 'no-store',
    },
    isBase64Encoded: true,
    body: Buffer.from(bytes).toString('base64'),
  }
}

export async function onePageQrPdf(url: string, title: string, subtitle?: string) {
  // QR as PNG bytes (no filesystem deps)
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'Q', margin: 0, scale: 10 })
  const pngBytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // US Letter (portrait)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)

  const { width, height } = page.getSize()

  // Title + subtitle centered across the page
  const titleSize = 24
  const subtitleSize = 12
  const topMargin = 72
  const titleY = height - topMargin - titleSize
  const subtitleGap = 18 // distance from title baseline to subtitle baseline

  const titleW = helv.widthOfTextAtSize(title, titleSize)
  const titleX = (width - titleW) / 2
  page.drawText(title, { x: titleX, y: titleY, size: titleSize, font: helv })

  if (subtitle) {
    const subW = helv.widthOfTextAtSize(subtitle, subtitleSize)
    const subX = (width - subW) / 2
    const subY = titleY - subtitleGap
    page.drawText(subtitle, { x: subX, y: subY, size: subtitleSize, font: helv, color: rgb(0.4, 0.4, 0.4) })
  }

  // QR centered on page
  const qrImg = await pdf.embedPng(pngBytes)
  const qrSize = 256
  const qrX = (width - qrSize) / 2
  const qrY = (height - qrSize) / 2 - 24 // small nudge down to balance the top text
  page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize })

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
