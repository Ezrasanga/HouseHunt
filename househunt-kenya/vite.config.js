import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		strictPort: true,
		allowedHosts: ["fiddling-splendor-rectified.ngrok-free.dev"],
		proxy: {
			"/api": {
				target: "http://localhost:5001",
				changeOrigin: true,
			},
		},
	},
});
