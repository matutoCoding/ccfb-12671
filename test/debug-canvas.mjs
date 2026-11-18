// 调试: 确认热力图画布真实渲染(非全黑)
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8094;
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
  // 通过 UI 按钮跑一次(走完整流程: 渲染+存档)
  await page.select('select', 'sp07');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find(b => b.textContent.includes('运行仿真'))?.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas.sim');
    if (!c) return { error: 'no canvas in DOM' };
    const g = c.getContext('webgl2');
    const px = new Uint8Array(4 * 512 * 512);
    g.readPixels(0, 0, 512, 512, g.RGBA, g.UNSIGNED_BYTE, px);
    let nonBg = 0, red = 0, sum = 0;
    for (let i = 0; i < 512 * 512; i++) {
      const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
      sum += r + gg + b;
      if (r + gg + b > 60) nonBg++;
      if (r > 200 && gg < 80 && b < 80) red++;
    }
    return { nonBg, red, mean: sum / (512 * 512 * 3) };
  });
  console.log('画布像素统计:', JSON.stringify(stats));
  console.log(stats.nonBg > 5000 ? '✓ 热力图有内容' : '✗ 热力图接近空白');
  console.log(stats.red > 50 ? '✓ 深槽死角标红可见' : '✗ 未见红色死角');
  // 追溯档案是否自动生成
  const rec = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 500));
    location.hash = '#/analysis';
    await new Promise(r => setTimeout(r, 500));
    return document.getElementById('app').textContent.includes('TXG-2024-011');
  });
  console.log(rec ? '✓ 追溯档案已生成并可检索' : '✗ 追溯档案未生成');
} finally {
  await browser.close();
  server.kill();
}
