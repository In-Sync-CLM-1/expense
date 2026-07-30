import { format } from "date-fns";
import { EXPENSE_TYPES } from "@/hooks/useExpenseClaims";

// `xlsx` is a heavy library (pushes the main bundle past the PWA precache
// limit) — load it on demand, only when someone actually imports/downloads
// a template, instead of shipping it to every visitor.
const loadXLSX = () => import("xlsx");

// ─── Template (download) ───────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "Date",
  "Type",
  "Description",
  "Amount (INR)",
  "GST Amount (optional)",
  "Vendor GSTIN (optional)",
];

export async function downloadExpenseImportTemplate() {
  const XLSX = await loadXLSX();
  const example = [
    "2026-07-15",
    "Cab / Taxi",
    "Airport to hotel",
    "450",
    "",
    "",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example]);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 30 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
  ];

  const typesSheet = XLSX.utils.aoa_to_sheet([
    ["Valid values for the Type column"],
    ...EXPENSE_TYPES.map((t) => [t.label]),
  ]);
  typesSheet["!cols"] = [{ wch: 28 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Expenses");
  XLSX.utils.book_append_sheet(wb, typesSheet, "Expense Types");
  XLSX.writeFile(wb, `expense-claim-template-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

// ─── Parse (upload) ─────────────────────────────────────────────────────────

export interface ParsedExpenseRow {
  expense_type: string;
  description: string;
  amount: string;
  expense_date: string;
  gst_amount: string;
  gst_number: string;
}

export interface ExpenseImportResult {
  items: ParsedExpenseRow[];
  errors: string[];
}

const norm = (s: unknown) => String(s ?? "").trim();
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// Accept either the human label ("Cab / Taxi") or the raw stored value ("cab").
function resolveExpenseType(raw: string): string | null {
  const key = normKey(raw);
  if (!key) return null;
  const byValue = EXPENSE_TYPES.find((t) => normKey(t.value) === key);
  if (byValue) return byValue.value;
  const byLabel = EXPENSE_TYPES.find((t) => normKey(t.label) === key);
  return byLabel?.value ?? null;
}

// Excel date cells arrive as JS Date objects (cellDates:true); plain-text
// cells arrive as strings — try both, in that order.
function resolveDate(raw: unknown): string | null {
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

function resolveAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[₹,\s]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

export async function parseExpenseImportFile(file: File): Promise<ExpenseImportResult> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { items: [], errors: ["The file has no sheets."] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const items: ParsedExpenseRow[] = [];
  const errors: string[] = [];

  const getCell = (row: Record<string, unknown>, ...names: string[]): unknown => {
    const keys = Object.keys(row);
    for (const name of names) {
      const target = normKey(name);
      const key = keys.find((k) => normKey(k) === target);
      if (key !== undefined) return row[key];
    }
    return undefined;
  };

  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const dateRaw = getCell(row, "Date", "Expense Date");
    const typeRaw = getCell(row, "Type", "Expense Type", "Category");
    const descRaw = getCell(row, "Description", "Remarks");
    const amountRaw = getCell(row, "Amount (INR)", "Amount", "Amount(INR)");
    const gstAmountRaw = getCell(row, "GST Amount (optional)", "GST Amount", "GST");
    const gstNumberRaw = getCell(row, "Vendor GSTIN (optional)", "Vendor GSTIN", "GSTIN");

    const rowIsBlank = [dateRaw, typeRaw, descRaw, amountRaw].every((v) => norm(v) === "");
    if (rowIsBlank) return;

    const expenseDate = resolveDate(dateRaw);
    const expenseType = resolveExpenseType(norm(typeRaw));
    const amount = resolveAmount(amountRaw);

    if (!expenseDate) {
      errors.push(`Row ${rowNum}: missing or unreadable Date.`);
      return;
    }
    if (!expenseType) {
      errors.push(`Row ${rowNum}: "${norm(typeRaw)}" is not a recognised Type — check the "Expense Types" sheet.`);
      return;
    }
    if (amount === null) {
      errors.push(`Row ${rowNum}: missing or invalid Amount.`);
      return;
    }

    const gstAmount = resolveAmount(gstAmountRaw);

    items.push({
      expense_type: expenseType,
      description: norm(descRaw),
      amount: String(amount),
      expense_date: expenseDate,
      gst_amount: gstAmount !== null ? String(gstAmount) : "",
      gst_number: norm(gstNumberRaw),
    });
  });

  return { items, errors };
}
