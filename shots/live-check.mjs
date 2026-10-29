/** 线上（GitHub Pages）冒烟：确认真实域名下资源、WebGL 与交互都正常 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const URL = 'https://yaoaibing.github.io/nova-hypercar/';
const OUT = path.resolve('shots/live');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proxy = process.env.http_proxy || process.env.HTTP_PROXY;
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
if (proxy) args.push('--proxy-server=' + proxy);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errs.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText));
page.on('response', (r) => {
  if (r.status() >= 400) errs.push('HTTP' + r.status() + ': ' + r.url());
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(6000);

const info = await page.evaluate(() => ({
  nova: !!window.NOVA,
  ver: window.NOVA?.version,
  parts: window.NOVA?.parts?.length,
  fps: document.getElementById('fps')?.textContent,
  canvas: (() => {
    const c = document.getElementById('stage');
    return c ? c.width + 'x' + c.height : 'none';
  })()
}));
console.log('live:', JSON.stringify(info));
await page.screenshot({ path: path.join(OUT, 'live-01.jpg'), type: 'jpeg', quality: 74 });

await page.evaluate(() => {
  window.NOVA.set('scene', 'rain');
  window.NOVA.enterDrive('chase');
});
await sleep(1500);
await page.keyboard.down('w');
await sleep(5000);
await page.screenshot({ path: path.join(OUT, 'live-02-drive.jpg'), type: 'jpeg', quality: 74 });
const st = await page.evaluate(() => window.NOVA.driveState());
console.log('drive:', JSON.stringify(st));
await page.keyboard.up('w');

console.log('errors:', errs.length ? errs.slice(0, 8) : 'none');
await browser.close();
