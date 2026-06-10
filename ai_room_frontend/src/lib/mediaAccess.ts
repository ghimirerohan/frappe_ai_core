/** Browsers only expose navigator.mediaDevices on secure contexts (HTTPS or localhost). */

function isLanIpv4Host(host: string): boolean {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function canAccessMicrophone(): boolean {
	return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function getMicrophoneBlockMessage(): string | null {
	if (canAccessMicrophone()) {
		return null;
	}

	const { protocol, hostname, port, origin } = window.location;
	const portSuffix = port ? `:${port}` : "";

	if (protocol === "http:" && isLanIpv4Host(hostname)) {
		return (
			`Voice calls need the microphone, but browsers block it on http://${hostname}${portSuffix} ` +
			`(LAN over plain HTTP is not a secure context). Fixes: open https://${hostname}${portSuffix} ` +
			`with TLS on your bench, use http://localhost${portSuffix} on this computer only, or for dev add ` +
			`this origin in Chrome → chrome://flags → "Insecure origins treated as secure". ` +
			`After HTTPS works, still set LIVEKIT_NODE_IP for WebRTC on other devices.`
		);
	}

	if (protocol === "http:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
		return (
			`Microphone access requires HTTPS or localhost. Current origin: ${origin}. ` +
			`Use https://… or open from http://localhost${portSuffix} on this machine.`
		);
	}

	return "Microphone API is not available in this browser (navigator.mediaDevices is missing).";
}
