const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n, dp = 2) => (n == null || isNaN(n) ? "—" : (dp ? eur2 : eur0).format(n));
export const eurSigned = (n) => (n > 0 ? "+" : "") + eur(n);
export const compact = (n) =>
  Math.abs(n) >= 1e6 ? `€${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e3 ? `€${(n / 1e3).toFixed(0)}k` : `€${Math.round(n)}`;
export const pct = (n, dp = 1) => (n == null || isNaN(n) ? "—" : `${(n * 100).toFixed(dp)}%`);
export const fmtDate = (s, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IE", opts);
export const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IE", { month: "short", year: "2-digit" });
};
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PALETTE = ["#2F6FDB", "#E9A21A", "#E0739B", "#1E8E3E", "#8B5CF6", "#14A3A3", "#DC4C3E", "#F26B2A", "#6B7280", "#B45309"];
export const colorFor = (s = "") => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
