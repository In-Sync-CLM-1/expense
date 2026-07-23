import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, HandCoins } from "lucide-react";
import { useCreateAdvanceRequest } from "@/hooks/useAdvanceRequests";

interface RequestAdvanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string;
  userId?: string;
}

export function RequestAdvanceDialog({ open, onOpenChange, orgId, userId }: RequestAdvanceDialogProps) {
  const createRequest = useCreateAdvanceRequest();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [remarks, setRemarks] = useState("");

  const reset = () => { setAmount(""); setPurpose(""); setRemarks(""); };

  const amountNum = parseFloat(amount);
  const canSubmit = !!orgId && !!userId && amountNum > 0 && !!purpose.trim();

  const handleSubmit = async () => {
    if (!canSubmit || !orgId || !userId) return;
    await createRequest.mutateAsync({
      org_id: orgId,
      user_id: userId,
      amount: amountNum,
      purpose: purpose.trim(),
      employee_remarks: remarks.trim() || null,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5" /> Request an Advance</DialogTitle>
          <DialogDescription>
            Your assigned approver will review this before it's disbursed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">Amount (₹) *</Label>
            <Input id="adv-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-purpose">Purpose *</Label>
            <Input id="adv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Client site visit — Delhi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-remarks">Remarks</Label>
            <Textarea id="adv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Any context that helps your approver review this" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createRequest.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || createRequest.isPending}>
            {createRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
