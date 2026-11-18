// 喷涂仿真: 选工件+枪预设 → WebGL2 离屏仿真 → 膜厚热力图 + 干涉检查 + 追溯档案
import { el, toast, fmt, download } from '../dom.js';
import { state, saveRecords } from '../store.js';
import { Simulator, judge } from '../sim/simulate.js';
import { checkInterference } from '../interference.js';
import { uid } from '../types.js';
let simulator = null;
let lastRun = null;
export function renderSimPage(root) {
    root.replaceChildren();
    root.append(el('h2', {}, '喷涂仿真'));
    if (state.parts.length === 0) {
        root.append(el('div', { class: 'panel' }, '工件库为空, 请先在工件库导入或添加工件。'));
        return;
    }
    // --- 选择区 ---
    const ctrl = el('div', { class: 'panel' });
    const partSel = el('select');
    for (const p of state.parts)
        partSel.append(el('option', { value: p.id }, `${p.drawingNo} ${p.name} (${p.material}, 目标${p.targetThickness}μm)`));
    const presetSel = el('select');
    for (const g of state.presets)
        presetSel.append(el('option', { value: g.id }, `${g.name} [${g.type === 'reciprocator' ? '往复机' : '固定枪'} ${g.voltage}kV 枪距${g.gunDistance}mm]`));
    if (state.presets.length === 0)
        presetSel.append(el('option', {}, '(无枪预设, 请到喷房配置新增)'));
    const runBtn = el('button', { class: 'primary' }, '▶ 运行仿真');
    const reportBtn = el('button', {}, '导出膜厚报告图');
    reportBtn.disabled = true;
    ctrl.append(el('div', { class: 'row' }, el('label', { class: 'field' }, '工件', partSel), el('label', { class: 'field' }, '枪预设', presetSel), el('label', { class: 'field' }, '　', runBtn), el('label', { class: 'field' }, '　', reportBtn)));
    root.append(ctrl);
    const resultPanel = el('div', { class: 'grid cols2' });
    root.append(resultPanel);
    runBtn.onclick = () => {
        const part = state.parts.find(p => p.id === partSel.value);
        const preset = state.presets.find(g => g.id === presetSel.value);
        if (!part || !preset) {
            toast('请选择工件和枪预设', true);
            return;
        }
        try {
            if (!simulator)
                simulator = new Simulator();
            if (!simulator.ready) {
                toast('当前环境不支持浮点渲染(EXT_color_buffer_float), 无法仿真', true);
                return;
            }
            runBtn.disabled = true;
            runBtn.textContent = '计算中…';
            // 让按钮状态先渲染
            setTimeout(() => {
                try {
                    const out = simulator.run({ part, preset, conveyorSpeed: state.booth.conveyorSpeed });
                    lastRun = { out, partId: part.id, presetId: preset.id };
                    window.__lastSim = { ...out, canvas: undefined };
                    showResult(resultPanel, part.id, preset.id, out);
                    reportBtn.disabled = false;
                    // 自动生成追溯档案
                    const { verdict, reasons } = judge(out, part.targetThickness);
                    const rec = {
                        id: uid(), partId: part.id, drawingNo: part.drawingNo, workOrder: part.workOrder,
                        runAt: new Date().toISOString(),
                        gunPresetId: preset.id, gunPresetName: preset.name,
                        tankBatch: state.tanks.find(t => t.type === '磷化')?.batchNo || state.tanks[0]?.batchNo || '-',
                        avgUm: out.avgUm, minUm: out.minUm, maxUm: out.maxUm,
                        targetUm: part.targetThickness, deadZonePct: out.deadZonePct,
                        orangePeelRisk: out.orangePeelRisk, verdict, reasons,
                        material: part.material, color: part.color, qty: part.qty,
                    };
                    state.records.unshift(rec);
                    void saveRecords();
                    toast(`仿真完成, 用时 ${fmt(out.runMs / 1000, 2)}s, 判定: ${verdict}`, verdict === '不合格');
                }
                catch (e) {
                    toast('仿真失败: ' + (e instanceof Error ? e.message : String(e)), true);
                }
                finally {
                    runBtn.disabled = false;
                    runBtn.textContent = '▶ 运行仿真';
                }
            }, 30);
        }
        catch (e) {
            toast('WebGL2 初始化失败: ' + (e instanceof Error ? e.message : String(e)), true);
            runBtn.disabled = false;
        }
    };
    reportBtn.onclick = () => {
        if (!lastRun)
            return;
        const part = state.parts.find(p => p.id === lastRun.partId);
        lastRun.out.canvas.toBlob(b => {
            if (b)
                download(`膜厚报告_${part?.drawingNo || 'part'}_${Date.now()}.png`, b, 'image/png');
        }, 'image/png');
    };
    // 恢复上次结果
    if (lastRun)
        showResult(resultPanel, lastRun.partId, lastRun.presetId, lastRun.out);
    // 自动化测试钩子: 直接以指定参数跑仿真并返回结果
    window.__simTest = (partId, patch) => {
        const part = state.parts.find(p => p.id === partId);
        if (!part)
            return { error: 'no part' };
        const preset = { ...state.presets[0], ...patch };
        if (!simulator)
            simulator = new Simulator();
        const out = simulator.run({ part, preset, conveyorSpeed: state.booth.conveyorSpeed });
        return JSON.parse(JSON.stringify({ ...out, canvas: undefined }));
    };
    window.__simGrid = () => {
        if (!simulator || !simulator.lastDep || !simulator.lastDist)
            return null;
        return { dep: Array.from(simulator.lastDep), dist: Array.from(simulator.lastDist), L: simulator.lastL };
    };
}
function showResult(panel, partId, presetId, out) {
    panel.replaceChildren();
    const part = state.parts.find(p => p.id === partId);
    const preset = state.presets.find(g => g.id === presetId);
    if (!part || !preset)
        return;
    const { verdict, reasons } = judge(out, part.targetThickness);
    // 左: 热力图
    const left = el('div', { class: 'panel' });
    left.append(el('h3', {}, `膜厚热力图 — ${part.drawingNo} ${part.name}`));
    out.canvas.style.maxWidth = '100%';
    left.append(out.canvas);
    left.append(el('div', { class: 'legend' }, el('span', {}, '0'), el('span', { class: 'bar' }), el('span', {}, `${fmt(part.targetThickness * 1.8, 0)}μm`), el('span', { class: 'tag bad' }, '红=死角(上粉不足)'), el('span', { class: 'tag', style: 'color:#ff4dd2;border-color:#ff4dd2' }, '品红=反电离风险'), el('span', { class: 'tag' }, '白点=枪位')));
    left.append(el('p', { class: 'muted' }, `水平剖视图: 灰色为工件截面, 白点为喷房两侧枪排(往复机垂直行程在截面外, 经频率折算停留时间)。计算耗时 ${fmt(out.runMs / 1000, 2)}s。`));
    panel.append(left);
    // 右: 数据
    const right = el('div', {});
    const kpi = el('div', { class: 'panel' });
    kpi.append(el('h3', {}, '膜厚统计'));
    kpi.append(el('div', { class: 'kpi' }, el('b', {}, fmt(out.avgUm, 0)), el('span', {}, '平均 μm')), el('div', { class: 'kpi' }, el('b', {}, fmt(out.minUm, 0)), el('span', {}, '最薄 μm')), el('div', { class: 'kpi' }, el('b', {}, fmt(out.maxUm, 0)), el('span', {}, '最厚(边角) μm')), el('div', { class: 'kpi' }, el('b', {}, fmt(out.deadZonePct, 1) + '%'), el('span', {}, '死角占比')), el('div', { class: 'kpi' }, el('b', {}, verdict), el('span', {}, '判定')));
    if (out.warnings.length) {
        const wl = el('ul');
        for (const w of out.warnings)
            wl.append(el('li', {}, w));
        kpi.append(el('div', {}, el('h3', {}, '工艺提示'), wl));
    }
    if (reasons.length) {
        const rl = el('ul');
        for (const r of reasons)
            rl.append(el('li', {}, r));
        kpi.append(el('div', {}, el('h3', {}, '不合格原因'), rl));
    }
    right.append(kpi);
    // 干涉检查
    const inter = checkInterference(preset, part, state.booth);
    const ip = el('div', { class: 'panel' });
    ip.append(el('h3', {}, '往复机运动干涉检查'));
    if (inter.ok) {
        ip.append(el('p', {}, el('span', { class: 'tag ok' }, `通过 · 全程最小间距 ${inter.minOverall === Infinity ? '-' : fmt(inter.minOverall, 0) + 'mm'} ≥ 安全枪距 ${state.booth.safeGunDistance}mm`)));
    }
    else {
        ip.append(el('p', {}, el('span', { class: 'tag bad' }, `发现 ${inter.segments.length} 个行程段间距不足`)));
        const tbl = el('table');
        tbl.append(el('tr', {}, el('th', {}, '行程段'), el('th', {}, 'y范围mm'), el('th', {}, '最小间距mm'), el('th', {}, '干涉对象')));
        for (const s of inter.segments) {
            tbl.append(el('tr', { class: 'short' }, el('td', {}, String(s.index)), el('td', {}, `${s.yFrom} ~ ${s.yTo}`), el('td', {}, String(s.minDist)), el('td', {}, s.obstacle)));
        }
        ip.append(tbl);
        const sl = el('ul');
        for (const s of inter.suggestions)
            sl.append(el('li', {}, s));
        ip.append(el('div', {}, el('h3', {}, '调整建议'), sl));
    }
    right.append(ip);
    panel.append(right);
}
//# sourceMappingURL=simPage.js.map