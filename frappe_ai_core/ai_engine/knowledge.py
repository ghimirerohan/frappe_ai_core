# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Knowledge base support for voice agents: prompt injection + article search."""

from __future__ import annotations

import re
from typing import Any

import frappe

_MAX_TITLES_IN_PROMPT = 40
_EXCERPT_RADIUS = 240
_MAX_CANDIDATES = 500
_STOPWORDS = {
	"the", "and", "for", "are", "but", "not", "you", "your", "can", "how", "what", "why", "who",
	"with", "from", "this", "that", "have", "has", "was", "were", "will", "would", "could", "did",
	"does", "about", "into", "out", "got", "get", "i", "a", "an", "of", "to", "is", "it", "my",
	"me", "do", "in", "on", "at", "or", "be", "if", "so", "we", "us",
}


def build_kb_prompt_block(kb_name: str | None) -> str:
	"""Compact system-prompt block: always-on guidelines + a list of searchable article titles."""
	if not kb_name or not frappe.db.exists("AI Knowledge Base", kb_name):
		return ""
	kb = frappe.db.get_value(
		"AI Knowledge Base",
		kb_name,
		["title", "enabled", "guidelines_summary"],
		as_dict=True,
	)
	if not kb or not kb.enabled:
		return ""

	titles = frappe.get_all(
		"AI Knowledge Article",
		filters={"knowledge_base": kb_name, "enabled": 1},
		pluck="title",
		order_by="title asc",
		limit=_MAX_TITLES_IN_PROMPT,
	)

	parts = ["\n\n---\n## Knowledge base: {0}".format(kb.title or kb_name)]
	summary = (kb.guidelines_summary or "").strip()
	if summary:
		parts.append("\n### Guidelines (always follow)\n" + summary)
	if titles:
		listed = "\n".join(f"- {t}" for t in titles)
		parts.append(
			"\n### Reference articles you can look up\n"
			"Use the `search_knowledge_base` tool to fetch exact details before answering policy / factual "
			"questions. Do not invent answers; if the knowledge base has nothing relevant, say so.\n"
			+ listed
		)
	else:
		parts.append(
			"\nUse the `search_knowledge_base` tool to look up details before answering policy / factual "
			"questions. Do not invent answers."
		)
	return "".join(parts)


def _excerpt(content: str, query: str) -> str:
	text = (content or "").strip()
	if not text:
		return ""
	lower = text.lower()
	idx = lower.find((query or "").strip().lower())
	if idx == -1:
		return text[: _EXCERPT_RADIUS * 2].strip()
	start = max(0, idx - _EXCERPT_RADIUS)
	end = min(len(text), idx + len(query) + _EXCERPT_RADIUS)
	snippet = text[start:end].strip()
	prefix = "…" if start > 0 else ""
	suffix = "…" if end < len(text) else ""
	return f"{prefix}{snippet}{suffix}"


def _tokenize(query: str) -> list[str]:
	tokens = [t for t in re.findall(r"[a-z0-9]+", (query or "").lower()) if len(t) >= 3 and t not in _STOPWORDS]
	# De-duplicate while preserving order.
	seen: set[str] = set()
	out: list[str] = []
	for t in tokens:
		if t not in seen:
			seen.add(t)
			out.append(t)
	return out


def search_articles(kb_name: str | None, query: str, limit: int = 5) -> list[dict[str, Any]]:
	"""Token-aware search over keywords/title/content within one knowledge base.

	Splits the query into words and ranks articles by how many distinct terms match
	(title/keywords matches weighted higher). Returns a list of {title, excerpt}.
	Upgradeable to MariaDB FULLTEXT for very large KBs.
	"""
	q = (query or "").strip()
	if not kb_name or not q:
		return []

	tokens = _tokenize(q) or [q.lower()]
	rows = frappe.get_all(
		"AI Knowledge Article",
		filters={"knowledge_base": kb_name, "enabled": 1},
		fields=["title", "keywords", "content"],
		limit=_MAX_CANDIDATES,
	)

	scored: list[tuple[int, Any]] = []
	for r in rows:
		head = f"{r.title or ''}\n{r.keywords or ''}".lower()
		body = (r.content or "").lower()
		score = 0
		for t in tokens:
			if t in head:
				score += 3
			elif t in body:
				score += 1
		if score:
			scored.append((score, r))

	scored.sort(key=lambda x: x[0], reverse=True)
	results: list[dict[str, Any]] = []
	for _, r in scored[:limit]:
		anchor = next((t for t in tokens if t in (r.content or "").lower()), tokens[0])
		results.append({"title": r.title, "excerpt": _excerpt(r.content, anchor)})
	return results
