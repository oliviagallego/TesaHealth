const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const express = require('express');
const sequelize = require("../database");
const auth = require('../middleware/auth');
const { requireAdminVerified, requireAdmin } = require('../middleware/profiles');
const { sendResultsEmail } = require("../utils/sendResultsEmail");
const { passwordChangedTemplate } = require("../utils/emailTemplates");

const { sendMail } = require("../utils/mailer");
const { generateRawToken, hashToken } = require("../utils/token");
const {
  verificationApprovedTemplate,
  verificationDeniedTemplate,
  verificationNeedsFixTemplate,
} = require("../utils/emailTemplates");

const path = require("path");
const fs = require("fs");
const { UPLOAD_DIR } = require("../utils/clinicianDocsUpload");

const router = express.Router();


const {
  user: User,
  patient_profile: PatientProfile,
  clinician_profile: ClinicianProfile,
  admin_profile: AdminProfile,
  notification: Notification,
  case: Case,
  consensus: Consensus,
  review: Review,
  ai_artifact: AIArtifact,
  logging: Logging,
  user_token: UserToken,
} = sequelize.models;


router.get("/profile", auth, requireAdmin, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId, {
      attributes: ["id", "name", "surname", "email", "phone", "address", "dob"],
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    return res.json({ user: u, admin: req.adminProfile || null });
  } catch (e) {
    next(e);
  }
});


router.put("/profile", auth, requireAdmin, async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { user = {} } = req.body || {};

    const u = await User.findByPk(req.user.userId, { transaction: t });
    if (!u) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    let a = await AdminProfile.findOne({ where: { userId: u.id }, transaction: t });
    if (!a) a = await AdminProfile.create({ userId: u.id }, { transaction: t });

    const commonUpdate = {
      name: user.name ?? u.name,
      surname: user.surname ?? u.surname,
      phone: user.phone ?? u.phone,
      address: user.address ?? u.address,
      dob: user.dob ?? u.dob,
    };

    await User.update(commonUpdate, {
      where: { email: u.email },
      transaction: t
    });


    await t.commit();
    return res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});


router.get('/verifications', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const wherePending = {
      [Op.or]: [
        { verification_status: { [Op.in]: ["pending"] } },
        { verification_status: null }
      ]
    };

    const clinicians = await ClinicianProfile.findAll({
      where: wherePending,
      include: [{ model: User, attributes: ['id', 'name', 'surname', 'email'] }],
      order: [['created_at', 'DESC']]
    });

    const admins = await AdminProfile.findAll({
      where: wherePending,
      include: [{ model: User, attributes: ['id', 'name', 'surname', 'email'] }],
      order: [['created_at', 'DESC']]
    });

    res.json({ clinicians, admins });
  } catch (e) { next(e); }
});


router.patch('/clinicians/:id/verify', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const clinicianId = Number(req.params.id);
    const { decision } = req.body;

    if (!['verified', 'denied', 'needs_fix', 'missing', 'pending'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const c = await ClinicianProfile.findByPk(clinicianId);
    if (!c) return res.status(404).json({ error: 'Clinician profile not found' });

    await c.update({ verification_status: decision });

    const { getIO } = require("../utils/socket");

    getIO()?.to("admins").emit("verifications:update");
    getIO()?.to("admins").emit("dashboard:update");

    getIO()?.to(`user:${c.userId}`).emit("verification:update", {
      role: "CLINICIAN",
      status: decision
    });

    const notifType = decision === 'verified' ? 'clinician_verified'
      : decision === 'denied' ? 'clinician_denied'
        : 'generic';

    await Notification.create({
      userId: c.userId,
      type: notifType,
      payload: JSON.stringify({ clinicianProfileId: c.id, decision })
    });

    await Logging.create({
      userId: req.user.userId,
      entity: "clinician_profile",
      action: `verify_decision:${decision}:clinicianProfileId=${c.id}`,
      timestamp: new Date()
    });

    res.json(c);
  } catch (e) { next(e); }
});

