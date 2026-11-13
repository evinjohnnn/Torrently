import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NotepadHero } from "./NotepadHero";
import "./notepad.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NotepadHero />
  </StrictMode>,
);
