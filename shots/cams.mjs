/** 四机位车体检查图 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const OUT = path.resolve('shots/out');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700 });
await page.goto('http://127.0.0.1:4178/', { waitUntil: 'networkidle2' });
await sleep(3500);
await page.evaluate(() => window.NOVA.set('photo', true));
await sleep(500);

const cams = {
  a_front: [3.2, 1.5, -6.4],
  b_side: [8.6, 1.3, 0.4],
  c_rear: [3.0, 1.6, 6.4],
  d_top: [0.4, 7.4, 0.6]
};

for (const [name, p] of Object.entries(cams)) {
  await page.evaluate((pos) => {
    const app = window.__app;
    app.view.camera.position.set(pos[0], pos[1], pos[2]);
    app.view.controls.target.set(0, 0.62, 0);
    app.view.controls.update();
  }, p);
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'cam-' + name + '.jpg'), type: 'jpeg', quality: 72 });
  console.log('shot', name);
}
await browser.close();
