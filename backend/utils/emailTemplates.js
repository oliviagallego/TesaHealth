const fs = require("fs");
const path = require("path");

function loadTemplate(filename) {
  const filePath = path.join(__dirname, "templates", filename);
  return fs.readFileSync(filePath, "utf8");
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyVars(html, vars) {
  let out = html;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v ?? "");
  }
  return out;
}

function verifyEmailTemplate({ name, verifyUrl }) {
  const subject = "Confirm your TesaHealth email";

  const safeName = escapeHtml(name || "there");
  const safeVerifyUrl = String(verifyUrl || "");

  const text =
    `Hi ${name || "there"},\n\n` +
    `Please confirm your email by clicking this link:\n${safeVerifyUrl}\n\n` +
    `If you didn't create this account, you can ignore this email.\n\n` +
    `Safety note: Educational use only. If you have warning signs, call 112.`;

  const template = loadTemplate("confirmation_email.html");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const html = applyVars(template, {
    NAME: safeName,
    VERIFY_URL: safeVerifyUrl,
    FRONTEND_URL,
    LOGO_URL,
    ICON_URL,
  });

  return { subject, text, html };
}


function resultsTemplate({ name, summary, reportUrl }) {
  const subject = "Your TesaHealth results are ready";

  const safeName = escapeHtml(name || "there");
  const safeSummary = escapeHtml(summary || "");
  const safeReportUrl = String(reportUrl || "");

  const text =
    `Hi ${name || "there"},\n\n` +
    `Your results are ready:\n${summary || ""}\n\n` +
    `You can download your report here:\n${safeReportUrl}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>Your results are ready:</p>
      <pre style="background:#f6f6f6;padding:12px;border-radius:8px;white-space:pre-wrap;">${safeSummary}</pre>
      <p><a href="${safeReportUrl}">Download report</a></p>
    </div>
  `;

  return { subject, text, html };
}

function verificationRequestTemplate({ requestRole }) {
  const subject = "Admin action required – TesaHealth";

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const next = encodeURIComponent("/pages/area_admin.html?focus=verifications");
  const adminPortalUrl = `${FRONTEND_URL}/pages/login.html?role=ADMIN&next=${next}`;

  const text =
    `Admin review required.\n\n` +
    `A new ${requestRole} account is waiting for verification.\n` +
    `For privacy reasons, details are available only after sign-in.\n\n` +
    `Open Admin Portal: ${adminPortalUrl}\n`;

  const template = loadTemplate("verification_template.html");

  const html = applyVars(template, {
    LOGO_URL,
    ICON_URL,
    ADMIN_PORTAL_URL: adminPortalUrl,
  });

  return { subject, text, html };
}


function passwordChangeCodeTemplate({ name, code }) {
  const subject = "TesaHealth – Security code to change your password";

  const safeName = escapeHtml(name || "there");
  const safeCode = escapeHtml(String(code || ""));

  const text =
    `Hi ${name || "there"},\n\n` +
    `Your security code is: ${code}\n\n` +
    `This code expires in 10 minutes.\n` +
    `If you didn’t request this, you can ignore this email.\n`;

  const template = loadTemplate("securityCode.html");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
  const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
  const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

  const html = applyVars(template, {
    NAME: safeName,
    CODE: safeCode,
    LOGO_URL,
    ICON_URL,
    SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
    SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
    SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),
  });

  return { subject, text, html };
}

function passwordChangedTemplate({ name }) {
  const subject = "TesaHealth – Your password was changed";
  const template = loadTemplate("password_changed.html");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
  const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
  const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

  const html = applyVars(template, {
    NAME: escapeHtml(name || "there"),
    LOGO_URL,
    ICON_URL,
    SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
    SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
    SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),
  });

  const text =
    `Hi ${name || "there"},\n\n` +
    `Security alert: your TesaHealth password was changed.\n\n` +
    `If this wasn't you, change your password immediately and contact support.\n`;

  return { subject, text, html };
}

