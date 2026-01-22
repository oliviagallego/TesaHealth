const express = require("express");
const crypto = require("crypto");
const sequelize = require("../database");
const auth = require("../middleware/auth");
const { requirePatient } = require("../middleware/profiles");
const { infermedicaPost } = require("../utils/infermedicaClient");
const { buildPatientContext } = require("../utils/patientContext");
const { normalizeEvidence, upsertEvidence } = require("../utils/evidence");
const { generateMirVignette } = require("../utils/openaiVignette");
const { generateMirQuestion } = require("../utils/openaiMir");
const { generateExtraDifferentials } = require("../utils/openaiExtraDifferentials");

const { Op, UniqueConstraintError } = require("sequelize");
const router = express.Router();

const {
  user: User,
  patient_profile: PatientProfile,
  case: Case,
  ai_artifact: AIArtifact,
  notification: Notification,
} = sequelize.models;

function stripEvidenceForInfermedica(evidence) {
  return (Array.isArray(evidence) ? evidence : [])
    .filter((e) => e && typeof e.id === "string" && typeof e.choice_id === "string")
    .map((e) => ({ id: e.id, choice_id: e.choice_id }));
}
function safeParseJSON(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickUniqueTopLabels(sortedConditions = [], n = 4) {
  const out = [];
  const seen = new Set();

  for (const c of sortedConditions) {
    const label = c?.common_name || c?.name || c?.id;
    if (!label) continue;

    const key = normalizeLabel(label);
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(String(label));
    if (out.length >= n) break;
  }

  return out;
}


function appendInterviewLog(caseRow, lastQuestion, incomingEvidence) {
  const log = safeParseJSON(caseRow.interview_log || "[]", []);
  if (lastQuestion) {
    log.push({
      at: new Date().toISOString(),
      question: lastQuestion,
      answer_evidence: incomingEvidence
    });
  }

  return JSON.stringify(log.slice(-50));
}


router.post("/start", auth, requirePatient, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId);
    const p = await PatientProfile.findOne({ where: { userId: u.id } });

    const initial = normalizeEvidence(req.body.evidence);
    if (!initial.length) return res.status(400).json({ error: "evidence must be a non-empty array" });

    const interviewId = crypto.randomUUID();

    const c = await Case.create({
      patientProfileId: req.patientProfile.id,
      interview_id: interviewId,
      symptoms: JSON.stringify(initial),
      status: "in_interview",
      submitted_at: new Date(),
      last_question: null,
      interview_log: JSON.stringify([]),
    });

    const context = buildPatientContext({ user: u, patientProfile: p, evidence: initial });
    const inferEv = stripEvidenceForInfermedica(initial);

    const diag = await infermedicaPost(
      "/diagnosis",
      { sex: context.sex, age: { value: context.age }, evidence: inferEv },
      interviewId
    );

    await c.update({
      last_question: diag.question ? JSON.stringify(diag.question) : null,
      interview_log: JSON.stringify([
        { at: new Date().toISOString(), question: { type: "initial", text: "Initial evidence" }, answer_evidence: initial }
      ])
    });

    res.json({
      caseId: c.id,
      interviewId: c.interview_id,
      question: diag.question || null,
      conditions: diag.conditions || [],
      has_emergency_evidence: !!diag.has_emergency_evidence,
      should_stop: !!diag.should_stop,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/:caseId/answer", auth, requirePatient, async (req, res, next) => {
  try {
    const caseId = Number(req.params.caseId);
    const c = await Case.findOne({ where: { id: caseId, patientProfileId: req.patientProfile.id } });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!c.interview_id) return res.status(400).json({ error: "Case has no interview_id" });

    const incoming = normalizeEvidence(req.body.evidence);
    if (!incoming.length) return res.status(400).json({ error: "evidence must be a non-empty array" });

    const current = JSON.parse(c.symptoms || "[]");
    const lastQ = c.last_question ? JSON.parse(c.last_question) : null;

    let merged = upsertEvidence(current, incoming);

    if (lastQ?.type === "group_single") {
      const groupIds = (lastQ.items || []).map((it) => it.id);
      const selectedId = incoming?.[0]?.id;
      merged = merged.filter((e) => !groupIds.includes(e.id) || e.id === selectedId);
    }

    const newLog = appendInterviewLog(c, lastQ, incoming);

    await c.update({
      symptoms: JSON.stringify(merged),
      interview_log: newLog,
    });

    const u = await User.findByPk(req.user.userId);
    const p = await PatientProfile.findOne({ where: { userId: u.id } });
    const context = buildPatientContext({ user: u, patientProfile: p, evidence: merged });

    const inferEv = stripEvidenceForInfermedica(merged);

    const diag = await infermedicaPost(
      "/diagnosis",
      { sex: context.sex, age: { value: context.age }, evidence: inferEv },
      c.interview_id
    );

    await c.update({ last_question: diag.question ? JSON.stringify(diag.question) : null });

    res.json({
      caseId: c.id,
      question: diag.question || null,
      conditions: diag.conditions || [],
      has_emergency_evidence: !!diag.has_emergency_evidence,
      should_stop: !!diag.should_stop,
    });
  } catch (e) {
    next(e);
  }
});


