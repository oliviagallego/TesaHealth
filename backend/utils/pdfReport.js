const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

function loadTemplate(filename) {
    const filePath = path.join(__dirname, "templates", filename);
    return fs.readFileSync(filePath, "utf8");
}

function applyVars(html, vars) {
    let out = html;
    for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{{${k}}}`, v ?? "");
    }
    return out;
}

function escapeHtml(str = "") {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function fmtDate(d) {
    if (!d) return "—";
    try {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return "—";
        return dt.toLocaleString("en-GB");
    } catch {
        return "—";
    }
}

function safeParseJSON(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}

function renderKV(k, v) {
    return `
    <div style="display:flex; gap:10px; padding:6px 0; border-bottom:1px solid #eef2f7;">
      <div style="width:190px; color:#5b6b7a; font-weight:700;">${escapeHtml(k)}</div>
      <div style="flex:1; color:#111827;">${escapeHtml(v ?? "—")}</div>
    </div>
  `;
}

function buildCaseReportHtml({ user, patient, caseRow, aiArtifact, consensus }) {
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
    const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
    const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

    const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
    const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
    const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

    const symptomsArr =
        Array.isArray(caseRow?.symptoms) ? caseRow.symptoms :
            typeof caseRow?.symptoms === "string" ? safeParseJSON(caseRow.symptoms, []) :
                [];

    const diff =
        typeof aiArtifact?.differentials === "string"
            ? safeParseJSON(aiArtifact.differentials, {})
            : (aiArtifact?.differentials || {});

    const mirText =
        aiArtifact?.vignette ||
        diff?.public?.question_text ||
        "—";

    const mirOptions = Array.isArray(diff?.public?.options) ? diff.public.options : [];

    const triage =
        diff?.infermedica?.triage?.triage_level ||
        diff?.infermedica?.triage?.triage ||
        "—";

    const evidenceItems = symptomsArr
        .filter(e => e && e.choice_id === "present")
        .map(e => e.name || e.label || e.id)
        .slice(0, 50);

    const EVIDENCE_BLOCK = evidenceItems.length
        ? `<ul style="margin:0; padding-left:18px;">${evidenceItems.map(x => `<li>${escapeHtml(String(x))}</li>`).join("")}</ul>`
        : "—";

    const MIR_OPTIONS_BLOCK = mirOptions.length
        ? `
      <div style="margin-top:10px; background:#f4f7f8; border:1px solid rgba(18,58,99,0.12); border-radius:12px; padding:14px;">
        <div style="font-weight:800; color:#123a63; margin-bottom:8px;">MIR options</div>
        <ul style="margin:0; padding-left:18px; color:#111827; line-height:1.6;">
          ${mirOptions.map(o => `<li><strong>${escapeHtml(String(o.key || ""))}</strong>: ${escapeHtml(String(o.label || ""))}</li>`).join("")}
        </ul>
      </div>
    `
        : "";

    const diagnosis = consensus?.final_diagnosis || "—";
    const urgency = consensus?.final_urgency || "—";
    const closedAt = fmtDate(consensus?.closed_at || caseRow?.closed_at);

    const patientSummary = consensus?.patient_summary || "";
    const patientExpl = consensus?.patient_explanation || "";
    const clinicianNotes = consensus?.clinician_notes || "";

    const PATIENT_INFO_ROWS = [
        renderKV("Name", `${user?.name || ""}`),
        renderKV("Surname", `${user?.surname || ""}`),
        renderKV("Email", `${user?.email || ""}`),
        renderKV("Phone", `${user?.phone || "—"}`),
        renderKV("Address", `${user?.address || "—"}`),
        renderKV("Date of birth", `${user?.dob || "—"}`),
        `<div style="height:10px;"></div>`,
        renderKV("Sex", `${patient?.sex || "—"}`),
        renderKV("Pregnant", patient?.pregnant === true ? "Yes" : patient?.pregnant === false ? "No" : "—"),
        renderKV("Height (cm)", patient?.height != null ? String(patient.height) : "—"),
        renderKV("Weight (kg)", patient?.weight != null ? String(patient.weight) : "—"),
        renderKV("Smoking", patient?.smoking ?? "—"),
        renderKV("High blood pressure", patient?.high_blood_pressure ?? "—"),
        renderKV("Diabetes", patient?.diabetes ?? "—"),
        renderKV("Chronic condition", patient?.chronic_condition ?? "—"),
        renderKV("Prior surgery", patient?.prior_surgery ?? "—"),
        renderKV("Allergies", patient?.allergies ?? "—"),
        renderKV("Medications", patient?.medications ?? "—"),
    ].join("");

    const CASE_INFO_ROWS = [
        renderKV("Case ID", String(caseRow?.id ?? "—")),
        renderKV("Created", fmtDate(caseRow?.created_at || caseRow?.submitted_at)),
        renderKV("Status", String(caseRow?.status || "—")),
        renderKV("Triage level (Infermedica)", String(triage || "—")),
        renderKV("Consensus closed at", String(closedAt || "—")),
    ].join("");

    const CONSENSUS_ROWS = [
        renderKV("Final diagnosis", diagnosis),
        renderKV("Final urgency", urgency),
    ].join("");

    const PATIENT_SUMMARY_BLOCK = patientSummary
        ? `
      <div style="margin-top:14px;">
        <div style="font-weight:800; color:#123a63; margin-bottom:8px;">Patient summary</div>
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; color:#374151; white-space:pre-wrap;">${escapeHtml(patientSummary)}</div>
      </div>
    `
        : "";

    const PATIENT_EXPLANATION_BLOCK = patientExpl
        ? `
      <div style="margin-top:14px;">
        <div style="font-weight:800; color:#123a63; margin-bottom:8px;">Explanation</div>
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; color:#374151; white-space:pre-wrap;">${escapeHtml(patientExpl)}</div>
      </div>
    `
        : "";

    const CLINICIAN_NOTES_BLOCK = clinicianNotes
        ? `
      <div style="margin-top:14px;">
        <div style="font-weight:800; color:#123a63; margin-bottom:8px;">Clinician notes</div>
        <div style="background:#fff7ed; border:1px solid rgba(194,65,12,0.22); border-radius:12px; padding:12px; color:#374151; white-space:pre-wrap;">${escapeHtml(clinicianNotes)}</div>
      </div>
    `
        : "";

    const template = loadTemplate("case_report.html");

    const patientFullName =
        `${user?.name || ""} ${user?.surname || ""}`.trim() || "there";

    return applyVars(template, {
        FRONTEND_URL: escapeHtml(FRONTEND_URL),
        LOGO_URL: escapeHtml(LOGO_URL),
        ICON_URL: escapeHtml(ICON_URL),

        SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
        SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
        SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),

        PATIENT_FULLNAME: escapeHtml(patientFullName),

        PATIENT_INFO_ROWS,
        CASE_INFO_ROWS,
        EVIDENCE_BLOCK,

        MIR_TEXT: escapeHtml(String(mirText || "—")),
        MIR_OPTIONS_BLOCK,

        CONSENSUS_ROWS,

        PATIENT_SUMMARY_BLOCK,
        PATIENT_EXPLANATION_BLOCK,
        CLINICIAN_NOTES_BLOCK,
    });
}

async function htmlToPdfBuffer(html) {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" }
        });
        return pdf;
    } finally {
        await browser.close();
    }
}

module.exports = { buildCaseReportHtml, htmlToPdfBuffer };
