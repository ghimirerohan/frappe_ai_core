# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Optional helpers for LMS, HR, and Support apps (no hard dependency on those apps)."""

from __future__ import annotations

from typing import Any

import frappe


def check_ai_completion(
	ref_doctype: str,
	ref_docname: str,
	user: str | None = None,
	min_score: float = 80.0,
) -> bool:
	"""
	Return True if the user has an Evaluated AI Session linked to ref_doctype/ref_docname
	with score >= min_score (e.g. LMS lesson completion gate).
	"""
	user = user or frappe.session.user
	if not ref_doctype or not ref_docname:
		return False
	rows = frappe.get_all(
		"AI Session",
		filters={
			"user": user,
			"ref_doctype": ref_doctype,
			"ref_docname": ref_docname,
			"status": "Evaluated",
		},
		pluck="score",
		limit=1,
	)
	if not rows:
		return False
	score = rows[0]
	return score is not None and float(score) >= min_score


def get_latest_session_for_reference(ref_doctype: str, ref_docname: str) -> dict[str, Any] | None:
	"""Latest AI Session for a reference document (any user)."""
	rows = frappe.get_all(
		"AI Session",
		filters={"ref_doctype": ref_doctype, "ref_docname": ref_docname},
		pluck="name",
		order_by="modified desc",
		limit_page_length=1,
	)
	if not rows:
		return None
	return frappe.get_doc("AI Session", rows[0]).as_dict()


def post_interview_report(job_applicant_name: str) -> dict[str, Any] | None:
	"""
	Return evaluation payload for dashboards. Does not mutate Job Applicant unless you extend this.

	Consuming HR apps should update status / attach Communication from the returned data.
	"""
	sess = get_latest_session_for_reference("Job Applicant", job_applicant_name)
	if not sess:
		return None
	return {
		"session": sess.get("name"),
		"score": sess.get("score"),
		"status": sess.get("status"),
		"evaluation": sess.get("evaluation_json"),
		"transcript": sess.get("transcript"),
	}
