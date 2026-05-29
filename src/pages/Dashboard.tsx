import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt, Clock, CheckCircle2, IndianRupee, Plane, ShieldCheck, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser, useExpenseClaims, useOrgExpenseSummary } from "@/hooks/useExpenseClaims";
import { useUserPermissions } from "@/hooks/useUserPermissions";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: myClaims, isLoading } = useExpenseClaims(user?.id);
  const { permissions } = useUserPermissions();
  const { data: org } = useOrgExpenseSummary();

  const my = {
    total: myClaims?.length ?? 0,
    pending: myClaims?.filter((c) => c.status === "submitted").length ?? 0,
    approved: myClaims?.filter((c) => c.status === "approved" || c.status === "reimbursed").length ?? 0,
    totalAmount: myClaims?.reduce((s, c) => s + Number(c.total_amount), 0) ?? 0,
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back{user?.email ? `, ${user.email}` : ""}!</p>
      </div>

      {/* My expenses */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Plane className="h-5 w-5" /> My Expense Claims
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard icon={<Receipt className="h-4 w-4 text-blue-500" />} label="Total Claims" value={my.total} />
            <StatCard icon={<Clock className="h-4 w-4 text-yellow-500" />} label="Pending" value={my.pending} highlight={my.pending > 0} />
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Approved" value={my.approved} />
            <StatCard icon={<IndianRupee className="h-4 w-4 text-purple-500" />} label="Total Claimed" value={`₹${my.totalAmount.toLocaleString("en-IN")}`} />
          </div>
        )}
        <Button className="mt-4" onClick={() => navigate("/my-expenses")}>
          <Plane className="h-4 w-4 mr-2" /> View My Claims
        </Button>
      </section>

      {/* Org summary (admin/manager) */}
      {permissions.canApproveExpenses && org && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Organisation Overview
          </h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard icon={<Receipt className="h-4 w-4 text-blue-500" />} label="Total Claims" value={org.total} />
            <StatCard icon={<Clock className="h-4 w-4 text-yellow-500" />} label="Awaiting Approval" value={org.submitted} highlight={org.submitted > 0} />
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Approved" value={org.approved} />
            <StatCard icon={<IndianRupee className="h-4 w-4 text-green-500" />} label="Approved Amount" value={`₹${org.approvedAmount.toLocaleString("en-IN")}`} />
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button variant="outline" onClick={() => navigate("/approvals")}>
              <ShieldCheck className="h-4 w-4 mr-2" /> Go to Approvals
            </Button>
            {permissions.canViewReports && (
              <Button variant="outline" onClick={() => navigate("/reports")}>
                <BarChart3 className="h-4 w-4 mr-2" /> View Reports
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-yellow-300" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm font-medium">{label}</span></div>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
