// 调试: 打印平板件某一行的高度场/距离场/膜厚数值
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8093;
const server = spawn('node', ['server.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/#/sim`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof window.__simTest === 'function');
  const out = await page.evaluate(() => window.__simTest('sp01', {}));
  console.log('avg', out.avgUm.toFixed(1), 'dead%', out.deadZonePct.toFixed(1));
  const g = await page.evaluate(() => {
    const { dep, dist, L } = window.__simGrid();
    const N = 512, mm = L / N;
    const j = 300; // 中间行
    const row = [];
    for (let i = 170; i <= 200; i++) {
      const d = dist[(j * N + i) * 4];
      const T = dep[(j * N + i) * 4];
      const E = dep[(j * N + i) * 4 + 1];
      const o = dep[(j * N + i) * 4 + 2];
      row.push({ px: i, d: +d.toFixed(2), T: +T.toFixed(1), E: +E.toFixed(0), open: +o.toFixed(2) });
    }
    return { mm, row };
  });
  console.log('mmPerPx', g.mm.toFixed(3));
  console.table(g.row);
} finally {
  await browser.close();
  server.kill();
}
