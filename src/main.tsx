import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Early token capture (before React mounts) so auth state is correct on first render.
(() => {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (token) {
      localStorage.setItem("auth_token", token);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // no-op
  }
})();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);
