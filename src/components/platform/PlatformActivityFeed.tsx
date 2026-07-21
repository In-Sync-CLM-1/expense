import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";

export interface RecentClaim {
  id: string;
  trip_title: string;
  status: string;
  total_amount: number;
  submitted_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
  organizations: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft:              "bg-muted text-muted-foreground",
  submitted:          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved:           "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  partially_approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  rejected:           "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  reimbursed:         "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Pending", approved: "Approved",
  partially_approved: "Partial", rejected: "Rejected", reimbursed: "Reimbursed",
};

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function PlatformActivityFeed({ claims }: { claims: RecentClaim[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Recent Claims (All Orgs)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {claims.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">No claims yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Claim Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{c.profiles?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.profiles?.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.organizations?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">{c.trip_title}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(c.total_amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
