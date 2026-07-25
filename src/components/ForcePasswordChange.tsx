import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const TEMP_PASSWORD = "Rmpl@1234";

export function ForcePasswordChange({
  userId,
  email,
  onDone,
  onSignOut,
}: {
  userId: string;
  email?: string | null;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password === TEMP_PASSWORD) { toast.error("Please choose a new password, not the temporary one"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { error: pErr } = await supabase
        .from("profiles" as never)
        .update({ must_change_password: false } as never)
        .eq("id", userId);
      if (pErr) throw pErr;
      toast.success("Password updated");
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-background p-4">
      <Card className="w-full max-w-md shadow-deep">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-primary rounded-2xl">
              <KeyRound className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle>Set a New Password</CardTitle>
          <CardDescription>
            For security, you must choose your own password before continuing
            {email ? <> as <span className="font-medium">{email}</span></> : null}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Password & Continue
            </Button>
          </form>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4"
          >
            Sign out
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
