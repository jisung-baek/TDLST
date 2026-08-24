/**
 * 데모 화면을 그림으로 찍는다. UI 를 고친 뒤 눈으로 확인할 때 쓴다.
 *
 *   npm run dev          (다른 창에서 띄워둔 뒤)
 *   npm run shoot
 *
 * 결과는 shots/ 에 떨어진다.
 */
import { launch } from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'shots')
const URL = process.env.SHOOT_URL ?? 'http://localhost:1420/demo.html'

const CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
]

const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) throw new Error('Chrome 이나 Edge 를 찾지 못했습니다')

const shots = [
  { name: 'widget', width: 760, height: 520 },
  { name: 'widget-wide', width: 1240, height: 700 },
  { name: 'widget-min', width: 730, height: 400 },
  { name: 'phone', width: 390, height: 720 },
] as const

mkdirSync(OUT, { recursive: true })

const browser = await launch({ executablePath: chrome, headless: true })
try {
  for (const shot of shots) {
    const page = await browser.newPage()
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 2 })
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30_000 })
    // 서버 요청이 실패하는 데모라서, 목록이 실제로 그려질 때까지 기다린다
    await page.waitForSelector('.app', { timeout: 15_000 })
    await page.waitForFunction(() => document.querySelectorAll('.task').length > 0, {
      timeout: 15_000,
    })
    const file = join(OUT, `${shot.name}.png`)
    await page.screenshot({ path: file as `${string}.png` })
    console.log(`  ${shot.name.padEnd(12)} ${shot.width}x${shot.height}  → shots/${shot.name}.png`)
    await page.close()
  }
} finally {
  await browser.close()
}
