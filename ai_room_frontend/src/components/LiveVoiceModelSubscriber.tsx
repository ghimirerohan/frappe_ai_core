import { useDataChannel } from "@livekit/components-react";
import { useCallback } from "react";

/**
 * Reads `live_voice_model_id` / `live_voice_model_label` from agent status packets.
 * Values match the model string passed to RealtimeModel in the LiveKit worker (after Frappe normalization).
 */
export default function LiveVoiceModelSubscriber({
	onModel,
}: {
	onModel: (id: string, label: string) => void;
}) {
	const handler = useCallback(
		(msg: { payload: Uint8Array }) => {
			try {
				const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
					live_voice_model_id?: string;
					live_voice_model_label?: string;
				};
				const id = typeof data.live_voice_model_id === "string" ? data.live_voice_model_id.trim() : "";
				const label = typeof data.live_voice_model_label === "string" ? data.live_voice_model_label.trim() : "";
				if (id || label) {
					onModel(id || label, label || id);
				}
			} catch {
				/* ignore non-JSON status payloads */
			}
		},
		[onModel],
	);
	useDataChannel("status", handler);
	return null;
}
