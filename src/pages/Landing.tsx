import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Receipt, BarChart3, Users, ShieldCheck, ArrowRight,
  TrendingUp, FileText, CheckCircle2, AlertCircle, Download,
  Eye, Lock, Smartphone,
} from "lucide-react";

const painPoints = [
  { icon: AlertCircle, text: "Expense reports submitted on WhatsApp or email" },
  { icon: AlertCircle, text: "No visibility into what's approved vs. what's pending" },
  { icon: AlertCircle, text: "Finance scrambling at month-end to reconcile claims" },
  { icon: AlertCircle, text: "No audit trail when questions arise" },
];

const features = [
  {
    icon: Eye,
    title: "Real-Time Spend Visibility",
    description:
      "See every claim across your organisation — pending, approved, rejected, and reimbursed — without asking anyone for a status update.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: CheckCircle2,
    title: "Structured Approval Chains",
    description:
      "Nothing gets reimbursed without the right sign-off. Managers approve with a custom approved amount; admins have full override control.",
    color: "text-[hsl(142_76%_36%)]",
    bg: "bg-[hsl(142_56%_92%)]",
  },
  {
    icon: BarChart3,
    title: "Finance-Ready Reports",
    description:
      "Monthly summaries, team-wise spend breakdowns, and full audit exports — one click, ready for your accountant or board deck.",
    color: "text-secondary",
    bg: "bg-secondary/10",
  },
  {
    icon: TrendingUp,
    title: "Reimbursement Tracking",
    description:
      "Approved claims don't disappear into a spreadsheet. Track every rupee owed through to actual disbursement.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Users,
    title: "Team Hierarchy & Delegation",
    description:
      "Mirror your org chart. Employees report to managers; managers report to you. Approvals flow through the right people automatically.",
    color: "text-secondary",
    bg: "bg-secondary/10",
  },
  {
    icon: Lock,
    title: "Role-Based Access Control",
    description:
      "Employees see only their own claims. Managers see their team. Admins see everything. Sensitive data never leaks sideways.",
    color: "text-[hsl(142_76%_36%)]",
    bg: "bg-[hsl(142_56%_92%)]",
  },
];

const steps = [
  {
    number: "01",
    title: "Sign Up in Seconds",
    description: "Register with your work email and mobile number. Your identity is verified instantly via OTP on both WhatsApp and email.",
  },
  {
    number: "02",
    title: "Create Your Organisation",
    description: "Name your organisation, add team members, and assign roles — employee, manager, or admin. Your approval chain is live immediately.",
  },
  {
    number: "03",
    title: "Claims Flow Through Approvals",
    description: "Employees submit itemised claims with receipts. Managers review, approve with an exact amount, and every action is timestamped.",
  },
  {
    number: "04",
    title: "Finance Closes the Loop",
    description: "Approved claims queue up for reimbursement. Mark as paid, export a finance-ready CSV report, and you're done.",
  },
];

const stats = [
  { value: "100%", label: "Claim visibility, always", icon: Eye },
  { value: "0", label: "Spreadsheets required", icon: FileText },
  { value: "Full", label: "Audit trail on every action", icon: ShieldCheck },
  { value: "1-click", label: "CSV export for finance", icon: Download },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navigation ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary rounded-lg">
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Expense Claims</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Sign In
              </Button>
            </Link>
            <Link to="/login?tab=signup">
              <Button size="sm" className="btn-accent gap-1.5">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[hsl(222_47%_15%)] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(280_85%_65%/0.15),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(217_91%_60%/0.12),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(hsl(0_0%_100%)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="animate-float absolute top-16 right-24 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="animate-float absolute bottom-8 left-16 w-48 h-48 rounded-full bg-secondary/10 blur-3xl" style={{ animationDelay: "1.5s" }} />

        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-sm text-white/70 mb-8">
            <span className="w-2 h-2 rounded-full bg-[hsl(142_76%_45%)] animate-pulse" />
            Multi-tenant · OTP-verified sign-up · Free to start
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            Stop Chasing Expense Reports.{" "}
            <span className="gradient-text-primary">Start Controlling Spend.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/65 max-w-2xl mx-auto mb-10 leading-relaxed">
            Give your CFO, finance team, and business heads complete visibility
            into every expense claim — from submission to reimbursement —
            with structured approvals and audit-ready reports.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login?tab=signup">
              <Button size="lg" className="btn-accent gap-2 px-8 py-6 text-base shadow-glow">
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Trust row */}
          <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-white/45">
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> WhatsApp OTP verification
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Role-based access control
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> No credit card required
            </span>
          </div>
        </div>
      </section>

      {/* ── Pain Points ────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/50">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            Sound familiar?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {painPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
                <Icon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {stats.map(({ value, label, icon: Icon }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="text-3xl font-extrabold gradient-text-primary">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </div>
        ))}
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section className="bg-[hsl(222_47%_15%)] text-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
              Everything finance needs.{" "}
              <span className="gradient-text-primary">Nothing it doesn't.</span>
            </h2>
            <p className="text-white/60 text-lg max-w-xl mx-auto">
              Designed so your finance team spends less time chasing paper and more time on decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1">
                <div className={`inline-flex p-3 rounded-xl ${bg} mb-4`}>
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
                <h3 className="font-bold text-lg mb-2 text-white">{title}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            Live in{" "}
            <span className="gradient-text-primary">minutes</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            No implementation project. No consultants. Just a working expense system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map(({ number, title, description }, i) => (
            <div key={number} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(100%-1rem)] w-full h-px bg-border z-0" />
              )}
              <div className="relative z-10">
                <div className="text-5xl font-black gradient-text-primary opacity-60 mb-3">{number}</div>
                <h3 className="font-bold text-lg mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24 text-center">
        <div className="relative overflow-hidden rounded-3xl bg-[hsl(222_47%_15%)] px-8 py-16 shadow-deep">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(217_91%_60%/0.15),transparent_70%)]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Ready to bring order to your expense process?
            </h2>
            <p className="text-white/60 text-lg mb-8 max-w-lg mx-auto">
              Sign up in seconds — verified via WhatsApp and email OTP.
              Your finance team will thank you. Your auditors will too.
            </p>
            <Link to="/login?tab=signup">
              <Button size="lg" className="btn-accent gap-2 px-8 shadow-glow">
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-primary rounded-md">
              <Receipt className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Expense Claims</span>
          </div>
          <span>© {new Date().getFullYear()} In-Sync. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
