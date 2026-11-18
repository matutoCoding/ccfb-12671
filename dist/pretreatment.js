/**
 * 按当天排产总面积计算各槽状态。
 * 补充量 = 排产面积 × 单耗(带出+消耗); 换槽日期 = 上次换槽 + 周期。
 */
export function tankStatus(tanks, dailyAreaM2, today = new Date()) {
    return tanks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(t => {
        const last = new Date(t.lastChangeDate + 'T00:00:00');
        const daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
        const daysLeft = t.changeIntervalDays - daysSince;
        const next = new Date(last.getTime() + t.changeIntervalDays * 86400000);
        return {
            tank: t,
            daysSinceChange: daysSince,
            daysLeft,
            overdue: daysLeft < 0,
            nextChangeDate: next.toISOString().slice(0, 10),
            dailyReplenishKg: t.dosePerM2 * dailyAreaM2 / 1000,
        };
    });
}
/** 当天排产总面积 */
export function dailyArea(parts, areaOf) {
    return parts.reduce((s, p) => s + areaOf(p), 0);
}
//# sourceMappingURL=pretreatment.js.map