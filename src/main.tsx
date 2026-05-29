import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
