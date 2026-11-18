const DB_NAME = 'powder-coat-sim';
const DB_VER = 1;
const STORES = ['parts', 'pending', 'presets', 'tanks', 'records', 'settings'];
let dbp = null;
function open() {
    if (dbp)
        return dbp;
    dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const s of STORES) {
                if (!db.objectStoreNames.contains(s))
                    db.createObjectStore(s, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbp;
}
async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export async function putAll(store, items) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        const s = t.objectStore(store);
        for (const it of items)
            s.put(it);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}
export async function getAll(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readonly');
        const req = t.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export async function clearStore(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        t.objectStore(store).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}
export async function del(store, id) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        t.objectStore(store).delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}
export async function saveSetting(id, value) {
    await putAll('settings', [{ id, ...(typeof value === 'object' && value !== null ? value : { value }) }]);
}
export async function getSetting(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction('settings', 'readonly');
        const req = t.objectStore('settings').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
/** 全量导出(方案打包发车间) */
export async function exportAll() {
    const out = { exportedAt: new Date().toISOString(), app: 'powder-coat-sim', version: 1 };
    for (const s of STORES)
        out[s] = await getAll(s);
    return out;
}
/** 全量导入 */
export async function importAll(data) {
    for (const s of STORES) {
        const arr = data[s];
        if (Array.isArray(arr)) {
            await clearStore(s);
            await putAll(s, arr.filter(x => x && typeof x === 'object' && 'id' in x));
        }
    }
}
//# sourceMappingURL=db.js.map