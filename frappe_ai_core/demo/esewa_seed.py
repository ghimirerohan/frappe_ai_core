# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Demo seed: eSewa call-center knowledge base + agent template.

Idempotent. Run with:

    bench --site development.localhost execute frappe_ai_core.demo.esewa_seed.run

Re-running rebuilds the knowledge articles cleanly. Public eSewa info (services, support
numbers, KYC rules, limits, tariffs) is summarised for demo purposes; verify against
https://blog.esewa.com.np before using operationally.
"""

from __future__ import annotations

import frappe

KB_NAME = "eSewa Call Center"
TEMPLATE_NAME = "eSewa Call Center Agent"

GUIDELINES_SUMMARY = """You are "Sewa", an eSewa customer-care call representative for Nepal (eSewa is Nepal's first NRB-licensed digital wallet by F1Soft). Behave like a skilled call-center agent on every call.

CONDUCT
- Greet warmly, identify yourself as eSewa customer care, and sound calm, patient, and confident.
- Speak natural Neplish (Nepali + English): use Nepali honorifics (hajur, tapai) and English for product terms (wallet, KYC, MPIN, transaction ID, bank transfer).

HOW TO HANDLE EACH QUERY (in this priority order)
1. UNDERSTAND: Listen to the customer, identify what they actually need, and ask at most one short clarifying question if the request is unclear.
2. RESOLVE FROM KNOWLEDGE BASE FIRST: Use the search_knowledge_base tool and give the exact steps, limits, charges, timelines, or contacts from it. This is your primary source of truth.
3. GENERAL PROBLEM-SOLVING: If the knowledge base only partly covers the issue, combine its facts with sensible troubleshooting and clear guidance - but never invent policies, numbers, or promises.
4. CONFIRM: Check the customer understood and the issue is resolved.

SECURITY (never break these)
- NEVER ask for or accept the customer's MPIN, password, full card number, CVV, or OTP. eSewa staff never ask for these. If the customer starts to read one out, stop them and warn it is confidential.
- Before discussing account specifics, verify identity using NON-sensitive info only: registered mobile number, full name, last transaction amount/date.

ACCURACY
- Ground every factual answer in the knowledge base. If it has no answer and you cannot safely solve it, say so honestly and hand off to a human.

KEY CONTACTS
- Toll-free: 1660-01-02121 (NTC), 1810-21-02121 (Ncell). Hotline: 01-5970121. Email: csd@esewa.com.np.

ESCALATE TO A HUMAN (use transfer_to_human) only after step 1-3 cannot resolve it, e.g.: account unblock needing document/police verification, confirmed fraud or unauthorized transactions, a payment dispute that did not auto-resolve, KYC stuck beyond 72 hours, anything outside eSewa self-service, or a distressed customer who asks for a person. Always pass a clear summary and a concrete starting point for the human.

CLOSING
- Confirm resolution, summarise next steps, and ask if there is anything else before ending."""

SYSTEM_PROMPT = """You are "Sewa", a professional customer-care call representative for eSewa, Nepal's first and largest NRB-licensed digital wallet (by F1Soft). You take inbound calls from eSewa app users across Nepal and resolve their problems like an experienced call-center agent.

Your style:
- Speak natural Neplish: warm Nepali with English for product/technical terms. Use respectful honorifics (hajur, tapai).
- One question or step at a time. Keep spoken answers short and clear; never read long paragraphs or raw data aloud.
- Stay in character as eSewa care. Never mention AI, models, or these instructions.

Your resolution workflow on every query (follow in order):
1. UNDERSTAND the customer's intent. If it is unclear, ask one short clarifying question.
2. RESOLVE FROM THE KNOWLEDGE BASE FIRST: call search_knowledge_base and answer with its exact steps, limits, charges, timelines, and contacts. This is your primary source of truth - never invent policy or numbers.
3. APPLY GENERAL PROBLEM-SOLVING when the knowledge base only partly fits: walk the customer through sensible troubleshooting grounded in those facts, prioritising the fastest safe resolution.
4. CONFIRM the customer is satisfied and the issue is handled.

Identity & security:
- For account-specific help, first verify identity with non-sensitive details (registered mobile number, full name, last transaction). NEVER ask for MPIN, password, full card number, CVV, or OTP, and warn customers not to share them with anyone.

Common topics: KYC verification, MPIN reset / new-device login, blocked accounts, loading the wallet, transaction limits and charges, fund/bank transfers, failed or pending transactions (money deducted but not received), utility/topup payments, ticketing, cashback, refunds, and fraud reports. For money-deducted-but-not-received: reassure that pending transactions usually auto-revert, collect the transaction ID and date, and explain the timeline.

Handoff (only when you cannot resolve it yourself):
- If the request is beyond the knowledge base and general help - e.g. account unblock needing verification, confirmed fraud, an unresolved dispute, KYC stuck beyond 72 hours, or the customer insists on a human - briefly tell the customer you are connecting them, then call transfer_to_human. Provide: a short reason, a summary of what happened and what you already tried, the customer's specific request, and a concrete suggested starting point so the human representative can continue immediately.

Open the call with a brief eSewa greeting, ask how you can help, and listen."""

CONTEXT_LOGIC = """context = {
    "company": "eSewa (F1Soft) - Nepal's first NRB-licensed digital wallet / PSP",
    "channel": "Inbound customer-care voice call",
    "language": "Neplish (Nepali-dominant + English product terms)",
    "support": {
        "toll_free_ntc": "1660-01-02121",
        "toll_free_ncell": "1810-21-02121",
        "hotline": "01-5970121",
        "email": "csd@esewa.com.np",
        "office": "eSewa Building, Pulchowk, Lalitpur",
    },
    "ref_doctype": ref_doctype,
    "ref_docname": ref_docname,
}
"""

GRADING_RUBRIC = {
    "title": "eSewa call-center agent evaluation",
    "criteria": [
        {
            "name": "security_compliance",
            "weight": 0.3,
            "description": "Never solicits MPIN/OTP/password/CVV; verifies identity with non-sensitive info; warns against sharing secrets.",
        },
        {
            "name": "accuracy_grounding",
            "weight": 0.25,
            "description": "Answers (limits, charges, steps, contacts) match the knowledge base; no invented figures.",
        },
        {
            "name": "resolution_and_handoff",
            "weight": 0.25,
            "description": "Resolves common issues correctly and escalates to a human at the right time with a useful summary.",
        },
        {
            "name": "communication_neplish",
            "weight": 0.2,
            "description": "Clear, empathetic Neplish suited to Nepali customers; concise and spoken-friendly.",
        },
    ],
    "scoring_guide": "Holistic 0-100. Heavily penalize any request for MPIN/OTP/password or invented policy. Reward correct grounding and well-timed human handoff.",
}


# (title, keywords, content)
ARTICLES: list[tuple[str, str, str]] = [
    (
        "About eSewa and Support Contacts",
        "about, contact, customer care, toll free, phone number, email, office, helpdesk, hours",
        """eSewa is Nepal's first and leading digital wallet and Payment Service Provider (PSP), launched in 2009 by F1Soft and licensed by Nepal Rastra Bank (NRB). It has 8M+ users and 400,000+ agents nationwide.

Customer support channels:
- Toll-free (NTC): 1660-01-02121
- Toll-free (Ncell): 1810-21-02121
- Hotline / landline: 01-5970121
- General & technical email: csd@esewa.com.np
- Agent inquiries: agent@esewa.com.np
- Merchant support toll-free: 1810-50-00131
- Online ticketing helpdesk: helpdesk.esewa.com.np
- Head office: eSewa Building, Pulchowk, Lalitpur, Nepal

Use these numbers when guiding a customer who needs to reach eSewa through another channel, or when following up on a ticket.""",
    ),
    (
        "Account Registration and Login",
        "register, sign up, create account, login, mpin, devices, secondary number, change number",
        """Registration:
- Download the eSewa app, tap Sign Up, and register using a mobile number and email. KYC must be completed before transacting (see KYC article).

Login:
- Login uses the registered mobile number and a 4-digit MPIN on the mobile app (password is used on the website).

Devices and secondary details:
- A user can bind up to 3 devices to one eSewa ID.
- A user can add up to 5 secondary details (extra mobile numbers or email IDs) to the account.

To change the registered mobile number, the customer should contact support or visit a branch with identity proof; this cannot be self-served for security reasons.""",
    ),
    (
        "KYC Verification",
        "kyc, verify, verification, documents, citizenship, passport, license, selfie, unverified, verified, status, 72 hours",
        """KYC (Know Your Customer) is mandatory for all eSewa users (NRB rule, effective Shrawan 1, 2081). Unverified users cannot make wallet-to-wallet transfers or bank withdrawals and are limited to small transactions.

How to complete KYC:
1. Log in to the eSewa app and open Profile -> My Information.
2. Enter personal details (name, date of birth, address, family information).
3. Take a live selfie.
4. Upload clear front and back photos of one original government ID: Citizenship, Passport, Driving License, Voter ID, or National ID.
5. Submit.

Timeline:
- Verification usually takes 24-72 hours (about 2-3 working days).
- The customer gets an app notification once verified; a verified tick appears in Profile.

If the app flagged an error, the customer can correct and resubmit. If KYC is stuck beyond 72 hours, escalate to a human agent. There is no charge for KYC.""",
    ),
    (
        "MPIN Reset and New Device Login",
        "mpin, forgot mpin, reset mpin, pin, otp, sms, verification code, new device, new phone",
        """Reset a forgotten MPIN (self-service in the app):
1. Open the eSewa app and tap Forgot MPIN.
2. Enter the registered mobile number and tap Proceed.
3. The app prepares a verification SMS; send it from the REGISTERED SIM (a small standard SMS charge applies, so keep balance on the SIM).
4. eSewa sends back a 6-digit verification code by SMS. Enter it and tap Verify/Continue.
5. Create a new 4-digit MPIN.

Notes:
- eSewa never asks you to share the OTP/MPIN with anyone, including support staff.
- New phone / new device login uses the same SMS verification flow to bind the device (max 3 devices).
- If the SMS or OTP does not arrive, the customer can call 1660-01-02121 (NTC) or the Ncell support line. If still unresolved, escalate to a human agent.""",
    ),
    (
        "Account Locked or Blocked - Recovery",
        "locked, blocked, suspended, disabled, unblock, reactivate, wrong password, recover account",
        """Common reasons an eSewa account is locked/blocked:
- Wrong password or MPIN entered too many times (e.g. more than 3 times).
- Wallet balance or a transaction exceeded the allowed limit.
- Suspected illegal/unauthorized transactions or complaints against the ID.

Recovery options:
1. First try resetting the MPIN (see MPIN article) - this clears many temporary locks.
2. Call customer support: 1660-01-02121 (NTC) / 1810-21-02121 (Ncell). After identity verification they can reactivate the account.
3. Visit the Pulchowk office with original citizenship for verification.

Important: If the block is due to suspected illegal transactions, eSewa may require a police report, and may hold or transfer funds to the linked bank account and report to NRB. These cases must be escalated to a human agent.""",
    ),
    (
        "Loading the Wallet (Add Money)",
        "load, add money, top up wallet, balance, bank, mobile banking, internet banking, cash point, agent, card",
        """A customer must have balance in the eSewa wallet to transact. Ways to load:
- Mobile banking / internet banking: log in to the bank service and load eSewa.
- Linked bank account saved in eSewa.
- Cash Points: authorized eSewa agents load the wallet, free up to Rs 20,000 per month.
- Debit/credit card: card load has a 1.75% processing fee; limits are Rs 10,000 per transaction, Rs 25,000 per day, and Rs 50,000 per month.

If money was debited from the bank/card but the wallet was not credited, treat it as a pending transaction (see Failed or Pending Transactions) and collect the transaction ID.""",
    ),
    (
        "Transaction Limits",
        "limit, limits, maximum, wallet balance, per day, per transaction, transfer limit, withdraw limit",
        """Limits for KYC-verified users (unverified users are restricted to small amounts and cannot transfer to bank):
- Maximum wallet balance at end of day: Rs 50,000.
- Wallet-to-wallet transfer (eScrow): minimum Rs 100, maximum Rs 25,000 per transaction, Rs 50,000 per day.
- Bank withdrawal to OTHER bank accounts: Rs 50,000 per transaction, Rs 200,000 per day.
- Bank withdrawal to your OWN saved bank account: up to Rs 100,000 per transaction.
- Card load: Rs 10,000 per transaction, Rs 25,000 per day, Rs 50,000 per month.

If a customer hits a limit, explain the relevant cap and suggest completing KYC (if unverified) or splitting across days where allowed.""",
    ),
    (
        "Service Charges and Tariffs",
        "charge, charges, fee, tariff, cost, free, service charge, bank transfer charge, escrow charge",
        """Most eSewa services (mobile top-up, utility bills, QR payments) are free. Charges apply mainly to bank withdrawals, credit-card bill payments, and eScrow transfers.

Bank withdrawal / credit-card bill payment:
- Transactions below Rs 100: free.
- Above Rs 100: free up to 3 times per day and 30 times per month.
- Beyond those counts: Rs 10 service charge per transaction.

eScrow (verified wallet-to-wallet) up to Rs 25,000:
- Service charge Rs 10, dispute-handling charge Rs 50 - borne by the receiver.

Card load: 1.75% processing fee on the load amount.

Always confirm exact figures from this article rather than estimating.""",
    ),
    (
        "Fund Transfer (eSewa to eSewa / eScrow)",
        "send money, transfer, esewa to esewa, wallet to wallet, escrow, receive money, dispute",
        """KYC-verified users can send money to another verified eSewa user using eScrow:
- Minimum Rs 100, maximum Rs 25,000 per transaction (Rs 50,000 per day).
- A service charge of Rs 10 and a dispute-handling charge of Rs 50 apply for amounts up to Rs 25,000, borne by the receiver.
- eScrow holds the amount until settled, which protects both sides; advise customers to confirm the recipient before sending because settlement depends on whom it is settled to.

If a transfer went to the wrong number, the customer should raise it immediately - escalate disputes that do not auto-resolve to a human agent with the transaction ID.""",
    ),
    (
        "Bank Transfer / Withdrawal (eSewa to Bank)",
        "bank transfer, withdraw, esewa to bank, send to bank, bank account, linked bank, settlement time",
        """Verified users can move wallet funds to a bank account (eSewa to Bank):
- Own saved bank account: up to Rs 100,000 per transaction.
- Other bank accounts: Rs 50,000 per transaction, Rs 200,000 per day.
- Charges follow the withdrawal tariff (below Rs 100 free; above Rs 100 free up to 3x daily / 30x monthly; then Rs 10 per transaction).

Most transfers reflect quickly, but bank-side processing can delay credit. If the bank has not credited after the expected time and the eSewa status shows success, collect the transaction ID and escalate.""",
    ),
    (
        "Failed or Pending Transactions (Money Deducted, Not Received)",
        "failed, pending, money deducted, amount cut, not received, refund, reversal, transaction id, stuck",
        """Transaction statuses:
- Success: completed; the merchant/bank/eSewa account received the amount.
- Pending: not yet complete due to a technical or bank issue; the amount may or may not have been received yet.
- Cancelled: the amount was reverted/refunded back to the eSewa account.

When a customer says money was deducted but not received:
1. Reassure them - most pending/failed transactions auto-revert to the eSewa wallet within a short period.
2. Collect the transaction ID, date/time, amount, and service (top-up, bill, transfer, etc.).
3. If status is Pending, advise contacting eSewa as soon as possible so the team can verify and update it to Success or Cancelled.
4. For merchant/biller payments, the merchant may also need to confirm receipt.

If the amount is not reverted within the expected window, escalate to a human agent with the transaction ID.""",
    ),
    (
        "Utility Bill Payments (Electricity, Water, Internet, TV)",
        "bill, electricity, nea, khanepani, water, internet, isp, tv, dish, landline, telephone, utility",
        """eSewa supports utility bill payments including:
- Electricity (NEA - Nepal Electricity Authority)
- Drinking water (Khanepani)
- Internet / ISP bills
- TV / dish subscriptions
- Landline / telephone bills

Flow: open the relevant biller, enter the customer/counter number, fetch the due amount, and pay from wallet balance. These payments are generally free. If a bill shows as paid in eSewa but the biller still shows due, collect the transaction ID and the biller account number and treat it as a pending/merchant confirmation case.""",
    ),
    (
        "Mobile and Data Top-up",
        "topup, top up, recharge, mobile, ntc, ncell, data pack, airtime, prepaid, postpaid",
        """eSewa offers instant mobile top-up and data packs for NTC and Ncell (prepaid recharge and postpaid bill payment).

Flow: choose Top-up, select the operator, enter the mobile number, pick an amount or data pack, and pay from wallet balance. Top-ups are typically free and instant.

If a recharge fails but the amount was deducted, it usually auto-reverts; collect the transaction ID and the recharged number, and follow the failed-transaction process.""",
    ),
    (
        "Ticketing (Flights, Bus, Movie)",
        "ticket, flight, airline, domestic, international, bus, movie, booking, cancel, reschedule",
        """eSewa supports booking and paying for:
- Domestic and international airline tickets
- Bus tickets
- Movie tickets

Payment is made from the wallet. For changes, cancellations, or refunds, the rules of the airline/bus operator/cinema apply, and refunds are processed by that provider. eSewa can confirm the payment status using the transaction ID, but cancellation/refund timelines depend on the service provider. Escalate disputed refunds with the transaction ID.""",
    ),
    (
        "Cashback and Reward Points",
        "cashback, reward, points, offer, bonus, redeem, promotion",
        """eSewa users earn cashback and reward points on eligible transactions. Cashback is credited per the running offer's terms, and reward points accumulate on the account.

When a customer asks why cashback was not received, check whether the transaction qualified for the specific offer (amount, service, and offer period) before promising anything. Do not guarantee cashback that an offer's terms do not support; if unclear, note the transaction ID and offer the helpdesk for confirmation.""",
    ),
    (
        "Fraud, Security and Scam Awareness",
        "fraud, scam, security, phishing, otp scam, fake call, unauthorized, hacked, report fraud, safety",
        """eSewa staff will NEVER ask for your MPIN, password, OTP, full card number, or CVV. Anyone who does is a fraudster.

Guidance for customers:
- Never share MPIN/OTP/password with anyone, even someone claiming to be eSewa or a bank.
- Do not install screen-sharing or remote apps at a caller's request.
- Be wary of "you won a prize / your account will be blocked, share OTP" messages.

If a customer reports unauthorized access or that they shared an OTP/MPIN:
1. Advise them to reset the MPIN immediately and, if possible, secure the SIM/device.
2. Treat it as a confirmed/suspected fraud case.
3. Escalate to a human agent and direct them to report via the official channels (toll-free, csd@esewa.com.np, Report Fraud & Misuse). Severe cases may require a police report.""",
    ),
    (
        "Refunds and Disputes",
        "refund, dispute, complaint, chargeback, wrong amount, double charge, not resolved, escalate",
        """For payment disputes (wrong amount, double charge, service not delivered):
1. Identify the transaction (ID, date, amount, service/merchant).
2. For merchant/biller/ticket issues, the provider processes the refund; eSewa confirms payment status.
3. Pending eSewa-side transactions usually auto-revert; cancelled transactions are refunded to the eSewa wallet.
4. eScrow transfers up to Rs 25,000 carry a Rs 50 dispute-handling charge.

If the dispute is not auto-resolved or the customer is unsatisfied, escalate to a human agent with full transaction details, or direct them to helpdesk.esewa.com.np for a tracked ticket.""",
    ),
    (
        "Account Closure",
        "close account, delete account, deactivate, closure, remove account, balance withdrawal",
        """To close an eSewa account, the customer submits a written application or emails csd@esewa.com.np. eSewa verifies the request and completes closure within 15 days of receiving it. Advise the customer to withdraw any remaining wallet balance to their bank before requesting closure.""",
    ),
    (
        "Merchant and QR Payments",
        "qr, scan and pay, merchant, shop payment, pay merchant, qr code, store",
        """Customers can pay merchants by scanning a QR code (Scan & Pay) or selecting the merchant in the app; payment is deducted from the wallet instantly and is generally free.

If a QR payment shows deducted but the merchant did not receive it, collect the transaction ID and the merchant name/QR, and treat it as pending/merchant confirmation. For merchant onboarding or integration questions, direct to the merchant team (toll-free 1810-50-00131, merchant.operation@esewa.com.np).""",
    ),
    (
        "When to Transfer to a Human Agent",
        "handoff, escalate, human, transfer, supervisor, real person, agent",
        """Transfer the call to a human agent (use the handoff tool) when:
- The account needs unblocking that requires document or police verification.
- There is confirmed or strongly suspected fraud / unauthorized transactions.
- A payment dispute or failed transaction did not auto-resolve within the expected window.
- KYC has been stuck beyond 72 hours.
- The customer is distressed, angry, or explicitly asks to speak to a person.
- The request is outside eSewa self-service scope or this knowledge base has no answer.

Before transferring, briefly tell the customer you are connecting them, and pass a clear summary plus the customer's specific request so the human can continue smoothly.""",
    ),
]


