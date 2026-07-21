import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface OrgHealthRow {
  name: string;
  is_active: boolean;
  memberCount: number;
  hasStalePending: boolean; // a submitted claim older than 7 days, still unactioned
  activeLast30Days: boolean; // at least one claim created in the last 30 days
}

interface Props {
  organizations: OrgHealthRow[];
}

// Same green/red pair already used for status badges elsewhere in this app
// (STATUS_COLORS in the recent-claims table) — not a new palette.
const ACTIVE_COLOR = "#16a34a";
const INACTIVE_COLOR = "#dc2626";

export function PlatformOrgHealth({ organizations }: Props) {
  const active = organizations.filter((o) => o.is_active).length;
  const inactive = organizations.length - active;
  const withStalePending = organizations.filter((o) => o.hasStalePending).length;
  const recentlyActive = organizations.filter((o) => o.activeLast30Days).length;
  const staffed = organizations.filter((o) => o.memberCount > 1).length;

  const pieData = [
    { name: "Active", value: active, color: ACTIVE_COLOR },
    { name: "Inactive", value: inactive, color: INACTIVE_COLOR },
  ].filter((d) => d.value > 0);

  const metrics = [
    { label: "Active this month", value: recentlyActive, total: organizations.length },
    { label: "With 2+ users", value: staffed, total: organizations.length },
    { label: "Active", value: active, total: organizations.length },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Organisation Health</CardTitle>
      </CardHeader>
      <CardContent>
        {organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No organisations yet.</p>
        ) : (
          <>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={pieData.length > 1 ? 3 : 0}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-4 mt-2 mb-4">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>

            {withStalePending > 0 && (
              <div className="mb-4 px-3 py-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 text-xs text-yellow-800 dark:text-yellow-400">
                {withStalePending} organisation{withStalePending > 1 ? "s" : ""} with an approval pending 7+ days
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              {metrics.map((m) => {
                const pct = m.total > 0 ? Math.round((m.value / m.total) * 100) : 0;
                return (
                  <div key={m.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{m.label}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {m.value}/{m.total}
                      </Badge>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
