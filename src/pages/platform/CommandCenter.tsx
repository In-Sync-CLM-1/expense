import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PlatformSummaryStats, type PlatformStats } from "@/components/platform/PlatformSummaryStats";
import { PlatformOrgsTable, type OrgRow } from "@/components/platform/PlatformOrgsTable";
import { PlatformActivityFeed, type RecentClaim } from "@/components/platform/PlatformActivityFeed";
import { PlatformOrgHealth, type OrgHealthRow } from "@/components/platform/PlatformOrgHealth";
import { PlatformActivityTrend, type WeeklyPoint } from "@/components/platform/PlatformActivityTrend";

const STALE_PENDING_DAYS = 7;
const RECENT_ACTIVITY_DAYS = 30;
const WEEKS = 12;

interface ClaimRow {
  org_id: string | null;
  status: string;
  total_amount: number;
  approved_amount: number | null;
  submitted_at: string | null;
  created_at: string;
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
        supabase.from("travel_expense_claims" as never)
          .select("org_id, status, total_amount, approved_amount, submitted_at, created_at"),
      ]);

      const orgs = (orgsRes.data ?? []) as {
        id: string; name: string; industry: string | null;
        is_active: boolean; created_at: string;
      }[];
      const members = (membersRes.data ?? []) as { org_id: string; user_id: string; is_active: boolean }[];
      const claims = (claimsRes.data ?? []) as ClaimRow[];

      return { orgs, members, claims };
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
      return (data ?? []) as unknown as RecentClaim[];
    },
  });
}

const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

function buildWeeklyTrend(claims: ClaimRow[]): WeeklyPoint[] {
  const now = new Date();
  const points: WeeklyPoint[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7 - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const count = claims.filter((c) => {
      const d = new Date(c.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    points.push({
      week: weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      count,
    });
  }
  return points;
}

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

function SectionSkeleton({ height = "h-48" }: { height?: string }) {
  return <Skeleton className={`w-full rounded-lg ${height}`} />;
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading: orgsLoading } = usePlatformOrgs();
  const { data: recentClaims, isLoading: recentLoading } = useRecentClaims();

  const loading = orgsLoading || recentLoading;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["platform-orgs"] });
    queryClient.invalidateQueries({ queryKey: ["platform-recent-claims"] });
  };

  const orgs = data?.orgs ?? [];
  const members = data?.members ?? [];
  const claims = data?.claims ?? [];

  // Per-org aggregation, computed once and shared by the stats row, the
  // organisations table, and the health panel.
  const memberCountByOrg = new Map<string, number>();
  for (const m of members.filter((x) => x.is_active)) {
    memberCountByOrg.set(m.org_id, (memberCountByOrg.get(m.org_id) ?? 0) + 1);
  }
  const claimStatsByOrg = new Map<string, { count: number; pending: number; amount: number; hasStalePending: boolean; activeLast30: boolean }>();
  for (const c of claims) {
    if (!c.org_id) continue;
    const cur = claimStatsByOrg.get(c.org_id) ?? { count: 0, pending: 0, amount: 0, hasStalePending: false, activeLast30: false };
    cur.count++;
    if (c.status === "submitted") {
      cur.pending++;
      if (c.submitted_at && daysAgo(c.submitted_at) > STALE_PENDING_DAYS) cur.hasStalePending = true;
    }
    cur.amount += Number(c.total_amount);
    if (daysAgo(c.created_at) <= RECENT_ACTIVITY_DAYS) cur.activeLast30 = true;
    claimStatsByOrg.set(c.org_id, cur);
  }

  const orgRows: OrgRow[] = orgs.map((o) => ({
    ...o,
    memberCount: memberCountByOrg.get(o.id) ?? 0,
    claimCount: claimStatsByOrg.get(o.id)?.count ?? 0,
    pendingCount: claimStatsByOrg.get(o.id)?.pending ?? 0,
    totalAmount: claimStatsByOrg.get(o.id)?.amount ?? 0,
  }));

  const healthRows: OrgHealthRow[] = orgs.map((o) => ({
    name: o.name,
    is_active: o.is_active,
    memberCount: memberCountByOrg.get(o.id) ?? 0,
    hasStalePending: claimStatsByOrg.get(o.id)?.hasStalePending ?? false,
    activeLast30Days: claimStatsByOrg.get(o.id)?.activeLast30 ?? false,
  }));

  const stats: PlatformStats = {
    totalOrgs: orgs.length,
    activeOrgs: orgs.filter((o) => o.is_active).length,
    totalUsers: members.filter((m) => m.is_active).length,
    totalClaims: claims.length,
    pendingClaims: claims.filter((c) => c.status === "submitted").length,
    totalApproved: claims
      .filter((c) => c.status === "approved" || c.status === "reimbursed")
      .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount), 0),
  };

  const trend = buildWeeklyTrend(claims);

  return (
    <div className="p-6 space-y-6">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => navigate("/platform/orgs")}>
            <Plus className="h-4 w-4 mr-2" /> New Organisation
          </Button>
        </div>
      </div>

      {/* Row 1: Summary Stats */}
      <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0 }}>
        {loading ? <SectionSkeleton height="h-32" /> : <PlatformSummaryStats stats={stats} />}
      </motion.div>

      {/* Row 2: Activity Trend + Org Health */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
        className="grid gap-6 lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          {loading ? <SectionSkeleton height="h-[380px]" /> : <PlatformActivityTrend data={trend} />}
        </div>
        <div>
          {loading ? <SectionSkeleton height="h-[380px]" /> : <PlatformOrgHealth organizations={healthRows} />}
        </div>
      </motion.div>

      {/* Row 3: Organisations Table */}
      <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
        <PlatformOrgsTable organizations={orgRows} isLoading={orgsLoading} />
      </motion.div>

      {/* Row 4: Recent Activity */}
      <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
        {recentLoading ? <SectionSkeleton height="h-64" /> : <PlatformActivityFeed claims={recentClaims ?? []} />}
      </motion.div>
    </div>
  );
}
