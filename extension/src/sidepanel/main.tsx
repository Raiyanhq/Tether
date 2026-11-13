import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import { IS_BUBBLE } from "../lib/config";
import "@fontsource/patrick-hand/400.css"; // handwriting style for the Tutor notepad
import { App } from "./App";
import "./styles.css";

if (IS_BUBBLE) document.documentElement.classList.add("bubble");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
