import { useEffect, useState } from "react";

/** Elapsed seconds since `active` became true; resets when it goes false. */
export function useCallTimer(active: boolean): number {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		if (!active) {
			setSeconds(0);
			return;
		}
		const startedAt = Date.now();
		const id = window.setInterval(() => {
			setSeconds(Math.floor((Date.now() - startedAt) / 1000));
		}, 1000);
		return () => window.clearInterval(id);
	}, [active]);
	return seconds;
}
