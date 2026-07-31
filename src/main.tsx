import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// The auto-injected register script only checks for a new deploy on a real
// page load. An employee who keeps this tab open and just alt-tabs to
// another app (Excel, etc.) and back — never triggering a navigation —
// would otherwise keep running whatever bundle was loaded when the tab was
// first opened, even hours/days after a fix has shipped. Poll for updates
// every 60s so an already-open tab picks up a new deploy on its own.
registerSW({
  immediate: true,
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
