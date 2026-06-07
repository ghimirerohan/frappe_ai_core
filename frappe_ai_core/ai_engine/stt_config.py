# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Gemini Live STT / language configuration for Nepali, Neplish, and English voice sessions."""

from __future__ import annotations

from dataclasses import dataclass

from google.genai import types

# Fintech + Nepal call-center terms (prompt glossary + cleanup).
DEFAULT_KEYTERMS: tuple[str, ...] = (
	"eSewa",
	"MPIN",
	"OTP",
	"KYC",
	"wallet",
	"Khalti",
	"IME Pay",
	"remittance",
	"load",
	"transfer",
	"withdraw",
	"Hajur",
	"Tapai",
)

_STT_BLOCK_BY_MODE: dict[str, str] = {
	"Nepali Only": """

---
## Speech recognition context (critical)
The customer speaks **Nepali** (Devanagari script and/or romanized Nepali). Expected language: Nepali (`ne`) only.
Never transcribe or interpret customer speech as Korean, Chinese, Japanese, or other unrelated languages.
Preserve respectful forms (Hajur/Tapai). Keep fintech terms in standard spelling: eSewa, MPIN, OTP, KYC, wallet.
Do not translate the customer — only understand and respond.""",
	"English Only": """

---
## Speech recognition context (critical)
The customer speaks **English**. Transcribe in English only.
Keep fintech terms in standard spelling: eSewa, MPIN, OTP, KYC, wallet.""",
	"Neplish Mixed": """

---
## Speech recognition context (critical)
The customer speaks **Neplish**: natural code-switching between Nepali (Devanagari or romanized) and English in the same sentence.
Expected languages: **Nepali (`ne`) and English (`en`) only**. Never transcribe as Korean, Chinese, Japanese, or other languages.
Common terms (exact spelling): eSewa, MPIN, OTP, KYC, wallet, Khalti, load, transfer, remittance, Hajur, Tapai.
When Nepali is clear, Devanagari script is preferred in transcripts; keep English words in Latin script.
Do not translate the customer — preserve their language mix.""",
}


@dataclass(frozen=True)
class VoiceSttConfig:
	"""Resolved Gemini Live STT settings for a template language mode."""

	language_mode: str
	live_language_bcp47: str | None
	polish_user_utterances: bool
	stt_provider_label: str = "gemini_live"


def map_language_mode_to_stt_instruction_block(language_mode: str) -> str:
	return _STT_BLOCK_BY_MODE.get(language_mode or "", _STT_BLOCK_BY_MODE["Neplish Mixed"])


def map_language_mode_to_live_language(language_mode: str) -> str | None:
	"""Reserved for future use.

	Gemini native-audio Live models reject explicit ``speech_config.language_code`` (WebSocket
	1007 invalid argument). Language bias is applied via the STT instruction block in the
	system prompt instead.
	"""
	return None


def build_voice_stt_config(language_mode: str) -> VoiceSttConfig:
	"""Gemini Live native audio STT + optional text polish for Nepal language modes."""
	mode = language_mode or "Neplish Mixed"
	polish = mode in ("Nepali Only", "Neplish Mixed")
	return VoiceSttConfig(
		language_mode=mode,
		live_language_bcp47=map_language_mode_to_live_language(mode),
		polish_user_utterances=polish,
	)


def build_realtime_model(
	*,
	full_prompt: str,
	model_name: str,
	api_key: str,
	stt_cfg: VoiceSttConfig,
	temperature: float,
	voice: str = "Aoede",
):
	"""Gemini Live with built-in input/output audio transcription enabled."""
	from livekit.plugins.google.realtime import RealtimeModel

	# Do not pass ``language=`` — native-audio Live API rejects it (1007 invalid argument).
	return RealtimeModel(
		instructions=full_prompt,
		model=model_name,
		api_key=api_key,
		voice=voice,
		temperature=temperature,
		input_audio_transcription=types.AudioTranscriptionConfig(),
		output_audio_transcription=types.AudioTranscriptionConfig(),
	)
