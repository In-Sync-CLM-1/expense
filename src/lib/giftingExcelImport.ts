import { format } from "date-fns";
import { loadXLSX, norm, getCell, resolveDate, resolveAmount } from "@/lib/excelImportHelpers";

// ─── Template (download) ───────────────────────────────────────────────────
// Unlike the Project Expense template (one project per claim), every row
// here names its own project — that's the whole point of this claim type.

const HEADERS = ["Date", "Project Number", "Description", "Recipient / Occasion", "Amount"];

export async function downloadGiftingImportTemplate() {
  const XLSX = await loadXLSX();

  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ["2026-07-15", "RMPL-1042", "Branded hampers for client team", "Acme Corp — project kickoff", "12500"],
    ["2026-07-16", "RMPL-1050", "Diwali gift boxes", "Beta Industries — festive gifting", "8400"],
  ]);
  sheet["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 32 }, { wch: 28 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Gifting Expenses");
  XLSX.writeFile(wb, `gifting-expense-template-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

// ─── Parse (upload) ─────────────────────────────────────────────────────────

export interface ParsedGiftingLine {
  line_date: string;
  project_number: string;
  project_name: string;
  description: string;
  recipient: string;
  amount: string;
}

export interface GiftingImportResult {
  lines: ParsedGiftingLine[];
  errors: string[];
}

export async function parseGiftingImportFile(file: File): Promise<GiftingImportResult> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("gifting")) ?? wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  const lines: ParsedGiftingLine[] = [];
  const errors: string[] = [];
  if (!sheet) return { lines, errors };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet as never, { defval: "" });
  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const dateRaw = getCell(row, "Date", "Expense Date", "Line Date");
    const projectRaw = getCell(row, "Project Number", "Project No", "Project", "Project Name");
    const descRaw = getCell(row, "Description", "Item");
    const recipientRaw = getCell(row, "Recipient / Occasion", "Recipient", "Occasion");
    const amountRaw = getCell(row, "Amount", "Total");

    const rowIsBlank = [dateRaw, projectRaw, descRaw, recipientRaw, amountRaw].every((v) => norm(v) === "");
    if (rowIsBlank) return;

    const lineDate = resolveDate(dateRaw);
    if (!lineDate) {
      errors.push(`Row ${rowNum}: missing or unreadable Date.`);
      return;
    }

    const project = norm(projectRaw);
    if (!project) {
      errors.push(`Row ${rowNum}: missing Project Number.`);
      return;
    }

    const amount = resolveAmount(amountRaw);
    if (amount === null) {
      errors.push(`Row ${rowNum}: missing or invalid Amount.`);
      return;
    }

    lines.push({
      line_date: lineDate,
      project_number: project,
      project_name: "",
      description: norm(descRaw),
      recipient: norm(recipientRaw),
      amount: String(amount),
    });
  });

  return { lines, errors };
}
