import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const assetsDir = path.join(root, 'assets')
const svgPath = path.join(assetsDir, 'icon.svg')
const svg = fs.readFileSync(svgPath, 'utf-8')

// Render PNG at 512x512
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } })
const pngData = resvg.render().asPng()
const pngPath = path.join(assetsDir, 'icon.png')
fs.writeFileSync(pngPath, pngData)
console.log('wrote', pngPath)

// Render PNG at 256x256 for ICO source
const resvg256 = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } })
const png256 = resvg256.render().asPng()
const png256Path = path.join(assetsDir, 'icon-256.png')
fs.writeFileSync(png256Path, png256)

// Build ICO (Windows)
const icoBuffer = await pngToIco([png256Path])
const icoPath = path.join(assetsDir, 'icon.ico')
fs.writeFileSync(icoPath, icoBuffer)
console.log('wrote', icoPath)

// Clean up intermediate
fs.unlinkSync(png256Path)
console.log('done')
