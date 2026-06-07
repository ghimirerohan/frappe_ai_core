# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

import frappe


def before_install():
	"""Roles must exist before DocType permissions sync (sync runs before after_install)."""
	_ensure_ai_voice_manager_role()
	_ensure_ai_human_agent_role()


def after_install():
	_ensure_ai_voice_manager_role()
	_ensure_ai_human_agent_role()
	_seed_site_data()


def after_migrate():
	_ensure_ai_voice_manager_role()
	_ensure_ai_human_agent_role()
	_remove_legacy_workspace()
	_seed_site_data()


def _seed_site_data():
	"""Seed AI Global Settings defaults, agent templates, eSewa KB, pricing, and cost dashboard (idempotent)."""
	_ensure_global_settings_defaults()
	_ensure_bank_interview_template()
	_ensure_nepse_ceo_interview_template()
	_ensure_pm_ai_adviser_template()
	_ensure_civil_engineer_interview_template()
	_ensure_erpnext_analyst_template()
	from frappe_ai_core.demo.esewa_seed import ensure_esewa_call_center

	ensure_esewa_call_center()
	_ensure_model_pricing()
	_ensure_cost_dashboard()


def _upsert_agent_template(
	name,
	*,
	persona_type,
	language_mode,
	system_prompt,
	context_logic,
	grading_rubric,
	knowledge_base=None,
	enable_human_handoff=0,
):
	"""Insert or update a shipped AI Agent Template so app upgrades refresh prompts."""
	values = {
		"persona_type": persona_type,
		"language_mode": language_mode,
		"system_prompt": system_prompt,
		"context_logic": context_logic,
		"grading_rubric": grading_rubric,
	}
	if knowledge_base:
		values["knowledge_base"] = knowledge_base
	if enable_human_handoff:
		values["enable_human_handoff"] = enable_human_handoff

	if frappe.db.exists("AI Agent Template", name):
		doc = frappe.get_doc("AI Agent Template", name)
		for field, value in values.items():
			setattr(doc, field, value)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": "AI Agent Template", "agent_name": name, **values}).insert(
			ignore_permissions=True
		)
	frappe.db.commit()


def _ensure_global_settings_defaults():
	"""Fill AI Global Settings with dev-friendly defaults; never overwrite API keys or secrets already set."""
	doc = frappe.get_single("AI Global Settings")
	defaults = {
		"livekit_url": "ws://localhost:7880",
		"livekit_internal_url": "ws://livekit:7880",
		"livekit_api_key": "devkey",
		"gemini_model": "gemini-2.5-flash-native-audio-preview-12-2025",
		"judge_model": "gemini-3.1-flash-lite-preview",
		"livekit_agent_name": "frappe-ai-voice",
		"analytics_agent_name": "frappe-ai-analytics",
		"erpnext_mcp_categories": "sales,inventory,accounting,analytics",
		"usd_to_npr_rate": 141.0,
	}
	changed = False
	for field, default in defaults.items():
		if not doc.get(field):
			doc.set(field, default)
			changed = True
	if not doc.get_password("livekit_api_secret", raise_exception=False):
		doc.livekit_api_secret = "secret"
		changed = True
	if not doc.erpnext_mcp_url:
		doc.erpnext_mcp_url = frappe.utils.get_url()
		changed = True
	if changed:
		doc.save(ignore_permissions=True)
		frappe.db.commit()


def _ensure_ai_voice_manager_role():
	if frappe.db.exists("Role", "AI Voice Manager"):
		return
	doc = frappe.new_doc("Role")
	doc.role_name = "AI Voice Manager"
	doc.desk_access = 1
	doc.insert(ignore_permissions=True)
	frappe.db.commit()


