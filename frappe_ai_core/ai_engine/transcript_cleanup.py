# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Post-call transcript polish for Neplish / Nepali ASR errors (wrong language, script mix)."""

from __future__ import annotations

import json
import re
from typing import Any

import frappe

from frappe_ai_core.ai_engine.stt_config import DEFAULT_KEYTERMS

# Hangul / CJK often appear when Gemini mis-detects Nepali phonetics as Korean/Chinese.
_HANGUL_RE = re.compile(r"[\uac00-\ud7af]")
_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097f]")
_LINE_PREFIX_RE = re.compile(r"^(User|Agent):\s*")


def should_polish_transcript(lines: list[str], language_mode: str) -> bool:
	"""Polish Nepali / Neplish transcripts after every call; skip English-only sessions."""
	if language_mode == "English Only" or not lines:
		return False
	return any(ln.strip().lower().startswith("user:") for ln in lines)


def transcript_has_asr_red_flags(lines: list[str]) -> bool:
	"""Heuristic markers of bad ASR (wrong script / language)."""
	user_text = " ".join(
		_LINE_PREFIX_RE.sub("", ln) for ln in lines if ln.strip().lower().startswith("user:")
	)
	if not user_text.strip():
		return False
	if _HANGUL_RE.search(user_text) or _CJK_RE.search(user_text):
		return True
	if len(user_text) > 40 and not _DEVANAGARI_RE.search(user_text) and re.search(r"[a-zA-Z]{3,}", user_text):
		return True
	return False


def _gemini_cleanup_model() -> str:
	settings = frappe.get_single("AI Global Settings")
	return (settings.judge_model or "").strip() or "gemini-2.0-flash"


def _gemini_client():
	settings = frappe.get_single("AI Global Settings")
	api_key = settings.get_password("gemini_api_key")
	if not api_key:
		return None, None
	try:
		from google import genai
	except ImportError:
		frappe.log_error("google-genai not installed", "frappe_ai_core transcript_cleanup")
		return None, None
	return genai.Client(api_key=api_key), _gemini_cleanup_model()


def polish_user_utterance(text: str, language_mode: str) -> str:
	"""Lightweight per-turn Gemini fix for live + stored user transcripts (Nepali / Neplish)."""
	raw = (text or "").strip()
	if not raw or language_mode == "English Only":
		return raw

	client_model = _gemini_client()
	if not client_model[0]:
		return raw
	client, model = client_model
	glossary = ", ".join(DEFAULT_KEYTERMS)
	prompt = f"""Fix this single voice ASR utterance from a Nepal fintech support call.

Language mode: {language_mode}
Glossary: {glossary}

Rules:
- Caller spoke Nepali and/or English only — remove Korean, Chinese, or other wrong-language hallucinations.
- Preserve Neplish code-switching; do not translate.
- Fix obvious phonetic errors (MPIN, OTP, eSewa, wallet, load, transfer).
- Return ONLY the corrected utterance text with no quotes or prefix.

ASR: {raw}"""

	try:
		resp = client.models.generate_content(model=model, contents=prompt)
		out = (resp.text or "").strip()
		return out or raw
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core polish_user_utterance")
		return raw


def _cleanup_prompt(language_mode: str, raw_block: str) -> str:
	glossary = ", ".join(DEFAULT_KEYTERMS)
	return f"""You correct voice-call ASR transcripts from a Nepal fintech support line.

Language mode: {language_mode}
Glossary (keep exact spelling): {glossary}

Rules:
- Fix wrong-language hallucinations (e.g. Korean Hangul, Chinese characters when the caller spoke Nepali/English).
- Preserve Neplish code-switching: English words stay English; Nepali may be Devanagari or romanized — do not force translation.
- Fix obvious phonetic ASR mistakes for common terms (MPIN, OTP, eSewa, wallet, load, transfer).
- Keep each line's prefix exactly ("User:" or "Agent:").
- Return ONLY valid JSON: {{"lines": ["User: ...", "Agent: ...", ...]}} with the same number of lines as input.
- If a line is already correct, return it unchanged.

Input lines:
{raw_block}
"""


def polish_transcript_lines(lines: list[str], language_mode: str) -> list[str]:
	"""Normalize transcript lines; no-op when cleanup is unnecessary or API unavailable."""
	if not lines:
		return lines
	if not should_polish_transcript(lines, language_mode):
		return lines

	client_model = _gemini_client()
	if not client_model[0]:
		return lines
	client, model = client_model
	raw_block = "\n".join(lines)

	try:
		resp = client.models.generate_content(model=model, contents=_cleanup_prompt(language_mode, raw_block))
		text = (resp.text or "").strip()
		match = re.search(r"\{[\s\S]*\}", text)
		if not match:
			return lines
		parsed: dict[str, Any] = json.loads(match.group())
		out = parsed.get("lines")
		if not isinstance(out, list) or len(out) != len(lines):
			return lines
		cleaned = [str(x).strip() for x in out if str(x).strip()]
		if len(cleaned) != len(lines):
			return lines
		return cleaned
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core transcript_cleanup")
		return lines


def polish_transcript_text(text: str, language_mode: str) -> str:
	lines = [ln for ln in (text or "").split("\n") if ln.strip()]
	if not lines:
		return text or ""
	return "\n".join(polish_transcript_lines(lines, language_mode))