router.patch('/admins/:id/verify', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const adminId = Number(req.params.id);
    const { decision } = req.body;

    if (!['verified', 'denied', 'needs_fix', 'missing', 'pending'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const a = await AdminProfile.findByPk(adminId);
    if (!a) return res.status(404).json({ error: 'Admin profile not found' });

    await a.update({ verification_status: decision });

    const { getIO } = require("../utils/socket");

    getIO()?.to("admins").emit("verifications:update");
    getIO()?.to("admins").emit("dashboard:update");

    getIO()?.to(`user:${a.userId}`).emit("verification:update", {
      role: "ADMIN",
      status: decision
    });

    await Notification.create({
      userId: a.userId,
      type: decision === 'verified' ? 'admin_verified' : decision === 'denied' ? 'admin_denied' : 'generic',
      payload: JSON.stringify({ adminProfileId: a.id, decision })
    });

    await Logging.create({
      userId: req.user.userId,
      entity: "admin_profile",
      action: `verify_decision:${decision}:adminProfileId=${a.id}`,
      timestamp: new Date()
    });

    res.json(a);
  } catch (e) { next(e); }
});


function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

router.get('/clinicians/:id/documents', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const clinicianId = Number(req.params.id);
    const c = await ClinicianProfile.findByPk(clinicianId);
    if (!c) return res.status(404).json({ error: "Clinician profile not found" });

    const docs = safeJsonParse(c.documents || "[]", []);

    const out = docs.map(d => ({
      ...d,
      url: `/api/admin/clinicians/${encodeURIComponent(String(clinicianId))}/documents/${encodeURIComponent(String(d?.id))}/file`
    }));

    return res.json(out);

  } catch (e) { next(e); }
});



router.patch('/clinicians/:id/documents/:docId/review', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const clinicianId = Number(req.params.id);
    const docId = String(req.params.docId || "");
    const { status } = req.body;

    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const c = await ClinicianProfile.findByPk(clinicianId);
    if (!c) return res.status(404).json({ error: "Clinician profile not found" });

    const docs = safeJsonParse(c.documents || "[]", []);
    const idx = docs.findIndex(d => String(d?.id) === docId);
    if (idx < 0) return res.status(404).json({ error: "Document not found" });

    docs[idx] = {
      ...docs[idx],
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_profile_id: req.adminProfile.id
    };

    await c.update({ documents: JSON.stringify(docs) });

    await Logging.create({
      userId: req.user.userId,
      entity: "clinician_profile",
      action: `document_review:${status}:clinicianProfileId=${clinicianId}:docId=${docId}`,
      timestamp: new Date()
    });

    return res.json(docs[idx]);
  } catch (e) { next(e); }
});

router.get('/clinicians/:id/documents/:docId/file', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const clinicianId = Number(req.params.id);
    const docId = String(req.params.docId || "");

    const c = await ClinicianProfile.findByPk(clinicianId);
    if (!c) return res.status(404).json({ error: "Clinician profile not found" });

    const docs = safeJsonParse(c.documents || "[]", []);
    const doc = docs.find(d => String(d?.id) === docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const abs = path.resolve(__dirname, "..", String(doc.path || ""));
    const root = path.resolve(UPLOAD_DIR);

    if (!abs.startsWith(root)) {
      return res.status(400).json({ error: "Invalid document path" });
    }
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: "File missing on disk" });
    }

    res.setHeader("Content-Type", doc.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.original_name || doc.filename || "document")}"`
    );

    return res.sendFile(abs);
  } catch (e) { next(e); }
});


router.get('/cases', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const list = await Case.findAll({
      attributes: ['id', 'created_at', 'submitted_at', 'closed_at', 'status', 'patientProfileId'],
      order: [['created_at', 'DESC']],
      limit: 100
    });
    res.json(list);
  } catch (e) { next(e); }
});