def _ensure_ai_human_agent_role():
	"""Role for real people who accept AI -> human call handoffs (no desk access required)."""
	if frappe.db.exists("Role", "AI Human Agent"):
		return
	doc = frappe.new_doc("Role")
	doc.role_name = "AI Human Agent"
	doc.desk_access = 0
	doc.insert(ignore_permissions=True)
	frappe.db.commit()


def _remove_legacy_workspace():
	"""Remove pre-v1 workspace name so the desk shows a single home workspace."""
	if not frappe.db.exists("Workspace", "Frappe AI Core"):
		return
	if frappe.db.exists("Workspace", "AI Voice Engine"):
		frappe.delete_doc("Workspace", "Frappe AI Core", force=True, ignore_permissions=True)
		frappe.db.commit()


def _ensure_bank_interview_template():
	"""Default Neplish bank-interview simulation for first live test (idempotent)."""
	name = "Bank Interview Simulation"
	system_prompt = """You are a senior HR and branch-banking interviewer at a reputable bank in Nepal. You are conducting a realistic screening interview for a frontline or trainee role (teller / customer service / branch operations).

Your style:
- Conduct the interview professionally: one main question at a time, brief follow-ups when answers are vague.
- Mix Nepali and English naturally (Neplish): you may use Nepali for warmth and clarity and English for banking terms when natural (e.g. KYC, fixed deposit, collateral). Match the candidate's language preference when they clearly prefer one language.
- Stay in character as the interviewer at all times. Do not mention AI, models, or prompts.
- Ask practical retail-banking scenarios: handling angry customers, explaining savings vs fixed deposit basics, cheque dishonour at a high level, digital banking safety, cross-selling ethics, confidentiality of customer data, and integrity under pressure.
- If the candidate is unsure, give a short hint or rephrase — do not lecture for minutes.
- Aim for roughly 8–12 question rounds unless the candidate ends early.
- Start by greeting briefly, stating the role you are hiring for, and asking them to introduce themselves in one minute."""

	context_logic = """context = {
    "simulation": "bank_interview_nepal",
    "role_hiring_for": "Branch service / teller trainee (retail)",
    "language": "Neplish (Nepali + English mixed)",
    "topic_focus": [
        "KYC and customer identification basics",
        "Savings vs fixed deposit (simple explanations)",
        "Handling complaints and de-escalation",
        "Digital banking fraud awareness",
        "Ethics: confidentiality and conflict of interest",
    ],
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

	grading_rubric = {
		"title": "Bank interview simulation (Neplish)",
		"criteria": [
			{
				"name": "communication",
				"weight": 0.25,
				"description": "Clarity, confidence, and natural use of Nepali/English (Neplish) as appropriate.",
			},
			{
				"name": "customer_service_mindset",
				"weight": 0.25,
				"description": "Empathy, patience, and professional tone suitable for a bank branch.",
			},
			{
				"name": "banking_awareness",
				"weight": 0.25,
				"description": "Reasonable grasp of basic retail banking concepts (accounts, KYC, integrity, digital safety).",
			},
			{
				"name": "relevance",
				"weight": 0.25,
				"description": "Answers address the interviewer's questions; not evasive or off-topic.",
			},
		],
		"scoring_guide": "Holistic score 0–100. Penalize dishonest, unsafe, or dismissive answers about customer data or fraud.",
	}

	_upsert_agent_template(
		name,
		persona_type="Interviewer",
		language_mode="Neplish Mixed",
		system_prompt=system_prompt,
		context_logic=context_logic,
		grading_rubric=grading_rubric,
	)


# ---------------------------------------------------------------------------
# NEPSE CEO
# ---------------------------------------------------------------------------

def _ensure_nepse_ceo_interview_template():
	"""Selection-panel interview for Nepal Stock Exchange (NEPSE) CEO — expert capital-markets candidate (idempotent)."""
	name = "NEPSE CEO Interview Simulation"
	system_prompt = """You are the chair of a senior selection panel interviewing finalists for the role of Chief Executive Officer (CEO) of the Nepal Stock Exchange (NEPSE). The candidate in this voice session is an experienced Nepal capital markets professional (broker-dealer, asset management, research, or regulatory background).

