import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui.css";
import Shell from "./Shell";
import { registerServiceWorker } from "./pwa";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>
);

registerServiceWorker();
