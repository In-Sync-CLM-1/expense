import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Receipt, Loader2, Eye, EyeOff, CheckCircle2, MessageSquare, Mail } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Edge Functions return a JSON `{ error: "..." }` body on non-2xx, but the
// supabase-js client surfaces only the generic "Edge Function returned a
// non-2xx status code" message. Unwrap the response body so the user sees
// the real reason (expired OTP, incorrect OTP, etc.).
async function extractFnError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      if (body?.error) return String(body.error);
    } catch { /* fall through */ }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ── Sign In ───────────────────────────────────────────────────────────────────

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Enter your email and password"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Navigation handled by Login page's useEffect once auth state resolves
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) { toast.error("Enter your email"); return; }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent!");
      setForgotOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setForgotOpen(true)}
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Sign In
        </Button>
      </form>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
            <Button onClick={handleForgotPassword} disabled={forgotLoading}>
              {forgotLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Reset Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sign Up ───────────────────────────────────────────────────────────────────

type SignUpStep = "details" | "otp" | "done";

function SignUp() {
  const navigate = useNavigate();

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP state
  const [step, setStep]         = useState<SignUpStep>("details");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp]           = useState("");
  const [channels, setChannels] = useState<{ whatsapp: boolean; email: boolean }>({ whatsapp: false, email: false });

  const [loading, setLoading]   = useState(false);

  // Step 1 — send OTP to both channels
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !phone || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone)) {
      toast.error("Enter a valid 10-digit Indian mobile number");
      return;
    }

    setLoading(true);
    try {
      const res = await supabase.functions.invoke("send-otp", {
        body: { phone: cleanPhone, email, name: fullName },
      });
      if (res.error) throw res.error;
      const data = res.data as { success: boolean; sessionId: string; channels: { whatsapp: boolean; email: boolean } };
      if (!data.success) throw new Error("Failed to send OTP");

      setSessionId(data.sessionId);
      setChannels(data.channels);
      setStep("otp");

      const sent = [];
      if (data.channels.whatsapp) sent.push("WhatsApp");
      if (data.channels.email) sent.push("email");
      toast.success(`OTP sent via ${sent.join(" & ")}`);
    } catch (err: unknown) {
      toast.error(await extractFnError(err, "Failed to send OTP"));
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify OTP then create account
  const handleVerifyAndCreate = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      // Verify OTP
      const verifyRes = await supabase.functions.invoke("verify-otp", {
        body: { sessionId, otp },
      });
      if (verifyRes.error) throw verifyRes.error;
      const verifyData = verifyRes.data as { verified?: boolean; error?: string };
      if (!verifyData.verified) throw new Error(verifyData.error || "OTP verification failed");

      // Create account
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (signUpError) throw signUpError;

      setStep("done");
    } catch (err: unknown) {
      toast.error(await extractFnError(err, "Verification failed"));
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    setOtp("");
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const res = await supabase.functions.invoke("send-otp", {
        body: { phone: cleanPhone, email, name: fullName },
      });
      if (res.error) throw res.error;
      const data = res.data as { success: boolean; sessionId: string; channels: { whatsapp: boolean; email: boolean } };
      setSessionId(data.sessionId);
      setChannels(data.channels);
      toast.success("New OTP sent");
    } catch (err: unknown) {
      toast.error(await extractFnError(err, "Failed to resend"));
    } finally {
      setLoading(false);
    }
  };

  // ── Done state ──────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="text-center space-y-4 py-4">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
        <div>
          <p className="font-semibold text-lg">Account created!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please check your email to confirm your address, then sign in.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate("/login")}>
          Go to Sign In
        </Button>
      </div>
    );
  }

  // ── OTP step ────────────────────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <div className="space-y-5">
        {/* Channel indicators */}
        <div className="flex gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${channels.whatsapp ? "border-green-300 bg-green-50 text-green-700" : "border-muted text-muted-foreground"}`}>
            <MessageSquare className="h-3.5 w-3.5" />
            WhatsApp {channels.whatsapp ? "✓" : "—"}
          </div>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${channels.email ? "border-blue-300 bg-blue-50 text-blue-700" : "border-muted text-muted-foreground"}`}>
            <Mail className="h-3.5 w-3.5" />
            Email {channels.email ? "✓" : "—"}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Enter the 6-digit OTP</p>
          <p className="text-xs text-muted-foreground">
            Sent to <span className="font-medium">{phone}</span> and <span className="font-medium">{email}</span>
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          className="w-full"
          onClick={handleVerifyAndCreate}
          disabled={loading || otp.length !== 6}
        >
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Verify & Create Account
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { setStep("details"); setOtp(""); }}
          >
            ← Back
          </button>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={handleResend}
            disabled={loading}
          >
            Resend OTP
          </button>
        </div>
      </div>
    );
  }

  // ── Details step ────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSendOtp} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reg-name">Full Name</Label>
        <Input
          id="reg-name"
          placeholder="Amit Sengupta"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">Work Email</Label>
        <Input
          id="reg-email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-phone">Mobile Number</Label>
        <div className="flex gap-2">
          <span className="flex items-center px-3 border rounded-md bg-muted text-sm text-muted-foreground select-none">
            +91
          </span>
          <Input
            id="reg-phone"
            type="tel"
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            autoComplete="tel"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <div className="relative">
          <Input
            id="reg-password"
            type={showPassword ? "text" : "password"}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Send OTP
      </Button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const { user, isPlatformAdmin, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "signin";

  // Redirect once auth state is fully resolved
  useEffect(() => {
    if (authLoading || !user) return;
    if (isPlatformAdmin) navigate("/platform", { replace: true });
    else navigate("/dashboard", { replace: true });
  }, [authLoading, user, isPlatformAdmin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-background p-4">
      <Card className="w-full max-w-md shadow-deep">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-primary rounded-2xl">
              <Receipt className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Expense Claims</CardTitle>
          <CardDescription>Manage your expense claims</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full mb-5">
              <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignIn />
            </TabsContent>
            <TabsContent value="signup">
              <SignUp />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
