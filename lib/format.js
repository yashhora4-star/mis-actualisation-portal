export function inr(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}
export function pct(n) {
    if (n === null || n === undefined) return '—';
    return `${Number(n).toFixed(1)}%`;
}