router.get("/cases/search", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const caseId = req.query.caseId ? Number(req.query.caseId) : null;
    const patientId = req.query.patientId ? Number(req.query.patientId) : null;
    const q = String(req.query.q || "").trim();

    let whereCase = {};

    if (caseId && Number.isFinite(caseId)) {
      whereCase.id = caseId;
    } else if (patientId && Number.isFinite(patientId)) {
      whereCase.patientProfileId = patientId;
    } else if (q) {

      const tokens = q
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5);

      const users = await User.findAll({
        attributes: ["id"],
        where: {
          [Op.and]: tokens.map(tok => {
            const like = `%${tok}%`;
            return {
              [Op.or]: [
                sequelize.where(sequelize.fn("lower", sequelize.col("name")), { [Op.like]: like }),
                sequelize.where(sequelize.fn("lower", sequelize.col("surname")), { [Op.like]: like }),
                sequelize.where(sequelize.fn("lower", sequelize.col("email")), { [Op.like]: like }),
              ]
            };
          })
        },
        limit: 50,
      });

      const userIds = users.map(u => u.id);
      if (!userIds.length) return res.json({ cases: [] });

      const pats = await PatientProfile.findAll({
        attributes: ["id"],
        where: { userId: { [Op.in]: userIds } },
        limit: 50,
      });

      const patientProfileIds = pats.map(p => p.id);
      if (!patientProfileIds.length) return res.json({ cases: [] });

      whereCase.patientProfileId = { [Op.in]: patientProfileIds };
    }


    const list = await Case.findAll({
      where: Object.keys(whereCase).length ? whereCase : undefined,
      attributes: ["id", "created_at", "submitted_at", "closed_at", "status", "patientProfileId"],
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    return res.json({ cases: list });
  } catch (e) { next(e); }
});


router.get('/cases/:id', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const c = await Case.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });

    res.json({
      id: c.id,
      created_at: c.created_at,
      submitted_at: c.submitted_at,
      closed_at: c.closed_at,
      status: c.status,
      patientProfileId: c.patientProfileId
    });
  } catch (e) { next(e); }
});

router.post("/cases/:id/consensus", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);

    const QUORUM = 3;
    const THRESHOLD = 0.8;

    const c = await Case.findByPk(caseId);
    if (!c) return res.status(404).json({ error: "Case not found" });

    if (c.status === "closed") {
      return res.status(409).json({ error: "Case already closed" });
    }

    const ai = await AIArtifact.findOne({ where: { caseId } });
    if (!ai) return res.status(400).json({ error: "AIArtifact not found" });

    const reviews = await Review.findAll({ where: { caseId } });
    if (reviews.length < QUORUM) {
      return res.status(400).json({ error: `Need at least ${QUORUM} reviews to close consensus` });
    }


    const counts = {};
    for (const r of reviews) {
      const ans = (r.answer || "BLANK").trim();
      counts[ans] = (counts[ans] || 0) + 1;
    }
    const sortedAnswers = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const isTie = sortedAnswers.length > 1 && sortedAnswers[1][1] === sortedAnswers[0][1];
    if (isTie) {
      return res.status(409).json({
        error: "Tie between answers. Need more reviews.",
        details: { counts }
      });
    }

    const finalAnswer = sortedAnswers[0][0];
    const topVotes = sortedAnswers[0][1];
    const share = topVotes / reviews.length;

    if (share < THRESHOLD) {
      return res.status(409).json({
        error: "No supermajority yet",
        details: { top_answer: finalAnswer, top_votes: topVotes, total_reviews: reviews.length, share }
      });
    }

    let d = {};
    try { d = ai.differentials ? JSON.parse(ai.differentials) : {}; } catch { }
    const options = d.public?.options || [];
    const finalDiagnosis = options.find(o => o.key === finalAnswer)?.label || null;


    const rank = { self_care: 0, within_72h: 1, within_24_48h: 2, seek_now: 3 };
    let finalUrgency = "self_care";
    for (const r of reviews) {
      const u = r.urgency || "self_care";
      if ((rank[u] ?? 0) > (rank[finalUrgency] ?? 0)) finalUrgency = u;
    }

    const closedAt = new Date();
    let cons = await Consensus.findOne({ where: { caseId } });
    if (!cons) {
      cons = await Consensus.create({
        caseId,
        aiArtifactId: ai.id,
        final_answer: finalAnswer,
        final_diagnosis: finalDiagnosis,
        final_urgency: finalUrgency,
        closed_at: closedAt
      });

    } else {
      await cons.update({
        final_answer: finalAnswer,
        final_diagnosis: finalDiagnosis,
        final_urgency: finalUrgency,
        closed_at: closedAt
      });
    }

    await c.update({ status: "closed", closed_at: new Date() });

    if (!ai.closed_at) {
      await ai.update({ closed_at: closedAt });
    }

    const patientProfile = await PatientProfile.findByPk(c.patientProfileId);
    if (!patientProfile) return res.status(400).json({ error: "PatientProfile not found" });

    const user = await User.findByPk(patientProfile.userId);
    if (!user) return res.status(400).json({ error: "User not found" });

    const { getIO } = require("../utils/socket");
    const io = getIO();
    io?.to("admins").emit("dashboard:update");
    io?.to("admins").emit("case:update", { caseId, status: "closed" });
    io?.to(`user:${user.id}`).emit("case:update", { caseId, status: "closed" });
    io?.to(`user:${user.id}`).emit("notification:new", { type: "consensus_ready", caseId, consensusId: cons.id });

    await Logging.create({
      userId: req.user.userId,
      entity: "case",
      action: `consensus_closed:caseId=${caseId}:answer=${finalAnswer}:urgency=${finalUrgency}`,
      timestamp: new Date()
    });

    const frontUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    const reportUrl = `${frontUrl}/cases/${caseId}`;

    const summary =
      `Final diagnosis: ${finalDiagnosis}\n` +
      `Urgency: ${finalUrgency}\n` +
      `Next step: check your report in TesaHealth.`;

    await sendResultsEmail({ user, summary, reportUrl });

    await Notification.create({
      userId: user.id,
      type: "consensus_ready",
      payload: JSON.stringify({ caseId, consensusId: cons.id })
    });

    const full = await Case.findByPk(caseId, {
      include: [{ model: AIArtifact }, { model: Consensus }]
    });
    const out = full.toJSON();
    out.symptoms = JSON.parse(out.symptoms || "[]");
    out.ai_artifact.differentials = JSON.parse(out.ai_artifact.differentials || "{}");

    return res.status(201).json(out);

  } catch (e) {
    next(e);
  }
});


