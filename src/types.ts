// 共享类型定义

export type GunType = 'reciprocator' | 'fixed';

/** 工件截面形状(2D 截面, 沿长度方向拉伸) */
export interface ShapeSpec {
  kind: 'plate' | 'angle' | 'channel' | 'tube' | 'deepbox' | 'fin' | 'zbar' | 'frame';
  /** 外形尺寸 mm, 含义随 kind 而定 */
  w: number; h: number;
  t?: number;        // 壁厚/板厚
  grooveW?: number;  // 槽口宽(deepbox/channel)
  grooveD?: number;  // 槽深
  fins?: number;     // 筋板数量(fin)
}

export interface Part {
  id: string;
  drawingNo: string;   // 图号
  name: string;
  material: string;    // 材质
  color: string;       // 粉末颜色
  targetThickness: number; // 期望膜厚 μm
  qty: number;
  shape: ShapeSpec;
  workOrder?: string;  // 工单号
  source: 'sample' | 'csv' | 'manual';
  remark?: string;
}

/** CSV 导入时无法识别、挂起等人工处理的行 */
export interface PendingRow {
  id: string;
  raw: Record<string, string>;
  reason: string;
  importedAt: string;
}

export interface GunPreset {
  id: string;
  name: string;
  type: GunType;
  x: number;            // 枪位 x (mm, 喷房截面坐标)
  y: number;            // 枪位 y (往复机为中位)
  stroke: number;       // 摆幅 mm (往复机行程半幅; 固定枪为 0)
  frequency: number;    // 往复频率 次/分
  powderOutput: number; // 出粉量 g/min
  voltage: number;      // 高压 kV
  gunDistance: number;  // 枪距 mm (枪口到工件输送线)
}

export type TankType = '预脱脂' | '主脱脂' | '水洗' | '酸洗' | '磷化' | '表调';

export interface Tank {
  id: string;
  order: number;
  name: string;
  type: TankType;
  concentration: number;  // 槽液浓度 %
  immersionMin: number;   // 浸泡时长 min
  temperature: number;    // 温度 ℃
  capacityL: number;      // 槽容积 L
  dosePerM2: number;      // 每平米工件带出/消耗药剂量 g
  changeIntervalDays: number; // 换槽周期 天
  lastChangeDate: string; // 上次换槽日期 YYYY-MM-DD
  batchNo: string;        // 当前槽液批次
}

export interface BoothConfig {
  conveyorSpeed: number;    // 链速 m/min
  hangersPerPart: number;   // 每挂工件数
  safeGunDistance: number;  // 安全枪距 mm
  hangerX: number;          // 输送链(挂具)截面 x 位置 mm
  boothWidth: number;       // 喷房截面宽 mm
  boothHeight: number;      // 喷房截面高 mm
  powderStock: Record<string, number>; // 各色粉末库存 kg
}

export interface SimSummary {
  partId: string;
  drawingNo: string;
  runAt: string;
  gunPresetId: string;
  gunPresetName: string;
  tankBatch: string;
  workOrder?: string;
  avgUm: number; minUm: number; maxUm: number;
  targetUm: number;
  deadZonePct: number;      // 上粉不足(<60%目标)面积占比 %
  orangePeelRisk: boolean;  // 反电离/橘皮风险
  verdict: '合格' | '不合格';
  reasons: string[];        // 不合格原因
}

export interface TraceRecord extends SimSummary {
  id: string;
  material: string;
  color: string;
  qty: number;
}

export interface CostBreakdown {
  powder: number; chemical: number; energy: number; reworkLoss: number; total: number;
}

export interface Batch {
  id: string;
  key: string;             // 颜色+材质
  color: string;
  material: string;
  parts: { partId: string; drawingNo: string; qty: number; areaM2: number }[];
  totalQty: number;
  totalAreaM2: number;
  powderNeedKg: number;
  powderStockKg: number;
  shortage: boolean;
}

export interface AppState {
  parts: Part[];
  pending: PendingRow[];
  presets: GunPreset[];
  tanks: Tank[];
  booth: BoothConfig;
  records: TraceRecord[];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
