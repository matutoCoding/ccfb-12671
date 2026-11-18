// 产能核算: 分批合并 / 粉末库存核对 / 四块成本 / CSV+JSON 导出
import { el, toast, download, fmt } from '../dom.js';
import { state } from '../store.js';
import { makeBatches, batchCost, reworkRateFromRecords, batchesToCSV } from '../costing.js';
import { exportAll, importAll } from '../db.js';
import { loadState } from '../store.js';
export function renderCapacityPage(root) {
    root.replaceChildren();
    root.append(el('h2', {}, '产能核算'));
    const batches = makeBatches(state.parts, state.booth.powderStock);
    const reworkRate = reworkRateFromRecords(state.records);
    // --- 分批 ---
    const bp = el('div', { class: 'panel' });
    bp.append(el('h3', {}, `整班分批 (同色同材质集中进炉, 共 ${batches.length} 批)`), el('p', { class: 'muted' }, `返工率按追溯记录估算: ${fmt(reworkRate * 100, 1)}%。粉桶剩余量不够的批次已标红, 请先领料。`));
    if (batches.length === 0) {
        bp.append(el('p', { class: 'muted' }, '没有可排产的工件。'));
    }
    else {
        const tbl = el('table');
        tbl.append(el('tr', {}, el('th', {}, '批次'), el('th', {}, '颜色'), el('th', {}, '材质'), el('th', {}, '工件(图号×数量)'), el('th', {}, '总件数'), el('th', {}, '总面积m²'), el('th', {}, '需粉kg'), el('th', {}, '库存kg'), el('th', {}, '状态')));
        for (const b of batches) {
            tbl.append(el('tr', b.shortage ? { class: 'short' } : {}, el('td', {}, b.id.slice(-6)), el('td', {}, b.color), el('td', {}, b.material), el('td', {}, b.parts.map(p => `${p.drawingNo}×${p.qty}`).join(' ')), el('td', {}, String(b.totalQty)), el('td', {}, fmt(b.totalAreaM2, 1)), el('td', {}, fmt(b.powderNeedKg, 1)), el('td', {}, fmt(b.powderStockKg, 1)), el('td', {}, b.shortage ? el('span', { class: 'tag bad' }, '缺料, 请领料') : el('span', { class: 'tag ok' }, '充足'))));
        }
        bp.append(tbl);
    }
    root.append(bp);
    // --- 成本 ---
    const cp = el('div', { class: 'panel' });
    cp.append(el('h3', {}, '成本拆分 (粉末 / 槽液药剂 / 固化能耗 / 返工损耗)'));
    if (batches.length > 0) {
        const tbl = el('table');
        tbl.append(el('tr', {}, el('th', {}, '批次'), el('th', {}, '粉末元'), el('th', {}, '药剂元'), el('th', {}, '能耗元'), el('th', {}, '返工损耗元'), el('th', {}, '合计元'), el('th', {}, '单件元')));
        let tot = { powder: 0, chemical: 0, energy: 0, reworkLoss: 0, total: 0 };
        for (const b of batches) {
            const c = batchCost(b, state.tanks, reworkRate);
            tot = { powder: tot.powder + c.powder, chemical: tot.chemical + c.chemical, energy: tot.energy + c.energy, reworkLoss: tot.reworkLoss + c.reworkLoss, total: tot.total + c.total };
            tbl.append(el('tr', {}, el('td', {}, `${b.color} ${b.material}`), el('td', {}, fmt(c.powder, 0)), el('td', {}, fmt(c.chemical, 0)), el('td', {}, fmt(c.energy, 0)), el('td', {}, fmt(c.reworkLoss, 0)), el('td', {}, fmt(c.total, 0)), el('td', {}, fmt(c.total / Math.max(1, b.totalQty), 2))));
        }
        tbl.append(el('tr', {}, el('td', {}, el('b', {}, '合计')), el('td', {}, el('b', {}, fmt(tot.powder, 0))), el('td', {}, el('b', {}, fmt(tot.chemical, 0))), el('td', {}, el('b', {}, fmt(tot.energy, 0))), el('td', {}, el('b', {}, fmt(tot.reworkLoss, 0))), el('td', {}, el('b', {}, fmt(tot.total, 0))), el('td', {}, '')));
        cp.append(tbl);
        const exp = el('button', { class: 'primary' }, '导出成本 CSV 给车间');
        exp.onclick = () => download(`产能成本_${new Date().toISOString().slice(0, 10)}.csv`, batchesToCSV(batches, state.tanks, reworkRate), 'text/csv');
        cp.append(el('p', {}, exp));
    }
    root.append(cp);
    // --- 方案打包 ---
    const xp = el('div', { class: 'panel' });
    xp.append(el('h3', {}, '方案打包 (不依赖后端, 文件直接发给车间)'));
    const expJson = el('button', {}, '导出方案 JSON');
    expJson.onclick = () => {
        void exportAll().then(data => {
            download(`喷涂方案_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
        });
    };
    const impJson = el('button', {}, '导入方案 JSON');
    const impInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    impJson.onclick = () => impInput.click();
    impInput.onchange = () => {
        const f = impInput.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result));
                if (!data || typeof data !== 'object')
                    throw new Error('不是有效的 JSON');
                void importAll(data).then(() => loadState()).then(() => {
                    toast('方案导入完成');
                    renderCapacityPage(root);
                });
            }
            catch (e) {
                toast('导入失败: ' + (e instanceof Error ? e.message : String(e)), true);
            }
        };
        reader.onerror = () => toast('文件读取失败', true);
        reader.readAsText(f);
        impInput.value = '';
    };
    xp.append(el('div', { class: 'row' }, expJson, impJson, impInput));
    root.append(xp);
}
//# sourceMappingURL=capacityPage.js.map