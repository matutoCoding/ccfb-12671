// 结果分析: 喷涂追溯档案检索 + 返工清单
import { el, download, fmt } from '../dom.js';
import { state } from '../store.js';
import { reworkToCSV } from '../costing.js';

export function renderAnalysisPage(root: HTMLElement): void {
  root.replaceChildren();
  root.append(el('h2', {}, '结果分析'));

  const bad = state.records.filter(r => r.verdict === '不合格');
  const kpis = el('div', { class: 'panel' });
  kpis.append(
    el('div', { class: 'kpi' }, el('b', {}, String(state.records.length)), el('span', {}, '追溯档案')),
    el('div', { class: 'kpi' }, el('b', {}, String(bad.length)), el('span', {}, '不合格(返工)')),
    el('div', { class: 'kpi' }, el('b', {}, state.records.length ? fmt(100 * bad.length / state.records.length, 1) + '%' : '-'), el('span', {}, '返工率')),
  );
  root.append(kpis);

  // --- 检索 ---
  const sp = el('div', { class: 'panel' });
  const q = el('input', { placeholder: '按图号或工单号搜索, 如 TXG-2024-001 / WO2601', style: 'width:340px' });
  const resultDiv = el('div');
  sp.append(el('h3', {}, '追溯档案检索'), q, resultDiv);
  root.append(sp);

  const doSearch = () => {
    const kw = q.value.trim().toLowerCase();
    const hits = kw
      ? state.records.filter(r => r.drawingNo.toLowerCase().includes(kw) || (r.workOrder || '').toLowerCase().includes(kw))
      : state.records;
    resultDiv.replaceChildren(recordTable(hits.slice(0, 50)));
    if (kw && hits.length === 0) resultDiv.append(el('p', { class: 'muted' }, '没有匹配的档案'));
  };
  q.oninput = doSearch;
  doSearch();

  // --- 返工清单 ---
  const rp = el('div', { class: 'panel' });
  rp.append(el('h3', {}, `返工清单 (${bad.length} 项)`));
  if (bad.length === 0) {
    rp.append(el('p', { class: 'muted' }, '暂无不合格记录。跑一遍仿真后, 判定不合格的工件会自动汇总到这里。'));
  } else {
    const tbl = el('table');
    tbl.append(el('tr', {}, el('th', {}, '图号'), el('th', {}, '工单'), el('th', {}, '数量'), el('th', {}, '不合格原因'), el('th', {}, '时间')));
    for (const r of bad) {
      tbl.append(el('tr', { class: 'short' },
        el('td', {}, r.drawingNo), el('td', {}, r.workOrder || '-'), el('td', {}, String(r.qty)),
        el('td', {}, r.reasons.join('; ')), el('td', {}, r.runAt.slice(0, 19).replace('T', ' '))));
    }
    rp.append(tbl);
    const exp = el('button', {}, '导出返工清单 CSV');
    exp.onclick = () => download(`返工清单_${new Date().toISOString().slice(0, 10)}.csv`, reworkToCSV(state.records), 'text/csv');
    rp.append(el('p', {}, exp));
  }
  root.append(rp);
}

function recordTable(records: typeof state.records): HTMLElement {
  if (records.length === 0) return el('p', { class: 'muted' }, '暂无记录');
  const tbl = el('table');
  tbl.append(el('tr', {},
    el('th', {}, '图号'), el('th', {}, '工单'), el('th', {}, '枪预设'), el('th', {}, '槽液批次'),
    el('th', {}, '平均μm'), el('th', {}, '最薄μm'), el('th', {}, '死角%'), el('th', {}, '判定'), el('th', {}, '时间')));
  for (const r of records) {
    tbl.append(el('tr', r.verdict === '不合格' ? { class: 'short' } : {},
      el('td', {}, r.drawingNo), el('td', {}, r.workOrder || '-'), el('td', {}, r.gunPresetName),
      el('td', {}, r.tankBatch), el('td', {}, fmt(r.avgUm, 0)), el('td', {}, fmt(r.minUm, 0)),
      el('td', {}, fmt(r.deadZonePct, 1)),
      el('td', {}, el('span', { class: r.verdict === '合格' ? 'tag ok' : 'tag bad' }, r.verdict)),
      el('td', {}, r.runAt.slice(0, 19).replace('T', ' '))));
  }
  return tbl;
}
