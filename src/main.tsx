import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadData } from "./storage";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
try {
  const initialData = loadData();
  root.render(
    <React.StrictMode>
      <App initialData={initialData} />
    </React.StrictMode>
  );
} catch {
  root.render(
    <div className="empty" role="alert">
      <p>Pulse API Studio could not open your saved workspace.</p>
      <button className="btn" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}
