import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/lexend";
import "./styles/tokens.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
