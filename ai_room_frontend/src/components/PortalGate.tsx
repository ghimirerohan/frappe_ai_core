import { useEffect, useState } from "react";
import { checkRouteAccess, redirectToLogin } from "@/utils/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PortalGate({
	children,
	path,
}: {
	children: React.ReactNode;
	path: string;
}) {
	const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");
	const [message, setMessage] = useState("");

	useEffect(() => {
		const result = checkRouteAccess(path);
		if (result.ok) {
			setStatus("ok");
			return;
		}
		if (result.reason === "guest") {
			redirectToLogin();
			return;
		}
		setMessage(result.message);
		setStatus("denied");
	}, [path]);

	if (status === "checking") {
		return (
			<div className="min-h-dvh flex items-center justify-center bg-slate-900 text-slate-400">
				<div className="animate-pulse text-sm">Loading…</div>
			</div>
		);
	}

	if (status === "denied") {
		return (
			<div className="min-h-dvh flex items-center justify-center bg-slate-900 p-6">
				<Card className="max-w-md text-center">
					<h1 className="text-lg font-semibold text-slate-100 mb-2">Access denied</h1>
					<p className="text-sm text-slate-400 mb-6">{message}</p>
					<div className="flex flex-col gap-2">
						<Button variant="ghost" size="sm" onClick={() => { window.location.href = "/support"; }}>
							Go to customer support
						</Button>
						<Button variant="ghost" size="sm" onClick={() => { window.location.href = "/"; }}>
							Go to home
						</Button>
					</div>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}
