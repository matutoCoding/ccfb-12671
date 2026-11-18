// 内置示例数据: 10 个示例工件 + 默认喷房 + 7 槽前处理 + 默认枪预设
import type { Part, GunPreset, Tank, BoothConfig } from './types.js';

export const SAMPLE_PARTS: Part[] = [
  { id: 'sp01', drawingNo: 'TXG-2024-001', name: '通信柜前门', material: '冷轧板 SPCC', color: 'RAL7035灰', targetThickness: 80, qty: 40, workOrder: 'WO2601', source: 'sample', shape: { kind: 'plate', w: 600, h: 900, t: 1.5 }, remark: '门板带折边' },
  { id: 'sp02', drawingNo: 'TXG-2024-002', name: '通信柜侧板', material: '冷轧板 SPCC', color: 'RAL7035灰', targetThickness: 80, qty: 80, workOrder: 'WO2601', source: 'sample', shape: { kind: 'plate', w: 500, h: 900, t: 1.5 } },
  { id: 'sp03', drawingNo: 'TXG-2024-007', name: '柜体框架立柱', material: 'Q235', color: 'RAL7035灰', targetThickness: 75, qty: 60, workOrder: 'WO2601', source: 'sample', shape: { kind: 'frame', w: 80, h: 80, t: 2.5 } },
  { id: 'sp04', drawingNo: 'GF-ZJ-C80', name: '光伏支架C型钢', material: 'Q235B热镀锌', color: 'RAL9006银', targetThickness: 70, qty: 200, workOrder: 'WO2602', source: 'sample', shape: { kind: 'channel', w: 80, h: 40, t: 2.5, grooveW: 18, grooveD: 44 } },
  { id: 'sp05', drawingNo: 'GF-ZJ-F60', name: '光伏支架方管立柱', material: 'Q235B热镀锌', color: 'RAL9006银', targetThickness: 70, qty: 150, workOrder: 'WO2602', source: 'sample', shape: { kind: 'tube', w: 60, h: 60, t: 3 } },
  { id: 'sp06', drawingNo: 'GF-LJ-L50', name: '连接角码', material: 'Q235', color: 'RAL9006银', targetThickness: 65, qty: 400, workOrder: 'WO2602', source: 'sample', shape: { kind: 'angle', w: 50, h: 50, t: 5 } },
  { id: 'sp07', drawingNo: 'TXG-2024-011', name: '走线深槽线槽', material: '冷轧板 SPCC', color: 'RAL7035灰', targetThickness: 80, qty: 50, workOrder: 'WO2603', source: 'sample', shape: { kind: 'deepbox', w: 120, h: 100, t: 1.5, grooveW: 45, grooveD: 78 }, remark: '深槽件, 注意槽内上粉' },
  { id: 'sp08', drawingNo: 'TXG-2024-013', name: '逆变器散热片', material: '铝 6063', color: 'RAL9005黑', targetThickness: 60, qty: 90, workOrder: 'WO2603', source: 'sample', shape: { kind: 'fin', w: 200, h: 80, t: 4, fins: 8 } },
  { id: 'sp09', drawingNo: 'GF-ZJ-Z40', name: 'Z型檩条连接件', material: 'Q235', color: 'RAL9006银', targetThickness: 65, qty: 180, workOrder: 'WO2602', source: 'sample', shape: { kind: 'zbar', w: 60, h: 40, t: 3 } },
  { id: 'sp10', drawingNo: 'TXG-2024-015', name: '柜顶盖板', material: '冷轧板 SPCC', color: 'RAL7035灰', targetThickness: 80, qty: 40, workOrder: 'WO2601', source: 'sample', shape: { kind: 'plate', w: 700, h: 500, t: 1.5 } },
];

export const DEFAULT_TANKS: Tank[] = [
  { id: 'tk1', order: 1, name: '预脱脂槽', type: '预脱脂', concentration: 3.0, immersionMin: 2, temperature: 50, capacityL: 3000, dosePerM2: 1.2, changeIntervalDays: 30, lastChangeDate: daysAgo(22), batchNo: 'TU-Z1-0619' },
  { id: 'tk2', order: 2, name: '主脱脂槽', type: '主脱脂', concentration: 4.5, immersionMin: 3, temperature: 55, capacityL: 3000, dosePerM2: 1.8, changeIntervalDays: 45, lastChangeDate: daysAgo(40), batchNo: 'TU-Z2-0601' },
  { id: 'tk3', order: 3, name: '水洗1槽', type: '水洗', concentration: 0, immersionMin: 1, temperature: 25, capacityL: 2500, dosePerM2: 0.3, changeIntervalDays: 15, lastChangeDate: daysAgo(18), batchNo: 'TU-S1-0624' },
  { id: 'tk4', order: 4, name: '酸洗槽', type: '酸洗', concentration: 8.0, immersionMin: 5, temperature: 40, capacityL: 2500, dosePerM2: 2.5, changeIntervalDays: 60, lastChangeDate: daysAgo(25), batchNo: 'TU-SX-0607' },
  { id: 'tk5', order: 5, name: '水洗2槽', type: '水洗', concentration: 0, immersionMin: 1, temperature: 25, capacityL: 2500, dosePerM2: 0.3, changeIntervalDays: 15, lastChangeDate: daysAgo(6), batchNo: 'TU-S2-0706' },
  { id: 'tk6', order: 6, name: '磷化槽', type: '磷化', concentration: 5.5, immersionMin: 4, temperature: 45, capacityL: 3000, dosePerM2: 3.2, changeIntervalDays: 90, lastChangeDate: daysAgo(70), batchNo: 'TU-LH-0503' },
  { id: 'tk7', order: 7, name: '水洗3槽', type: '水洗', concentration: 0, immersionMin: 1, temperature: 25, capacityL: 2500, dosePerM2: 0.3, changeIntervalDays: 15, lastChangeDate: daysAgo(9), batchNo: 'TU-S3-0703' },
];

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_PRESETS: GunPreset[] = [
  { id: 'gp1', name: '往复机-平板件标准', type: 'reciprocator', x: 250, y: 1000, stroke: 450, frequency: 30, powderOutput: 180, voltage: 70, gunDistance: 250 },
  { id: 'gp2', name: '往复机-深槽件低电压', type: 'reciprocator', x: 280, y: 1000, stroke: 400, frequency: 24, powderOutput: 150, voltage: 50, gunDistance: 280 },
  { id: 'gp3', name: '固定枪-小件补喷', type: 'fixed', x: 300, y: 1100, stroke: 0, frequency: 0, powderOutput: 90, voltage: 60, gunDistance: 200 },
];

export const DEFAULT_BOOTH: BoothConfig = {
  conveyorSpeed: 2.0,
  hangersPerPart: 2,
  safeGunDistance: 150,
  hangerX: 550,
  boothWidth: 1200,
  boothHeight: 2000,
  powderStock: { 'RAL7035灰': 120, 'RAL9006银': 80, 'RAL9005黑': 45 },
};