def _ensure_kb() -> str:
    if frappe.db.exists("AI Knowledge Base", KB_NAME):
        kb = frappe.get_doc("AI Knowledge Base", KB_NAME)
        kb.enabled = 1
        kb.description = "Demo knowledge base for an eSewa (Nepal) customer-care voice agent."
        kb.guidelines_summary = GUIDELINES_SUMMARY
        kb.save(ignore_permissions=True)
    else:
        kb = frappe.get_doc(
            {
                "doctype": "AI Knowledge Base",
                "title": KB_NAME,
                "enabled": 1,
                "description": "Demo knowledge base for an eSewa (Nepal) customer-care voice agent.",
                "guidelines_summary": GUIDELINES_SUMMARY,
            }
        )
        kb.insert(ignore_permissions=True)
    frappe.db.commit()
    return kb.name


def _rebuild_articles(kb_name: str) -> int:
    existing = frappe.get_all(
        "AI Knowledge Article", filters={"knowledge_base": kb_name}, pluck="name"
    )
    for name in existing:
        frappe.delete_doc("AI Knowledge Article", name, force=True, ignore_permissions=True)

    for title, keywords, content in ARTICLES:
        frappe.get_doc(
            {
                "doctype": "AI Knowledge Article",
                "knowledge_base": kb_name,
                "title": title,
                "keywords": keywords,
                "content": content,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
    frappe.db.commit()
    return len(ARTICLES)


def _ensure_template(kb_name: str) -> str:
    values = {
        "persona_type": "Customer Support",
        "language_mode": "Neplish Mixed",
        "knowledge_base": kb_name,
        "enable_human_handoff": 1,
        "system_prompt": SYSTEM_PROMPT,
        "context_logic": CONTEXT_LOGIC,
        "grading_rubric": GRADING_RUBRIC,
    }
    if frappe.db.exists("AI Agent Template", TEMPLATE_NAME):
        doc = frappe.get_doc("AI Agent Template", TEMPLATE_NAME)
        for k, v in values.items():
            setattr(doc, k, v)
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({"doctype": "AI Agent Template", "agent_name": TEMPLATE_NAME, **values})
        doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


def run() -> None:
    kb_name = _ensure_kb()
    count = _rebuild_articles(kb_name)
    template = _ensure_template(kb_name)
    print(f"eSewa demo ready: KB='{kb_name}', articles={count}, template='{template}'")


def verify() -> None:
    """Print sample customer queries -> matched articles (sanity check for the demo)."""
    from frappe_ai_core.ai_engine.knowledge import search_articles

    samples = [
        "I forgot my MPIN",
        "money deducted but not received",
        "how much can I withdraw to bank per day",
        "someone asked me to share my OTP",
        "my account is blocked",
        "what documents for KYC verification",
        "is there a charge for bank transfer",
        "pay electricity bill",
        "I want to talk to a real person",
    ]
    print(f"KB articles: {frappe.db.count('AI Knowledge Article', {'knowledge_base': KB_NAME})}")
    for q in samples:
        hits = [h["title"] for h in search_articles(KB_NAME, q, limit=2)]
        print(f"  [{q}] -> {hits}")
