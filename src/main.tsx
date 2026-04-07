import React from "react";
import ReactDOM from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles.css";
import "./styles-shell.css";
import "./styles-overview.css";
import "./styles-diagnostics-log.css";
import "./styles-sessions.css";
import "./styles-workspace.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme
      appearance="light"
      accentColor="teal"
      grayColor="sand"
      radius="large"
      scaling="95%"
    >
      <App />
    </Theme>
  </React.StrictMode>,
);
