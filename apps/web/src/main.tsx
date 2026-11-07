import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { Startup } from "./Startup";
import "./style.css";
import { isTauri } from '@tauri-apps/api/core';
if(isTauri() && location.pathname === '/') history.replaceState(null,'','/operations');
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Startup><App /></Startup>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
