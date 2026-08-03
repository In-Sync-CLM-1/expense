import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { requestAppUpdate } from "./lib/pwaUpdateGate";

// Poll for updates every 60s (plus workbox's own check whenever the tab
// regains focus) so an already-open tab picks up a new deploy without
// requiring a manual reload. But applying that update means a forced
// location.reload() — if the employee has the New Expense Claim dialog open
// (a very likely moment to trigger the focus-regain check, since that's
// exactly when someone alt-tabs away and back), it would blow away
// whatever they were filling in. requestAppUpdate defers the reload until
// the dialog is closed instead of forcing it through immediately.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    requestAppUpdate(() => updateSW(true));
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 1000);
  },
});

window.addEventListener("error", (event) => {
  console.error("[GLOBAL ERROR]", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    error: event.error?.stack,
    route: window.location.pathname,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[UNHANDLED REJECTION]", {
    reason: event.reason,
    route: window.location.pathname,
  });
});

createRoot(document.getElementById("root")!).render(<App />);
