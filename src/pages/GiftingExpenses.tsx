import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Gift, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useCurrentUser } from "@/hooks/useExpenseClaims";
import { useOrg } from "@/contexts/OrgContext";
import { isRmplOrg } from "@/lib/rmplOrg";
import {
  useMyGiftingExpenseClaims, useGiftingExpenseClaimDetail,
  getGiftingStatusColor, getGiftingStatusLabel,
  type GiftingExpenseClaim,
} from "@/hooks/useGiftingExpenses";
import { GiftingExpenseClaimDialog } from "@/components/expenses/GiftingExpenseClaimDialog";

export default function GiftingExpenses() {
  const { currentOrg } = useOrg();
  const { data: user } = useCurrentUser();
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const { data: claims, isLoading } = useMyGiftingExpenseClaims(user?.id);
  const { data: selectedClaim } = useGiftingExpenseClaimDetail(selectedClaimId ?? undefined);

  if (!isRmplOrg(currentOrg?.id)) {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Gifting Expenses is available for the RMPL organisation only.
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
            <Gift className="h-7 w-7" /> Gifting Expenses
          </h1>
          <p className="text-muted-foreground">One claim, many projects — no approval needed, straight to Accounts for payment</p>
        </div>
        <Button onClick={() => setNewOpen(true)} size="lg">
          <Plus className="mr-2 h-4 w-4" /> New Gifting Expense
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
              <SelectItem value="submitted">Awaiting Payment</SelectItem>
              <SelectItem value="reimbursed">Paid</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No gifting expense claims found</p>
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
        <GiftingExpenseClaimDialog open={newOpen} onOpenChange={setNewOpen} userId={user.id} orgId={currentOrg.id} />
      )}

      <Dialog open={!!selectedClaimId} onOpenChange={(o) => { if (!o) setSelectedClaimId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" /> Gifting Expense — {selectedClaim?.period || format(new Date(selectedClaim?.created_at ?? Date.now()), "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={getGiftingStatusColor(selectedClaim.status)}>
                  {getGiftingStatusLabel(selectedClaim.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">Filed by {selectedClaim.filer_name}</span>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Lines by Project</p>
                {selectedClaim.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {item.project_name}{item.project_number ? ` (${item.project_number})` : ""}
                      </div>
                      <span className="text-muted-foreground">
                        {format(new Date(item.line_date), "MMM d, yyyy")} · {item.description || item.recipient || "—"}
                      </span>
                      {item.receipt_url && (
                        <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 inline-flex items-center gap-0.5">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <span className="font-medium shrink-0 ml-2">₹{Number(item.amount).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between font-semibold"><span>Total</span><span>₹{Number(selectedClaim.total_amount).toLocaleString("en-IN")}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClaimRow({ claim, onClick }: { claim: GiftingExpenseClaim; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={onClick}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{claim.period || format(new Date(claim.created_at), "MMM d, yyyy")}</span>
          <Badge variant={getGiftingStatusColor(claim.status)}>{getGiftingStatusLabel(claim.status)}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">{claim.filer_name}</div>
      </div>
      <div className="text-right ml-4">
        <div className="font-bold text-lg">₹{Number(claim.total_amount).toLocaleString("en-IN")}</div>
        {claim.submitted_at && (
          <div className="text-xs text-muted-foreground">{format(new Date(claim.submitted_at), "MMM d, yyyy")}</div>
        )}
      </div>
    </div>
  );
}
