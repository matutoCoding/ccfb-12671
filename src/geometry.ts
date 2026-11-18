// 2D 截面几何:由 ShapeSpec 生成多边形截面, 供仿真/干涉检查/面积估算使用
import type { ShapeSpec } from './types.js';

export type Pt = { x: number; y: number };

/**
 * 生成截面多边形集合(可能多个环: 外轮廓逆时针, 孔/槽顺时针)。
 * 坐标单位 mm, 原点在截面中心。
 */
export function shapePolygons(s: ShapeSpec): Pt[][] {
  const w = s.w, h = s.h, t = Math.max(1, s.t ?? 3);
  const hw = w / 2, hh = h / 2;
  switch (s.kind) {
    case 'plate':
      // 薄板截面(水平剖视): 板厚 t 朝喷枪方向(x), 面宽 w 沿输送方向(y)
      return [rect(-t / 2, -w / 2, t / 2, w / 2)];
    case 'tube':
      // 方管: 外矩形 + 内孔
      return [rect(-hw, -hh, hw, hh), rect(-hw + t, -hh + t, hw - t, hh - t).reverse()];
    case 'angle': {
      // L 角钢
      const pts: Pt[] = [
        { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: -hh + t },
        { x: -hw + t, y: -hh + t }, { x: -hw + t, y: hh }, { x: -hw, y: hh },
      ];
      return [pts];
    }
    case 'channel': {
      // C 型槽钢: 开口朝右
      const gw = s.grooveW ?? h * 0.5;
      const pts: Pt[] = [
        { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: -hh + t },
        { x: -hw + (s.grooveD ?? w * 0.55), y: -hh + t },
        { x: -hw + (s.grooveD ?? w * 0.55), y: -hh + t + gw },
        { x: hw, y: -hh + t + gw }, { x: hw, y: hh }, { x: -hw, y: hh },
      ];
      return [pts];
    }
    case 'deepbox': {
      // 深槽件: 矩形外壳, 顶部开深槽(法拉第笼效应演示件)
      const gw = s.grooveW ?? w * 0.4, gd = s.grooveD ?? h * 0.75;
      const pts: Pt[] = [
        { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh },
        { x: gw / 2, y: hh }, { x: gw / 2, y: hh - gd }, { x: -gw / 2, y: hh - gd },
        { x: -gw / 2, y: hh }, { x: -hw, y: hh },
      ];
      return [pts];
    }
    case 'fin': {
      // 散热片: 底板 + 多个竖筋
      const n = Math.max(2, Math.min(12, s.fins ?? 6));
      const rings: Pt[][] = [rect(-hw, -hh, hw, -hh + t)];
      const gap = w / n;
      for (let i = 0; i < n; i++) {
        const cx = -hw + gap * (i + 0.5);
        rings.push(rect(cx - t / 2, -hh + t, cx + t / 2, hh));
      }
      return rings;
    }
    case 'zbar': {
      const pts: Pt[] = [
        { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: -hh + t },
        { x: -hw + t, y: hh - t }, { x: hw, y: hh - t }, { x: hw, y: hh },
        { x: -hw, y: hh }, { x: -hw, y: hh - t }, { x: hw - t, y: -hh + t },
        { x: -hw, y: -hh + t },
      ];
      return [pts];
    }
    case 'frame': {
      // 柜体框架截面: 外框 + 内孔(薄壁)
      return [rect(-hw, -hh, hw, hh), rect(-hw + t, -hh + t, hw - t, hh - t).reverse()];
    }
  }
}

function rect(x1: number, y1: number, x2: number, y2: number): Pt[] {
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

/** 截面周长 mm(所有环) */
export function perimeter(rings: Pt[][]): number {
  let p = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      p += Math.hypot(b.x - a.x, b.y - a.y);
    }
  return p;
}

/** 估算单件喷涂面积 m²: 截面周长 × 拉伸长度 */
export function estimateAreaM2(s: ShapeSpec): number {
  const perimMm = perimeter(shapePolygons(s));
  const lenMm = s.kind === 'plate'
    ? Math.max(300, s.h)  // 板件: 拉伸方向 = 板面高
    : Math.max(400, Math.min(3000, Math.max(s.w, s.h) * 10)); // 型材/小件按常见长度折算
  return (perimMm / 1000) * (lenMm / 1000);
}

/** 点到线段距离 */
export function distPtSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 线段到多边形最小距离 */
export function distSegPolygon(a: Pt, b: Pt, rings: Pt[][], offset: Pt): number {
  let min = Infinity;
  const N = 16;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p1 = { x: ring[i].x + offset.x, y: ring[i].y + offset.y };
      const p2 = { x: ring[(i + 1) % ring.length].x + offset.x, y: ring[(i + 1) % ring.length].y + offset.y };
      // 采样线段上的点, 求到多边形边的距离(近似)
      for (let k = 0; k <= N; k++) {
        const q = { x: a.x + (b.x - a.x) * k / N, y: a.y + (b.y - a.y) * k / N };
        min = Math.min(min, distPtSeg(q, p1, p2));
      }
    }
  }
  return min;
}
