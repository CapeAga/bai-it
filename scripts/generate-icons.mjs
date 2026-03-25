/**
 * Generate extension icons using Puppeteer
 *
 * Two sets:
 * - Default: icon16.png, icon48.png, icon128.png (red, no indicator)
 * - Active:  icon16-on.png, icon48-on.png, icon128-on.png (red + green dot)
 *
 * All sizes show single "掰" character (ZCOOL KuaiLe 400).
 * Green dot (#22c55e) in bottom-right corner indicates enabled state.
 */
import puppeteer from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPuppeteerLaunchOptions } from './puppeteer-launch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'icons');

const SIZES = [
  { size: 128, fontSize: 88, dotSize: 28, dotStroke: 3, dotOffset: 6 },
  { size: 48,  fontSize: 34, dotSize: 10, dotStroke: 1.5, dotOffset: 2 },
  { size: 16,  fontSize: 12, dotSize: 5,  dotStroke: 1, dotOffset: 0 },
];

function buildHtml({ size, fontSize, dotSize, dotStroke, dotOffset, showDot }) {
  const radius = Math.round(size * 0.22);
  const yOffset = Math.round(size * -0.04);
  const dotPos = dotOffset;

  return `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap&text=掰" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; }
    body {
      width: ${size}px;
      height: ${size}px;
      overflow: hidden;
      background: transparent;
    }
    .icon {
      width: ${size}px;
      height: ${size}px;
      border-radius: ${radius}px;
      background: #ef4444;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .icon span {
      font-family: 'ZCOOL KuaiLe', sans-serif;
      font-size: ${fontSize}px;
      color: #fff;
      line-height: 1;
      transform: translateY(${yOffset}px);
    }
    .dot {
      position: absolute;
      bottom: ${dotPos}px;
      right: ${dotPos}px;
      width: ${dotSize}px;
      height: ${dotSize}px;
      border-radius: 50%;
      background: #22c55e;
      border: ${dotStroke}px solid rgba(0,0,0,0.3);
      display: ${showDot ? 'block' : 'none'};
    }
  </style>
</head>
<body>
  <div class="icon">
    <span>掰</span>
    <div class="dot"></div>
  </div>
</body>
</html>`;
}

async function generate() {
  await mkdir(ICONS_DIR, { recursive: true });

  const browser = await puppeteer.launch(
    getPuppeteerLaunchOptions({
      headless: true,
    }),
  );
  const page = await browser.newPage();

  for (const sizeConfig of SIZES) {
    for (const { suffix, showDot } of [
      { suffix: '', showDot: false },
      { suffix: '-on', showDot: true },
    ]) {
      const html = buildHtml({ ...sizeConfig, showDot });
      const { size } = sizeConfig;

      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => Promise.race([
        document.fonts.ready,
        new Promise(r => setTimeout(r, 5000))
      ]));
      await new Promise(r => setTimeout(r, 1000));

      const screenshot = await page.screenshot({
        type: 'png',
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size }
      });

      const outPath = path.join(ICONS_DIR, `icon${size}${suffix}.png`);
      await writeFile(outPath, screenshot);
      console.log(`Generated ${outPath}`);
    }
  }

  await browser.close();
  console.log('Done!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
