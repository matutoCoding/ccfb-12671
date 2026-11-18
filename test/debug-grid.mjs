// 一次性调试: 分析平板件死区分布
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8092;
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
  // 先跑一次
  await page.evaluate(() => window.__simTest('sp01', {}));
  // 直接从仿真器拿网格分析
  const analysis = await page.evaluate(() => {
    // 从 simPage 模块作用域拿不到 simulator, 重新用钩子数据
    return null;
  });
  void analysis;
  // 改用 __simGrid 钩子(若存在)
  const hasGrid = await page.evaluate(() => typeof window.__simGrid === 'function');
  if (!hasGrid) { console.log('需要 __simGrid 钩子'); }
  else {
    const g = await page.evaluate(() => {
      const { dep, dist, L } = window.__simGrid();
      const N = 512, mm = L / N;
      const rows = [];
      let deadL = 0, deadR = 0, deadT = 0, deadB = 0, totL = 0, totR = 0;
      for (let j = 0; j < N; j++) {
        let line = '';
        for (let i = 0; i < N; i += 8) {
          // 每8列采样一个字符
          let best = ' ';
          for (let ii = i; ii < i + 8; ii++) {
            const d = dist[(j * N + ii) * 4];
            if (d <= 0.001) { best = '#'; break; }
            if (d <= 2.5 * mm) {
              const T = dep[(j * N + ii) * 4];
              if (T < 48) best = 'x'; else if (best === ' ') best = '.';
            }
          }
          line += best;
        }
        if (line.trim()) rows.push(String(j).padStart(3) + ' ' + line);
      }
      // 统计左右两侧死区
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const d = dist[(j * N + i) * 4];
        if (d <= 0.001 || d > 2.5 * mm) continue;
        const T = dep[(j * N + i) * 4];
        const x = i * mm;
        if (x < L / 2) { totL++; if (T < 48) deadL++; } else { totR++; if (T < 48) deadR++; }
        void deadT; void deadB;
      }
      return { map: rows.join('\n'), deadL, totL, deadR, totR };
    });
    console.log(g.map);
    console.log(`左侧死区 ${g.deadL}/${g.totL}, 右侧死区 ${g.deadR}/${g.totR}`);
  }
} finally {
  await browser.close();
  server.kill();
}
