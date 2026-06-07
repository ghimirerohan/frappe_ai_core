import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const builtPath = path.resolve(root, "../frappe_ai_core/public/ai_room/index.html");
const wwwPaths = [
	path.resolve(root, "../frappe_ai_core/www/ai_room.html"),
	path.resolve(root, "../frappe_ai_core/www/ai-room.html"),
];

const built = fs.readFileSync(builtPath, "utf8");
const scriptMatch = built.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const cssMatch = built.match(/<link[^>]+href="([^"]+)"[^>]*>/);
if (!scriptMatch || !cssMatch) {
	console.error("Could not parse built index.html");
	process.exit(1);
}
const js = scriptMatch[1];
const css = cssMatch[1];

const out = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta
			name="viewport"
			content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover, user-scalable=no"
		/>
		<title>AI Voice Room</title>
		<meta name="theme-color" content="#312e81" />
		<meta name="mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-title" content="AI Voice" />
		<link rel="manifest" href="/api/method/frappe_ai_core.api.pwa.manifest" />
		<link rel="apple-touch-icon" href="/assets/frappe_ai_core/images/frappe-ai-core.svg" />
		<script type="module" crossorigin src="${js}"></script>
		<link rel="stylesheet" crossorigin href="${css}" />
	</head>
	<body>
		<div id="root"></div>
		<script>
			window.csrf_token = "{{ frappe.session.csrf_token or '' }}";
		</script>
	</body>
</html>
`;
for (const wwwPath of wwwPaths) {
	fs.writeFileSync(wwwPath, out, "utf8");
	console.log("Updated", wwwPath);
}
