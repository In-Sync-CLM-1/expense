import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, Clock, IndianRupee } from "lucide-react";

export interface PlatformStats {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  totalClaims: number;
  pendingClaims: number;
  totalApproved: number;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function PlatformSummaryStats({ stats }: { stats: PlatformStats }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Building2 className="h-5 w-5 text-blue-500" />}
        label="Organisations"
        value={stats.totalOrgs}
        sub={`${stats.activeOrgs} active`}
      />
      <StatCard
        icon={<Users className="h-5 w-5 text-indigo-500" />}
        label="Active Users"
        value={stats.totalUsers}
      />
      <StatCard
        icon={<Clock className="h-5 w-5 text-yellow-500" />}
        label="Pending Claims"
        value={stats.pendingClaims}
        highlight={stats.pendingClaims > 0}
      />
      <StatCard
        icon={<IndianRupee className="h-5 w-5 text-green-500" />}
        label="Total Approved"
        value={fmt(stats.totalApproved)}
        sub={`${stats.totalClaims} claims total`}
      />
    </div>
  );
}

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
