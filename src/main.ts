// 入口: 路由 + 启动
import { loadState } from './store.js';
import { renderPartsPage } from './pages/partsPage.js';
import { renderBoothPageFull } from './pages/boothPage.js';
import { renderSimPage } from './pages/simPage.js';
import { renderAnalysisPage } from './pages/analysisPage.js';
import { renderCapacityPage } from './pages/capacityPage.js';
import { initGL } from './sim/gl.js';

const routes: Record<string, (root: HTMLElement) => void> = {
  parts: renderPartsPage,
  booth: renderBoothPageFull,
  sim: renderSimPage,
  analysis: renderAnalysisPage,
  capacity: renderCapacityPage,
};

function route(): void {
  const hash = location.hash.replace(/^#\//, '') || 'parts';
  const name = routes[hash] ? hash : 'parts';
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', (a as HTMLAnchorElement).dataset.route === name);
  });
  const app = document.getElementById('app')!;
  try {
    routes[name](app);
  } catch (e) {
    app.replaceChildren();
    app.append(`页面渲染出错: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  }
}

async function main(): Promise<void> {
  // WebGL2 状态指示
  const probe = document.createElement('canvas');
  const ctx = initGL(probe);
  const glStatus = document.getElementById('gl-status')!;
  if (!ctx) {
    glStatus.textContent = 'WebGL2 不可用, 仿真功能受限';
    glStatus.classList.add('bad');
  } else if (!ctx.floatOK) {
    glStatus.textContent = 'WebGL2 可用, 但缺少浮点渲染扩展, 仿真不可用';
    glStatus.classList.add('bad');
  } else {
    glStatus.textContent = 'WebGL2 离屏加速: 就绪';
  }

  try {
    await loadState();
  } catch (e) {
    console.error('IndexedDB 加载失败, 使用内存数据', e);
    // 隐私模式等场景 IndexedDB 不可用时页面仍可用
    const { SAMPLE_PARTS, DEFAULT_PRESETS, DEFAULT_TANKS } = await import('./samples.js');
    const { state } = await import('./store.js');
    state.parts = SAMPLE_PARTS.map(p => ({ ...p }));
    state.presets = DEFAULT_PRESETS.map(p => ({ ...p }));
    state.tanks = DEFAULT_TANKS.map(t => ({ ...t }));
  }

  window.addEventListener('hashchange', route);
  route();
}

void main();
