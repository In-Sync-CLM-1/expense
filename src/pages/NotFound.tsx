import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
      <Receipt className="h-16 w-16 text-muted-foreground/30" />
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
    </div>
  );
}
