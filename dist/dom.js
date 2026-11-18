// DOM 小工具
export function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class')
            n.className = v;
        else
            n.setAttribute(k, v);
    }
    for (const c of children)
        n.append(c);
    return n;
}
export function toast(msg, isErr = false, ms = 3200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.hidden = true; }, ms);
}
export function download(filename, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const fmt = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : '-';
//# sourceMappingURL=dom.js.map