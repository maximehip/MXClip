import path from 'path'
import fs from 'fs'
const readline = require('node:readline/promises');


export async function askFaceName() {
    const faceCroppedDir = path.resolve(__dirname, '..', 'output/face_crop')
    const outputDir = path.resolve(__dirname, '..', 'output')
    const facesNamePath = path.resolve(outputDir, 'face_name.json')
    const data: { clusterId: string, name: string }[] = []

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    if (!fs.existsSync(faceCroppedDir)) {
        fs.mkdirSync(faceCroppedDir, { recursive: true })
    }
    for (const file of fs.readdirSync(faceCroppedDir)) {
        const clusterId = file.match(/cluster_(\d+)\.jpg/)?.[1]
        if (!clusterId) continue
        const name = await rl.question(`Quel est le nom de la personne dans ${file} ? (ou appuyez sur Entrée pour "Inconnu")`) || 'Inconnu'
        data.push({ clusterId, name })
    }

     fs.writeFileSync(
            facesNamePath,
            JSON.stringify(data, null, 2),
            'utf-8'
        )
    rl.close()
}