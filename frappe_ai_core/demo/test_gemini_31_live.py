# Quick smoke test — bench execute frappe_ai_core.demo.test_gemini_31_live.run
from __future__ import annotations

import asyncio

import frappe
from google import genai
from google.genai import types


def run() -> None:
	api_key = frappe.get_single("AI Global Settings").get_password("gemini_api_key")
	if not api_key:
		print("No Gemini API key configured")
		return
	client = genai.Client(api_key=api_key)
	asyncio.run(_test(client))


async def _test(client: genai.Client) -> None:
	config = types.LiveConnectConfig(
		response_modalities=[types.Modality.AUDIO],
		history_config=types.HistoryConfig(initial_history_in_client_content=True),
		speech_config=types.SpeechConfig(
			voice_config=types.VoiceConfig(
				prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
			)
		),
		system_instruction=types.Content(parts=[types.Part(text="Say hello briefly.")]),
	)
	async with client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=config) as session:
		print("connected ok")
		await session.send_client_content(
			turns=types.Content(role="user", parts=[types.Part(text="hi")]),
			turn_complete=True,
		)
		async for msg in session.receive():
			if msg.server_content and msg.server_content.model_turn:
				print("got model turn")
				break
		print("done")
