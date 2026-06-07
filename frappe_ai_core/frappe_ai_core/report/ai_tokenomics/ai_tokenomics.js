// Copyright (c) 2026, Frappe AI Core and contributors
// For license information, please see license.txt

frappe.query_reports["AI Tokenomics"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
		},
		{
			fieldname: "template",
			label: __("Template"),
			fieldtype: "Link",
			options: "AI Agent Template",
		},
		{
			fieldname: "user",
			label: __("User"),
			fieldtype: "Link",
			options: "User",
		},
		{
			fieldname: "usage_kind",
			label: __("Usage Kind"),
			fieldtype: "Select",
			options: ["", "Live Voice", "Judge", "Analytics"].join("\n"),
		},
	],
};