function verificationApprovedTemplate({ name, role }) {
  const subject = "TesaHealth – Account verified";
  const text = `Hi ${name || "there"},\n\nYour ${role} account has been verified. You can now sign in.\n`;
  const html = `<div style="font-family:Arial,sans-serif">
    <h2>Account verified</h2>
    <p>Hi <strong>${escapeHtml(name || "there")}</strong>,</p>
    <p>Your <strong>${escapeHtml(role)}</strong> account has been verified. You can now sign in.</p>
  </div>`;
  return { subject, text, html };
}

function verificationDeniedTemplate({ name, role, note }) {
  const subject = "TesaHealth – Account denied";
  const text = `Hi ${name || "there"},\n\nYour ${role} account request was denied.\n${note ? `\nReason:\n${note}\n` : ""}`;
  const html = `<div style="font-family:Arial,sans-serif">
    <h2>Account denied</h2>
    <p>Hi <strong>${escapeHtml(name || "there")}</strong>,</p>
    <p>Your <strong>${escapeHtml(role)}</strong> account request was denied.</p>
    ${note ? `<p><strong>Reason:</strong><br/>${escapeHtml(note)}</p>` : ""}
  </div>`;
  return { subject, text, html };
}

function verificationNeedsFixTemplate({ name, role, note, fixUrl, fields = [] }) {
  const subject = "Corrections required";

  const safeName = escapeHtml(name || "there");
  const safeRole = escapeHtml(String(role || "ACCOUNT"));
  const safeFixUrl = String(fixUrl || "");

  const fieldsText = fields.length ? `Fields to update: ${fields.join(", ")}\n\n` : "";
  const text =
    `Hi ${name || "there"},\n\n` +
    `We need some corrections to verify your ${role} account.\n\n` +
    fieldsText +
    (note ? `Admin note:\n${note}\n\n` : "") +
    `Open the correction form:\n${safeFixUrl}\n`;

  const template = loadTemplate("verification_needs_fix.html");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
  const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
  const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

  const fieldsBlock = (fields && fields.length)
    ? `
      <div style="background:#f4f7f8; border:1px solid rgba(18,58,99,0.12); border-radius:12px; padding:14px; margin:14px 0;">
        <p style="margin:0 0 8px; color:#111827; font-weight:700;">Fields to update</p>
        <ul style="margin:0; padding-left:18px; color:#374151; line-height:1.6; font-size:13px;">
          ${fields.map(f => `<li>${escapeHtml(String(f))}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const noteBlock = note
    ? `
      <div style="background:#fff7ed; border:1px solid rgba(194,65,12,0.22); border-radius:12px; padding:14px; margin:14px 0;">
        <p style="margin:0 0 8px; color:#111827; font-weight:700;">Admin note</p>
        <p style="margin:0; color:#374151; line-height:1.6; font-size:13px;">
          ${escapeHtml(String(note))}
        </p>
      </div>
    `
    : "";

  const html = applyVars(template, {
    NAME: safeName,
    ROLE: safeRole,
    FIX_URL: safeFixUrl,
    FRONTEND_URL,
    LOGO_URL,
    ICON_URL,
    SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
    SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
    SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),
    FIELDS_BLOCK: fieldsBlock,
    NOTE_BLOCK: noteBlock,
  });

  return { subject, text, html };
}

function verificationApprovedTemplate({ name, role }) {
  const subject = "TesaHealth – Account verified";

  const safeName = escapeHtml(name || "there");
  const safeRole = escapeHtml(String(role || "ACCOUNT"));

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const signInUrl = `${FRONTEND_URL}/pages/login.html?role=${encodeURIComponent(String(role || "").toUpperCase())}`;

  const text =
    `Hi ${name || "there"},\n\n` +
    `Your ${role} account has been verified. You can now sign in:\n` +
    `${signInUrl}\n`;

  const template = loadTemplate("verification_approved.html");

  const html = applyVars(template, {
    NAME: safeName,
    ROLE: safeRole,
    SIGN_IN_URL: signInUrl,
    FRONTEND_URL,
    LOGO_URL,
    ICON_URL,
  });

  return { subject, text, html };
}

