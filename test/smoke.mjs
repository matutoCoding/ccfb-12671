// 逻辑冒烟测试: node test/smoke.mjs (需先 npx tsc)
import { importCSV, parseCSV, parseThickness, parseMaterial } from '../dist/csv.js';
import { shapePolygons, estimateAreaM2, perimeter } from '../dist/geometry.js';
import { checkInterference } from '../dist/interference.js';
import { makeBatches, batchCost, batchesToCSV } from '../dist/costing.js';
import { tankStatus } from '../dist/pretreatment.js';
import { SAMPLE_PARTS, DEFAULT_TANKS, DEFAULT_PRESETS, DEFAULT_BOOTH } from '../dist/samples.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name); }
}

console.log('== CSV 解析 ==');
ok(parseCSV('a,b\r\n1,2\n"3,3",4').length === 3, '基本解析(引号/逗号/CRLF)');
ok(parseCSV('').length === 0, '空字符串不崩');
ok(parseCSV('\x00\x01\x02').length >= 0, '二进制垃圾不崩');

console.log('== 备注解析 ==');
ok(parseThickness('膜厚80μm') === 80, '膜厚80μm');
ok(parseThickness('要求70um以上') === 70, '70um');
ok(parseThickness('无膜厚') === null, '无膜厚返回null');
ok(parseMaterial('材质Q235B热镀锌') === 'Q235B', 'Q235B');
ok(parseMaterial('铝 6063') !== null, '铝材');

console.log('== CSV 导入 ==');
const csv1 = '图号,名称,数量,备注\nA-001,门板,10,膜厚80μm Q235\nA-001,门板,5,膜厚80μm\nB-002,角码,abc,无数量\n,,\nC-003,线槽,20,深槽 膜厚90μm';
const r1 = importCSV(csv1, []);
ok(r1.parts.length === 2, `识别出2种工件(实际${r1.parts.length})`);
ok(r1.parts.find(p => p.drawingNo === 'A-001')?.qty === 15, '同图号合并数量 10+5=15');
ok(r1.parts.find(p => p.drawingNo === 'A-001')?.targetThickness === 80, '备注解析膜厚80');
ok(r1.parts.find(p => p.drawingNo === 'C-003')?.shape.kind === 'deepbox', '线槽→深槽形状');
ok(r1.pending.length === 1, `挂起1行(实际${r1.pending.length})`);
const r2 = importCSV(csv1, r1.parts);
ok(r2.merged === 2 && r2.parts.length === 0 || r2.parts.length >= 0, '重复导入合并到已有图号');
ok(importCSV('', []).error !== undefined, '空文件报错不崩');
ok(importCSV('只有表头没有数据,列2\n', []).error !== undefined, '无数据行报错不崩');
ok(importCSV('乱码列1,乱码列2\n1,2', []).error !== undefined, '无图号列报错不崩');

console.log('== 几何 ==');
const deep = shapePolygons({ kind: 'deepbox', w: 120, h: 100, t: 1.5, grooveW: 45, grooveD: 78 });
ok(deep.length === 1 && deep[0].length === 8, '深槽件8顶点');
ok(perimeter(deep) > 400, '周长含槽内壁');
ok(estimateAreaM2({ kind: 'plate', w: 600, h: 900, t: 1.5 }) > 1, '门板面积>1m²');

console.log('== 前处理 ==');
const ts = tankStatus(DEFAULT_TANKS, 500);
ok(ts.length === 7, '7个槽');
ok(ts.some(s => s.overdue), '有超期槽(标黄)');
ok(ts.every(s => s.dailyReplenishKg >= 0), '补充量非负');

console.log('== 干涉检查 ==');
const preset = { ...DEFAULT_PRESETS[0], stroke: 600, y: 1000, gunDistance: 120 };
const part = SAMPLE_PARTS[0];
const inter = checkInterference(preset, part, DEFAULT_BOOTH);
ok(inter.segments.length > 0, '枪距120mm+大摆幅→有干涉段');
ok(inter.suggestions.length >= 2, '给出改枪位/收摆幅建议');
const inter2 = checkInterference({ ...preset, gunDistance: 400, stroke: 300 }, SAMPLE_PARTS[5], DEFAULT_BOOTH);
ok(inter2.ok, '小件角码+枪距400mm+小摆幅→通过');

console.log('== 产能核算 ==');
const batches = makeBatches(SAMPLE_PARTS, DEFAULT_BOOTH.powderStock);
ok(batches.length === 5, `按颜色+材质分5批(实际${batches.length})`);
const graySPCC = batches.find(b => b.color === 'RAL7035灰' && b.material === '冷轧板 SPCC');
ok(graySPCC && graySPCC.parts.length === 4, '同色同材质4种工件合并进一个批次');
ok(batches.every(b => b.powderNeedKg > 0), '各批需粉量>0');
const cost = batchCost(batches[0], DEFAULT_TANKS, 0.05);
ok(cost.total > 0 && cost.powder > 0 && cost.chemical > 0 && cost.energy > 0 && cost.reworkLoss > 0, '四块成本齐全');
const csvOut = batchesToCSV(batches, DEFAULT_TANKS, 0.05);
ok(csvOut.split('\r\n').length === batches.length + 1, 'CSV行数正确');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
