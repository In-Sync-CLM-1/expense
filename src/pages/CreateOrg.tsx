import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Building2, Users, Rocket, ArrowRight, ArrowLeft,
  Check, SkipForward, Plus, X, Receipt, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "Education", "Manufacturing",
  "Retail", "Consulting", "Real Estate", "Media", "Other",
];

const ROLES = [
  { value: "admin",    label: "Admin",    desc: "Full access, user management" },
  { value: "manager",  label: "Manager",  desc: "Approve team expense claims" },
  { value: "employee", label: "Employee", desc: "Submit own claims only" },
];

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-8) + "A1!";
}

interface InviteRow {
  email: string;
  role: string;
  fullName: string;
}

const STEPS = [
  { id: "org",    title: "Your Organisation", icon: Building2, description: "Name your company workspace" },
  { id: "invite", title: "Invite Your Team",  icon: Users,     description: "Add colleagues — or skip and do it later" },
  { id: "launch", title: "You're All Set!",   icon: Rocket,    description: "Your expense system is ready" },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

export default function CreateOrg() {
  const navigate   = useNavigate();
  const { user, isPlatformAdmin, loading: authLoading } = useAuth();
  const { refreshOrgs } = useOrg();

  // Platform admins never need to create an org
  useEffect(() => {
    if (!authLoading && isPlatformAdmin) navigate("/platform", { replace: true });
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, isPlatformAdmin, user, navigate]);

  const [step, setStep]   = useState(0);
  const [dir, setDir]     = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [orgName, setOrgName]     = useState("");
  const [industry, setIndustry]   = useState("");
  const [orgId, setOrgId]         = useState<string | null>(null);

  // Step 2 — invite rows
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "employee", fullName: "" },
  ]);
  const [inviteResults, setInviteResults] = useState<{ email: string; ok: boolean }[]>([]);

  const goNext = () => { setDir(1);  setStep((s) => s + 1); };
  const goBack = () => { setDir(-1); setStep((s) => s - 1); };

  // ── Step 1: create org ───────────────────────────────────────────────────────
  // Calls a SECURITY DEFINER RPC that creates the org + admin membership
  // atomically, bypassing the chicken-and-egg RLS on these two tables.
  const handleCreateOrg = async () => {
    if (!orgName.trim()) { toast.error("Organisation name is required"); return; }
    if (!user) return;
    setLoading(true);
    try {
      const slug = slugify(orgName) + "-" + Math.random().toString(36).slice(2, 6);
      const { data, error } = await supabase.rpc("create_organization" as never, {
        p_name: orgName.trim(),
        p_slug: slug,
        p_industry: industry || null,
      });
      if (error) throw error;
      if (!data) throw new Error("No organisation id returned");

      setOrgId(data as unknown as string);
      goNext();
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message;
      toast.error(msg || "Failed to create organisation");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: send invites ─────────────────────────────────────────────────────
  const handleInvite = async (skip = false) => {
    if (skip || !orgId) { goNext(); return; }

    const valid = invites.filter((r) => r.email.trim());
    if (valid.length === 0) { goNext(); return; }

    setLoading(true);
    const results: { email: string; ok: boolean }[] = [];

    for (const row of valid) {
      try {
        const res = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: row.email.trim(),
            password: generateTempPassword(),
            full_name: row.fullName.trim() || row.email.split("@")[0],
            role: row.role,
            org_id: orgId,
          },
        });
        results.push({ email: row.email, ok: !res.error && res.data?.success });
      } catch {
        results.push({ email: row.email, ok: false });
      }
    }

    setInviteResults(results);
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) toast.warning(`${failed} invite(s) failed — you can add them later from Users.`);
    else toast.success(`${results.length} team member(s) invited!`);

    setLoading(false);
    goNext();
  };

  // ── Step 3: complete ─────────────────────────────────────────────────────────
  const handleComplete = async () => {
    setLoading(true);
    await refreshOrgs();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } }), 300);
    setTimeout(() => navigate("/dashboard"), 1200);
  };

  // ── Invite row helpers ───────────────────────────────────────────────────────
  const addRow = () => setInvites((prev) => [...prev, { email: "", role: "employee", fullName: "" }]);
  const removeRow = (i: number) => setInvites((prev) => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof InviteRow, val: string) =>
    setInvites((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const currentStep = STEPS[step];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/5" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
      <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl" />

      {/* Logo */}
      <div className="relative z-10 mb-8 flex items-center gap-2">
        <div className="p-2 bg-primary rounded-lg">
          <Receipt className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold">Expense Claims</span>
      </div>

      {/* Progress stepper */}
      <div className="relative z-10 mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <motion.div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                  animate={{ scale: i === step ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </motion.div>
                <span className={`hidden text-[10px] font-medium sm:block ${i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 mb-5 transition-colors ${i < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          );
        })}
      </div>

      <Card className="relative z-10 w-full max-w-lg border-border shadow-xl overflow-hidden">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">{currentStep.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{currentStep.description}</p>
        </CardHeader>
        <CardContent className="pt-2">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >

              {/* ══ Step 1 — Organisation ══ */}
              {step === 0 && (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Organisation Name *</Label>
                    <Input
                      placeholder="Acme Pvt Ltd"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((ind) => (
                          <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full gap-2 mt-2" onClick={handleCreateOrg} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create Organisation <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* ══ Step 2 — Invite team ══ */}
              {step === 1 && (
                <div className="space-y-4 py-2">
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {invites.map((row, i) => (
                      <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="email"
                            placeholder="colleague@company.com"
                            value={row.email}
                            onChange={(e) => updateRow(i, "email", e.target.value)}
                            className="flex-1 text-sm"
                          />
                          {invites.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeRow(i)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Full name (optional)"
                            value={row.fullName}
                            onChange={(e) => updateRow(i, "fullName", e.target.value)}
                            className="flex-1 text-sm"
                          />
                          <Select value={row.role} onValueChange={(v) => updateRow(i, "role", v)}>
                            <SelectTrigger className="w-32 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  <div>
                                    <div className="font-medium text-sm">{r.label}</div>
                                    <div className="text-xs text-muted-foreground">{r.desc}</div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add another
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    Each person will receive login credentials via email. You can also add users later from the Users page.
                  </p>

                  <div className="flex justify-between gap-2 pt-1">
                    <Button variant="outline" onClick={goBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => handleInvite(true)} className="gap-2">
                        <SkipForward className="h-4 w-4" /> Skip
                      </Button>
                      <Button onClick={() => handleInvite(false)} disabled={loading} className="gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Invite & Continue <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ Step 3 — Launch ══ */}
              {step === 2 && (
                <div className="space-y-6 text-center py-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
                  >
                    <Rocket className="h-10 w-10 text-primary" />
                  </motion.div>

                  <div>
                    <h3 className="text-lg font-bold">{orgName} is live!</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your organisation is set up and you're the admin. Start by submitting your first expense claim.
                    </p>
                  </div>

                  {inviteResults.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {inviteResults.map((r) => (
                        <Badge key={r.email} variant={r.ok ? "default" : "destructive"} className="text-xs">
                          {r.ok ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                          {r.email}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Button onClick={handleComplete} disabled={loading} size="lg" className="gap-2 w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    Launch Dashboard
                  </Button>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
