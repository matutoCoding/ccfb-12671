// 端到端验证: 用本机 Chrome 无头跑真实 WebGL2 仿真, 校验物理趋势
// 运行: node test/e2e.mjs
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8091;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name); }
};

const server = spawn('node', ['server.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('== 页面加载 ==');
  await page.goto(`http://localhost:${PORT}/#/sim`, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForFunction(() => typeof window.__simTest === 'function', { timeout: 10000 });
  ok(true, '仿真页加载, 测试钩子就绪');
  const glStatus = await page.$eval('#gl-status', el => el.textContent);
  ok(/就绪/.test(glStatus), `WebGL2 状态: ${glStatus}`);

  const run = (partId, patch) => page.evaluate(
    (p, q) => window.__simTest(p, q), partId, patch);

  console.log('== 平板件 (sp01 通信柜前门) ==');
  const plate = await run('sp01', {});
  ok(plate.runMs < 10000, `单次仿真 ${plate.runMs.toFixed(0)}ms < 10s`);
  ok(plate.avgUm > 30 && plate.avgUm < 250, `平均膜厚 ${plate.avgUm.toFixed(1)}μm 在合理区间`);
  ok(plate.maxUm > plate.avgUm * 1.1, `边角积粉: 最厚 ${plate.maxUm.toFixed(0)} > 平均 ${plate.avgUm.toFixed(0)}μm`);
  ok(plate.deadZonePct < 5, `平板死角占比 ${plate.deadZonePct.toFixed(1)}% < 5%`);

  console.log('== 深槽件 (sp07 走线深槽, 法拉第笼) ==');
  const deep = await run('sp07', {});
  ok(deep.deadZonePct > 5, `深槽死角占比 ${deep.deadZonePct.toFixed(1)}% > 5% (法拉第笼效应可见)`);
  ok(deep.minUm < plate.avgUm * 0.5, `深槽内壁明显薄: 最薄 ${deep.minUm.toFixed(1)}μm << 平板平均 ${plate.avgUm.toFixed(0)}μm`);
  ok(deep.warnings.some(w => w.includes('法拉第')), '给出法拉第笼工艺提示');

  console.log('== 反电离/橘皮 (枪距过近+高压) ==');
  const close = await run('sp01', { gunDistance: 80, voltage: 90 });
  ok(close.orangePeelRisk === true, `枪距80mm+90kV → 反电离风险(占比${close.orangePeelPct.toFixed(1)}%)`);
  ok(close.warnings.some(w => w.includes('橘皮')), '给出橘皮提示');
  const far = await run('sp01', { gunDistance: 250, voltage: 60 });
  ok(far.orangePeelRisk === false, '枪距250mm+60kV → 无反电离风险');

  console.log('== 出粉量/电压对膜厚的影响方向 ==');
  const more = await run('sp01', { powderOutput: 260 });
  ok(more.avgUm > plate.avgUm, `出粉量180→260 平均膜厚 ${plate.avgUm.toFixed(0)}→${more.avgUm.toFixed(0)}μm 上升`);
  const lowV = await run('sp07', { voltage: 40 });
  ok(lowV.avgUm < deep.avgUm, `深槽件降电压 平均膜厚 ${deep.avgUm.toFixed(0)}→${lowV.avgUm.toFixed(0)}μm 下降`);

  console.log('== 其它页面渲染 ==');
  for (const r of ['parts', 'booth', 'analysis', 'capacity']) {
    await page.goto(`http://localhost:${PORT}/#/${r}`, { waitUntil: 'networkidle0' });
    await new Promise(res => setTimeout(res, 300));
    const txt = await page.$eval('#app', el => el.textContent.length);
    ok(txt > 50, `#/${r} 渲染出内容 (${txt} 字符)`);
  }
  ok(errors.length === 0, errors.length ? `页面无 JS 错误(实际有: ${errors[0]})` : '页面无 JS 错误');
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
