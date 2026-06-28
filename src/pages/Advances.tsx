import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, HandCoins, Plus, Search, Download, Check, ChevronsUpDown, Trash2, IndianRupee, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrentUser } from "@/hooks/useExpenseClaims";
import {
  useAdvanceReconciliation,
  useAdvancesList,
  useCreateAdvance,
  useDeleteAdvance,
  useOrgMembers,
  useMemberClaims,
  advanceKind,
  type ReconciliationRow,
} from "@/hooks/useAdvances";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function Advances() {
  const { permissions, isLoading: permsLoading } = useUserPermissions();
  const { currentOrg } = useOrg();
  const { data: user } = useCurrentUser();
  const canAccess = permissions.canManageAdvances;

  const { data: reconciliation, isLoading } = useAdvanceReconciliation(currentOrg?.id, canAccess);
  const { data: register } = useAdvancesList(canAccess ? currentOrg?.id : undefined);
  const [search, setSearch] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteAdvance = useDeleteAdvance();

  const rows = useMemo(() => {
    const list = reconciliation || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.trip_title?.toLowerCase().includes(q),
    );
  }, [reconciliation, search]);

  const totals = useMemo(() => {
    const list = reconciliation || [];
    const given = list.reduce((s, r) => s + Number(r.advances_total || 0), 0);
    const unspent = list.reduce((s, r) => s + Math.max(0, Number(r.balance || 0)), 0);
    const payable = list.reduce((s, r) => s + Math.max(0, -Number(r.balance || 0)), 0);
    const people = new Set(list.map((r) => r.user_id)).size;
    return { given, unspent, payable, people };
  }, [reconciliation]);

  if (!permsLoading && !canAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <HandCoins className="h-12 w-12 mx-auto opacity-30 mb-3" />
            Advances are managed by your organisation's admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleExport = () => {
    if (rows.length === 0) return;
    const headers = ["Employee", "Email", "Trip", "Advances Given (INR)", "Advances Count", "Expenses Approved (INR)", "Balance (INR)", "Status"];
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvRows = rows.map((r) => {
      const kind = advanceKind(Number(r.balance || 0));
      return [
        r.full_name || "",
        r.email || "",
        r.trip_title || "(General — no trip)",
        Number(r.advances_total || 0),
        Number(r.advances_count || 0),
        Number(r.expenses_total || 0),
        Number(r.balance || 0),
        kind === "unspent" ? "Unspent (recover)" : kind === "payable" ? "Payable" : "Settled",
      ].map(escape).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `advances-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HandCoins className="h-7 w-7" />
            Advances
          </h1>
          <p className="text-muted-foreground">
            Money advanced to employees, settled against the expenses they file
          </p>
        </div>
        <Button size="lg" onClick={() => setRecordOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Record Advance
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <KpiCard icon={<IndianRupee className="h-4 w-4 text-blue-500" />} label="Total Advances Given" value={inr(totals.given)} />
        <KpiCard icon={<Wallet className="h-4 w-4 text-amber-500" />} label="Unspent (to recover)" value={inr(totals.unspent)} hint="Employees holding money" />
        <KpiCard icon={<IndianRupee className="h-4 w-4 text-green-600" />} label="Payable (overspent)" value={inr(totals.payable)} hint="Company still owes" />
        <KpiCard icon={<Users className="h-4 w-4 text-purple-500" />} label="Employees with Advances" value={String(totals.people)} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-lg">By employee &amp; claim</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employee or claim…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HandCoins className="h-12 w-12 mx-auto opacity-30 mb-3" />
              No advances recorded yet. Use “Record Advance” to add one.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Claim</TableHead>
                    <TableHead className="text-right">Advances Given (₹)</TableHead>
                    <TableHead className="text-right">Expenses Approved (₹)</TableHead>
                    <TableHead className="text-right">Balance (₹)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <ReconRow key={`${r.user_id}|${r.claim_id ?? "none"}`} row={r} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register / recent entries with delete */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent advance entries</CardTitle>
        </CardHeader>
        <CardContent>
          {!register || register.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No entries yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Claim</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount (₹)</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {a.advance_date ? format(new Date(a.advance_date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{a.profiles?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{a.profiles?.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.claim?.trip_title ?? <span className="text-muted-foreground">General</span>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px] truncate text-muted-foreground">{a.note || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(Number(a.amount || 0))}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordAdvanceDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        orgId={currentOrg?.id}
        givenBy={user?.id}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this advance entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the advance record and updates every balance that used it. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) await deleteAdvance.mutateAsync(deleteId);
                setDeleteId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ReconRow({ row }: { row: ReconciliationRow }) {
  const kind = advanceKind(Number(row.balance || 0));
  const balance = Number(row.balance || 0);
  const tone =
    kind === "payable" ? "text-green-700 dark:text-green-400"
    : kind === "unspent" ? "text-amber-700 dark:text-amber-400"
    : "text-muted-foreground";
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground">{row.email}</div>
      </TableCell>
      <TableCell className="text-sm">
        {row.trip_title ?? <span className="text-muted-foreground">General (no claim)</span>}
      </TableCell>
      <TableCell className="text-right font-semibold">{inr(Number(row.advances_total || 0))}</TableCell>
      <TableCell className="text-right">{inr(Number(row.expenses_total || 0))}</TableCell>
      <TableCell className={`text-right font-semibold ${tone}`}>{inr(Math.abs(balance))}</TableCell>
      <TableCell>
        <Badge variant={kind === "settled" ? "outline" : "secondary"}>
          {kind === "unspent" ? "Unspent" : kind === "payable" ? "Payable" : "Settled"}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function RecordAdvanceDialog({
  open, onOpenChange, orgId, givenBy,
}: { open: boolean; onOpenChange: (o: boolean) => void; orgId?: string; givenBy?: string }) {
  const { data: members = [] } = useOrgMembers(open ? orgId : undefined);
  const createAdvance = useCreateAdvance();
  const [userId, setUserId] = useState<string | null>(null);
  const { data: claims = [] } = useMemberClaims(orgId, userId);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [advDate, setAdvDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [empOpen, setEmpOpen] = useState(false);

  const reset = () => {
    setUserId(null); setClaimId(null); setAmount(""); setNote("");
    setAdvDate(format(new Date(), "yyyy-MM-dd"));
  };

  const selectedEmp = members.find((p) => p.id === userId);
  const amountNum = parseFloat(amount);
  const canSave = !!orgId && !!userId && !!givenBy && amountNum > 0 && !!advDate;

  const handleSave = async () => {
    if (!canSave || !orgId || !userId || !givenBy) return;
    await createAdvance.mutateAsync({
      org_id: orgId,
      user_id: userId,
      claim_id: claimId,
      amount: amountNum,
      advance_date: advDate,
      note: note.trim() || null,
      given_by: givenBy,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5" /> Record an advance</DialogTitle>
          <DialogDescription>
            Money given to an employee. Tie it to a claim so the expenses filed against that claim settle against it, or leave blank for a general advance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !selectedEmp && "text-muted-foreground")}>
                  {selectedEmp ? selectedEmp.full_name : "Select employee"}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search employee…" />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {members.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.full_name} ${p.email}`}
                          onSelect={() => { setUserId(p.id); setClaimId(null); setEmpOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", userId === p.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex flex-col">
                            <span>{p.full_name}</span>
                            <span className="text-xs text-muted-foreground">{p.email}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Link to claim (optional)</Label>
            <Select
              value={claimId ?? "general"}
              onValueChange={(v) => setClaimId(v === "general" ? null : v)}
              disabled={!userId}
            >
              <SelectTrigger>
                <SelectValue placeholder={userId ? "General (no claim)" : "Select employee first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General (no claim)</SelectItem>
                {claims.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trip_title} · {format(new Date(c.trip_start_date), "dd MMM")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={advDate} onChange={(e) => setAdvDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={2} placeholder="e.g. cash advance for client visit" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || createAdvance.isPending}>
            {createAdvance.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Record Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
