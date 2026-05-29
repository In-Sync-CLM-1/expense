import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, ShieldCheck, Download } from "lucide-react";
import { format } from "date-fns";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  useCurrentUser, usePendingApprovals, useAllApprovals,
  useApproveClaim, useRejectClaim,
  getStatusColor, getStatusLabel, type ExpenseClaim,
} from "@/hooks/useExpenseClaims";
import { ApprovalCard } from "@/components/expenses/ApprovalCard";
import { exportClaimsToCSV } from "@/lib/expenseExport";

export default function Approvals() {
  const { data: user } = useCurrentUser();
  const { permissions } = useUserPermissions();

  const { data: pending, isLoading: pendingLoading } = usePendingApprovals(user?.id);
  const { data: allClaims, isLoading: allLoading } = useAllApprovals(user?.id, permissions.isAdmin);

  const [rejectClaim, setRejectClaim] = useState<ExpenseClaim | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveClaim, setApproveClaim] = useState<ExpenseClaim | null>(null);
  const [approvedAmount, setApprovedAmount] = useState("");

  const approveMutation = useApproveClaim();
  const rejectMutation = useRejectClaim();

  const handleApprove = async () => {
    if (!approveClaim || !user) return;
    await approveMutation.mutateAsync({
      claimId: approveClaim.id,
      approverId: user.id,
      approvedAmount: approvedAmount ? parseFloat(approvedAmount) : Number(approveClaim.total_amount),
    });
    setApproveClaim(null);
    setApprovedAmount("");
  };

  const handleReject = async () => {
    if (!rejectClaim || !user || !rejectReason.trim()) return;
    await rejectMutation.mutateAsync({
      claimId: rejectClaim.id,
      approverId: user.id,
      reason: rejectReason,
    });
    setRejectClaim(null);
    setRejectReason("");
  };

  const history = allClaims?.filter((c) => c.status !== "submitted") ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-7 w-7" /> Expense Approvals
        </h1>
        <p className="text-muted-foreground">Review and approve team expense claims</p>
      </div>

      <Tabs defaultValue="pending">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="pending" className="flex gap-2">
              Pending
              {(pending?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">{pending?.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {history.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportClaimsToCSV(history)}>
              <Download className="h-4 w-4 mr-2" /> Export History CSV
            </Button>
          )}
        </div>

        {/* Pending */}
        <TabsContent value="pending" className="space-y-4 mt-4">
          {pendingLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !pending?.length ? (
            <Card><CardContent className="py-12 text-center">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500/30 mb-3" />
              <p className="text-muted-foreground">All caught up! No pending approvals.</p>
            </CardContent></Card>
          ) : (
            pending.map((claim) => (
              <ApprovalCard
                key={claim.id}
                claim={claim}
                onApprove={() => { setApproveClaim(claim); setApprovedAmount(String(Number(claim.total_amount))); }}
                onReject={() => setRejectClaim(claim)}
              />
            ))
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-3 mt-4">
          {allLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !history.length ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No history yet</CardContent></Card>
          ) : (
            history.map((claim) => (
              <div key={claim.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{claim.trip_title}</span>
                    <Badge variant={getStatusColor(claim.status)}>{getStatusLabel(claim.status)}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {claim.profiles?.full_name}
                    {claim.destination && ` · ${claim.destination}`}
                    {" · "}{format(new Date(claim.trip_start_date), "MMM d")} —{" "}
                    {format(new Date(claim.trip_end_date), "MMM d, yyyy")}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold">₹{Number(claim.total_amount).toLocaleString("en-IN")}</div>
                  {claim.approved_amount != null && (
                    <div className="text-xs text-green-600">
                      Approved: ₹{Number(claim.approved_amount).toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={!!approveClaim} onOpenChange={(o) => { if (!o) setApproveClaim(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm"><strong>{approveClaim?.trip_title}</strong> by {approveClaim?.profiles?.full_name}</p>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span>Claimed Amount</span>
              <span className="font-bold">₹{Number(approveClaim?.total_amount ?? 0).toLocaleString("en-IN")}</span>
            </div>
            <div className="space-y-2">
              <Label>Approved Amount (₹)</Label>
              <Input type="number" value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave as-is to approve the full amount</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveClaim(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectClaim} onOpenChange={(o) => { if (!o) setRejectClaim(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              <strong>{rejectClaim?.trip_title}</strong> by {rejectClaim?.profiles?.full_name}<br />
              Amount: ₹{Number(rejectClaim?.total_amount ?? 0).toLocaleString("en-IN")}
            </p>
            <div className="space-y-2">
              <Label>Reason for Rejection *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please provide a reason"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectClaim(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}>
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
