import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { "@": path.resolve(__dirname, "src") },
	},
	base: "/assets/frappe_ai_core/ai_room/",
	build: {
		outDir: path.resolve(__dirname, "../frappe_ai_core/public/ai_room"),
		emptyOutDir: true,
		assetsDir: "assets",
		rollupOptions: {
			input: path.resolve(__dirname, "index.html"),
		},
	},
});
