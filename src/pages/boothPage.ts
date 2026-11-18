// 喷房配置: 前处理 7 槽工艺卡 + 喷房参数 + 枪预设
import { el, toast, fmt } from '../dom.js';
import { state, saveTanks, savePresets, saveBooth } from '../store.js';
import { tankStatus } from '../pretreatment.js';
import { estimateAreaM2 } from '../geometry.js';
import { uid } from '../types.js';
import type { GunPreset, Tank } from '../types.js';

function numInput(value: number, onChange: (v: number) => void, step = 'any'): HTMLInputElement {
  const inp = el('input', { type: 'number', value: String(value), step });
  inp.onchange = () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) onChange(v);
    else inp.value = String(value);
  };
  return inp;
}

export function renderBoothPage(root: HTMLElement): void {
  root.replaceChildren();
  root.append(el('h2', {}, '喷房配置'));

  // ===== 前处理 7 槽 =====
  const dailyAreaM2 = state.parts.reduce((s, p) => s + estimateAreaM2(p.shape) * p.qty, 0);
  const statuses = tankStatus(state.tanks, dailyAreaM2);
  const pt = el('div', { class: 'panel' });
  pt.append(el('h3', {}, '前处理工艺卡 (7 槽)'),
    el('p', { class: 'muted' }, `按当前排产 ${fmt(dailyAreaM2, 0)} m² 自动计算槽液补充量与换槽日期; 超期槽位标黄。`));
  const tbl = el('table');
  tbl.append(el('tr', {},
    el('th', {}, '#'), el('th', {}, '槽位'), el('th', {}, '浓度%'), el('th', {}, '浸泡min'), el('th', {}, '温度℃'),
    el('th', {}, '单耗g/m²'), el('th', {}, '换槽周期天'), el('th', {}, '上次换槽'), el('th', {}, '槽液批次'),
    el('th', {}, '日补充kg'), el('th', {}, '换槽日期'), el('th', {}, '状态')));
  for (const s of statuses) {
    const t = s.tank;
    const save = () => void saveTanks();
    const tr = el('tr', s.overdue ? { class: 'overdue' } : {},
      el('td', {}, String(t.order)),
      el('td', {}, t.name),
      el('td', {}, numInput(t.concentration, v => { t.concentration = v; save(); })),
      el('td', {}, numInput(t.immersionMin, v => { t.immersionMin = v; save(); })),
      el('td', {}, numInput(t.temperature, v => { t.temperature = v; save(); })),
      el('td', {}, numInput(t.dosePerM2, v => { t.dosePerM2 = v; save(); })),
      el('td', {}, numInput(t.changeIntervalDays, v => { t.changeIntervalDays = v; save(); renderBoothPage(root); }, '1')),
      el('td', {}, dateInput(t.lastChangeDate, v => { t.lastChangeDate = v; save(); renderBoothPage(root); })),
      el('td', {}, textInput(t.batchNo, v => { t.batchNo = v; save(); })),
      el('td', {}, fmt(s.dailyReplenishKg, 2)),
      el('td', {}, s.nextChangeDate),
      el('td', {}, s.overdue
        ? el('span', { class: 'tag warn' }, `超期 ${-s.daysLeft} 天`)
        : el('span', { class: 'tag ok' }, `剩 ${s.daysLeft} 天`)));
    tbl.append(tr);
  }
  pt.append(tbl);
  root.append(pt);

  // ===== 喷房参数 =====
  const bp = el('div', { class: 'panel' });
  bp.append(el('h3', {}, '喷房与固化参数'));
  const b = state.booth;
  const row = el('div', { class: 'row' });
  row.append(
    field('链速 m/min', numInput(b.conveyorSpeed, v => { b.conveyorSpeed = v; void saveBooth(); })),
    field('每挂工件数', numInput(b.hangersPerPart, v => { b.hangersPerPart = Math.max(1, Math.round(v)); void saveBooth(); }, '1')),
    field('安全枪距 mm', numInput(b.safeGunDistance, v => { b.safeGunDistance = v; void saveBooth(); })),
    field('挂具位置 mm', numInput(b.hangerX, v => { b.hangerX = v; void saveBooth(); })),
    field('喷房宽 mm', numInput(b.boothWidth, v => { b.boothWidth = v; void saveBooth(); })),
    field('喷房高 mm', numInput(b.boothHeight, v => { b.boothHeight = v; void saveBooth(); })),
  );
  bp.append(row);
  // 粉末库存
  bp.append(el('h3', {}, '粉末库存 (kg)'));
  const stockRow = el('div', { class: 'row' });
  const colors = new Set([...Object.keys(b.powderStock), ...state.parts.map(p => p.color)]);
  for (const c of colors) {
    stockRow.append(field(c, numInput(b.powderStock[c] ?? 0, v => { b.powderStock[c] = v; void saveBooth(); })));
  }
  bp.append(stockRow);
  root.append(bp);
}

