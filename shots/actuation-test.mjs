/** 机械动作回归：不累加、不漂移、反复开关准确归位、不同求值路径终点一致 */
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
await sleep(4000);

const read = () =>
  page.evaluate(() => {
    const app = window.__app;
    const n = app.model.nodes;
    const s = n.wingSurface;
    const dL = n.doors.L;
    const strut = n.wingStruts[0];
    const act = n.wingActuators[0];
    const st = n.steers.wheelFL;
    const sp = n.spins.wheelFL;
    const f = (o) => (o ? [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.y] : null);
    const parts = {};
    for (const [id, p] of Object.entries(app.model.parts)) parts[id] = [p.position.x, p.position.y, p.position.z];
    return { wing: f(s), doorL: f(dL), strut: f(strut), act: f(act), steer: f(st), spin: f(sp), parts };
  });

const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(46) + detail);
};

const base = await read();

// 1. 展开尾翼
await page.evaluate(() => window.NOVA.set('wing', true));
await sleep(2600);
const opened = await read();

// 2. 保持 5 秒不继续旋转
await sleep(5000);
const held = await read();
console.log('   opened.wing =', opened.wing.map((v) => +v.toFixed(6)).join(', '));
console.log('   held.wing   =', held.wing.map((v) => +v.toFixed(6)).join(', '));
console.log('   wingP/dur   =', await page.evaluate(() => [window.__app.act.wingP, window.__app.act.wingEased]));
check('尾翼展开后保持 5s 不漂移', diff(opened.wing, held.wing) < 1e-9, 'Δ=' + diff(opened.wing, held.wing).toExponential(2));
check('支架/执行机构同步稳定', diff(opened.strut, held.strut) < 1e-9 && diff(opened.act, held.act) < 1e-9, 'Δ=' + diff(opened.strut, held.strut).toExponential(2));

// 3. 不同求值路径（pose 直接给终值）终点一致
await page.evaluate(() => window.NOVA.pose({ wing: 1 }));
await sleep(120);
const posed = await read();
console.log('   posed.wing  =', posed.wing.map((v) => +v.toFixed(6)).join(', '));
check('pose(wing=1) 与实时展开终点一致', diff(opened.wing, posed.wing) < 1e-9, 'Δ=' + diff(opened.wing, posed.wing).toExponential(2));
await page.evaluate(() => window.NOVA.set('wing', false));
await page.evaluate(() => window.NOVA.set('wing', true));
await sleep(2600);

// 4. 开关 20 次后准确归位
for (let i = 0; i < 20; i++) {
  await page.evaluate((v) => window.NOVA.set('wing', v), i % 2 === 0 ? false : true);
  await sleep(1000);
}
await page.evaluate(() => window.NOVA.set('wing', false));
await sleep(2000);
const closed = await read();
check('尾翼开关 20 次后归位', diff(base.wing, closed.wing) < 1e-9, 'Δ=' + diff(base.wing, closed.wing).toExponential(2));

// 5. 车门同样流程
await page.evaluate(() => window.NOVA.set('doors', true));
await sleep(2600);
const doorOpen = await read();
for (let i = 0; i < 20; i++) {
  await page.evaluate((v) => window.NOVA.set('doors', v), i % 2 === 0 ? false : true);
  await sleep(1000);
}
await page.evaluate(() => window.NOVA.set('doors', false));
await sleep(2000);
const doorClosed = await read();
check('车门开关 20 次后归位', diff(base.doorL, doorClosed.doorL) < 1e-9, 'Δ=' + diff(base.doorL, doorClosed.doorL).toExponential(2));
check('车门开启确实产生了位移', diff(doorOpen.doorL, base.doorL) > 0.05, 'Δ=' + diff(doorOpen.doorL, base.doorL).toFixed(4));

// 6. 拆解 → 归位
await page.evaluate(() => {
  window.NOVA.set('explode', 1);
  window.NOVA.set('explodeMode', 'all');
});
await sleep(800);
const exploded = await read();
let moved = 0;
for (const id of Object.keys(base.parts)) if (diff(base.parts[id], exploded.parts[id]) > 0.05) moved++;
check('整体拆解位移生效', moved >= 14, moved + '/17 个部件发生位移');

await page.evaluate(() => window.NOVA.set('explode', 0));
await sleep(800);
const restored = await read();
let maxErr = 0;
for (const id of Object.keys(base.parts)) maxErr = Math.max(maxErr, diff(base.parts[id], restored.parts[id]));
check('拆解归位误差', maxErr < 1e-9, 'maxΔ=' + maxErr.toExponential(2));

// 7. 拆解 + 尾翼同时作用不冲突
await page.evaluate(() => {
  window.NOVA.set('wing', true);
  window.NOVA.set('explode', 0.8);
});
await sleep(2600);
const both = await read();
await page.evaluate(() => window.NOVA.pose({ wing: 1 }));
await sleep(120);
const both2 = await read();
check('拆解状态下尾翼姿态仍为绝对值', diff(both.wing, both2.wing) < 1e-9, 'Δ=' + diff(both.wing, both2.wing).toExponential(2));

// 8. 车轮滚动由累计路程决定（同一 distance 结果一致）
await page.evaluate(() => window.NOVA.pose({ distance: 123.456 }));
await sleep(120);
const r1 = await read();
await page.evaluate(() => window.NOVA.pose({ distance: 0 }));
await page.evaluate(() => window.NOVA.pose({ distance: 123.456 }));
await sleep(120);
const r2 = await read();
check('车轮滚动角由路程唯一决定', diff(r1.spin, r2.spin) < 1e-9, 'Δ=' + diff(r1.spin, r2.spin).toExponential(2));

await page.evaluate(() => window.NOVA.reset());
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log('\n结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过');
process.exit(failed.length ? 1 : 0);
