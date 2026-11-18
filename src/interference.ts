// 往复机运动干涉检查: 枪嘴扫过包络与工件/挂具的最小间距逐行程段计算
import type { GunPreset, Part, BoothConfig } from './types.js';
import { shapePolygons, distSegPolygon, type Pt } from './geometry.js';

export interface InterferenceSegment {
  index: number;
  yFrom: number; yTo: number;   // 行程段范围 mm
  minDist: number;              // 该段最小间距 mm
  obstacle: '工件' | '挂具';
}

export interface InterferenceResult {
  ok: boolean;
  segments: InterferenceSegment[];   // 违规段清单
  minOverall: number;
  suggestions: string[];
}

const SEGMENTS = 16;

/**
 * 检查往复机带枪运行时的运动干涉。
 * 模型: 枪固定在 x = 挂具x - 枪距, 沿 y 往复(中位 y0, 半幅 stroke),
 * 枪嘴向工件方向探出 nozzleReach; 工件截面中心位于 (hangerX, partCenterY),
 * 挂具为挂具 x 处从输送链到工件顶部的竖杆。
 */
export function checkInterference(
  preset: GunPreset, part: Part, booth: BoothConfig,
  partCenterY = 1000, nozzleReach = 60,
): InterferenceResult {
  if (preset.type !== 'reciprocator') {
    return { ok: true, segments: [], minOverall: Infinity, suggestions: ['固定枪无往复运动, 无需干涉检查'] };
  }
  const gunX = booth.hangerX - preset.gunDistance + nozzleReach;
  const y0 = preset.y, A = preset.stroke;
  const rings = shapePolygons(part.shape);
  const partOffset: Pt = { x: booth.hangerX, y: partCenterY };

  // 挂具: 竖杆从工件顶部到输送链(喷房顶)
  const partTop = partCenterY + part.shape.h / 2;
  const hangerA: Pt = { x: booth.hangerX, y: partTop };
  const hangerB: Pt = { x: booth.hangerX, y: booth.boothHeight };

  const violations: InterferenceSegment[] = [];
  let minOverall = Infinity;

  for (let i = 0; i < SEGMENTS; i++) {
    // 行程段: 正弦轨迹按时间均分, 取该段扫过的 y 包络
    const t1 = i / SEGMENTS, t2 = (i + 1) / SEGMENTS;
    const ys: number[] = [];
    for (let k = 0; k <= 8; k++) ys.push(y0 + A * Math.sin(2 * Math.PI * (t1 + (t2 - t1) * k / 8)));
    const segA: Pt = { x: gunX, y: Math.min(...ys) };
    const segB: Pt = { x: gunX, y: Math.max(...ys) };

    const dPart = distSegPolygon(segA, segB, rings, partOffset);
    const dHanger = distSegPolygon(segA, segB, [[hangerA, hangerB]], { x: 0, y: 0 });
    const d = Math.min(dPart, dHanger);
    minOverall = Math.min(minOverall, d);
    if (d < booth.safeGunDistance) {
      violations.push({
        index: i + 1,
        yFrom: Math.round(segA.y), yTo: Math.round(segB.y),
        minDist: Math.round(d),
        obstacle: dPart <= dHanger ? '工件' : '挂具',
      });
    }
  }

  const suggestions: string[] = [];
  if (violations.length > 0) {
    const back = Math.ceil(booth.safeGunDistance - minOverall);
    suggestions.push(`枪位整体后移 ≥ ${back} mm(枪距 ${preset.gunDistance} → ${preset.gunDistance + back} mm)`);
    // 收摆幅建议: 找到最高/最低违规行程, 收缩摆幅使包络避开
    const minY = Math.min(...violations.map(v => v.yFrom));
    const maxY = Math.max(...violations.map(v => v.yTo));
    const newStroke = Math.max(0, Math.floor(Math.min(Math.abs(minY - y0), Math.abs(maxY - y0)) / 10) * 10 - 10);
    if (newStroke < A) suggestions.push(`或收摆幅: ${A} → ${Math.max(0, newStroke)} mm(避开 y=${minY}~${maxY} 干涉区)`);
    suggestions.push('也可将工件挂点下移/上移, 使干涉段避开工件本体');
  }

  return { ok: violations.length === 0, segments: violations, minOverall, suggestions };
}
