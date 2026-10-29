/** 亮度实测：把 canvas 缩绘到离屏 2D canvas 后统计像素亮度（0-255） */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:4178/', { waitUntil: 'networkidle2' });
await sleep(4000);

async function measure(label) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('stage');
    const off = document.createElement('canvas');
    off.width = 160;
    off.height = 90;
    const ctx = off.getContext('2d');
    ctx.drawImage(c, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    let all = 0;
    let lower = 0;
    let lowerN = 0;
    let maxV = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      all += lum;
      maxV = Math.max(maxV, lum);
      const y = Math.floor(i / 4 / 160);
      if (y > 55) {
        lower += lum;
        lowerN++;
      }
    }
    const n = d.length / 4;
    return { avg: +(all / n).toFixed(1), lower: +(lower / lowerN).toFixed(1), max: +maxV.toFixed(0) };
  });
  console.log(label.padEnd(22), 'avg=' + String(r.avg).padStart(6), ' lower(下1/3)=' + String(r.lower).padStart(6), ' max=' + r.max);
}

await measure('showroom');
await page.evaluate(() => window.NOVA.set('scene', 'rain'));
await sleep(2500);
await measure('rain-static');
await page.evaluate(() => window.NOVA.enterDrive('cockpit'));
await sleep(1200);
await page.keyboard.down('w');
await sleep(4000);
await measure('drive-cockpit');
await page.evaluate(() => window.NOVA.setDriveCam('chase'));
await sleep(1500);
await measure('drive-chase');
await page.evaluate(() => window.NOVA.set('headlights', false));
await sleep(1200);
await measure('drive-chase-nolights');
await page.keyboard.up('w');
await browser.close();