function verificationDeniedTemplate({ name, role, note }) {
  const subject = "TesaHealth – Account denied";

  const safeName = escapeHtml(name || "there");
  const safeRole = escapeHtml(String(role || "ACCOUNT"));

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_URL = process.env.SUPPORT_URL || `${FRONTEND_URL}/pages/support.html`;

  const text =
    `Hi ${name || "there"},\n\n` +
    `Your ${role} account request was denied.\n` +
    (note ? `\nReason:\n${note}\n` : "") +
    `\nIf you think this is a mistake, contact support: ${SUPPORT_URL}\n`;

  const template = loadTemplate("verification_denied.html");

  const NOTE_BLOCK = note
    ? `
      <div style="background:#fff7ed; border:1px solid rgba(194,65,12,0.22); border-radius:12px; padding:14px; margin:14px 0;">
        <p style="margin:0 0 8px; color:#111827; font-weight:700;">Reason provided by the reviewer</p>
        <p style="margin:0; color:#374151; line-height:1.6; font-size:13px;">
          ${escapeHtml(String(note))}
        </p>
      </div>
    `
    : "";

  const html = applyVars(template, {
    NAME: safeName,
    ROLE: safeRole,
    SUPPORT_URL,
    NOTE_BLOCK,
    FRONTEND_URL,
    LOGO_URL,
    ICON_URL,
  });

  return { subject, text, html };
}

function accountDeleteCodeTemplate({ name, code }) {
  const subject = "TesaHealth – Code to delete your account";
  const template = loadTemplate("delete_account_code.html");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
  const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
  const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

  const html = applyVars(template, {
    NAME: escapeHtml(name || "there"),
    CODE: escapeHtml(String(code || "")),
    LOGO_URL,
    ICON_URL,
    SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
    SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
    SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),
  });

  const text =
    `Hi ${name || "there"},\n\n` +
    `You requested to delete your TesaHealth account.\n\n` +
    `Your security code is: ${code}\n` +
    `This code expires in 10 minutes.\n\n` +
    `If you didn’t request this, ignore this email.`;

  return { subject, text, html };
}

function consensusReadyTemplate({ name, caseId, reportUrl }) {
  const subject = `TesaHealth – Your case #${caseId} is finalized`;

  const safeName = escapeHtml(name || "there");
  const safeCaseId = escapeHtml(String(caseId || ""));
  const safeReportUrl = String(reportUrl || "");

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
  const LOGO_URL = process.env.LOGO_URL || `${FRONTEND_URL}/assets/img/icono.png`;
  const ICON_URL = process.env.ICON_URL || `${FRONTEND_URL}/assets/img/icono.png`;

  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "tesahealth.tfg@gmail.com";
  const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+34 912 345 678";
  const SUPPORT_LOCATION = process.env.SUPPORT_LOCATION || "Madrid, Spain";

  const text =
    `Hi ${name || "there"},\n\n` +
    `The clinician consensus for your case #${caseId} is finalized.\n` +
    `Open your report here:\n${safeReportUrl}\n\n` +
    `Safety note: Educational use only. If you have warning signs, call 112.\n`;

  const template = loadTemplate("consensus_ready.html");

  const html = applyVars(template, {
    NAME: safeName,
    CASE_ID: safeCaseId,
    REPORT_URL: safeReportUrl,
    FRONTEND_URL,
    LOGO_URL,
    ICON_URL,
    SUPPORT_EMAIL: escapeHtml(SUPPORT_EMAIL),
    SUPPORT_PHONE: escapeHtml(SUPPORT_PHONE),
    SUPPORT_LOCATION: escapeHtml(SUPPORT_LOCATION),
  });

  return { subject, text, html };
}

module.exports = {
  verifyEmailTemplate,
  passwordChangedTemplate,
  passwordChangeCodeTemplate,
  resultsTemplate,
  verificationRequestTemplate,
  verificationApprovedTemplate,
  verificationDeniedTemplate,
  verificationNeedsFixTemplate,
  accountDeleteCodeTemplate,
  consensusReadyTemplate,
};