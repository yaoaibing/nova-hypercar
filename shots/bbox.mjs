/** 逐部件包围盒诊断：找出飞出车体的部件 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });
await page.goto('http://127.0.0.1:4178/', { waitUntil: 'networkidle2' });
await sleep(3500);

const data = await page.evaluate(() => {
  const THREE = window.__app.model.root.parent.constructor;
  void THREE;
  const app = window.__app;
  const parts = app.model.parts;
  const out = {};
  // eslint-disable-next-line
  const Box3 = app.constructor.__box || null;
  void Box3;
  for (const [id, obj] of Object.entries(parts)) {
    obj.updateWorldMatrix(true, true);
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g.attributes.position) return;
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
        const m = o.matrixWorld.elements;
        const w = {
          x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
          y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
          z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14]
        };
        minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
        minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
        minZ = Math.min(minZ, w.z); maxZ = Math.max(maxZ, w.z);
      }
    });
    out[id] = [minX, minY, minZ, maxX, maxY, maxZ].map((n) => +n.toFixed(2));
  }
  return out;
});

console.log('part'.padEnd(12), 'minX  minY  minZ | maxX  maxY  maxZ');
for (const [k, v] of Object.entries(data)) {
  const flag = v[0] < -1.35 || v[3] > 1.35 || v[1] < -0.05 || v[4] > 1.45 || v[2] < -2.75 || v[5] > 2.85;
  console.log(k.padEnd(12), String(v[0]).padStart(5), String(v[1]).padStart(5), String(v[2]).padStart(5), '|', String(v[3]).padStart(5), String(v[4]).padStart(5), String(v[5]).padStart(5), flag ? '  <== 越界' : '');
}
await browser.close();