router.get("/review/:role/:userId", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const role = String(req.params.role || "").toUpperCase();
    const userId = Number(req.params.userId);

    if (!["CLINICIAN", "ADMIN"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid userId" });

    const u = await User.findByPk(userId, {
      attributes: ["id", "email", "name", "surname", "phone", "created_at"],
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    const profile =
      role === "CLINICIAN"
        ? await ClinicianProfile.findOne({ where: { userId } })
        : await AdminProfile.findOne({ where: { userId } });

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    return res.json({ user: u, profile });
  } catch (e) {
    next(e);
  }
});


router.post("/review/:role/:userId", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const role = String(req.params.role || "").toUpperCase();
    const userId = Number(req.params.userId);

    const decisionRaw = String(req.body?.decision || "").toLowerCase();
    const note = String(req.body?.note || "").trim() || null;
    const fields = Array.isArray(req.body?.fields) ? req.body.fields.map(String) : [];

    if (!["CLINICIAN", "ADMIN"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid userId" });

    const decisionToStatus = {
      approve: "verified",
      verified: "verified",
      deny: "denied",
      denied: "denied",
      needs_fix: "needs_fix",
      missing: "missing",
      pending: "pending",
    };
    const nextStatus = decisionToStatus[decisionRaw];
    if (!nextStatus) return res.status(400).json({ error: "Invalid decision" });

    const u = await User.findByPk(userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const profile =
      role === "CLINICIAN"
        ? await ClinicianProfile.findOne({ where: { userId } })
        : await AdminProfile.findOne({ where: { userId } });

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    if ((nextStatus === "needs_fix" || nextStatus === "missing") && !fields.length) {
      return res.status(400).json({ error: "Select at least one field to correct" });
    }

    await profile.update({
      verification_status: nextStatus,
      verification_note: note,
      verification_fix_fields: fields.length ? JSON.stringify(fields) : null,
      verification_updated_at: new Date(),
    });

    if (nextStatus === "denied") {
      await u.update({ status: "invalid" });
    }

    const { getIO } = require("../utils/socket");
    const io = getIO();
    io?.to("admins").emit("verifications:update");
    io?.to("admins").emit("dashboard:update");
    io?.to(`user:${userId}`).emit("verification:update", { role, status: nextStatus });

    await Notification.create({
      userId,
      type:
        role === "CLINICIAN"
          ? (nextStatus === "verified" ? "clinician_verified" : nextStatus === "denied" ? "clinician_denied" : "generic")
          : (nextStatus === "verified" ? "admin_verified" : nextStatus === "denied" ? "admin_denied" : "generic"),
      payload: JSON.stringify({ role, verification_status: nextStatus, note, fields }),
    });

    await Logging.create({
      userId: req.user.userId,
      entity: role === "CLINICIAN" ? "clinician_profile" : "admin_profile",
      action: `review_decision:${nextStatus}:userId=${userId}`,
      timestamp: new Date(),
    });


    if (nextStatus === "verified") {
      const tpl = verificationApprovedTemplate({ name: u.name, role });
      await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
    }

    if (nextStatus === "denied") {
      const tpl = verificationDeniedTemplate({ name: u.name, role, note });
      await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
    }

    if (nextStatus === "needs_fix" || nextStatus === "missing") {

      const raw = generateRawToken();
      const tokenHash = hashToken(raw);

      const type = `verification_fix_${role.toLowerCase()}`;

      await UserToken.destroy({
        where: { userId: u.id, type, used_at: null }
      });

      await UserToken.create({
        userId: u.id,
        type,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
      });

      const FRONT = process.env.FRONTEND_URL || "http://localhost:3001";
      const focus = fields[0] || "";
      const fixUrl =
        `${FRONT}/pages/register.html?stage=fix` +
        `&role=${encodeURIComponent(role)}` +
        `&fix_token=${encodeURIComponent(raw)}` +
        `&focus=${encodeURIComponent(focus)}`;

      const tpl = verificationNeedsFixTemplate({ name: u.name, role, note, fixUrl, fields });
      await sendMail({ to: u.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
    }

    return res.json({ ok: true, verification_status: nextStatus });
  } catch (e) {
    next(e);
  }
});


router.get('/cases/:id/insights', auth, requireAdminVerified, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    if (!Number.isFinite(caseId)) return res.status(400).json({ error: "Invalid caseId" });

    const c = await Case.findByPk(caseId, { attributes: ["id", "created_at", "status", "patientProfileId"] });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const ai = await AIArtifact.findOne({ where: { caseId } });
    const reviews = await Review.findAll({ where: { caseId } });
    const cons = await Consensus.findOne({ where: { caseId } });

    let d = {};
    try { d = ai?.differentials ? JSON.parse(ai.differentials) : {}; } catch { }

    function pickText(...vals) {
      for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    }

    const question = pickText(
      d?.public?.question_text,
      d?.public?.questionText,
      d?.public?.question,
      d?.public?.stem,
      d?.public?.vignette,
      d?.public?.prompt,
      d?.question_text,
      d?.questionText,
      d?.question,
      d?.stem,
      d?.vignette,
      d?.prompt,
      ai?.question_text,
      ai?.question,
      ai?.vignette,
      ai?.prompt
    );

    const options =
      Array.isArray(d?.public?.options) ? d.public.options :
        Array.isArray(d?.options) ? d.options :
          [];

    const counts = {};
    for (const r of reviews) {
      const ans = String(r?.answer || "BLANK").trim();
      counts[ans] = (counts[ans] || 0) + 1;
    }


    function norm(s) {
      return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    }
    function condName(x) {
      return x?.common_name || x?.name || x?.id || "—";
    }
    function findBestMatchByLabel(label, conds) {
      const L = norm(label);
      if (!L) return null;

      let exact = conds.find(c => norm(condName(c)) === L);
      if (exact) return exact;

      const candidates = conds
        .map(c => ({ c, n: norm(condName(c)) }))
        .filter(o => o.n && (o.n.includes(L) || L.includes(o.n)))
        .map(o => o.c);

      if (!candidates.length) return null;

      candidates.sort((a, b) => (b?.probability || 0) - (a?.probability || 0));
      return candidates[0];
    }

    const inferCondsRaw = Array.isArray(d?.infermedica?.conditions) ? d.infermedica.conditions : [];
    const inferSorted = inferCondsRaw
      .slice()
      .sort((a, b) => (b?.probability || 0) - (a?.probability || 0));

    const inferTop = inferSorted.slice(0, 10).map(c => ({
      id: c?.id || null,
      name: condName(c),
      probability: typeof c?.probability === "number" ? c.probability : null
    }));

    const inferTriage =
      d?.infermedica?.triage?.triage_level ||
      d?.infermedica?.triage?.triage ||
      null;

    const inferByOption = (options || []).map(o => {
      const key = o?.key ?? o?.value ?? o?.id ?? "";
      const label = o?.label ?? o?.name ?? key;

      const match = findBestMatchByLabel(label, inferSorted);
      const p = typeof match?.probability === "number" ? match.probability : null;

      return {
        key,
        label,
        source: match ? "infermedica" : "extra",
        probability: p
      };
    });

    return res.json({
      case: c,
      mir: { question, options },
      stats: { total_reviews: reviews.length, counts },
      infermedica: {
        triage_level: inferTriage,
        top_conditions: inferTop,
        options: inferByOption
      },
      consensus: cons ? {
        final_answer: cons.final_answer,
        final_diagnosis: cons.final_diagnosis,
        final_urgency: cons.final_urgency,
        closed_at: cons.closed_at
      } : null
    });
  } catch (e) {
    next(e);
  }
});



router.post("/password-code/start", auth, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const code = String(Math.floor(100000 + Math.random() * 900000));

    const tokenHash = hashToken(code);
    await UserToken.create({
      userId: u.id,
      type: "password_change_code",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 10), // 10 min
    });

    await sendMail({
      to: u.email,
      subject: "TesaHealth • Password change code",
      text: `Your verification code is: ${code} (valid for 10 minutes).`,
      html: `<p>Your verification code is:</p><h2>${code}</h2><p>Valid for 10 minutes.</p>`
    });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});


router.post("/password-code/confirm", auth, async (req, res, next) => {
  try {
    const { code, currentPassword, newPassword } = req.body;
    if (!code || !currentPassword || !newPassword) {
      return res.status(400).json({ error: "Missing code/currentPassword/newPassword" });
    }

    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, u.password);
    if (!ok) return res.status(401).json({ error: "Invalid current password" });

    const tokenHash = hashToken(String(code).trim());
    const record = await UserToken.findOne({
      where: { userId: u.id, type: "password_change_code", token_hash: tokenHash, used_at: null },
      order: [["created_at", "DESC"]],
    });
    if (!record) return res.status(400).json({ error: "Invalid code" });
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: "Code expired" });

    u.password = newPassword;
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


router.get("/dashboard", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const { Op } = require("sequelize");

    const [
      cliniciansTotal,
      patientsTotal,
      adminsTotal,

      cliniciansVerified,
      adminsVerified,

      cliniciansPending,
      adminsPending,

      casesTotal,
      casesClosed,
      casesOpen,

      reviewsTotal,
      consensusTotal,
    ] = await Promise.all([
      ClinicianProfile.count(),
      PatientProfile.count(),
      AdminProfile.count(),

      ClinicianProfile.count({ where: { verification_status: "verified" } }),
      AdminProfile.count({ where: { verification_status: "verified" } }),

      ClinicianProfile.count({
        where: {
          [Op.or]: [
            { verification_status: { [Op.in]: ["pending", "needs_fix", "missing"] } },
            { verification_status: null },
          ],
        },
      }),
      AdminProfile.count({
        where: {
          [Op.or]: [
            { verification_status: { [Op.in]: ["pending", "needs_fix", "missing"] } },
            { verification_status: null },
          ],
        },
      }),

      Case.count(),
      Case.count({ where: { status: { [Op.in]: ["consensus_ready", "closed"] } } }),
      Case.count({ where: { status: { [Op.notIn]: ["consensus_ready", "closed"] } } }),

      Review.count(),
      Consensus.count(),
    ]);

    return res.json({
      users: {
        clinicians: { total: cliniciansTotal, verified: cliniciansVerified, pending: cliniciansPending },
        patients: { total: patientsTotal },
        admins: { total: adminsTotal, verified: adminsVerified, pending: adminsPending },
      },
      cases: {
        total: casesTotal,
        open: casesOpen,
        closed: casesClosed,
      },
      activity: {
        reviews_total: reviewsTotal,
        consensus_total: consensusTotal,
      },
    });
  } catch (e) {
    next(e);
  }
});


