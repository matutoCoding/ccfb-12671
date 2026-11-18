// 工件库: CSV 导入 / 同图号合并 / 挂起行人工处理 / 工件列表
import { el, toast } from '../dom.js';
import { importCSV, parseThickness, parseMaterial, guessShape } from '../csv.js';
import { state, saveParts, savePending, deletePending, deletePart } from '../store.js';
import { estimateAreaM2 } from '../geometry.js';
import { uid } from '../types.js';
import type { PendingRow } from '../types.js';

export function renderPartsPage(root: HTMLElement): void {
  root.replaceChildren();
  root.append(el('h2', {}, '工件库'));

  // --- CSV 导入 ---
  const dz = el('div', { class: 'dropzone' }, '把客户加工明细表 CSV 拖到这里, 或 ');
  const fileBtn = el('button', {}, '选择文件');
  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: 'display:none' });
  fileBtn.onclick = () => fileInput.click();
  dz.append(fileBtn, fileInput);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => {
    e.preventDefault(); dz.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) readFile(f);
  };
  fileInput.onchange = () => { const f = fileInput.files?.[0]; if (f) readFile(f); fileInput.value = ''; };

  function readFile(f: File): void {
    const reader = new FileReader();
    reader.onerror = () => toast('文件读取失败', true);
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const res = importCSV(text, state.parts);
        if (res.error) { toast(`导入失败: ${res.error}`, true); return; }
        state.parts.push(...res.parts);
        state.pending.push(...res.pending);
        void saveParts().then(savePending);
        toast(`导入完成: ${res.totalRows} 行, 新增 ${res.parts.length} 种工件, 合并 ${res.merged} 行, 挂起 ${res.pending.length} 行`);
        renderPartsPage(root);
      } catch (e) {
        toast('导入出错: ' + (e instanceof Error ? e.message : String(e)), true);
      }
    };
    // 破损文件(二进制等)按文本读, 解析阶段自然挂起, 不会崩页面
    reader.readAsText(f, 'utf-8');
  }

  const p1 = el('div', { class: 'panel' });
  p1.append(el('h3', {}, '导入客户加工明细表 (CSV)'), dz,
    el('p', { class: 'muted' }, '表头自动识别: 图号/名称/数量/材质/颜色/工单/备注。同一图号自动合并数量; 材质和期望膜厚从备注列解析(如"膜厚80μm Q235"); 识别不出的行挂起等人工处理。'));
  root.append(p1);

  // --- 挂起行 ---
  if (state.pending.length > 0) {
    const pp = el('div', { class: 'panel' });
    pp.append(el('h3', {}, `待人工处理 (${state.pending.length} 行)`));
    const tbl = el('table');
    tbl.append(el('tr', {}, el('th', {}, '原始数据'), el('th', {}, '挂起原因'), el('th', {}, '图号'), el('th', {}, '名称'), el('th', {}, '数量'), el('th', {}, '材质'), el('th', {}, '膜厚μm'), el('th', {}, '操作')));
    for (const row of state.pending) {
      tbl.append(pendingRow(row));
    }
    pp.append(tbl);
    root.append(pp);
  }

  // --- 工件列表 ---
  const pw = el('div', { class: 'panel' });
  pw.append(el('h3', {}, `工件清单 (${state.parts.length} 种, 共 ${state.parts.reduce((s, p) => s + p.qty, 0)} 件)`));
  const tbl = el('table');
  tbl.append(el('tr', {},
    el('th', {}, '图号'), el('th', {}, '名称'), el('th', {}, '材质'), el('th', {}, '颜色'),
    el('th', {}, '目标膜厚'), el('th', {}, '数量'), el('th', {}, '单件面积m²'), el('th', {}, '工单'), el('th', {}, '来源'), el('th', {}, '')));
  for (const p of state.parts) {
    const del = el('button', { class: 'danger' }, '删除');
    del.onclick = () => { void deletePart(p.id).then(() => renderPartsPage(root)); };
    tbl.append(el('tr', {},
      el('td', {}, p.drawingNo), el('td', {}, p.name), el('td', {}, p.material), el('td', {}, p.color),
      el('td', {}, `${p.targetThickness}μm`), el('td', {}, String(p.qty)),
      el('td', {}, estimateAreaM2(p.shape).toFixed(2)),
      el('td', {}, p.workOrder || '-'), el('td', {}, p.source === 'sample' ? '示例' : p.source === 'csv' ? 'CSV' : '手工'),
      el('td', {}, del)));
  }
  pw.append(tbl);
  root.append(pw);
}

function pendingRow(row: PendingRow): HTMLTableRowElement {
  const rawText = Object.entries(row.raw).map(([k, v]) => `${k}:${v}`).join(' | ') || '(空行)';
  const inD = el('input', { value: row.raw['图号'] || row.raw['编号'] || '', placeholder: '图号' });
  const inN = el('input', { value: row.raw['名称'] || row.raw['品名'] || '', placeholder: '名称' });
  const inQ = el('input', { type: 'number', value: row.raw['数量']?.replace(/[^\d]/g, '') || '', placeholder: '数量' });
  const inM = el('input', { value: parseMaterial(Object.values(row.raw).join(' ')) || '', placeholder: '材质' });
  const inT = el('input', { type: 'number', value: String(parseThickness(Object.values(row.raw).join(' ')) ?? ''), placeholder: 'μm' });
  const ok = el('button', { class: 'primary' }, '确认');
  const del = el('button', { class: 'danger' }, '丢弃');
  ok.onclick = () => {
    const drawingNo = inD.value.trim() || inN.value.trim();
    const qty = parseInt(inQ.value, 10);
    if (!drawingNo) { toast('图号和名称至少填一个', true); return; }
    if (!Number.isFinite(qty) || qty <= 0) { toast('数量必须是正整数', true); return; }
    const exist = state.parts.find(p => p.drawingNo === drawingNo);
    if (exist) exist.qty += qty;
    else state.parts.push({
      id: uid(), drawingNo, name: inN.value.trim() || drawingNo,
      material: inM.value.trim() || '未知材质', color: 'RAL7035灰',
      targetThickness: parseInt(inT.value, 10) || 75, qty,
      shape: guessShape(inN.value, ''), source: 'manual', workOrder: row.raw['工单'] || undefined,
    });
    void deletePending(row.id).then(saveParts);
    toast('已并入工件清单');
    renderPartsPage(document.getElementById('app')!);
  };
  del.onclick = () => {
    void deletePending(row.id).then(() => renderPartsPage(document.getElementById('app')!));
  };
  const tr = el('tr', { class: 'pending' },
    el('td', {}, el('span', { class: 'muted' }, rawText.slice(0, 80))),
    el('td', {}, row.reason),
    el('td', {}, inD), el('td', {}, inN), el('td', {}, inQ), el('td', {}, inM), el('td', {}, inT),
    el('td', {}, ok, ' ', del));
  return tr;
}
