import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { syncSystemTheme } from "@/lib/theme";
import "./index.css";

syncSystemTheme();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
