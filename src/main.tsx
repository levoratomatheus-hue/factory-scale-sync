import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Força modo claro independente de preferência do OS ou classe injetada pela plataforma
document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