router.get("/cases/:id/insight", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);

    const c = await Case.findByPk(caseId, {
      include: [
        { model: AIArtifact },
        { model: Consensus },
        { model: Review, attributes: ["id", "answer", "urgency", "solution", "submitted_at"] }
      ]
    });
    if (!c) return res.status(404).json({ error: "Case not found" });

    const out = c.toJSON();

    if (out.ai_artifact?.differentials) {
      try { out.ai_artifact.differentials = JSON.parse(out.ai_artifact.differentials); } catch { }
    }
    if (out.consensus?.answer_stats) {
      try { out.consensus.answer_stats = JSON.parse(out.consensus.answer_stats); } catch { }
    }
    if (out.consensus?.urgency_stats) {
      try { out.consensus.urgency_stats = JSON.parse(out.consensus.urgency_stats); } catch { }
    }

    res.json({
      caseId: out.id,
      status: out.status,
      mir: out.ai_artifact?.differentials?.public?.question_text || out.ai_artifact?.vignette,
      options: out.ai_artifact?.differentials?.public?.options || [],
      consensus: out.consensus || null,
      reviews_count: (out.reviews || []).length
    });
  } catch (e) {
    next(e);
  }
});


router.get("/users/search", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (!q) return res.json({ users: [] });

    const where = {};
    if (/^\d+$/.test(q)) where.id = Number(q);
    else {
      const like = `%${q}%`;
      where[Op.or] = [
        sequelize.where(sequelize.fn("lower", sequelize.col("email")), { [Op.like]: like }),
        sequelize.where(sequelize.fn("lower", sequelize.col("name")), { [Op.like]: like }),
        sequelize.where(sequelize.fn("lower", sequelize.col("surname")), { [Op.like]: like }),
      ];
    }

    const users = await User.findAll({
      where,
      attributes: ["id", "email", "name", "surname", "last_profile", "status", "created_at"],
      order: [["created_at", "DESC"]],
      limit: 50
    });

    res.json({ users });
  } catch (e) { next(e); }
});



