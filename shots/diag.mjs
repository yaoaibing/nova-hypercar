/** 几何自检：包围盒 + 面法线朝外比例 + 逐子网格越界检查 */
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

const res = await page.evaluate(() => {
  const app = window.__app;
  const parts = app.model.parts;
  const report = [];
  for (const [id, obj] of Object.entries(parts)) {
    obj.updateWorldMatrix(true, true);
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    let outDot = 0, nDot = 0;
    const subs = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const nor = o.geometry.attributes.normal;
      let smin = [1e9, 1e9, 1e9], smax = [-1e9, -1e9, -1e9];
      let cx = 0, cy = 0, cz = 0;
      const local = [];
      for (let i = 0; i < pos.count; i++) {
        const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        local.push(v);
        cx += v[0]; cy += v[1]; cz += v[2];
      }
      cx /= pos.count; cy /= pos.count; cz /= pos.count;
      for (let i = 0; i < pos.count; i++) {
        const v = local[i];
        const m = o.matrixWorld.elements;
        const w = [
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
        ];
        for (let k = 0; k < 3; k++) {
          smin[k] = Math.min(smin[k], w[k]);
          smax[k] = Math.max(smax[k], w[k]);
        }
        minX = Math.min(minX, w[0]); maxX = Math.max(maxX, w[0]);
        minY = Math.min(minY, w[1]); maxY = Math.max(maxY, w[1]);
        minZ = Math.min(minZ, w[2]); maxZ = Math.max(maxZ, w[2]);
        if (nor) {
          const d = (v[0] - cx) * nor.getX(i) + (v[1] - cy) * nor.getY(i) + (v[2] - cz) * nor.getZ(i);
          if (Math.abs(d) > 1e-6) { outDot += d > 0 ? 1 : 0; nDot++; }
        }
      }
      subs.push({ role: o.userData.role, n: pos.count, box: smin.map((x, i) => [+x.toFixed(2), +smax[i].toFixed(2)]) });
    });
    report.push({
      id,
      box: [minX, minY, minZ, maxX, maxY, maxZ].map((n) => +n.toFixed(2)),
      outward: nDot ? +(outDot / nDot).toFixed(2) : null,
      subs
    });
  }
  return report;
});

const LIMIT = { x: 1.35, yMin: -0.06, yMax: 1.45, zMin: -2.75, zMax: 2.85 };
console.log('part        outward  bbox(minX,minY,minZ → maxX,maxY,maxZ)');
for (const r of res) {
  const b = r.box;
  const bad = Math.abs(b[0]) > LIMIT.x || Math.abs(b[3]) > LIMIT.x || b[1] < LIMIT.yMin || b[4] > LIMIT.yMax || b[2] < LIMIT.zMin || b[5] > LIMIT.zMax;
  console.log(
    r.id.padEnd(11),
    String(r.outward).padStart(6),
    ' ',
    b.join(', ').padEnd(40),
    bad ? '<== 越界' : ''
  );
}
console.log('\n-- 子网格细节（只看越界/异常） --');
for (const r of res) {
  for (const s of r.subs) {
    const [xr, yr, zr] = s.box;
    if (xr[0] < -1.35 || xr[1] > 1.35 || yr[0] < -0.06 || yr[1] > 1.45 || zr[0] < -2.75 || zr[1] > 2.85) {
      console.log(r.id.padEnd(11), String(s.role).padEnd(9), 'n=' + String(s.n).padEnd(5), JSON.stringify(s.box));
    }
  }
}
await browser.close();
