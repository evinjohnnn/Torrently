import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Router } from "./app/router";
import { readBootState } from "./app/state";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/components.css";

const state = readBootState();

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Router initial={state}>
      <App />
    </Router>
  </StrictMode>,
);
