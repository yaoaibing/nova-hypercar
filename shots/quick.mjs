/** 关键画面 JPEG 快检 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const OUT = path.resolve('shots/quick');
fs.mkdirSync(OUT, { recursive: true });
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

const shot = async (n, ms = 1500) => {
  await sleep(ms);
  await page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 74 });
  console.log('shot', n);
};

await shot('01-showroom');
await page.evaluate(() => window.NOVA.set('wing', true));
await shot('02-wing', 1600);
await page.evaluate(() => window.NOVA.set('doors', true));
await shot('03-doors', 1600);
await page.evaluate(() => {
  window.NOVA.set('wing', false);
  window.NOVA.set('doors', false);
  window.NOVA.set('scene', 'rain');
});
await shot('04-rain', 2000);
await page.evaluate(() => window.NOVA.enterDrive('cockpit'));
await sleep(1000);
await page.keyboard.down('w');
await sleep(4000);
await shot('05-cockpit', 500);
await page.evaluate(() => window.NOVA.setDriveCam('chase'));
await shot('06-chase', 1200);
await page.evaluate(() => window.NOVA.exitDrive());
await page.evaluate(() => window.NOVA.set('scene', 'lab'));
await shot('07-lab', 2000);
await page.evaluate(() => {
  window.NOVA.set('scene', 'showroom');
  window.NOVA.set('shade', 'xray');
});
await shot('08-xray');
await browser.close();
