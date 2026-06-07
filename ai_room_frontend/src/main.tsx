import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "@livekit/components-styles";

const root = document.getElementById("root");
if (root) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/api/method/frappe_ai_core.api.pwa.service_worker", { scope: "/" })
			.catch(() => {
				/* PWA is a progressive enhancement; ignore registration failures */
			});
	});
}
