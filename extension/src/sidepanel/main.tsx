import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
