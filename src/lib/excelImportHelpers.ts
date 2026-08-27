import { format } from "date-fns";

// `xlsx` is a heavy library (pushes the main bundle past the PWA precache
// limit) — load it on demand, only when someone actually imports/downloads
// a template, instead of shipping it to every visitor.
export const loadXLSX = () => import("xlsx");

export const norm = (s: unknown) => String(s ?? "").trim();
export const normKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function getCell(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = normKey(name);
    const key = keys.find((k) => normKey(k) === target);
    if (key !== undefined) return row[key];
  }
  return undefined;
}

// Excel date cells arrive as JS Date objects (cellDates:true); plain-text
// cells arrive as strings — try both, in that order.
export function resolveDate(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return format(raw, "yyyy-MM-dd");
  }
  const s = norm(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : format(parsed, "yyyy-MM-dd");
}

export function resolveAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[₹,\s]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}
