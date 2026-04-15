import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { isCloudEnabled } from "./config/cloud";
import { AuthProvider } from "./store/authStore";

document.documentElement.lang = "de";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isCloudEnabled ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
