const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sequelize = require("../database");
const { Op } = require("sequelize");

const crypto = require("crypto");
const { uploadClinicianDocs } = require("../utils/clinicianDocsUpload");

const auth = require('../middleware/auth');
const { sendMail } = require("../utils/mailer");
const { generateRawToken, hashToken } = require("../utils/token");
const { verifyEmailTemplate,
  passwordChangedTemplate,
  passwordChangeCodeTemplate,
  verificationRequestTemplate,
  accountDeleteCodeTemplate,
} = require("../utils/emailTemplates");

const router = express.Router();

const {
  user: User,
  user_token: UserToken,
  patient_profile: PatientProfile,
  clinician_profile: ClinicianProfile,
  admin_profile: AdminProfile,
  notification: Notification,
  logging: Logging,
  case: Case,
  ai_artifact: AIArtifact,
  review: Review,
  consensus: Consensus,
  money: Money
} = sequelize.models;

function assertConsents(consents) {
  if (!consents) return "Missing consents";
  if (!consents.privacy) return "Privacy consent required";
  if (!consents.data_processing) return "Data processing consent required";
  return null;
}

function make6DigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function toDocMeta(files = []) {
  return (files || []).map((f) => ({
    id: crypto.randomBytes(16).toString("hex"),
    type: "verification_document",
    original_name: f.originalname,
    filename: f.filename,
    mime: f.mimetype,
    size: f.size,
    path: `uploads/clinician_docs/${f.filename}`,
    created_at: new Date().toISOString(),
    status: "pending",
  }));
}


async function pickRandomAdminEmail() {

  const admins = await User.findAll({
    where: {
      last_profile: "admin",
      email_verified: true,
      status: "valid",
    },
    attributes: ["id", "email"],
    include: [{
      model: AdminProfile,
      required: true,
      attributes: ["id", "verification_status"],
      where: { verification_status: "verified" },
    }],
  });

  if (!admins.length) return null;

  const chosen = admins[Math.floor(Math.random() * admins.length)];
  return chosen.email;
}


router.post("/check", async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const roleUpper = String(role || "").toUpperCase();

    if (!normalizedEmail || !roleUpper) return res.status(400).json({ error: "Missing email or role" });
    if (!["PATIENT", "CLINICIAN", "ADMIN"].includes(roleUpper)) return res.status(400).json({ error: "Invalid role" });

    const existsSameRole = await User.findOne({
      where: { email: normalizedEmail, last_profile: roleUpper.toLowerCase() },
    });

    return res.json({ exists: !!existsSameRole });

  } catch (e) {
    next(e);
  }
});

router.get("/prefill", async (req, res, next) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const roleUpper = String(req.query.role || "").trim().toUpperCase();
    const finishToken = String(req.query.finish_token || "").trim();

    if (!email || !finishToken) return res.status(400).json({ error: "Missing email/finish_token" });
    if (!["PATIENT", "CLINICIAN", "ADMIN"].includes(roleUpper)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const roleLower = roleUpper.toLowerCase();

    const u = await User.findOne({
      where: { email, last_profile: roleLower },
      attributes: ["id", "email", "last_profile"]
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    const finishHash = hashToken(finishToken);
    const fin = await UserToken.findOne({
      where: {
        userId: u.id,
        type: "onboarding_finish",
        token_hash: finishHash,
        used_at: null,
      },
      order: [["created_at", "DESC"]],
    });

    if (!fin) return res.status(403).json({ error: "Invalid finish token" });
    if (new Date(fin.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: "Finish token expired" });
    }

    const source = await User.findOne({
      where: {
        email,
        id: { [Op.ne]: u.id },
        status: "valid",
        email_verified: true,
        name: { [Op.ne]: null },
        surname: { [Op.ne]: null },
        address: { [Op.ne]: null },
        dob: { [Op.ne]: null },
        phone: { [Op.ne]: null },
      },
      attributes: ["id", "last_profile", "name", "surname", "address", "dob", "phone", "created_at"],
      order: [["created_at", "DESC"]],
    });

    if (!source) return res.json({ found: false });

    return res.json({
      found: true,
      source_role: String(source.last_profile || "").toUpperCase(),
      user: {
        name: source.name,
        surname: source.surname,
        address: source.address,
        dob: (source.dob || "").slice(0, 10),
        phone: source.phone,
      },
    });
  } catch (e) {
    next(e);
  }
});