router.get("/users/:id", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const u = await User.findByPk(id, {
      attributes: ["id", "email", "name", "surname", "phone", "address", "dob", "last_profile", "status", "created_at", "email_verified"]
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    const logs = await Logging.findAll({
      where: { userId: id },
      order: [["timestamp", "DESC"]],
      limit: 80
    });

    res.json({ user: u, logs });
  } catch (e) { next(e); }
});


router.get("/logs", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const entity = String(req.query.entity || "").trim();
    const q = String(req.query.q || "").trim();
    const actorUserId = req.query.actorUserId ? Number(req.query.actorUserId) : null;

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    let limit = req.query.limit ? Number(req.query.limit) : 50;
    let offset = req.query.offset ? Number(req.query.offset) : 0;

    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const where = {};

    if (entity) where.entity = entity;
    if (Number.isFinite(actorUserId) && actorUserId > 0) where.userId = actorUserId;

    if (q) {
      where[Op.or] = [
        { action: { [Op.like]: `%${q}%` } },
        { entity: { [Op.like]: `%${q}%` } },
      ];
    }

    if (from || to) {
      where.timestamp = {};
      if (from && !isNaN(from.getTime())) where.timestamp[Op.gte] = from;
      if (to && !isNaN(to.getTime())) where.timestamp[Op.lte] = to;
    }

    const { count, rows } = await Logging.findAndCountAll({
      where,
      order: [["timestamp", "DESC"]],
      limit,
      offset
    });

    return res.json({
      total: count,
      limit,
      offset,
      logs: rows
    });
  } catch (e) {
    next(e);
  }
});


router.patch("/users/:id/block", auth, requireAdminVerified, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const blocked = !!req.body?.blocked;

    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    if (targetId === req.user.userId) {
      return res.status(400).json({ error: "You cannot block your own account" });
    }

    const u = await User.findByPk(targetId);
    if (!u) return res.status(404).json({ error: "User not found" });

    const nextStatus = blocked ? "blocked" : "valid";
    await u.update({ status: nextStatus });

    await Logging.create({
      userId: req.user.userId,
      entity: "user",
      action: `user_block:${blocked ? "blocked" : "unblocked"}:userId=${targetId}`,
      timestamp: new Date()
    });

    const { getIO } = require("../utils/socket");
    getIO()?.to("admins").emit("dashboard:update");

    return res.json({ ok: true, userId: u.id, status: u.status });
  } catch (e) {
    next(e);
  }
});


module.exports = router;
