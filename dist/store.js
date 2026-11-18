import * as db from './db.js';
import { SAMPLE_PARTS, DEFAULT_TANKS, DEFAULT_PRESETS, DEFAULT_BOOTH } from './samples.js';
export const state = {
    parts: [], pending: [], presets: [], tanks: [],
    booth: { ...DEFAULT_BOOTH }, records: [],
};
export async function loadState() {
    const [parts, pending, presets, tanks, records, booth] = await Promise.all([
        db.getAll('parts'),
        db.getAll('pending'),
        db.getAll('presets'),
        db.getAll('tanks'),
        db.getAll('records'),
        db.getSetting('booth'),
    ]);
    // 空库 → 写入示例数据, 打开就能跑
    if (parts.length === 0) {
        await db.putAll('parts', SAMPLE_PARTS);
        state.parts = SAMPLE_PARTS.map(p => ({ ...p }));
    }
    else
        state.parts = parts;
    if (presets.length === 0) {
        await db.putAll('presets', DEFAULT_PRESETS);
        state.presets = DEFAULT_PRESETS.map(p => ({ ...p }));
    }
    else
        state.presets = presets;
    if (tanks.length === 0) {
        await db.putAll('tanks', DEFAULT_TANKS);
        state.tanks = DEFAULT_TANKS.map(t => ({ ...t }));
    }
    else
        state.tanks = tanks;
    state.pending = pending;
    state.records = records;
    if (booth)
        state.booth = { ...DEFAULT_BOOTH, ...booth };
    else
        await db.saveSetting('booth', DEFAULT_BOOTH);
}
export const saveParts = () => db.putAll('parts', state.parts);
export const savePending = () => db.putAll('pending', state.pending);
export const savePresets = () => db.putAll('presets', state.presets);
export const saveTanks = () => db.putAll('tanks', state.tanks);
export const saveRecords = () => db.putAll('records', state.records);
export const saveBooth = () => db.saveSetting('booth', state.booth);
export async function deletePending(id) {
    state.pending = state.pending.filter(p => p.id !== id);
    await db.del('pending', id);
}
export async function deletePart(id) {
    state.parts = state.parts.filter(p => p.id !== id);
    await db.del('parts', id);
}
//# sourceMappingURL=store.js.map