router.post("/register-start", async (req, res, next) => {

  const t = await sequelize.transaction();
  try {
    const { role, email, password, consents } = req.body;

    const err = assertConsents(consents);
    if (err) { await t.rollback(); return res.status(400).json({ error: err }); }

    const roleUpper = String(role || "").toUpperCase();
    if (!["PATIENT", "CLINICIAN", "ADMIN"].includes(roleUpper)) {
      await t.rollback();
      return res.status(400).json({ error: "Invalid role" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      await t.rollback();
      return res.status(400).json({ error: "Missing email/password/phone" });
    }

    const existingSameRole = await User.findOne({
      where: { email: normalizedEmail, last_profile: roleUpper.toLowerCase() },
      transaction: t
    });

    if (existingSameRole) {
      await t.rollback();
      return res.status(409).json({ error: "Email already registered for this role" });
    }

    const u = await User.create({
      email: normalizedEmail,
      password,
      phone: null,
      name: null,
      surname: null,
      address: null,
      dob: null,

      privacy_accepted_at: new Date(),
      consent_push: !!consents.push,
      consent_data_processing: !!consents.data_processing,

      status: "pending",
      email_verified: false,
      last_profile: roleUpper.toLowerCase(),
      onboarding_stage: 2,
    }, { transaction: t });

    if (roleUpper === "PATIENT") await PatientProfile.create({ userId: u.id }, { transaction: t });
    if (roleUpper === "CLINICIAN") await ClinicianProfile.create({ userId: u.id }, { transaction: t });
    if (roleUpper === "ADMIN") await AdminProfile.create({ userId: u.id }, { transaction: t });

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    await UserToken.create({
      userId: u.id,
      type: "email_verify",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
    }, { transaction: t });

    await t.commit();

    const backendUrl = process.env.URL || `http://localhost:${process.env.PORT || 3001}`;
    const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${rawToken}` +
      `&email=${encodeURIComponent(u.email)}` +
      `&role=${encodeURIComponent(roleUpper)}`;

    const tpl = verifyEmailTemplate({ name: "there", verifyUrl });
    await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });

    return res.status(201).json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});


router.get("/verify-email", async (req, res, next) => {
  try {
    const { token, email, role: roleFromQuery } = req.query;
    if (!token || !email) return res.status(400).json({ error: "Missing token or email" });

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const roleLower = String(roleFromQuery || "").trim().toLowerCase();

    if (!["patient", "clinician", "admin"].includes(roleLower)) {
      return res.status(400).json({ error: "Missing or invalid role" });
    }

    const u = await User.findOne({ where: { email: normalizedEmail, last_profile: roleLower } });
    if (!u) return res.status(400).json({ error: "Invalid link" });

    const tokenHash = hashToken(String(token));

    const record = await UserToken.findOne({
      where: {
        userId: u.id,
        type: "email_verify",
        token_hash: tokenHash,
        used_at: null,
      },
      order: [["created_at", "DESC"]],
    });

    if (!record) return res.status(400).json({ error: "Invalid or used token" });

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "Token expired" });
    }

    await u.update({ email_verified: true, email_verified_at: new Date(), status: "valid", onboarding_stage: 3 });
    await record.update({ used_at: new Date() });

    const rawFinish = generateRawToken();
    const finishHash = hashToken(rawFinish);

    await UserToken.create({
      userId: u.id,
      type: "onboarding_finish",
      token_hash: finishHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 30), // 30 min
    });

    const front = process.env.FRONTEND_URL || "http://localhost:3001";

    let role = (u.last_profile || "").toLowerCase();
    const roleUpper =
      roleLower === "admin" ? "ADMIN" :
        roleLower === "clinician" ? "CLINICIAN" :
          "PATIENT";

    if (!u) return res.status(400).json({ error: "Invalid link" });

    const qp = new URLSearchParams();
    qp.set("stage", "3");
    qp.set("role", roleUpper);
    qp.set("email", u.email);
    qp.set("finish_token", rawFinish);

    return res.redirect(`${front}/pages/register.html?${qp.toString()}`);

  } catch (e) {
    next(e);
  }
});

function uploadClinicianDocsMw(req, res, next) {
  return uploadClinicianDocs.array("clinician_docs", 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  });
}


router.post("/register-finish", uploadClinicianDocsMw, async (req, res, next) => {
  try {

    const bodyUser = typeof req.body.user === "string" ? safeJsonParse(req.body.user, {}) : (req.body.user || {});
    const bodyPatient = typeof req.body.patient === "string" ? safeJsonParse(req.body.patient, {}) : (req.body.patient || {});
    const bodyClinician = typeof req.body.clinician === "string" ? safeJsonParse(req.body.clinician, {}) : (req.body.clinician || {});
    const bodyAdmin = typeof req.body.admin === "string" ? safeJsonParse(req.body.admin, {}) : (req.body.admin || {});

    const { finish_token, email, role, user, patient, clinician, admin } = req.body;

    if (!finish_token || !email) return res.status(400).json({ error: "Missing finish_token/email" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const roleLower = String(role || "").trim().toLowerCase();
    if (!["patient", "clinician", "admin"].includes(roleLower)) {
      return res.status(400).json({ error: "Missing or invalid role" });
    }

    const u = await User.findOne({ where: { email: normalizedEmail, last_profile: roleLower } });

    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.email_verified) return res.status(403).json({ error: "Email not verified" });

    const finishHash = hashToken(String(finish_token));
    const fin = await UserToken.findOne({
      where: { userId: u.id, type: "onboarding_finish", token_hash: finishHash, used_at: null },
      order: [["created_at", "DESC"]],
    });
    if (!fin) return res.status(400).json({ error: "Invalid finish token" });
    if (new Date(fin.expires_at) < new Date()) return res.status(400).json({ error: "Finish token expired" });

    const name = String(bodyUser?.name || "").trim();
    const surname = String(bodyUser?.surname || "").trim();
    const address = String(bodyUser?.address || "").trim();
    const dob = String(bodyUser?.dob || "").trim();
    const phone = String(bodyUser?.phone || "").trim();

    if (!name || !surname || !address || !dob || !phone) {
      return res.status(400).json({ error: "Missing required fields: name,surname,address,dob,phone" });
    }

    await u.update({
      name, surname, address, dob, phone,
      status: "valid",
      last_profile: String(role || u.last_profile || "").toLowerCase(),
      onboarding_stage: 5
    });

    const roleUpper = String(role || "").toUpperCase();

    if (roleUpper === "PATIENT") {
      const p = await PatientProfile.findOne({ where: { userId: u.id } });
      await p.update({
        sex: patient?.sex || null,
        height: patient?.height || null,
        weight: patient?.weight || null,
        pregnant: patient?.pregnant ?? false,

        smoking: patient?.smoking || "na",
        high_blood_pressure: patient?.high_blood_pressure || "na",
        diabetes: patient?.diabetes || "na",
        chronic_condition: patient?.chronic_condition || null,
        prior_surgery: patient?.prior_surgery || null,
        allergies: patient?.allergies || null,
        medications: patient?.medications || null,
      });
    }

    if (roleUpper === "CLINICIAN") {
      const c = await ClinicianProfile.findOne({ where: { userId: u.id } });
      await c.update({
        medical_college_reg_no: bodyClinician?.medical_college_reg_no || null,
        provincial_college: bodyClinician?.provincial_college || null,
        specialty: bodyClinician?.specialty || null,
        mir_year: bodyClinician?.mir_year || null,
        liability_insurance: bodyClinician?.liability_insurance || null,

        verification_status: "pending",
      });

      if (Array.isArray(req.files) && req.files.length) {
        const existing = safeJsonParse(c.documents || "[]", []);
        const incoming = toDocMeta(req.files);
        await c.update({ documents: JSON.stringify([...existing, ...incoming]) });
      }

      const { getIO } = require("../utils/socket");
      getIO()?.to("admins").emit("verifications:update", { role: "CLINICIAN" });
      getIO()?.to("admins").emit("dashboard:update");

      const FRONT = process.env.FRONTEND_URL || "http://localhost:3001";
      const reviewUrl = `${FRONT}/pages/admin-review.html?userId=${encodeURIComponent(u.id)}&role=CLINICIAN`;

      const tpl = verificationRequestTemplate({
        requestRole: "CLINICIAN",
        userId: u.id,
        email: u.email,
        fullName: `${u.name || ""} ${u.surname || ""}`.trim() || "—",
        phone: u.phone || "—",
        createdAt: u.created_at ? new Date(u.created_at).toLocaleString() : new Date().toLocaleString(),
        reviewUrl,
      });

      const adminEmail = await pickRandomAdminEmail();
      const toEmail = adminEmail || process.env.ADMIN_REVIEW_EMAIL;

      if (!toEmail) {
        console.warn("No admin recipient available (DB empty and ADMIN_REVIEW_EMAIL missing). Skipping email.");
      } else {
        await sendMail({
          to: toEmail,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
      }
    }


    if (roleUpper === "CLINICIAN") {
      const ct = String(req.headers["content-type"] || "");
      const isMultipart = ct.includes("multipart/form-data");

      if (!isMultipart) {
        return res.status(400).json({
          error: "Clinician documents must be uploaded as multipart/form-data (field: clinician_docs)."
        });
      }

      if (!Array.isArray(req.files) || !req.files.length) {
        return res.status(400).json({
          error: "Please upload at least one document (PDF/JPG/PNG) in field clinician_docs."
        });
      }
    }


    if (roleUpper === "ADMIN") {
      const a = await AdminProfile.findOne({ where: { userId: u.id } });
      await a.update({ verification_status: "pending" });

      const FRONT = process.env.FRONTEND_URL || "http://localhost:3001";
      const reviewUrl = `${FRONT}/pages/admin-review.html?userId=${encodeURIComponent(u.id)}&role=ADMIN`;

      const tpl = verificationRequestTemplate({
        requestRole: "ADMIN",
        userId: u.id,
        email: u.email,
        fullName: `${u.name || ""} ${u.surname || ""}`.trim() || "—",
        phone: u.phone || "—",
        createdAt: u.created_at ? new Date(u.created_at).toLocaleString() : new Date().toLocaleString(),
        reviewUrl,
      });
      await a.update({ verification_status: "pending" });

      const { getIO } = require("../utils/socket");
      getIO()?.to("admins").emit("verifications:update", { role: "ADMIN" });
      getIO()?.to("admins").emit("dashboard:update");

      const adminEmail = await pickRandomAdminEmail();
      const toEmail = adminEmail || process.env.ADMIN_REVIEW_EMAIL;

      if (!toEmail) {
        console.warn("No admin recipient available (DB empty and ADMIN_REVIEW_EMAIL missing). Skipping email.");
      } else {
        await sendMail({
          to: toEmail,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
      }

    }

    if (roleUpper === "PATIENT") {
      const token = jwt.sign(
        { userId: u.id },
        process.env.JWT_SECRET || "dev_secret",
        { expiresIn: "7d" }
      );
      return res.json({ token, role: roleUpper, pending: false });
    }

    return res.json({
      ok: true,
      role: roleUpper,
      pending: true,
      message: "Verification required. Please wait for admin approval."
    });

  } catch (e) {
    next(e);
  }
});


router.post("/login", async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const roleUpper = String(role || "").trim().toUpperCase();
    const roleLower = roleUpper.toLowerCase();

    if (!["PATIENT", "CLINICIAN", "ADMIN"].includes(roleUpper)) {
      return res.status(400).json({ error: "Missing or invalid role" });
    }

    const u = await User.findOne({ where: { email: normalizedEmail, last_profile: roleLower } });
    if (!u) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password || "", u.password || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    if (!u.email_verified) return res.status(403).json({ error: "Email not verified" });

    if (u.status !== "valid") {
      return res.status(403).json({ error: "Account disabled" });
    }

    if (roleUpper === "CLINICIAN") {
      const c = await ClinicianProfile.findOne({ where: { userId: u.id } });
      const st = c?.verification_status || "pending";
      if (st === "denied") {
        return res.status(403).json({ error: "Access denied", code: "VERIFICATION_DENIED", role: "CLINICIAN", status: st });
      }
      if (st !== "verified") {
        return res.status(403).json({ error: "Verification pending", code: "VERIFICATION_PENDING", role: "CLINICIAN", status: st });
      }
    }

    if (roleUpper === "ADMIN") {
      const a = await AdminProfile.findOne({ where: { userId: u.id } });
      const st = a?.verification_status || "pending";
      if (st === "denied") {
        return res.status(403).json({ error: "Access denied", code: "VERIFICATION_DENIED", role: "ADMIN", status: st });
      }
      if (st !== "verified") {
        return res.status(403).json({ error: "Verification pending", code: "VERIFICATION_PENDING", role: "ADMIN", status: st });
      }
    }

    const token = jwt.sign(
      { userId: u.id },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "7d" }
    );

    await Logging.create({
      userId: u.id,
      entity: "auth",
      action: `login:${roleUpper}`,
      timestamp: new Date()
    });


    return res.json({ token });
  } catch (e) {
    next(e);
  }
});


router.post('/logout', (req, res) => {
  res.json({ ok: true });
})


router.patch('/last-profile', auth, async (req, res, next) => {
  try {
    const { last_profile } = req.body;
    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    u.last_profile = last_profile || null;
    await u.save();
    res.json({ last_profile: u.last_profile });
  } catch (e) { next(e); }
});


router.patch("/password", auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Missing currentPassword or newPassword" });
    }

    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, u.password);
    if (!ok) return res.status(401).json({ error: "Invalid current password" });

    u.password = newPassword;
    u.password_changed_at = new Date();
    await u.save();

    const tpl = passwordChangedTemplate({ name: u.name });
    await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});


router.post("/password-change/request", auth, async (req, res, next) => {
  try {
    const { new_password } = req.body;

    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const code = make6DigitCode();
    const tokenHash = hashToken(code);

    await UserToken.destroy({
      where: { userId: u.id, type: "password_change", used_at: null }
    });

    await UserToken.create({
      userId: u.id,
      type: "password_change",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 10), // 10 min
    });

    const tpl = passwordChangeCodeTemplate({ name: u.name || "there", code });
    await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});


router.post("/password-change/confirm", auth, async (req, res, next) => {
  try {
    const { code, new_password } = req.body;

    if (!code) return res.status(400).json({ error: "Code required" });
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const tokenHash = hashToken(String(code).trim());

    const record = await UserToken.findOne({
      where: {
        userId: u.id,
        type: "password_change",
        token_hash: tokenHash,
        used_at: null,
      },
      order: [["created_at", "DESC"]],
    });

    if (!record) return res.status(400).json({ error: "Invalid code" });
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await record.destroy();
      return res.status(400).json({ error: "Code expired" });
    }

    u.password = String(new_password);
    u.password_changed_at = new Date();
    await u.save();

    await record.update({ used_at: new Date() });

    const tpl = passwordChangedTemplate({ name: u.name });
    await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});


async function hardDeleteUserFully({ userId, transaction: t }) {
  const [p, c, a] = await Promise.all([
    PatientProfile.findOne({ where: { userId }, transaction: t }),
    ClinicianProfile.findOne({ where: { userId }, transaction: t }),
    AdminProfile.findOne({ where: { userId }, transaction: t }),
  ]);

  if (p) {
    const cases = await Case.findAll({
      where: { patientProfileId: p.id },
      attributes: ["id"],
      transaction: t,
    });
    const caseIds = cases.map(x => x.id);

    if (caseIds.length) {
      const reviews = await Review.findAll({
        where: { caseId: { [Op.in]: caseIds } },
        attributes: ["id"],
        transaction: t,
      });
      const reviewIds = reviews.map(r => r.id);

      await Money.destroy({
        where: {
          [Op.or]: [
            { caseId: { [Op.in]: caseIds } },
            ...(reviewIds.length ? [{ reviewId: { [Op.in]: reviewIds } }] : []),
          ],
        },
        transaction: t,
      }).catch(() => { });

      await Consensus.destroy({ where: { caseId: { [Op.in]: caseIds } }, transaction: t }).catch(() => { });
      await Review.destroy({ where: { caseId: { [Op.in]: caseIds } }, transaction: t }).catch(() => { });
      await AIArtifact.destroy({ where: { caseId: { [Op.in]: caseIds } }, transaction: t }).catch(() => { });
      await Case.destroy({ where: { id: { [Op.in]: caseIds } }, transaction: t }).catch(() => { });
    }

    await PatientProfile.destroy({ where: { id: p.id }, transaction: t }).catch(() => { });
  }

  if (c) {
    await Money.destroy({
      where: { clinicianProfileId: c.id },
      transaction: t,
    }).catch(() => { });

    await Review.destroy({
      where: { clinicianProfileId: c.id },
      transaction: t,
    }).catch(() => { });

    await ClinicianProfile.destroy({ where: { id: c.id }, transaction: t }).catch(() => { });
  }

  if (a) {
    await AdminProfile.destroy({ where: { id: a.id }, transaction: t }).catch(() => { });
  }

  await Notification.destroy({ where: { userId }, transaction: t }).catch(() => { });
  await Logging.destroy({ where: { userId }, transaction: t }).catch(() => { });
  await UserToken.destroy({ where: { userId }, transaction: t }).catch(() => { });

  await User.destroy({ where: { id: userId }, transaction: t });
}


router.post("/account-delete/request", auth, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    if (u.status !== "valid") return res.status(403).json({ error: "Account disabled" });

    const code = make6DigitCode();
    const tokenHash = hashToken(code);

    await UserToken.destroy({
      where: { userId: u.id, type: "account_delete", used_at: null }
    });

    await UserToken.create({
      userId: u.id,
      type: "account_delete",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 10), // 10 min
    });

    const tpl = accountDeleteCodeTemplate({ name: u.name || "there", code });
    await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});


router.post("/account-delete/confirm", auth, async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) { await t.rollback(); return res.status(400).json({ error: "Code required" }); }

    const u = await User.findByPk(req.user.userId, { transaction: t });
    if (!u) { await t.rollback(); return res.status(404).json({ error: "User not found" }); }

    const tokenHash = hashToken(code);

    const record = await UserToken.findOne({
      where: {
        userId: u.id,
        type: "account_delete",
        token_hash: tokenHash,
        used_at: null,
      },
      order: [["created_at", "DESC"]],
      transaction: t,
    });

    if (!record) { await t.rollback(); return res.status(400).json({ error: "Invalid code" }); }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await record.destroy({ transaction: t });
      await t.rollback();
      return res.status(400).json({ error: "Code expired" });
    }

    await record.update({ used_at: new Date() }, { transaction: t });

    await hardDeleteUserFully({ userId: u.id, transaction: t });

    await t.commit();
    return res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});


router.get("/verification-fix/info", async (req, res, next) => {
  try {
    const { email, role, fix_token } = req.query;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const roleUpper = String(role || "").trim().toUpperCase();
    if (!normalizedEmail || !fix_token || !["CLINICIAN", "ADMIN"].includes(roleUpper)) {
      return res.status(400).json({ error: "Missing email/role/fix_token" });
    }

    const roleLower = roleUpper.toLowerCase();
    const u = await User.findOne({ where: { email: normalizedEmail, last_profile: roleLower } });
    if (!u) return res.status(404).json({ error: "User not found" });

    const type = `verification_fix_${roleLower}`;
    const tokenHash = hashToken(String(fix_token));
    const tok = await UserToken.findOne({
      where: { userId: u.id, type, token_hash: tokenHash, used_at: null },
      order: [["created_at", "DESC"]],
    });
    if (!tok) return res.status(400).json({ error: "Invalid fix token" });
    if (new Date(tok.expires_at) < new Date()) return res.status(400).json({ error: "Fix token expired" });

    const profile =
      roleUpper === "CLINICIAN"
        ? await ClinicianProfile.findOne({ where: { userId: u.id } })
        : await AdminProfile.findOne({ where: { userId: u.id } });

    const fields = profile?.verification_fix_fields ? JSON.parse(profile.verification_fix_fields) : [];

    return res.json({
      user: {
        name: u.name, surname: u.surname, address: u.address, dob: u.dob, phone: u.phone, email: u.email
      },
      profile,
      note: profile?.verification_note || null,
      fields,
    });
  } catch (e) {
    next(e);
  }
});


router.post("/verification-fix/submit", async (req, res, next) => {
  try {
    const { email, role, fix_token, user, clinician, admin } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const roleUpper = String(role || "").trim().toUpperCase();
    if (!normalizedEmail || !fix_token || !["CLINICIAN", "ADMIN"].includes(roleUpper)) {
      return res.status(400).json({ error: "Missing email/role/fix_token" });
    }

    const roleLower = roleUpper.toLowerCase();
    const u = await User.findOne({ where: { email: normalizedEmail, last_profile: roleLower } });
    if (!u) return res.status(404).json({ error: "User not found" });

    const type = `verification_fix_${roleLower}`;
    const tokenHash = hashToken(String(fix_token));
    const tok = await UserToken.findOne({
      where: { userId: u.id, type, token_hash: tokenHash, used_at: null },
      order: [["created_at", "DESC"]],
    });
    if (!tok) return res.status(400).json({ error: "Invalid fix token" });
    if (new Date(tok.expires_at) < new Date()) return res.status(400).json({ error: "Fix token expired" });


    const name = String(user?.name || "").trim();
    const surname = String(user?.surname || "").trim();
    const address = String(user?.address || "").trim();
    const dob = String(user?.dob || "").trim();
    const phone = String(user?.phone || "").trim();
    if (!name || !surname || !address || !dob || !phone) {
      return res.status(400).json({ error: "Missing required fields: name,surname,address,dob,phone" });
    }

    await u.update({ name, surname, address, dob, phone, status: "valid" });

    if (roleUpper === "CLINICIAN") {
      const c = await ClinicianProfile.findOne({ where: { userId: u.id } });
      await c.update({
        medical_college_reg_no: clinician?.medical_college_reg_no || null,
        provincial_college: clinician?.provincial_college || null,
        specialty: clinician?.specialty || null,
        mir_year: clinician?.mir_year || null,
        liability_insurance: clinician?.liability_insurance || null,
        verification_status: "pending",
        verification_note: null,
        verification_fix_fields: null,
        verification_updated_at: new Date(),
      });
    }

    if (roleUpper === "ADMIN") {
      const a = await AdminProfile.findOne({ where: { userId: u.id } });
      await a.update({
        verification_status: "pending",
        verification_note: null,
        verification_fix_fields: null,
        verification_updated_at: new Date(),
      });
    }

    await tok.update({ used_at: new Date() });

    const { getIO } = require("../utils/socket");
    getIO()?.to("admins").emit("verifications:update");
    getIO()?.to("admins").emit("dashboard:update");

    return res.json({ ok: true, pending: true, message: "Updated. Waiting for admin verification." });

  } catch (e) {
    next(e);
  }
});


router.get("/verification-fix/load", async (req, res, next) => {
  try {
    const role = String(req.query.role || "").toUpperCase();
    const raw = String(req.query.fix_token || "").trim();

    if (!["CLINICIAN", "ADMIN"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!raw) return res.status(400).json({ error: "Missing fix_token" });

    const type = `verification_fix_${role.toLowerCase()}`;
    const tokenHash = hashToken(raw);

    const record = await UserToken.findOne({
      where: { type, token_hash: tokenHash, used_at: null },
      order: [["created_at", "DESC"]],
    });
    if (!record) return res.status(400).json({ error: "Invalid or used token" });
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: "Token expired" });

    const u = await User.findByPk(record.userId, {
      attributes: ["id", "email", "name", "surname", "phone", "address", "dob", "last_profile"],
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    if (String(u.last_profile || "").toLowerCase() !== role.toLowerCase()) {
      return res.status(403).json({ error: "Role mismatch" });
    }

    const profile =
      role === "CLINICIAN"
        ? await ClinicianProfile.findOne({ where: { userId: u.id } })
        : await AdminProfile.findOne({ where: { userId: u.id } });

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    let fields = [];
    try { fields = profile.verification_fix_fields ? JSON.parse(profile.verification_fix_fields) : []; } catch { }

    return res.json({ ok: true, role, user: u, profile, fields });
  } catch (e) { next(e); }
});


router.put("/verification-fix/submit", async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const role = String(req.body.role || "").toUpperCase();
    const raw = String(req.body.fix_token || "").trim();
    const userPatch = req.body.user || {};
    const profilePatch = req.body.profile || {};

    if (!["CLINICIAN", "ADMIN"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!raw) return res.status(400).json({ error: "Missing fix_token" });

    const type = `verification_fix_${role.toLowerCase()}`;
    const tokenHash = hashToken(raw);

    const record = await UserToken.findOne({
      where: { type, token_hash: tokenHash, used_at: null },
      order: [["created_at", "DESC"]],
      transaction: t,
    });
    if (!record) { await t.rollback(); return res.status(400).json({ error: "Invalid or used token" }); }
    if (new Date(record.expires_at) < new Date()) { await t.rollback(); return res.status(400).json({ error: "Token expired" }); }

    const u = await User.findByPk(record.userId, { transaction: t });
    if (!u) { await t.rollback(); return res.status(404).json({ error: "User not found" }); }

    if (String(u.last_profile || "").toLowerCase() !== role.toLowerCase()) {
      await t.rollback();
      return res.status(403).json({ error: "Role mismatch" });
    }

    const profile =
      role === "CLINICIAN"
        ? await ClinicianProfile.findOne({ where: { userId: u.id }, transaction: t })
        : await AdminProfile.findOne({ where: { userId: u.id }, transaction: t });

    if (!profile) { await t.rollback(); return res.status(404).json({ error: "Profile not found" }); }

    let fields = [];
    try { fields = profile.verification_fix_fields ? JSON.parse(profile.verification_fix_fields) : []; } catch { }

    const USER_KEYS = new Set(["name", "surname", "phone", "address", "dob"]);
    const CLINICIAN_KEYS = new Set([
      "medical_college_reg_no", "provincial_college", "specialty", "mir_year", "liability_insurance"
    ]);

    const userUpdates = {};
    const profileUpdates = {};

    for (const f of fields) {
      if (USER_KEYS.has(f) && userPatch[f] !== undefined) userUpdates[f] = userPatch[f];
      if (role === "CLINICIAN" && CLINICIAN_KEYS.has(f) && profilePatch[f] !== undefined) {
        profileUpdates[f] = profilePatch[f];
      }

    }

    if (Object.keys(userUpdates).length) await u.update(userUpdates, { transaction: t });
    if (Object.keys(profileUpdates).length) await profile.update(profileUpdates, { transaction: t });

    await profile.update({
      verification_status: "pending",
      verification_note: null,
      verification_fix_fields: null,
      verification_updated_at: new Date(),
    }, { transaction: t });

    await record.update({ used_at: new Date() }, { transaction: t });

    await t.commit();

    const { getIO } = require("../utils/socket");
    getIO()?.to("admins").emit("verifications:update");
    getIO()?.to("admins").emit("dashboard:update");


    try {
      const FRONT = process.env.FRONTEND_URL || "http://localhost:3000";
      const reviewUrl =
        `${FRONT}/pages/admin-review.html?userId=${encodeURIComponent(u.id)}` +
        `&role=${encodeURIComponent(role)}`;

      const tpl = verificationRequestTemplate({
        requestRole: role,
        userId: u.id,
        email: u.email,
        fullName: `${u.name || ""} ${u.surname || ""}`.trim() || "—",
        phone: u.phone || "—",
        createdAt: u.created_at ? new Date(u.created_at).toLocaleString() : new Date().toLocaleString(),
        reviewUrl,
      });

      const adminEmail = await pickRandomAdminEmail();
      const toEmail = adminEmail || process.env.ADMIN_REVIEW_EMAIL;

      if (toEmail) {
        await sendMail({ to: toEmail, subject: tpl.subject, text: tpl.text, html: tpl.html });
      } else {
        console.warn("No admin recipient available. Skipping admin re-notification email.");
      }
    } catch (err) {
      console.warn("Could not send admin re-notification email:", err.message || err);
    }

    return res.json({ ok: true });

  } catch (e) {
    await t.rollback();
    next(e);
  }
});

module.exports = router;
