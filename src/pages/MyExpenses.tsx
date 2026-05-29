import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Receipt, Wallet, Clock, CheckCircle2, IndianRupee, Plane, Download } from "lucide-react";
import { format } from "date-fns";
import {
  useCurrentUser, useExpenseClaims, useExpenseClaimDetail,
  getStatusColor, getStatusLabel, type ExpenseClaim,
} from "@/hooks/useExpenseClaims";
import { ExpenseClaimDialog } from "@/components/expenses/ExpenseClaimDialog";
import { ExpenseClaimDetail } from "@/components/expenses/ExpenseClaimDetail";
import { exportClaimsToCSV } from "@/lib/expenseExport";
import { useOrg } from "@/contexts/OrgContext";

export default function MyExpenses() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const { currentOrg } = useOrg();

  const { data: user } = useCurrentUser();
  const { data: claims, isLoading } = useExpenseClaims(user?.id);
  const { data: selectedClaim } = useExpenseClaimDetail(selectedClaimId ?? undefined);

  const filtered = claims?.filter((c) => statusFilter === "all" || c.status === statusFilter) ?? [];

  const stats = {
    total: claims?.length ?? 0,
    pending: claims?.filter((c) => c.status === "submitted").length ?? 0,
    approved: claims?.filter((c) => c.status === "approved" || c.status === "reimbursed").length ?? 0,
    totalAmount: claims?.reduce((s, c) => s + Number(c.total_amount ?? 0), 0) ?? 0,
    pendingAmount: claims?.filter((c) => c.status === "submitted").reduce((s, c) => s + Number(c.total_amount ?? 0), 0) ?? 0,
    approvedAmount: claims?.filter((c) => c.status === "approved" || c.status === "reimbursed")
      .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount ?? 0), 0) ?? 0,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Plane className="h-7 w-7" /> Travel Expenses
          </h1>
          <p className="text-muted-foreground">Submit and track your expense claims</p>
        </div>
        <div className="flex gap-2">
          {(claims?.length ?? 0) > 0 && (
            <Button variant="outline" onClick={() => exportClaimsToCSV(claims ?? [])}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)} size="lg">
            <Plus className="mr-2 h-4 w-4" /> New Expense Claim
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard icon={<Receipt className="h-4 w-4 text-blue-500" />} label="Total Claims" value={stats.total} />
        <StatCard icon={<Clock className="h-4 w-4 text-yellow-500" />} label="Pending" value={stats.pending} sub={`₹${stats.pendingAmount.toLocaleString("en-IN")}`} highlight={stats.pending > 0} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Approved" value={stats.approved} sub={`₹${stats.approvedAmount.toLocaleString("en-IN")}`} />
        <StatCard icon={<IndianRupee className="h-4 w-4 text-purple-500" />} label="Total Claimed" value={`₹${stats.totalAmount.toLocaleString("en-IN")}`} />
      </div>

      {/* List */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> My Claims
          </CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="submitted">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="reimbursed">Reimbursed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No expense claims found</p>
              <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create your first claim
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} onClick={() => setSelectedClaimId(claim.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {user && (
        <ExpenseClaimDialog open={createOpen} onOpenChange={setCreateOpen} userId={user.id} orgId={currentOrg?.id} />
      )}
      <ExpenseClaimDetail
        claim={selectedClaim ?? null}
        open={!!selectedClaimId}
        onOpenChange={(open) => { if (!open) setSelectedClaimId(null); }}
        isOwner
      />
    </div>
  );
}

function StatCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-yellow-300" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm font-medium">{label}</span></div>
        <div className="text-3xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ClaimRow({ claim, onClick }: { claim: ExpenseClaim; onClick: () => void }) {
  return (
    <div
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{claim.trip_title}</span>
          <Badge variant={getStatusColor(claim.status)}>{getStatusLabel(claim.status)}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {claim.destination && <span>{claim.destination} · </span>}
          {format(new Date(claim.trip_start_date), "MMM d")} —{" "}
          {format(new Date(claim.trip_end_date), "MMM d, yyyy")}
        </div>
      </div>
      <div className="text-right ml-4">
        <div className="font-bold text-lg">₹{Number(claim.total_amount).toLocaleString("en-IN")}</div>
        {claim.submitted_at && (
          <div className="text-xs text-muted-foreground">
            {format(new Date(claim.submitted_at), "MMM d, yyyy")}
          </div>
        )}
      </div>
    </div>
  );
}
