import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Briefcase, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useCurrentUser } from "@/hooks/useExpenseClaims";
import { useOrg } from "@/contexts/OrgContext";
import { isRmplOrg } from "@/lib/rmplOrg";
import {
  useMyProjectExpenseClaims, useProjectExpenseClaimDetail,
  getProjectExpenseStatusColor, getProjectExpenseStatusLabel,
  type ProjectExpenseClaim,
} from "@/hooks/useProjectExpenses";
import { ProjectExpenseClaimDialog } from "@/components/expenses/ProjectExpenseClaimDialog";

export default function ProjectExpenses() {
  const { currentOrg } = useOrg();
  const { data: user } = useCurrentUser();
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const { data: claims, isLoading } = useMyProjectExpenseClaims(user?.id);
  const { data: selectedClaim } = useProjectExpenseClaimDetail(selectedClaimId ?? undefined);

  if (!isRmplOrg(currentOrg?.id)) {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Project Expenses is available for the RMPL organisation only.
        </CardContent></Card>
      </div>
    );
  }

  const filtered = claims?.filter((c) => statusFilter === "all" || c.status === statusFilter) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="h-7 w-7" /> Project Expenses
          </h1>
          <p className="text-muted-foreground">File expenses against an RMPL project — approved by the Project Owner</p>
        </div>
        <Button onClick={() => setNewOpen(true)} size="lg">
          <Plus className="mr-2 h-4 w-4" /> New Project Expense
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">My Claims</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="submitted">Pending Project Owner Approval</SelectItem>
              <SelectItem value="approved">Approved — Awaiting Payment</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="reimbursed">Paid</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No project expense claims found</p>
              <Button variant="outline" className="mt-4" onClick={() => setNewOpen(true)}>
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

      {user && currentOrg && (
        <ProjectExpenseClaimDialog open={newOpen} onOpenChange={setNewOpen} userId={user.id} orgId={currentOrg.id} />
      )}

      <Dialog open={!!selectedClaimId} onOpenChange={(o) => { if (!o) setSelectedClaimId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> {selectedClaim?.project_name}
            </DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={getProjectExpenseStatusColor(selectedClaim.status)}>
                  {getProjectExpenseStatusLabel(selectedClaim.status)}
                </Badge>
                {selectedClaim.project_number && <span className="text-sm text-muted-foreground">Project No. {selectedClaim.project_number}</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Traveller</span><p className="font-medium">{selectedClaim.traveller_name}</p></div>
                <div><span className="text-muted-foreground">Project Owner</span><p className="font-medium">{selectedClaim.project_owner_name ?? "—"}</p></div>
                <div><span className="text-muted-foreground">City</span><p className="font-medium">{selectedClaim.city ?? "—"}</p></div>
                <div><span className="text-muted-foreground">Period</span><p className="font-medium">{selectedClaim.period ?? "—"}</p></div>
              </div>

              {selectedClaim.status === "rejected" && selectedClaim.rejection_reason && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
                  <strong>Rejection reason:</strong> {selectedClaim.rejection_reason}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold">Expense Lines</p>
                {selectedClaim.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <div>
                      <span>{format(new Date(item.line_date), "MMM d, yyyy")} · {item.description || item.mode_of_transport}</span>
                      {item.receipt_url && (
                        <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 inline-flex items-center gap-0.5">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <span className="font-medium">₹{Number(item.grand_total).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>

              {!!selectedClaim.travel_logs?.length && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Travel Log</p>
                  {selectedClaim.travel_logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-sm border rounded p-2 text-muted-foreground">
                      <span>{log.travel_date ? format(new Date(log.travel_date), "MMM d") : "—"} · {log.from_place} → {log.to_place} ({log.mode})</span>
                      <span>₹{Number(log.total).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between"><span>Advance Received</span><span className="font-medium">₹{Number(selectedClaim.advance_amount).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span>Actual Expense Incurred</span><span className="font-medium">₹{Number(selectedClaim.actual_expense_total).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between font-semibold pt-1 border-t"><span>Net Balance</span><span>₹{Number(selectedClaim.net_balance).toLocaleString("en-IN")}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClaimRow({ claim, onClick }: { claim: ProjectExpenseClaim; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={onClick}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{claim.project_name}</span>
          <Badge variant={getProjectExpenseStatusColor(claim.status)}>{getProjectExpenseStatusLabel(claim.status)}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {claim.project_number && <span>{claim.project_number} · </span>}
          {claim.city && <span>{claim.city} · </span>}
          Owner: {claim.project_owner_name ?? "—"}
        </div>
      </div>
      <div className="text-right ml-4">
        <div className="font-bold text-lg">₹{Number(claim.actual_expense_total).toLocaleString("en-IN")}</div>
        {claim.submitted_at && (
          <div className="text-xs text-muted-foreground">{format(new Date(claim.submitted_at), "MMM d, yyyy")}</div>
        )}
      </div>
    </div>
  );
}
