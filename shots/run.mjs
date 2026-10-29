/**
 * 真机验收脚本：启动 chromium 打开站点，按场景/状态批量截图并收集运行错误。
 * 用法：node shots/run.mjs [输出目录]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:4178/';
const OUT = process.argv[2] || path.resolve('shots/out');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1600,900',
    '--disable-dev-shm-usage'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(4000);

const ready = await page.evaluate(() => !!window.NOVA);
console.log('NOVA ready:', ready);

async function shot(name, ms = 1400) {
  await sleep(ms);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}

async function set(obj) {
  await page.evaluate((o) => {
    for (const [k, v] of Object.entries(o)) window.NOVA.set(k, v);
  }, obj);
}

// 1. 展厅默认
await shot('01-showroom-default', 2500);

// 2. 三种着色
await set({ shade: 'xray' });
await shot('02-xray');
await set({ shade: 'blueprint' });
await shot('03-blueprint');
await set({ shade: 'hologram' });
await shot('04-hologram');
await set({ shade: 'surface' });

// 3. 整体拆解
await set({ explode: 0.85, explodeMode: 'all' });
await shot('05-explode-all');
await set({ explode: 0, explodeMode: 'single', selected: 'wing' });
await set({ explode: 0.7 });
await shot('06-explode-single-wing');
await set({ explode: 0, selected: null });

// 4. 尾翼 + 车门
await set({ wing: true });
await shot('07-wing-open', 1600);
await set({ doors: true });
await shot('08-doors-open', 1600);
await set({ wing: false, doors: false });

// 5. 隔离 + 流线
await set({ selected: 'powertrain', isolate: true, flow: true });
await shot('09-isolate-flow');
await set({ isolate: false, flow: false, selected: null });

// 6. 其它场景
await set({ scene: 'analysis', selected: 'powertrain' });
await shot('10-analysis');
await set({ scene: 'lab', shade: 'hologram' });
await shot('11-lab');
await set({ shade: 'surface', scene: 'rain' });
await shot('12-rain');

// 7. 驾驶：三种视角
await page.evaluate(() => window.NOVA.enterDrive('chase'));
await sleep(1200);
await page.keyboard.down('w');
await sleep(3500);
await shot('13-drive-chase', 600);
await page.evaluate(() => window.NOVA.setDriveCam('cockpit'));
await shot('14-drive-cockpit', 1200);
await page.evaluate(() => window.NOVA.setDriveCam('hood'));
await shot('15-drive-hood', 1200);
await page.keyboard.down('Shift');
await sleep(1500);
await shot('16-drive-nitro', 500);
await page.keyboard.up('Shift');

const st = await page.evaluate(() => window.NOVA.driveState());
console.log('drive state:', JSON.stringify(st));

await page.keyboard.up('w');
await page.evaluate(() => window.NOVA.exitDrive());
await sleep(1500);
await shot('17-after-exit');

// 8. 自动演示定位
await page.evaluate(() => {
  window.NOVA.set('scene', 'showroom');
  window.NOVA.demo.seek(18);
});
await shot('18-demo-seek18', 1200);

// 9. 摄影模式
await page.evaluate(() => window.NOVA.set('photo', true));
await shot('19-photo', 1000);
await page.evaluate(() => window.NOVA.set('photo', false));

const fps = await page.evaluate(() => document.getElementById('fps')?.textContent);
console.log('fps:', fps);
console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');

await browser.close();