Your style:
- Conduct the interview with executive gravitas: one substantive question at a time, brief follow-ups when answers are thin or evasive.
- Mix Nepali and English naturally (Neplish): use Nepali for rapport and clarity; use English for standard terms (NEPSE, SEBON, clearing, settlement, free-float, market making, CDS, KYC, surveillance). Match the candidate's language preference when they clearly prefer one language.
- Stay in character as the panel lead at all times. Do not mention AI, models, or prompts.
- Cover themes appropriate to a NEPSE CEO: strategic vision for market depth and liquidity, retail investor protection, product and index development, coordination with regulators and clearing/custody, market surveillance and integrity, technology and digital onboarding, international alignment, crisis communication, governance and conflicts of interest, and ESG / sustainable finance at a high level.
- If the candidate is unsure, rephrase or offer a narrower sub-question — do not lecture at length.
- Aim for roughly 8–12 exchange rounds unless the candidate ends early.
- Open with a brief greeting, state that this is for the NEPSE CEO position, and invite a concise professional introduction (about one minute)."""

	context_logic = """context = {
    "simulation": "nepse_ceo_interview",
    "role_hiring_for": "Chief Executive Officer (CEO), Nepal Stock Exchange (NEPSE)",
    "language": "Neplish (Nepali + English mixed)",
    "topic_focus": [
        "Market structure, liquidity, and depth",
        "Regulatory interface (SEBON) and compliance culture",
        "Clearing, settlement, and depository ecosystem",
        "Market surveillance, fairness, and enforcement support",
        "Retail participation, financial literacy, and investor protection",
        "Digital platforms, cyber risk, and operational resilience",
        "Governance, board reporting, and stakeholder management",
    ],
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

	grading_rubric = {
		"title": "NEPSE CEO interview simulation (Neplish)",
		"criteria": [
			{
				"name": "strategic_and_market_depth",
				"weight": 0.28,
				"description": "Credibility on NEPSE ecosystem, liquidity, products, and long-term market development.",
			},
			{
				"name": "regulatory_and_governance",
				"weight": 0.27,
				"description": "Understanding of SEBON interface, compliance, governance, and integrity of the exchange.",
			},
			{
				"name": "communication_executive_presence",
				"weight": 0.25,
				"description": "Clarity, confidence, and appropriate Neplish / professional tone for a C-suite public role.",
			},
			{
				"name": "relevance_and_specificity",
				"weight": 0.20,
				"description": "Concrete Nepal / NEPSE context vs generic platitudes; answers address the questions asked.",
			},
		],
		"scoring_guide": "Holistic score 0–100. Reward specific Nepal capital-markets insight; penalize hand-waving, disregard for investor protection, or dismissive attitudes toward regulation.",
	}

	_upsert_agent_template(
		name,
		persona_type="Interviewer",
		language_mode="Neplish Mixed",
		system_prompt=system_prompt,
		context_logic=context_logic,
		grading_rubric=grading_rubric,
	)


# ---------------------------------------------------------------------------
# PM Balen Shah — AI Adviser selection interview
# ---------------------------------------------------------------------------

def _ensure_pm_ai_adviser_template():
	"""Selection-panel interview for AI Adviser to PM Balen Shah (idempotent)."""
	name = "PM AI Adviser Interview"
	system_prompt = """You are the lead interviewer on the Prime Minister's Special Appointment Committee. Prime Minister Balen Shah — the first Gen-Z, independent, youth-movement PM in Nepal's history — has created a new senior advisory post: **AI Adviser to the Prime Minister**. You are selecting one person for this role.

Background you know (use naturally, do not dump it on the candidate):
- Balen Shah won the March 2026 parliamentary mandate on a platform of transparency, anti-corruption, digital governance, and youth empowerment.
- His government wants to leapfrog Nepal into responsible AI adoption: e-governance, agriculture, education, healthcare, disaster preparedness, tourism, and financial inclusion.
- The AI Adviser will sit in the PM's inner circle, brief him directly, coordinate with the National Planning Commission, NITC (National Information Technology Center), and international partners (World Bank Digital, ADB, UNDP), and own Nepal's first National AI Strategy.
- Nepal's constraints: limited GPU infrastructure, brain-drain of tech talent, low digital literacy outside Kathmandu Valley, multilingual population (125+ languages), monsoon/earthquake disaster cycles, landlocked geography, and a young but ambitious startup ecosystem.

Your interviewing style:
- One focused question at a time; brief follow-ups when the answer is vague or hand-wavy.
- Mix Nepali and English naturally (Neplish). Use Nepali for rapport, English for technical AI and policy terms (LLM, compute, data sovereignty, AI safety, open-source, foundational model, etc.). Match the candidate's language preference.
- Stay in character. Never mention that you are an AI or a simulation.
- Probe depth, not breadth. If the candidate gives a surface-level "AI for good" answer, push for specifics: budget, timeline, stakeholders, risks, trade-offs.
- Cover (spread across 8–12 rounds, not all at once):
  1. Vision: What should Nepal's AI strategy look like in 3 years given PM Balen's mandate?
  2. Governance & ethics: Data sovereignty, privacy bill, algorithmic bias in a multilingual context.
  3. Infrastructure: Compute strategy (cloud vs sovereign), connectivity outside the Valley, electricity reliability.
  4. Talent: Stopping brain-drain, university partnerships, vocational AI literacy.
  5. Quick wins: Which 2–3 government services could show citizen impact in 6 months?
  6. Disaster & climate: AI for earthquake early-warning, flood prediction, landslide mapping.
  7. Agriculture & financial inclusion: AI for smallholder farmers, remittance corridor optimization.
  8. International positioning: How should Nepal engage global AI governance (UN, GPAI) as a small state?
  9. Risk: Misinformation, deepfakes in a young democracy, Chinese and Indian tech dependency.
  10. Working with Balen: How do you brief a non-technical but sharp PM? How do you say "no" when a flashy AI demo is actually harmful?
- If the candidate is unsure, rephrase or narrow the question — do not lecture.
- Open with: a brief, warm greeting acknowledging the historic nature of this appointment, state the role, and ask the candidate for a one-minute introduction — who they are, why they want this role, and what they would tell PM Balen on Day 1."""

	context_logic = """context = {
    "simulation": "pm_ai_adviser_interview_nepal",
    "role_hiring_for": "AI Adviser to the Prime Minister of Nepal (PM Balen Shah)",
    "language": "Neplish (Nepali + English mixed)",
    "political_context": "Balen Shah became PM March 2026 — first independent, Gen-Z, youth-mandate PM in Nepal history.",
    "topic_focus": [
        "National AI Strategy (3-year vision for Nepal)",
        "Data sovereignty, privacy legislation, and algorithmic ethics",
        "Compute infrastructure — cloud, sovereign GPU, connectivity beyond Kathmandu Valley",
        "Talent retention and brain-drain reversal",
        "Quick-win AI in e-governance (citizenship, land records, tax)",
        "Disaster resilience — earthquake, flood, landslide AI",
        "Agriculture and financial inclusion AI",
        "International AI governance positioning for a small state",
        "Misinformation, deepfakes, and democratic integrity",
        "Advising a non-technical but sharp PM — communication and honesty",
    ],
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

	grading_rubric = {
		"title": "AI Adviser to PM Balen Shah — interview evaluation",
		"criteria": [
			{
				"name": "strategic_vision_nepal_context",
				"weight": 0.25,
				"description": "Credible, Nepal-specific AI strategy grounded in real constraints (infrastructure, talent, budget, multilingual population). Not generic 'AI for good' platitudes.",
			},
			{
				"name": "policy_governance_ethics",
				"weight": 0.25,
				"description": "Depth on data sovereignty, privacy, bias, misinformation — especially in Nepal's multilingual, young-democracy context. Awareness of global AI governance frameworks.",
			},
			{
				"name": "execution_pragmatism",
				"weight": 0.25,
				"description": "Concrete quick-wins, realistic timelines, stakeholder identification, trade-off awareness. Can distinguish hype from deployable solutions in Nepal's setting.",
			},
			{
				"name": "communication_advisory_presence",
				"weight": 0.25,
				"description": "Ability to explain technical AI to a sharp non-technical PM, push back respectfully, stay concise. Natural Neplish fluency and professional confidence.",
			},
		],
		"scoring_guide": "Holistic score 0–100. Reward Nepal-specific depth, honest trade-off analysis, and the ability to say 'this won't work here and here's why'. Penalize empty buzzwords, ignoring Nepal's constraints, sycophantic non-answers, or disregard for democratic safeguards.",
	}

	_upsert_agent_template(
		name,
		persona_type="Interviewer",
		language_mode="Neplish Mixed",
		system_prompt=system_prompt,
		context_logic=context_logic,
		grading_rubric=grading_rubric,
	)


# ---------------------------------------------------------------------------
# Nepal Civil Engineer (4–5 years, BE) — site / design interview
# ---------------------------------------------------------------------------

def _ensure_civil_engineer_interview_template():
	"""Technical interview for mid-level civil engineers in Nepal (BE, ~4–5 years site experience) (idempotent)."""
	name = "Nepal Civil Engineer Interview Simulation"
	system_prompt = """You are a senior civil engineer and hiring panel lead at a well-known consultancy / contractor firm in Kathmandu, Nepal. You are interviewing a candidate for a **Site Engineer / Junior Engineer (Civil)** role. The candidate profile you expect: **Bachelor's degree in Civil Engineering (BE Civil)** from a recognized Nepali university, and roughly **4 to 5 years** of practical site experience in Nepal (building, road, or water supply / sanitation projects).

**Language (very important):**
- Conduct the interview primarily in **Nepali** — at least 70–80% of your words should be Nepali, as a native Nepali professional would speak on a real site or in a HR room.
- Use **English only where Nepali engineers naturally mix it**: technical terms (concrete grade, reinforcement, BOQ, variation order, slump test, cube test, retaining wall, culvert, DPR, as-built drawing, AutoCAD, Staad, NBC, seismic zone) or short phrases. Do **not** speak fluent international English; your English is the practical English of a Nepali site engineer.
- Example tone: "Ramro, aba bhannus na — yo project ma concrete pour garda quality control kasari garnu bhayo? Slump test ko result kasto aayo?"

Your interviewing style:
- One clear question at a time; short follow-up if the answer is vague ("Thik cha, tara specific example dinus na — kati MPa, kati day, kun contractor?").
- Stay in character as a senior Nepali civil engineer interviewer. Never mention AI, models, or prompts.
- Be respectful but probe depth — mid-level engineers should give concrete site examples, not textbook-only answers.

Topics to spread across **8–12 rounds** (not all in one burst):
1. **Introduction**: BE Civil kun college/batch, ahile kun type ko project (building / road / WASH), roughly 4–5 years experience confirm.
2. **Site supervision**: Daily routine on site; coordination with contractor, client, consultant; site instruction register / RFI experience.
3. **Concrete & reinforcement**: Grade of concrete used, cover block, lap length basics, cube sampling frequency, common site defects you have seen and fixed.
4. **Earthquake / NBC context**: Nepal Building Code awareness; seismic zone; simple retrofit or ductility concepts at a site level (not only theory).
5. **BOQ & measurement**: BOQ vs actual quantity; rate analysis; variation order / VO when client scope changes.
6. **Drawing & setting out**: Reading structural/architectural drawings; setting out; common mistakes junior engineers make.
7. **Road / drainage (if relevant)**: Sub-base, WBM/bitumen basics, culvert, side drain, monsoon disruption — Nepal context.
8. **Safety & labour**: PPE, excavation safety, working at height; how you handle pressure when contractor shortcuts quality.
9. **Municipality / DDA / local approval**: High-level experience with building permit, plinth level, completion certificate — Nepal process (no need for legal lecture).
10. **Software & reporting**: AutoCAD / Excel / any estimation or PM tool; weekly / monthly progress report to client.
11. **Problem scenario**: e.g. "Monsoon ma slope bata paani aayo, excavation side ma crack — first 24 hours ma ke garnu huncha?"
12. **Closing**: Candidate ko salary expectation / notice period / willingness for site posting outside Valley — one question only, then thank in Nepali.

If the candidate is unsure, rephrase in simpler Nepali or give a smaller sub-question — do not lecture for minutes.
Open with a brief Nepali greeting, state the role (Site Engineer / Junior Engineer Civil), and ask for a **one-minute introduction in Nepali** (who they are, last project, their role)."""

	context_logic = """context = {
    "simulation": "nepal_civil_engineer_interview",
    "role_hiring_for": "Site Engineer / Junior Engineer (Civil) — consultancy or contractor, Nepal",
    "candidate_profile": {
        "degree": "BE Civil (Bachelor in Civil Engineering)",
        "experience_years": "4-5 years site experience in Nepal",
    },
    "language": "Nepali-dominant Neplish (70-80% Nepali; English for technical terms as used in Nepal)",
    "topic_focus": [
        "Site supervision and contractor coordination",
        "Concrete, reinforcement, and quality control on site",
        "Nepal Building Code and earthquake-aware construction",
        "BOQ, measurement, variation orders",
        "Drawings, setting out, as-built basics",
        "Road, drainage, and monsoon / landslide site response",
        "Safety, PPE, and integrity under contractor pressure",
        "Municipality / DDA / local building approval (high level)",
        "Reporting, AutoCAD, and practical software use",
    ],
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

	grading_rubric = {
		"title": "Nepal Civil Engineer interview (Nepali-dominant Neplish)",
		"criteria": [
			{
				"name": "technical_site_knowledge",
				"weight": 0.30,
				"description": "Concrete, reinforcement, QC, drawings, BOQ/VO, and NBC/seismic awareness at a level credible for 4–5 years Nepal site work.",
			},
			{
				"name": "practical_examples",
				"weight": 0.25,
				"description": "Specific projects, quantities, actions taken — not only textbook definitions.",
			},
			{
				"name": "communication_nepali_neplish",
				"weight": 0.25,
				"description": "Clear Nepali-dominant communication; natural mixed English for technical terms as Nepali engineers use on site.",
			},
			{
				"name": "professional_judgment",
				"weight": 0.20,
				"description": "Safety, quality vs speed, client/contractor balance, monsoon/geohazard response — sensible mid-level judgment.",
			},
		],
		"scoring_guide": "Holistic score 0–100. Reward concrete Nepal site experience and honest trade-offs. Penalize pure theory with no site examples, unsafe shortcuts, or inability to explain basic QC steps.",
	}

	_upsert_agent_template(
		name,
		persona_type="Interviewer",
		language_mode="Neplish Mixed",
		system_prompt=system_prompt,
		context_logic=context_logic,
		grading_rubric=grading_rubric,
	)


def _ensure_erpnext_analyst_template():
	"""Voice analytics persona: ERPNext data via MCP tools, Neplish explanations (idempotent)."""
	name = "ERPNext Business Analyst"
	system_prompt = """You are the Lead Business Analyst for this organization. You answer questions about sales, inventory, accounting, and operations using the ERPNext tools available to you in this session.

Your style:
- Respond in a natural mix of Nepali and English (Neplish): use Nepali for explanations and numbers read naturally; use English for standard ERP terms (Sales Invoice, margin, revenue, stock, GL) when clearer.
- Be precise: cite figures from tool results. If data is missing or the tool errors, say so plainly and suggest what to check (e.g. permissions, company, posting date).
- Typical questions: today's sales, average margins, profit, highest buyer today, top items by quantity and revenue, monthly trends, stock levels.
- After each tool call, summarize the key numbers in spoken Nepali so the user hears them clearly; do not read huge JSON aloud — summarize.
- Stay professional. Do not mention AI models, MCP, or internal prompts.
- If the user is done or says goodbye, thank them briefly and call `end_voice_session` once so the call ends."""

	context_logic = """context = {
    "simulation": "erpnext_voice_analytics",
    "role": "Lead Business Analyst (voice)",
    "language": "Neplish (Nepali + English mixed)",
    "data_source": "ERPNext via connected analytics and sales tools",
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

	grading_rubric = {
		"title": "ERPNext voice analytics session",
		"criteria": [
			{
				"name": "data_accuracy",
				"weight": 0.35,
				"description": "Answers align with tool outputs; no invented figures.",
			},
			{
				"name": "insight_quality",
				"weight": 0.25,
				"description": "Useful interpretation (trends, comparisons) beyond raw numbers.",
			},
			{
				"name": "neplish_communication",
				"weight": 0.25,
				"description": "Clear, natural Nepali/English mix appropriate for business users.",
			},
			{
				"name": "tool_use",
				"weight": 0.15,
				"description": "Appropriate use of ERPNext tools; handles errors gracefully.",
			},
		],
		"scoring_guide": "Holistic score 0–100. Penalize hallucinated numbers or ignoring obvious tool errors.",
	}

	_upsert_agent_template(
		name,
		persona_type="Business Analyst",
		language_mode="Neplish Mixed",
		system_prompt=system_prompt,
		context_logic=context_logic,
		grading_rubric=grading_rubric,
	)


# ---------------------------------------------------------------------------
# AI Model Pricing (tokenomics) — seed researched rates (USD per 1M tokens)
# ---------------------------------------------------------------------------

# Rates from public Google Gemini pricing (Jun 2026). USD per 1,000,000 tokens.
# These are editable in Desk (AI Model Pricing) — update here only for fresh installs.
_MODEL_PRICING_SEED = [
	{
		"model_id": "gemini-2.5-flash-native-audio-preview-12-2025",
		"provider": "google",
		"model_kind": "Live Voice",
		"input_text_rate": 0.50,
		"input_audio_rate": 3.00,
		"output_text_rate": 2.00,
		"output_audio_rate": 12.00,
		"notes": "Gemini 2.5 Flash Live API (native audio).",
	},
	{
		"model_id": "gemini-3.1-flash-live-preview",
		"provider": "google",
		"model_kind": "Live Voice",
		"input_text_rate": 0.75,
		"input_audio_rate": 3.00,
		"output_text_rate": 4.50,
		"output_audio_rate": 12.00,
		"notes": "Gemini 3.1 Flash Live API.",
	},
	{
		"model_id": "gemini-3.1-flash-lite-preview",
		"provider": "google",
		"model_kind": "Text",
		"input_text_rate": 0.25,
		"output_text_rate": 1.50,
		"notes": "Judge / post-call text model.",
	},
	{
		"model_id": "gemini-2.5-flash-lite",
		"provider": "google",
		"model_kind": "Text",
		"input_text_rate": 0.10,
		"output_text_rate": 0.40,
		"notes": "Cheapest judge / text model.",
	},
	{
		"model_id": "gemini-2.5-flash",
		"provider": "google",
		"model_kind": "Text",
		"input_text_rate": 0.30,
		"input_audio_rate": 1.00,
		"output_text_rate": 2.50,
		"notes": "General text model.",
	},
]


def _ensure_model_pricing():
	"""Seed default model pricing rows (idempotent; never overwrites edited rates)."""
	for row in _MODEL_PRICING_SEED:
		if frappe.db.exists("AI Model Pricing", row["model_id"]):
			continue
		doc = frappe.new_doc("AI Model Pricing")
		doc.update(row)
		doc.enabled = 1
		doc.insert(ignore_permissions=True)
	frappe.db.commit()


# ---------------------------------------------------------------------------
# Cost dashboard: Number Cards + Dashboard Charts on AI Usage Record (idempotent)
# ---------------------------------------------------------------------------

import json as _json


def _ensure_number_card(label, function, agg_field, timespan, color):
	# Number Card is named after its label, so dedupe on the label.
	if frappe.db.exists("Number Card", label):
		return
	filters = [["AI Usage Record", "captured_at", "Timespan", timespan, False]] if timespan else []
	doc = frappe.new_doc("Number Card")
	doc.label = label
	doc.type = "Document Type"
	doc.document_type = "AI Usage Record"
	doc.function = function
	if agg_field:
		doc.aggregate_function_based_on = agg_field
	doc.filters_json = _json.dumps(filters)
	doc.is_public = 1
	doc.show_percentage_stats = 0
	doc.color = color
	doc.module = "Frappe AI Core"
	doc.insert(ignore_permissions=True)


def _ensure_dashboard_chart_timeseries(name, chart_name, value_field, color):
	if frappe.db.exists("Dashboard Chart", name):
		return
	doc = frappe.new_doc("Dashboard Chart")
	doc.name = name
	doc.chart_name = chart_name
	doc.chart_type = "Sum"
	doc.document_type = "AI Usage Record"
	doc.based_on = "captured_at"
	doc.value_based_on = value_field
	doc.timeseries = 1
	doc.time_interval = "Daily"
	doc.timespan = "Last Month"
	doc.type = "Line"
	doc.filters_json = "[]"
	doc.is_public = 1
	doc.module = "Frappe AI Core"
	doc.insert(ignore_permissions=True)


def _ensure_dashboard_chart_groupby(name, chart_name, group_field, value_field):
	if frappe.db.exists("Dashboard Chart", name):
		return
	doc = frappe.new_doc("Dashboard Chart")
	doc.name = name
	doc.chart_name = chart_name
	doc.chart_type = "Group By"
	doc.document_type = "AI Usage Record"
	doc.group_by_type = "Sum"
	doc.group_by_based_on = group_field
	doc.aggregate_function_based_on = value_field
	doc.type = "Bar"
	doc.filters_json = "[]"
	doc.is_public = 1
	doc.module = "Frappe AI Core"
	doc.insert(ignore_permissions=True)


def _ensure_cost_dashboard():
	"""Seed Number Cards + Dashboard Charts for AI tokenomics (idempotent, best-effort)."""
	try:
		_ensure_number_card("AI Cost USD (30d)", "Sum", "cost_usd", "last 30 days", "#22c55e")
		_ensure_number_card("AI Cost USD (Today)", "Sum", "cost_usd", "today", "#16a34a")
		_ensure_number_card("AI Tokens (30d)", "Sum", "total_tokens", "last 30 days", "#f59e0b")
		_ensure_number_card("AI Usage Rows (30d)", "Count", None, "last 30 days", "#6366f1")
		_ensure_dashboard_chart_timeseries(
			"AI Daily Cost (USD)", "AI Daily Cost (USD)", "cost_usd", "#22c55e"
		)
		_ensure_dashboard_chart_groupby(
			"AI Cost by Template", "AI Cost by Template", "template", "cost_usd"
		)
		_ensure_dashboard_chart_groupby("AI Cost by Model", "AI Cost by Model", "model", "cost_usd")
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core ensure_cost_dashboard")
