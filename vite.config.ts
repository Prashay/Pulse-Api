import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

function servePulseZipPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = (req.url || "").split("?")[0];
    if (
      rawUrl === "/pulse.zip" ||
      rawUrl === "/dist_electron/pulse.zip" ||
      rawUrl.endsWith("/pulse.zip")
    ) {
      const rootPath = path.resolve(__dirname, "pulse.zip");
      const distPath = path.resolve(__dirname, "dist_electron", "pulse.zip");
      const target = fs.existsSync(rootPath) ? rootPath : fs.existsSync(distPath) ? distPath : null;

      if (target) {
        res.setHeader("Content-Disposition", 'attachment; filename="pulse.zip"');
        res.setHeader("Content-Type", "application/zip");
        const stat = fs.statSync(target);
        res.setHeader("Content-Length", stat.size);
        const stream = fs.createReadStream(target);
        stream.pipe(res);
        return;
      }
    }
    next();
  };

  return {
    name: "serve-pulse-zip",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), servePulseZipPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".monkeycode-ai.live"],
    watch: {
      ignored: ["**/dist_electron/**"],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});

