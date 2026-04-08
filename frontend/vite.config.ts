import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8")) as {
  version?: string;
};
const APP_VERSION = packageJson.version || "0.0.0";
const APP_BUILD_ID = `${APP_VERSION}-${Date.now()}`;
const DEFAULT_DEV_PORT = 8080;

const parsePort = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// npm --port 8080 sets npm_config_port; also check argv for --port
const argPort = (() => {
  const idx = process.argv.indexOf('--port');
  return idx !== -1 ? parsePort(process.argv[idx + 1]) : undefined;
})();

const serverPort =
  argPort ??
  parsePort(process.env.PORT) ??
  parsePort(process.env.npm_config_port) ??
  parsePort(process.env.VITE_PORT) ??
  DEFAULT_DEV_PORT;

const additionalAllowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const allowedHosts = Array.from(new Set([
  ".lovable.app",
  ".lovableproject.com",
  ...additionalAllowedHosts,
]));

const hmrHost = process.env.VITE_HMR_HOST?.trim() || undefined;
const hmrProtocol = process.env.VITE_HMR_PROTOCOL?.trim() || undefined;
const hmrClientPort = parsePort(process.env.VITE_HMR_CLIENT_PORT);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    // Fallback: ensure env vars are always available even if .env is missing
    ...(process.env.VITE_SUPABASE_URL ? {} : {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify("https://stubkeeuttixteqckshd.supabase.co"),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdHVia2VldXR0aXh0ZXFja3NoZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzU3NDY0NDkyLCJleHAiOjIwNzMwNDA0OTJ9.YcpSKrTSb1P1REC8lgkdduDITX52h_z7ArPD6XIkrlU"),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify("stubkeeuttixteqckshd"),
    }),
  },
  server: {
    host: "0.0.0.0",
    port: serverPort,
    strictPort: true,
    allowedHosts,
    hmr: {
      overlay: false,
      ...(typeof hmrClientPort === "number" ? { clientPort: hmrClientPort } : {}),
      ...(hmrHost ? { host: hmrHost } : {}),
      ...(hmrProtocol ? { protocol: hmrProtocol as "ws" | "wss" } : {}),
    },
  },
  preview: {
    host: "0.0.0.0",
    port: serverPort,
    strictPort: true,
    allowedHosts,
  },
  plugins: [
    react(),
    {
      name: "app-version-manifest",
      apply: "build" as const,
      generateBundle() {
        (this as any).emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(
            {
              version: APP_VERSION,
              buildId: APP_BUILD_ID,
              generatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
        });
      },
    },
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // UI / animation
          "vendor-ui": ["framer-motion", "lucide-react", "sonner"],
          // Radix primitives
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-accordion",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
            "@radix-ui/react-scroll-area",
          ],
          // Charts
          "vendor-charts": ["recharts"],
          // Data / backend
          "vendor-data": ["@supabase/supabase-js", "@tanstack/react-query"],
          // PDF export
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
        },
      },
    },
  },
}));
