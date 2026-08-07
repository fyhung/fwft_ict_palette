import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Firebase Hosting serves this application from the domain root. GitHub
  // Actions is only the build/deployment runner, not the website host.
  base: "/",
});
