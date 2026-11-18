import { estimateAreaM2 } from './geometry.js';
import { uid } from './types.js';
export const PRICES = {
    powderPerKg: 25, // 粉末 元/kg
    chemicalPerKg: 8, // 槽液药剂 元/kg
    energyPerKwh: 1.0, // 电 元/kWh
    powderDensity: 1.5e-3, // kg/(m²·μm)  粉末堆积密度折算
    utilization: 0.65, // 上粉率(回收后)
    kwhPerM2: 0.6, // 固化能耗 kWh/m²
};
/** 整班订单按颜色+材质分批 */
export function makeBatches(parts, powderStock) {
    const groups = new Map();
    for (const p of parts) {
        if (p.qty <= 0)
            continue;
        const key = `${p.color}|${p.material}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(p);
    }
    const batches = [];
    for (const [key, ps] of groups) {
        const [color, material] = key.split('|');
        const items = ps.map(p => ({ partId: p.id, drawingNo: p.drawingNo, qty: p.qty, areaM2: estimateAreaM2(p.shape) * p.qty }));
        const totalArea = items.reduce((s, i) => s + i.areaM2, 0);
        const avgT = ps.reduce((s, p) => s + p.targetThickness * p.qty, 0) / ps.reduce((s, p) => s + p.qty, 0);
        const needKg = totalArea * avgT * PRICES.powderDensity / PRICES.utilization;
        const stock = powderStock[color] ?? 0;
        batches.push({
            id: uid(), key, color, material, parts: items,
            totalQty: items.reduce((s, i) => s + i.qty, 0),
            totalAreaM2: totalArea,
            powderNeedKg: needKg,
            powderStockKg: stock,
            shortage: needKg > stock,
        });
    }
    return batches.sort((a, b) => a.color.localeCompare(b.color));
}
/** 单批次四块成本 */
export function batchCost(b, tanks, reworkRate) {
    const powderKg = b.powderNeedKg;
    const chemKg = b.totalAreaM2 * tanks.reduce((s, t) => s + t.dosePerM2, 0) / 1000;
    const energyKwh = b.totalAreaM2 * PRICES.kwhPerM2;
    const powder = powderKg * PRICES.powderPerKg;
    const chemical = chemKg * PRICES.chemicalPerKg;
    const energy = energyKwh * PRICES.energyPerKwh;
    const reworkLoss = (powder + chemical + energy) * reworkRate;
    return { powder, chemical, energy, reworkLoss, total: powder + chemical + energy + reworkLoss };
}
/** 从追溯记录统计返工率(无记录时按默认 5%) */
export function reworkRateFromRecords(records) {
    if (records.length < 5)
        return 0.05;
    const bad = records.filter(r => r.verdict === '不合格').length;
    return Math.min(0.5, Math.max(0.01, bad / records.length));
}
/** 导出车间 CSV(带 BOM 便于 Excel 打开) */
export function batchesToCSV(batches, tanks, reworkRate) {
    const lines = ['批次,颜色,材质,工件图号,数量,面积m2,粉末kg,粉末成本,药剂成本,能耗成本,返工损耗,合计,库存状态'];
    for (const b of batches) {
        const c = batchCost(b, tanks, reworkRate);
        const f = (n) => n.toFixed(2);
        lines.push([
            b.id.slice(-6), b.color, b.material,
            `"${b.parts.map(p => `${p.drawingNo}x${p.qty}`).join(' ')}"`,
            b.totalQty, f(b.totalAreaM2), f(b.powderNeedKg),
            f(c.powder), f(c.chemical), f(c.energy), f(c.reworkLoss), f(c.total),
            b.shortage ? `缺料(库存${b.powderStockKg.toFixed(1)}kg)` : '充足',
        ].join(','));
    }
    return '﻿' + lines.join('\r\n');
}
/** 返工清单 CSV */
export function reworkToCSV(records) {
    const lines = ['图号,工单号,名称,数量,判定,不合格原因,时间'];
    for (const r of records.filter(x => x.verdict === '不合格')) {
        lines.push([r.drawingNo, r.workOrder || '', r.gunPresetName, r.qty, r.verdict,
            `"${r.reasons.join(';')}"`, r.runAt.slice(0, 19).replace('T', ' ')].join(','));
    }
    return '﻿' + lines.join('\r\n');
}
//# sourceMappingURL=costing.js.map