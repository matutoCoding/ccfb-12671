// CSV 导入: 解析客户加工明细表, 按行拆成工件, 同图号合并数量,
// 从备注列解析材质/期望膜厚, 识别不出的行挂起
import type { Part, PendingRow, ShapeSpec } from './types.js';
import { uid } from './types.js';

/** 健壮的 CSV 解析: 支持引号、逗号、换行、\r\n、空行; 破损输入返回空表而不抛异常 */
export function parseCSV(text: string): string[][] {
  if (!text || typeof text !== 'string') return [];
  // 去 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some(x => x.trim() !== '')) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some(x => x.trim() !== '')) rows.push(cur);
  return rows;
}

const HEADER_MAP: { re: RegExp; key: string }[] = [
  { re: /图号|图號|编号|代号|件号|drawing|part\s*no/i, key: 'drawingNo' },
  { re: /名称|品名|工件|零件|name|desc/i, key: 'name' },
  { re: /数量|数\s*量|qty|quantity|件数/i, key: 'qty' },
  { re: /材质|材料|material/i, key: 'material' },
  { re: /颜色|色号|粉末|color|colour/i, key: 'color' },
  { re: /工单|订单|订单号|order/i, key: 'workOrder' },
  { re: /备注|说明|要求|remark|note|comment/i, key: 'remark' },
];

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const hh = h.trim();
    if (!hh) return;
    for (const { re, key } of HEADER_MAP) {
      if (re.test(hh) && !(key in map)) { map[key] = i; break; }
    }
  });
  return map;
}

/** 从备注里解析期望膜厚: "膜厚80μm" "80um" "≥70μ" 等 */
export function parseThickness(text: string): number | null {
  if (!text) return null;
  const m = text.match(/膜厚[^0-9]{0,4}(\d{2,3})\s*(?:μm|um|μ|微米)?/i)
    || text.match(/(\d{2,3})\s*(?:μm|um|微米)/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 30 && v <= 300 ? v : null;
}

/** 从备注/任意文本解析材质 */
export function parseMaterial(text: string): string | null {
  if (!text) return null;
  const m = text.match(/(Q\d{3}[A-Z]?|SPCC|SGCC|SECC|冷轧|热轧|镀锌|不锈钢\s*\d*|铝\s*\d{4}|铝合金|铝)/);
  return m ? m[0].replace(/\s+/g, '') : null;
}

/** 按名称猜测截面形状 */
export function guessShape(name: string, remark: string): ShapeSpec {
  const t = name + ' ' + remark;
  const dim = (re: RegExp, d: number) => { const m = t.match(re); return m ? parseFloat(m[1]) : d; };
  if (/深槽|线槽|槽盒/.test(t)) return { kind: 'deepbox', w: dim(/(\d{2,4})\s*[x×*]/, 120), h: 100, t: 1.5, grooveW: 45, grooveD: 78 };
  if (/C型|槽钢|檩条/.test(t)) return { kind: 'channel', w: 80, h: 40, t: 2.5, grooveW: 18, grooveD: 44 };
  if (/方管|立柱|矩管/.test(t)) return { kind: 'tube', w: 60, h: 60, t: 3 };
  if (/角码|角钢|角铁/.test(t)) return { kind: 'angle', w: 50, h: 50, t: 5 };
  if (/散热|齿片|fin/i.test(t)) return { kind: 'fin', w: 200, h: 80, t: 4, fins: 8 };
  if (/Z型|z型/.test(t)) return { kind: 'zbar', w: 60, h: 40, t: 3 };
  if (/框架|机柜|柜体/.test(t)) return { kind: 'frame', w: 80, h: 80, t: 2.5 };
  return { kind: 'plate', w: dim(/(\d{2,4})\s*[x×*]/, 500), h: 600, t: 1.5 };
}

export interface ImportResult {
  parts: Part[];        // 新识别出的工件(已按图号合并)
  merged: number;       // 合并进已有图号的行数
  pending: PendingRow[];
  totalRows: number;
  error?: string;
}

/**
 * 导入 CSV 文本。existing 用于同图号合并(数量累加)。
 * 任何解析失败都只产生 pending 行或 error 消息, 不抛异常。
 */
export function importCSV(text: string, existing: Part[]): ImportResult {
  const res: ImportResult = { parts: [], merged: 0, pending: [], totalRows: 0 };
  try {
    const rows = parseCSV(text);
    if (rows.length === 0) { res.error = '文件为空或不是有效的 CSV 文本'; return res; }
    if (rows.length === 1) { res.error = '只有表头没有数据行'; return res; }
    const hmap = mapHeaders(rows[0]);
    if (!('drawingNo' in hmap) && !('name' in hmap)) {
      res.error = '表头里找不到"图号"或"名称"列, 请检查文件格式';
      return res;
    }
    const byDrawing = new Map(existing.map(p => [p.drawingNo, p]));
    const newParts = new Map<string, Part>();

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      res.totalRows++;
      const get = (key: string) => (hmap[key] !== undefined ? (cells[hmap[key]] || '').trim() : '');
      const raw: Record<string, string> = {};
      rows[0].forEach((h, i) => { if (h.trim()) raw[h.trim()] = (cells[i] || '').trim(); });

      const drawingNo = get('drawingNo');
      const name = get('name');
      const remark = get('remark');
      const qtyStr = get('qty');
      const qty = parseInt(qtyStr.replace(/[^\d]/g, ''), 10);

      // 识别条件: 图号或名称至少要有一个, 数量必须能解析
      if (!drawingNo && !name) {
        res.pending.push({ id: uid(), raw, reason: '缺少图号和名称, 无法识别工件', importedAt: new Date().toISOString() });
        continue;
      }
      if (!qtyStr || !Number.isFinite(qty) || qty <= 0) {
        res.pending.push({ id: uid(), raw, reason: `数量无法解析("${qtyStr || '空'}")`, importedAt: new Date().toISOString() });
        continue;
      }

      const key = drawingNo || name;
      const material = get('material') || parseMaterial(remark) || parseMaterial(name);
      const thickness = parseThickness(remark) ?? parseThickness(name);

      // 同图号合并: 已有工件或本次新工件都累加数量
      const exist = byDrawing.get(key) || newParts.get(key);
      if (exist) {
        exist.qty += qty;
        if (exist.source !== 'csv') exist.source = 'csv';
        if (byDrawing.has(key)) res.merged++;
        continue;
      }

      const part: Part = {
        id: uid(),
        drawingNo: key,
        name: name || key,
        material: material || '未知材质',
        color: get('color') || 'RAL7035灰',
        targetThickness: thickness ?? 75,
        qty,
        workOrder: get('workOrder') || undefined,
        shape: guessShape(name, remark),
        source: 'csv',
        remark: remark || undefined,
      };
      newParts.set(key, part);
      byDrawing.set(key, part);
    }
    res.parts = [...newParts.values()];
    return res;
  } catch (e) {
    res.error = '导入过程出错: ' + (e instanceof Error ? e.message : String(e));
    return res;
  }
}
