import { format } from "date-fns";
import { loadXLSX, norm, getCell, resolveDate, resolveAmount } from "@/lib/excelImportHelpers";

// ─── Template (download) ───────────────────────────────────────────────────

const LINE_HEADERS = [
  "Date",
  "Mode of Transport",
  "Description",
  "Local Conveyance",
  "Event Expense",
  "Refreshment",
  "Other Expense",
];

const TRAVEL_HEADERS = ["Date", "From", "To", "Mode", "Place", "Total"];

export async function downloadProjectExpenseImportTemplate() {
  const XLSX = await loadXLSX();

  const linesSheet = XLSX.utils.aoa_to_sheet([
    LINE_HEADERS,
    ["2026-07-15", "Cab", "Airport to venue", "450", "0", "0", "0"],
  ]);
  linesSheet["!cols"] = LINE_HEADERS.map(() => ({ wch: 18 }));

  const travelSheet = XLSX.utils.aoa_to_sheet([
    TRAVEL_HEADERS,
    ["2026-07-15", "Mumbai", "Bengaluru", "Flight", "Bengaluru", "6500"],
  ]);
  travelSheet["!cols"] = TRAVEL_HEADERS.map(() => ({ wch: 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, linesSheet, "Expense Lines");
  XLSX.utils.book_append_sheet(wb, travelSheet, "Travel Log (optional)");
  XLSX.writeFile(wb, `project-expense-template-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

// ─── Parse (upload) ─────────────────────────────────────────────────────────

export interface ParsedProjectExpenseLine {
  line_date: string;
  description: string;
  mode_of_transport: string;
  local_conveyance: string;
  event_expense: string;
  refreshment: string;
  other_expense: string;
}

export interface ParsedProjectTravelLog {
  travel_date: string;
  from_place: string;
  to_place: string;
  mode: string;
  place: string;
  total: string;
}

export interface ProjectExpenseImportResult {
  lines: ParsedProjectExpenseLine[];
  travelLogs: ParsedProjectTravelLog[];
  errors: string[];
}

function parseLines(sheet: unknown, XLSX: Awaited<ReturnType<typeof loadXLSX>>): { lines: ParsedProjectExpenseLine[]; errors: string[] } {
  const lines: ParsedProjectExpenseLine[] = [];
  const errors: string[] = [];
  if (!sheet) return { lines, errors };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet as never, { defval: "" });
  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const dateRaw = getCell(row, "Date", "Expense Date", "Line Date");
    const modeRaw = getCell(row, "Mode of Transport", "Mode");
    const descRaw = getCell(row, "Description", "Activity");
    const localRaw = getCell(row, "Local Conveyance");
    const eventRaw = getCell(row, "Event Expense");
    const refreshRaw = getCell(row, "Refreshment");
    const otherRaw = getCell(row, "Other Expense");

    const rowIsBlank = [dateRaw, modeRaw, descRaw, localRaw, eventRaw, refreshRaw, otherRaw]
      .every((v) => norm(v) === "");
    if (rowIsBlank) return;

    const lineDate = resolveDate(dateRaw);
    if (!lineDate) {
      errors.push(`Expense Lines row ${rowNum}: missing or unreadable Date.`);
      return;
    }

    const local = resolveAmount(localRaw);
    const event = resolveAmount(eventRaw);
    const refreshment = resolveAmount(refreshRaw);
    const other = resolveAmount(otherRaw);
    const description = norm(descRaw);

    if (!description && local === null && event === null && refreshment === null && other === null) {
      errors.push(`Expense Lines row ${rowNum}: needs a Description or at least one amount.`);
      return;
    }

    lines.push({
      line_date: lineDate,
      description,
      mode_of_transport: norm(modeRaw),
      local_conveyance: local !== null ? String(local) : "",
      event_expense: event !== null ? String(event) : "",
      refreshment: refreshment !== null ? String(refreshment) : "",
      other_expense: other !== null ? String(other) : "",
    });
  });

  return { lines, errors };
}

function parseTravelLogs(sheet: unknown, XLSX: Awaited<ReturnType<typeof loadXLSX>>): { travelLogs: ParsedProjectTravelLog[]; errors: string[] } {
  const travelLogs: ParsedProjectTravelLog[] = [];
  const errors: string[] = [];
  if (!sheet) return { travelLogs, errors };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet as never, { defval: "" });
  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const dateRaw = getCell(row, "Date", "Travel Date");
    const fromRaw = getCell(row, "From", "From Place");
    const toRaw = getCell(row, "To", "To Place");
    const modeRaw = getCell(row, "Mode");
    const placeRaw = getCell(row, "Place");
    const totalRaw = getCell(row, "Total");

    const rowIsBlank = [dateRaw, fromRaw, toRaw, modeRaw, placeRaw, totalRaw].every((v) => norm(v) === "");
    if (rowIsBlank) return;

    const travelDate = resolveDate(dateRaw);
    if (!travelDate) {
      errors.push(`Travel Log row ${rowNum}: missing or unreadable Date.`);
      return;
    }

    const total = resolveAmount(totalRaw);
    travelLogs.push({
      travel_date: travelDate,
      from_place: norm(fromRaw),
      to_place: norm(toRaw),
      mode: norm(modeRaw),
      place: norm(placeRaw),
      total: total !== null ? String(total) : "",
    });
  });

  return { travelLogs, errors };
}

export async function parseProjectExpenseImportFile(file: File): Promise<ProjectExpenseImportResult> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const findSheet = (...names: string[]) => {
    const target = names.map((n) => n.toLowerCase());
    const sheetName = wb.SheetNames.find((n) => target.includes(n.toLowerCase())) ?? wb.SheetNames[0];
    return sheetName ? wb.Sheets[sheetName] : undefined;
  };

  const linesSheet = findSheet("Expense Lines", "Expenses", "Sheet1");
  const travelSheet = findSheet("Travel Log (optional)", "Travel Log", "Travel");

  const { lines, errors: lineErrors } = parseLines(linesSheet, XLSX);
  // The travel sheet is optional — only parse it if it's a distinct sheet from the lines one.
  const { travelLogs, errors: travelErrors } =
    travelSheet && travelSheet !== linesSheet ? parseTravelLogs(travelSheet, XLSX) : { travelLogs: [], errors: [] };

  return { lines, travelLogs, errors: [...lineErrors, ...travelErrors] };
}
