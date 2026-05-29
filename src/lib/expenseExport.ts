import { format } from "date-fns";
import type { ExpenseClaim } from "@/hooks/useExpenseClaims";

// ─── helpers ──────────────────────────────────────────────────────────────────

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  const headerRow = headers.map(escapeCell).join(",");
  const dataRows = rows.map((row) => row.map(escapeCell).join(","));
  return [headerRow, ...dataRows].join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

// ─── 1. Export a list of expense claims (summary level) ───────────────────────

export function exportClaimsToCSV(claims: ExpenseClaim[]) {
  const headers = [
    "Claim ID",
    "Employee",
    "Email",
    "Trip Title",
    "Destination",
    "Start Date",
    "End Date",
    "Purpose",
    "Status",
    "Claimed Amount (₹)",
    "Approved Amount (₹)",
    "Currency",
    "Submitted On",
    "Approved By",
    "Approved On",
    "Reimbursed On",
    "Rejection Reason",
    "Items Count",
  ];

  const rows = claims.map((c) => [
    c.id,
    c.profiles?.full_name ?? "",
    c.profiles?.email ?? "",
    c.trip_title,
    c.destination ?? "",
    fmtDate(c.trip_start_date),
    fmtDate(c.trip_end_date),
    c.purpose ?? "",
    c.status,
    fmtAmount(c.total_amount),
    fmtAmount(c.approved_amount),
    c.currency,
    fmtDate(c.submitted_at),
    c.approver?.full_name ?? "",
    fmtDate(c.approved_at),
    fmtDate(c.reimbursed_at),
    c.rejection_reason ?? "",
    c.items?.length ?? "",
  ]);

  downloadCSV(buildCSV(headers, rows), `expense-claims-${stamp()}.csv`);
}

// ─── 2. Export a single claim with all line items ─────────────────────────────

export function exportClaimDetailToCSV(claim: ExpenseClaim) {
  // Section 1: Claim header
  const headerRows: unknown[][] = [
    ["Field", "Value"],
    ["Claim ID", claim.id],
    ["Employee", claim.profiles?.full_name ?? ""],
    ["Trip Title", claim.trip_title],
    ["Destination", claim.destination ?? ""],
    ["Start Date", fmtDate(claim.trip_start_date)],
    ["End Date", fmtDate(claim.trip_end_date)],
    ["Purpose", claim.purpose ?? ""],
    ["Status", claim.status],
    ["Claimed Amount", `₹${fmtAmount(claim.total_amount)}`],
    ["Approved Amount", claim.approved_amount != null ? `₹${fmtAmount(claim.approved_amount)}` : ""],
    ["Submitted On", fmtDate(claim.submitted_at)],
    ["Approved By", claim.approver?.full_name ?? ""],
    [],
  ];

  // Section 2: Expense items
  const itemHeaders = [
    "Type",
    "Date",
    "Description",
    "Amount (₹)",
    "Approved Amount (₹)",
    "Item Status",
    "Remarks",
    "Receipt",
  ];

  const itemRows = (claim.items ?? []).map((item) => [
    item.expense_type,
    fmtDate(item.expense_date),
    item.description,
    fmtAmount(item.amount),
    fmtAmount(item.approved_amount),
    item.item_status ?? "",
    item.remarks ?? "",
    item.receipt_url ? item.receipt_name ?? item.receipt_url : "",
  ]);

  const allRows: unknown[][] = [
    ...headerRows,
    itemHeaders,
    ...itemRows,
    [],
    ["Total", "", "", `₹${fmtAmount(claim.total_amount)}`],
  ];

  const csv = allRows.map((row) => row.map(escapeCell).join(",")).join("\n");
  const safeName = claim.trip_title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  downloadCSV(csv, `claim-${safeName}-${stamp()}.csv`);
}

// ─── 3. Monthly summary export ────────────────────────────────────────────────

export interface MonthlyRow {
  month: string;        // "Apr 2026"
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  reimbursed: number;
  totalClaimed: number;
  totalApproved: number;
}

export function exportMonthlySummaryToCSV(rows: MonthlyRow[]) {
  const headers = [
    "Month",
    "Total Claims",
    "Draft",
    "Pending Approval",
    "Approved",
    "Rejected",
    "Reimbursed",
    "Total Claimed (₹)",
    "Total Approved (₹)",
  ];

  const data = rows.map((r) => [
    r.month,
    r.total,
    r.draft,
    r.submitted,
    r.approved,
    r.rejected,
    r.reimbursed,
    fmtAmount(r.totalClaimed),
    fmtAmount(r.totalApproved),
  ]);

  downloadCSV(buildCSV(headers, data), `monthly-expense-summary-${stamp()}.csv`);
}

// ─── 4. Team / department summary export ─────────────────────────────────────

export interface TeamRow {
  teamName: string;
  employeeCount: number;
  totalClaims: number;
  approvedClaims: number;
  totalClaimed: number;
  totalApproved: number;
  pendingAmount: number;
}

export function exportTeamSummaryToCSV(rows: TeamRow[]) {
  const headers = [
    "Team / Department",
    "Employees with Claims",
    "Total Claims",
    "Approved Claims",
    "Total Claimed (₹)",
    "Total Approved (₹)",
    "Pending Amount (₹)",
  ];

  const data = rows.map((r) => [
    r.teamName,
    r.employeeCount,
    r.totalClaims,
    r.approvedClaims,
    fmtAmount(r.totalClaimed),
    fmtAmount(r.totalApproved),
    fmtAmount(r.pendingAmount),
  ]);

  downloadCSV(buildCSV(headers, data), `team-expense-summary-${stamp()}.csv`);
}

// ─── 5. Pending reimbursement export ─────────────────────────────────────────

export function exportPendingReimbursementToCSV(claims: ExpenseClaim[]) {
  const headers = [
    "Claim ID",
    "Employee",
    "Trip Title",
    "Destination",
    "Trip Dates",
    "Approved Amount (₹)",
    "Approved On",
    "Manager",
  ];

  const rows = claims.map((c) => [
    c.id,
    c.profiles?.full_name ?? "",
    c.trip_title,
    c.destination ?? "",
    `${fmtDate(c.trip_start_date)} – ${fmtDate(c.trip_end_date)}`,
    fmtAmount(c.approved_amount ?? c.total_amount),
    fmtDate(c.approved_at),
    c.approver?.full_name ?? "",
  ]);

  downloadCSV(buildCSV(headers, rows), `pending-reimbursement-${stamp()}.csv`);
}
