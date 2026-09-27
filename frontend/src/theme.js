// Theme handling. Charts need real colours (not CSS variables), so they read them from here.
const PALETTES = {
  dark: { accent: "#D9B04A", grid: "rgba(255,255,255,0.06)", muted: "#75736E" },
  light: { accent: "#F26B2A", grid: "#ECEAE6", muted: "#8C8882" },
};
export const currentTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
export const C = {
  get accent() { return PALETTES[currentTheme()].accent; },
  get grid() { return PALETTES[currentTheme()].grid; },
  get muted() { return PALETTES[currentTheme()].muted; },
};
export function initialTheme() {
  try { return localStorage.getItem("pifa-theme") || "dark"; } catch { return "dark"; }
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#F6F5F3" : "#0A0A0C");
  try { localStorage.setItem("pifa-theme", theme); } catch { /* storage unavailable */ }
}
