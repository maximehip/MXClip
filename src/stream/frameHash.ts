import sharp from 'sharp'

export async function computeFrameHash(imagePath: string): Promise<Buffer> {
    const raw = await sharp(imagePath)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer()
    // dHash : pour chaque ligne de 9px, comparer pixel[i] < pixel[i+1] → 64 bits
    const bits = Buffer.alloc(8)
    for (let row = 0; row < 8; row++) {
        let byte = 0
        for (let col = 0; col < 8; col++) {
            if (raw[row * 9 + col] < raw[row * 9 + col + 1]) byte |= (1 << col)
        }
        bits[row] = byte
    }
    return bits
}

export function hammingDistance(a: Buffer, b: Buffer): number {
    let dist = 0
    for (let i = 0; i < 8; i++) {
        let xor = a[i] ^ b[i]
        while (xor) { dist += xor & 1; xor >>= 1 }
    }
    return dist
}
