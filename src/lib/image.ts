/**
 * Getting a phone photo ready to send to a vision model.
 *
 * A modern phone camera produces a 12 MP, 4 MB JPEG. Sending that raw is slow
 * on mobile data, costs tokens, and buys no accuracy — a receipt is a tall
 * strip of text, and once it is legible, more pixels add nothing. So we
 * downscale and re-compress on the device first.
 *
 * Re-encoding through a canvas also normalises the format, which quietly
 * solves the iPhone HEIC problem: whatever goes in, JPEG comes out.
 */

export interface PreparedImage {
  /** Base64 with no data: prefix, which is what the model API wants. */
  base64: string
  mimeType: string
  width: number
  height: number
  /** Approximate encoded size, for telling the user why it is slow. */
  bytes: number
}

/**
 * Receipts are long and narrow. 1600px on the long edge keeps small print
 * readable while cutting a typical camera photo by an order of magnitude.
 */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `imageOrientation: 'from-image'` applies the EXIF rotation, without
      // which photos taken in portrait arrive on their side.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Some browsers cannot decode HEIC this way; fall through.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable-image'))
    }
    img.src = url
  })
}

export async function prepareReceiptImage(file: File): Promise<PreparedImage> {
  const source = await loadBitmap(file)
  const sourceWidth = 'width' in source ? source.width : 0
  const sourceHeight = 'height' in source ? source.height : 0
  if (!sourceWidth || !sourceHeight) throw new Error('unreadable-image')

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('unreadable-image')
  // White underneath: a transparent PNG would otherwise flatten to black and
  // make the text unreadable.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  if ('close' in source) source.close()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)

  return {
    base64,
    mimeType: 'image/jpeg',
    width,
    height,
    // base64 carries 3 bytes per 4 characters.
    bytes: Math.round((base64.length * 3) / 4),
  }
}
