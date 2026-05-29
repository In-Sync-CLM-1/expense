import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, BarChart3, IndianRupee, CheckCircle, Clock, Banknote, Users } from "lucide-react";
import { format } from "date-fns";

import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useMarkReimbursed, type ExpenseClaim } from "@/hooks/useExpenseClaims";
import {
  exportClaimsToCSV,
  exportMonthlySummaryToCSV,
  exportTeamSummaryToCSV,
  exportPendingReimbursementToCSV,
  type MonthlyRow,
  type TeamRow,
} from "@/lib/expenseExport";

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useAllClaims() {
  return useQuery({
    queryKey: ["all-claims-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email), approver:approved_by(full_name)")
        .neq("status", "draft")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseClaim[];
    },
  });
}

function useTeamSummary() {
  return useQuery({
    queryKey: ["team-expense-summary"],
    queryFn: async () => {
      // Get all team members with their claims
      const { data: members, error } = await supabase
        .from("team_members" as never)
        .select("user_id, teams:team_id(name)")
        .eq("is_active", true);
      if (error) throw error;

      const { data: claims } = await supabase
        .from("travel_expense_claims" as never)
        .select("user_id, status, total_amount, approved_amount")
        .neq("status", "draft");

      const memberList = (members ?? []) as { user_id: string; teams: { name: string } | null }[];
      const claimList = (claims ?? []) as {
        user_id: string; status: string; total_amount: number; approved_amount: number | null;
      }[];

      // Group by team
      const teamMap = new Map<string, { users: Set<string>; claims: typeof claimList }>();
      for (const m of memberList) {
        const teamName = m.teams?.name ?? "Unassigned";
        if (!teamMap.has(teamName)) teamMap.set(teamName, { users: new Set(), claims: [] });
        teamMap.get(teamName)!.users.add(m.user_id);
      }
      // Assign claims to teams
      for (const c of claimList) {
        for (const [, data] of teamMap) {
          if (data.users.has(c.user_id)) {
            data.claims.push(c);
          }
        }
      }

      const rows: TeamRow[] = Array.from(teamMap.entries()).map(([teamName, { users, claims: tc }]) => ({
        teamName,
        employeeCount: users.size,
        totalClaims: tc.length,
        approvedClaims: tc.filter((c) => c.status === "approved" || c.status === "reimbursed").length,
        totalClaimed: tc.reduce((s, c) => s + Number(c.total_amount), 0),
        totalApproved: tc
          .filter((c) => c.status === "approved" || c.status === "reimbursed")
          .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount), 0),
        pendingAmount: tc
          .filter((c) => c.status === "submitted")
          .reduce((s, c) => s + Number(c.total_amount), 0),
      }));

      return rows.sort((a, b) => b.totalClaimed - a.totalClaimed);
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { permissions } = useUserPermissions();
  const { data: allClaims, isLoading: claimsLoading } = useAllClaims();
  const { data: teamRows, isLoading: teamLoading } = useTeamSummary();
  const markReimbursed = useMarkReimbursed();
  const [reimbursing, setReimbursing] = useState<string | null>(null);

  if (!permissions.canViewReports) {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          You do not have permission to view reports.
        </CardContent></Card>
      </div>
    );
  }

  // ── Monthly summary ──────────────────────────────────────────────────────
  const monthlyRows = useMemo<MonthlyRow[]>(() => {
    if (!allClaims) return [];
    const map = new Map<string, MonthlyRow>();
    for (const c of allClaims) {
      const dt = c.submitted_at ? new Date(c.submitted_at) : new Date(c.created_at);
      const key = format(dt, "MMM yyyy");
      if (!map.has(key)) {
        map.set(key, { month: key, total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, reimbursed: 0, totalClaimed: 0, totalApproved: 0 });
      }
      const row = map.get(key)!;
      row.total++;
      if (c.status === "submitted") row.submitted++;
      else if (c.status === "approved" || c.status === "partially_approved") row.approved++;
      else if (c.status === "rejected") row.rejected++;
      else if (c.status === "reimbursed") row.reimbursed++;
      row.totalClaimed += Number(c.total_amount);
      if (c.status === "approved" || c.status === "reimbursed") {
        row.totalApproved += Number(c.approved_amount ?? c.total_amount);
      }
    }
    return Array.from(map.values()).reverse();
  }, [allClaims]);

  // ── Pending reimbursement ────────────────────────────────────────────────
  const pendingReimbursement = useMemo(
    () => allClaims?.filter((c) => c.status === "approved") ?? [],
    [allClaims]
  );

  const handleMarkReimbursed = async (claimId: string) => {
    setReimbursing(claimId);
    try {
      await markReimbursed.mutateAsync(claimId);
    } finally {
      setReimbursing(null);
    }
  };

  // ── Summary stats ────────────────────────────────────────────────────────
  const orgStats = useMemo(() => {
    if (!allClaims) return null;
    return {
      total: allClaims.length,
      pending: allClaims.filter((c) => c.status === "submitted").length,
      approved: allClaims.filter((c) => c.status === "approved").length,
      reimbursed: allClaims.filter((c) => c.status === "reimbursed").length,
      totalClaimed: allClaims.reduce((s, c) => s + Number(c.total_amount), 0),
      totalApproved: allClaims
        .filter((c) => c.status === "approved" || c.status === "reimbursed")
        .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount), 0),
    };
  }, [allClaims]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7" /> Expense Reports
          </h1>
          <p className="text-muted-foreground">Organisation-wide expense analytics and exports</p>
        </div>
        <Button
          variant="outline"
          onClick={() => allClaims && exportClaimsToCSV(allClaims)}
          disabled={!allClaims?.length}
        >
          <Download className="h-4 w-4 mr-2" /> Export All Claims
        </Button>
      </div>

      {/* Org-wide stat cards */}
      {orgStats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={<BarChart3 className="h-4 w-4 text-blue-500" />} label="Total Claims" value={orgStats.total} />
          <StatCard icon={<Clock className="h-4 w-4 text-yellow-500" />} label="Pending" value={orgStats.pending} highlight={orgStats.pending > 0} />
          <StatCard icon={<CheckCircle className="h-4 w-4 text-green-500" />} label="Approved" value={orgStats.approved} />
          <StatCard icon={<Banknote className="h-4 w-4 text-purple-500" />} label="Reimbursed" value={orgStats.reimbursed} />
          <StatCard icon={<IndianRupee className="h-4 w-4 text-blue-500" />} label="Total Claimed" value={`₹${(orgStats.totalClaimed / 100000).toFixed(1)}L`} />
          <StatCard icon={<IndianRupee className="h-4 w-4 text-green-500" />} label="Total Approved" value={`₹${(orgStats.totalApproved / 100000).toFixed(1)}L`} />
        </div>
      )}

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
          <TabsTrigger value="teams">By Team</TabsTrigger>
          <TabsTrigger value="reimbursement">
            Pending Reimbursement
            {pendingReimbursement.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">
                {pendingReimbursement.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all-claims">All Claims</TabsTrigger>
        </TabsList>

        {/* ── Monthly Summary ── */}
        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Monthly Summary</CardTitle>
              <Button
                variant="outline" size="sm"
                onClick={() => exportMonthlySummaryToCSV(monthlyRows)}
                disabled={!monthlyRows.length}
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {claimsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Approved</TableHead>
                      <TableHead className="text-center">Rejected</TableHead>
                      <TableHead className="text-center">Reimbursed</TableHead>
                      <TableHead className="text-right">Total Claimed</TableHead>
                      <TableHead className="text-right">Total Approved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRows.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                        <TableCell className="text-center">
                          {row.submitted > 0 ? <Badge variant="secondary">{row.submitted}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.approved > 0 ? <Badge variant="default">{row.approved}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.rejected > 0 ? <Badge variant="destructive">{row.rejected}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-center">{row.reimbursed || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{row.totalClaimed.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {row.totalApproved ? `₹${row.totalApproved.toLocaleString("en-IN")}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {monthlyRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No data yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By Team ── */}
        <TabsContent value="teams" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Team Summary
              </CardTitle>
              <Button
                variant="outline" size="sm"
                onClick={() => exportTeamSummaryToCSV(teamRows ?? [])}
                disabled={!teamRows?.length}
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {teamLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-center">Employees</TableHead>
                      <TableHead className="text-center">Claims</TableHead>
                      <TableHead className="text-center">Approved</TableHead>
                      <TableHead className="text-right">Total Claimed</TableHead>
                      <TableHead className="text-right">Total Approved</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(teamRows ?? []).map((row) => (
                      <TableRow key={row.teamName}>
                        <TableCell className="font-medium">{row.teamName}</TableCell>
                        <TableCell className="text-center">{row.employeeCount}</TableCell>
                        <TableCell className="text-center">{row.totalClaims}</TableCell>
                        <TableCell className="text-center">{row.approvedClaims}</TableCell>
                        <TableCell className="text-right">₹{row.totalClaimed.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right text-green-600">
                          ₹{row.totalApproved.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right text-yellow-600">
                          {row.pendingAmount ? `₹${row.pendingAmount.toLocaleString("en-IN")}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!teamRows?.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No team data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pending Reimbursement ── */}
        <TabsContent value="reimbursement" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Pending Reimbursement</CardTitle>
              {pendingReimbursement.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => exportPendingReimbursementToCSV(pendingReimbursement)}
                >
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {claimsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : !pendingReimbursement.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No claims pending reimbursement
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Trip</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Approved On</TableHead>
                      <TableHead className="text-right">Approved Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingReimbursement.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell className="font-medium">{claim.profiles?.full_name}</TableCell>
                        <TableCell>{claim.trip_title}</TableCell>
                        <TableCell>{claim.destination ?? "—"}</TableCell>
                        <TableCell>
                          {claim.approved_at
                            ? format(new Date(claim.approved_at), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          ₹{Number(claim.approved_amount ?? claim.total_amount).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkReimbursed(claim.id)}
                            disabled={reimbursing === claim.id}
                          >
                            {reimbursing === claim.id
                              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              : <CheckCircle className="h-3 w-3 mr-1" />}
                            Mark Reimbursed
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── All Claims ── */}
        <TabsContent value="all-claims" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>All Claims</CardTitle>
              <Button
                variant="outline" size="sm"
                onClick={() => allClaims && exportClaimsToCSV(allClaims)}
                disabled={!allClaims?.length}
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {claimsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {(allClaims ?? []).map((claim) => (
                    <div key={claim.id}
                      className="flex items-center justify-between p-3 border rounded-lg text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{claim.trip_title}</span>
                          <Badge variant="outline" className="text-xs">{claim.status}</Badge>
                        </div>
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {claim.profiles?.full_name}
                          {claim.submitted_at && ` · ${format(new Date(claim.submitted_at), "MMM d, yyyy")}`}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="font-semibold">₹{Number(claim.total_amount).toLocaleString("en-IN")}</div>
                        {claim.approved_amount != null && (
                          <div className="text-xs text-green-600">
                            ₹{Number(claim.approved_amount).toLocaleString("en-IN")} approved
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!allClaims?.length && (
                    <p className="text-center text-muted-foreground py-8">No claims found</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-yellow-300" : ""}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-muted-foreground">{label}</span></div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