router.post("/:caseId/finish", auth, requirePatient, async (req, res, next) => {
  try {
    const caseId = Number(req.params.caseId);

    const c = await Case.findOne({
      where: { id: caseId, patientProfileId: req.patientProfile.id }
    });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!c.interview_id) return res.status(400).json({ error: "Case has no interview_id" });

    const evidence = JSON.parse(c.symptoms || "[]");

    const existing = await AIArtifact.findOne({
      where: { caseId: c.id },
      order: [["created_at", "DESC"]],
    });

    if (existing) {
      const diff = safeParseJSON(existing.differentials || "{}", {});
      if (!existing.closed_at) {
        await existing.update({ closed_at: new Date() });
      }

      if (c.status !== "ai_ready") {
        await c.update({ status: "ai_ready", submitted_at: new Date() });
      }

      return res.json({
        caseId: c.id,
        aiArtifactId: existing.id,
        mir: { public: diff.public || null, meta: diff.meta || null },
        infermedica: diff.infermedica || { conditions: [], triage: null },
      });
    }

    const [claimed] = await Case.update(
      { status: "ai_generating" },
      { where: { id: c.id, patientProfileId: req.patientProfile.id, status: "in_interview" } }
    );

    if (!claimed) {
      existing = await AIArtifact.findOne({ where: { caseId: c.id }, order: [["created_at", "DESC"]] });
      if (existing) {
        const diff = safeParseJSON(existing.differentials || "{}", {});
        return res.json({
          caseId: c.id,
          aiArtifactId: existing.id,
          mir: { public: diff.public || null, meta: diff.meta || null },
          infermedica: diff.infermedica || { conditions: [], triage: null },
        });
      }
      return res.json({ caseId: c.id, generating: true });
    }

    const u = await User.findByPk(req.user.userId);
    const p = await PatientProfile.findOne({ where: { userId: u.id } });
    const context = buildPatientContext({ user: u, patientProfile: p, evidence });

    const interviewLog = safeParseJSON(c.interview_log || "[]", []);

    const inferEv = stripEvidenceForInfermedica(evidence);

    const diag = await infermedicaPost(
      "/diagnosis",
      { sex: context.sex, age: { value: context.age }, evidence: inferEv },
      c.interview_id
    );

    const triage = await infermedicaPost(
      "/triage",
      { sex: context.sex, age: { value: context.age }, evidence: inferEv },
      c.interview_id
    );


    const sorted = (diag.conditions || [])
      .slice()
      .sort((a, b) => (b.probability || 0) - (a.probability || 0));

    let top4 = pickUniqueTopLabels(sorted, 4);

    const missing = 4 - top4.length;
    if (missing > 0) {
      const payloadContext = {
        patient: {
          age: context.age ?? null,
          sex: context.sex ?? null,
          pregnant: context.pregnant ?? null
        },
        evidence: (Array.isArray(evidence) ? evidence : [])
          .filter(e => e && e.choice_id === "present")
          .slice(0, 12)
          .map(e => ({ id: e.id, name: e.name || e.id })),
        infermedica: {
          top_conditions: (diag.conditions || []).slice(0, 8).map(c => ({
            id: c.id,
            name: c.common_name || c.name || c.id,
            probability: c.probability
          })),
          triage_level: triage?.triage_level || null,
          has_emergency_evidence: !!diag?.has_emergency_evidence
        },
        interview_log: Array.isArray(interviewLog) ? interviewLog.slice(-20) : []
      };

      const extra = await generateExtraDifferentials({
        payloadContext,
        existingLabels: top4,
        needed: missing
      });

      top4 = top4.concat(extra).slice(0, 4);
    }

    while (top4.length < 4) top4.push(`Unknown ${top4.length + 1}`);

    const mir = await generateMirQuestion({
      context,
      infermedica: {
        conditions: diag.conditions || [],
        triage,
        has_emergency_evidence: !!diag.has_emergency_evidence,
        sex: context.sex,
        age: context.age
      },
      interview_log: interviewLog,
      optionLabels: top4,
      focus: "diagnosis",
      difficulty: "medium",
      topic: "clinical diagnosis"
    });

    const patient_context = {
      age: context.age,
      sex: context.sex,
      pregnant: context.pregnant ?? null,
      height: context.height ?? null,
      weight: context.weight ?? null,
      bmi: context.bmi ?? null,
      bmi_category: context.bmi_category ?? null,
      smoking: context.smoking ?? null,
      high_blood_pressure: context.high_blood_pressure ?? null,
      diabetes: context.diabetes ?? null,
      chronic_condition: context.chronic_condition ?? null,
      prior_surgery: context.prior_surgery ?? null,
      allergies: context.allergies ?? null,
      medications: context.medications ?? null,
    };

    const now = new Date();

    let artifact;
    try {
      artifact = await AIArtifact.create({
        caseId: c.id,
        vignette: mir.public.question_text,
        differentials: JSON.stringify({
          public: mir.public,
          private: mir.private,
          meta: mir.meta,
          infermedica: { conditions: diag.conditions || [], triage },
          interview_log: interviewLog,
          patient_context
        }),
        created_at: new Date(),
        closed_at: new Date(),
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        const ex = await AIArtifact.findOne({ where: { caseId: c.id }, order: [["created_at", "DESC"]] });
        const diff = safeParseJSON(ex?.differentials || "{}", {});
        await Case.update({ status: "ai_ready" }, { where: { id: c.id } });

        return res.json({
          caseId: c.id,
          aiArtifactId: ex.id,
          mir: { public: diff.public || null, meta: diff.meta || null },
          infermedica: diff.infermedica || { conditions: [], triage: null },
        });
      }

      await Case.update({ status: "in_interview" }, { where: { id: c.id, status: "ai_generating" } });
      throw e;
    }

    await c.update({ status: "ai_ready", submitted_at: new Date() });

    const { getIO } = require("../utils/socket");
    getIO()?.to("clinicians").emit("queue:update", { caseId: c.id });
    getIO()?.to("admins").emit("dashboard:update");


    await Notification.create({
      userId: u.id,
      type: "ai_ready",
      payload: JSON.stringify({ caseId: c.id, aiArtifactId: artifact.id }),
    });

    return res.json({
      caseId: c.id,
      aiArtifactId: artifact.id,
      mir: { public: mir.public, meta: mir.meta },
      infermedica: { conditions: diag.conditions || [], triage }
    });

  } catch (e) {
    next(e);
  }
});


module.exports = router;
