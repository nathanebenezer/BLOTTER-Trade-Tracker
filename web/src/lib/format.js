/* Formatting + date helpers — ported from the reference (blotter.html). */
export const fMoney = (n, sign = false) => {
  if (n == null || isNaN(n)) return "—";
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = n < 0 ? "-" : (sign && n > 0 ? "+" : "");
  return s + "$" + v;
};
export const fNum = (n, d = 2) =>
  n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fInt = (n) =>
  n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("en-US");
export const fPct = (n) => (n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%");
export const fR = (n) => (n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(2) + "R");
export const cls = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
export const today = () => new Date().toISOString().slice(0, 10);
export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
