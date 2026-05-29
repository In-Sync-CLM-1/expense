import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, Users, IndianRupee, Clock,
  ShieldAlert, Plus, MoreHorizontal, Activity,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  industry: string | null;
  is_active: boolean;
  created_at: string;
  memberCount: number;
  claimCount: number;
  pendingCount: number;
  totalAmount: number;
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [orgsRes, membersRes, claimsRes] = await Promise.all([
        supabase.from("organizations" as never).select("id, is_active"),
        supabase.from("org_memberships" as never).select("id, is_active"),
        supabase.from("travel_expense_claims" as never).select("id, org_id, status, total_amount, approved_amount"),
      ]);

      const orgs = (orgsRes.data ?? []) as { id: string; is_active: boolean }[];
      const members = (membersRes.data ?? []) as { id: string; is_active: boolean }[];
      const claims = (claimsRes.data ?? []) as {
        id: string; org_id: string; status: string;
        total_amount: number; approved_amount: number | null;
      }[];

      const totalOrgs = orgs.length;
      const activeOrgs = orgs.filter((o) => o.is_active).length;
      const totalUsers = members.filter((m) => m.is_active).length;
      const totalClaims = claims.length;
      const pendingClaims = claims.filter((c) => c.status === "submitted").length;
      const totalClaimed = claims.reduce((s, c) => s + Number(c.total_amount), 0);
      const totalApproved = claims
        .filter((c) => c.status === "approved" || c.status === "reimbursed")
        .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount), 0);

      // Per-org aggregation
      const orgStats = new Map<string, { claims: number; pending: number; amount: number }>();
      for (const claim of claims) {
        const oid = claim.org_id;
        if (!oid) continue;
        const cur = orgStats.get(oid) ?? { claims: 0, pending: 0, amount: 0 };
        cur.claims++;
        if (claim.status === "submitted") cur.pending++;
        cur.amount += Number(claim.total_amount);
        orgStats.set(oid, cur);
      }

      return {
        totalOrgs, activeOrgs, totalUsers, totalClaims,
        pendingClaims, totalClaimed, totalApproved, orgStats,
      };
    },
  });
}

function usePlatformOrgs() {
  return useQuery({
    queryKey: ["platform-orgs"],
    queryFn: async () => {
      const [orgsRes, membersRes, claimsRes] = await Promise.all([
        supabase.from("organizations" as never)
          .select("id, name, industry, is_active, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("org_memberships" as never).select("org_id, user_id, is_active"),
        supabase.from("travel_expense_claims" as never).select("org_id, status, total_amount"),
      ]);

      const orgs = (orgsRes.data ?? []) as {
        id: string; name: string; industry: string | null;
        is_active: boolean; created_at: string;
      }[];
      const members = (membersRes.data ?? []) as { org_id: string; user_id: string; is_active: boolean }[];
      const claims = (claimsRes.data ?? []) as { org_id: string; status: string; total_amount: number }[];

      // Aggregate per org
      const memberMap = new Map<string, number>();
      for (const m of members.filter((x) => x.is_active)) {
        memberMap.set(m.org_id, (memberMap.get(m.org_id) ?? 0) + 1);
      }
      const claimMap = new Map<string, { count: number; pending: number; amount: number }>();
      for (const c of claims) {
        if (!c.org_id) continue;
        const cur = claimMap.get(c.org_id) ?? { count: 0, pending: 0, amount: 0 };
        cur.count++;
        if (c.status === "submitted") cur.pending++;
        cur.amount += Number(c.total_amount);
        claimMap.set(c.org_id, cur);
      }

      return orgs.map((o): OrgRow => ({
        ...o,
        memberCount: memberMap.get(o.id) ?? 0,
        claimCount: claimMap.get(o.id)?.count ?? 0,
        pendingCount: claimMap.get(o.id)?.pending ?? 0,
        totalAmount: claimMap.get(o.id)?.amount ?? 0,
      }));
    },
  });
}

function useRecentClaims() {
  return useQuery({
    queryKey: ["platform-recent-claims"],
    queryFn: async () => {
      const { data } = await supabase
        .from("travel_expense_claims" as never)
        .select("id, trip_title, status, total_amount, submitted_at, created_at, profiles:user_id(full_name, email), organizations:org_id(name)")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as Array<{
        id: string; trip_title: string; status: string;
        total_amount: number; submitted_at: string | null; created_at: string;
        profiles: { full_name: string | null; email: string } | null;
        organizations: { name: string } | null;
      }>;
    },
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:             "bg-muted text-muted-foreground",
  submitted:         "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved:          "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  partially_approved:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  rejected:          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  reimbursed:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Pending", approved: "Approved",
  partially_approved: "Partial", rejected: "Rejected", reimbursed: "Reimbursed",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: orgs, isLoading: orgsLoading } = usePlatformOrgs();
  const { data: recentClaims } = useRecentClaims();

  const handleToggleOrg = async (org: OrgRow) => {
    const { error } = await supabase
      .from("organizations" as never)
      .update({ is_active: !org.is_active })
      .eq("id", org.id);
    if (error) toast.error("Failed to update organisation");
    else toast.success(org.is_active ? "Organisation deactivated" : "Organisation activated");
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-5 w-5 text-yellow-500" />
            <h1 className="text-2xl font-bold">Command Center</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Welcome, {user?.email} · Platform-wide overview of all organisations
          </p>
        </div>
        <Button onClick={() => navigate("/platform/orgs")}>
          <Plus className="h-4 w-4 mr-2" /> New Organisation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-5 w-5 text-blue-500" />}
          label="Organisations"
          value={statsLoading ? "—" : stats?.totalOrgs ?? 0}
          sub={statsLoading ? undefined : `${stats?.activeOrgs ?? 0} active`}
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-indigo-500" />}
          label="Active Users"
          value={statsLoading ? "—" : stats?.totalUsers ?? 0}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          label="Pending Claims"
          value={statsLoading ? "—" : stats?.pendingClaims ?? 0}
          highlight={(stats?.pendingClaims ?? 0) > 0}
        />
        <StatCard
          icon={<IndianRupee className="h-5 w-5 text-green-500" />}
          label="Total Approved"
          value={statsLoading ? "—" : fmt(stats?.totalApproved ?? 0)}
          sub={statsLoading ? undefined : `${stats?.totalClaims ?? 0} claims total`}
        />
      </div>

      {/* Organisations table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Organisations
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/platform/orgs")}>
              Manage
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {orgsLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
            </div>
          ) : (orgs ?? []).length === 0 ? (
            <div className="text-center text-muted-foreground py-10">
              No organisations yet. <button className="underline text-primary" onClick={() => navigate("/platform/orgs")}>Create one</button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Claims</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Total Claimed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgs ?? []).map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="font-medium">{org.name}</div>
                      {org.industry && (
                        <div className="text-xs text-muted-foreground">{org.industry}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{org.memberCount}</TableCell>
                    <TableCell className="text-right">{org.claimCount}</TableCell>
                    <TableCell className="text-right">
                      {org.pendingCount > 0 ? (
                        <span className="text-yellow-600 font-semibold">{org.pendingCount}</span>
                      ) : 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(org.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.is_active ? "default" : "outline"}>
                        {org.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleOrg(org)}>
                            {org.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Claims */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Recent Claims (All Orgs)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(recentClaims ?? []).length === 0 ? (
            <div className="text-center text-muted-foreground py-10">No claims yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentClaims ?? []).map((c) => (
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
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  const borderColor = highlight ? "border-yellow-400" : "border-border";
  return (
    <Card className={`${borderColor} transition-colors`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