function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, label, input);
}

function dateInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const inp = el('input', { type: 'date', value });
  inp.onchange = () => { if (inp.value) onChange(inp.value); };
  return inp;
}

function textInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const inp = el('input', { value });
  inp.onchange = () => onChange(inp.value.trim());
  return inp;
}

/** 枪预设区块(独立函数, 便于仿真页复用渲染) */
export function renderGunPresets(root: HTMLElement, onChange?: () => void): void {
  root.replaceChildren();
  root.append(el('h3', {}, '喷枪预设'));
  const tbl = el('table');
  tbl.append(el('tr', {},
    el('th', {}, '名称'), el('th', {}, '类型'), el('th', {}, '枪位x mm'), el('th', {}, '枪位y mm'),
    el('th', {}, '摆幅mm'), el('th', {}, '频率次/分'), el('th', {}, '出粉量g/min'), el('th', {}, '电压kV'),
    el('th', {}, '枪距mm'), el('th', {}, '')));
  const save = () => { void savePresets(); onChange?.(); };
  for (const p of state.presets) {
    const del = el('button', { class: 'danger' }, '删除');
    del.onclick = () => {
      state.presets = state.presets.filter(x => x.id !== p.id);
      save();
      renderGunPresets(root, onChange);
    };
    const typeSel = el('select', {},
      el('option', { value: 'reciprocator' }, '往复机'),
      el('option', { value: 'fixed' }, '固定枪'));
    typeSel.value = p.type;
    typeSel.onchange = () => { p.type = typeSel.value as GunPreset['type']; save(); };
    const nameInp = el('input', { value: p.name, style: 'width:150px' });
    nameInp.onchange = () => { p.name = nameInp.value.trim() || p.name; save(); };
    tbl.append(el('tr', {},
      el('td', {}, nameInp),
      el('td', {}, typeSel),
      el('td', {}, numInput(p.x, v => { p.x = v; save(); })),
      el('td', {}, numInput(p.y, v => { p.y = v; save(); })),
      el('td', {}, numInput(p.stroke, v => { p.stroke = v; save(); })),
      el('td', {}, numInput(p.frequency, v => { p.frequency = v; save(); })),
      el('td', {}, numInput(p.powderOutput, v => { p.powderOutput = v; save(); })),
      el('td', {}, numInput(p.voltage, v => { p.voltage = v; save(); })),
      el('td', {}, numInput(p.gunDistance, v => { p.gunDistance = v; save(); })),
      el('td', {}, del)));
  }
  root.append(tbl);
  const add = el('button', {}, '+ 新增枪预设');
  add.onclick = () => {
    state.presets.push({
      id: uid(), name: '新预设', type: 'reciprocator',
      x: 250, y: 1000, stroke: 400, frequency: 30, powderOutput: 150, voltage: 60, gunDistance: 250,
    });
    save();
    renderGunPresets(root, onChange);
    toast('已新增预设');
  };
  root.append(add);
}

// 供喷房页挂载枪预设区块
export function mountGunPanel(root: HTMLElement): void {
  const gp = el('div', { class: 'panel' });
  renderGunPresets(gp);
  root.append(gp);
}

export function renderBoothPageFull(root: HTMLElement): void {
  renderBoothPage(root);
  mountGunPanel(root);
}

export type { Tank };
