const express = require('express');
const sequelize = require("../database");
const auth = require('../middleware/auth');
const { requirePatient } = require('../middleware/profiles');
const { buildPatientContext, generateAiOutputs } = require("../utils/aiPipeline");
const { buildCaseReportHtml, htmlToPdfBuffer } = require("../utils/pdfReport");


const router = express.Router();
const {
  case: Case,
  ai_artifact: AIArtifact,
  consensus: Consensus,
  user: User,
  patient_profile: PatientProfile,
  notification: Notification,
  clinician_profile: ClinicianProfile
} = sequelize.models;


router.get("/", auth, requirePatient, async (req, res, next) => {
  try {
    const list = await Case.findAll({
      where: { patientProfileId: req.patientProfile.id },
      include: [
        { model: Consensus, as: "consensus", attributes: ["final_urgency", "final_diagnosis", "patient_summary", "closed_at"] }
      ],
      order: [["created_at", "DESC"]],
    });

    const out = list.map((c) => {
      const j = c.toJSON();

      j.symptoms = JSON.parse(j.symptoms || "[]");
      j.last_question = j.last_question ? JSON.parse(j.last_question) : null;

      const cons = j.consensus || null;
      j.urgency = cons?.final_urgency || null;

      j.summary =
        cons?.patient_summary
          ? String(cons.patient_summary).split("\n").slice(0, 3).join(" ").trim()
          : (cons?.final_diagnosis || null);

      return j;
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
});


router.get("/:id", auth, requirePatient, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const row = await Case.findOne({
      where: { id, patientProfileId: req.patientProfile.id },
      include: [
        { model: AIArtifact, as: "ai_artifact" },
        { model: Consensus, as: "consensus" },
      ]
    });

    if (!row) return res.status(404).json({ error: "Case not found" });

    const j = row.toJSON();

    try { j.symptoms = JSON.parse(j.symptoms || "[]"); } catch { j.symptoms = []; }

    try { j.last_question = j.last_question ? JSON.parse(j.last_question) : null; } catch { j.last_question = null; }

    try { j.interview_log = JSON.parse(j.interview_log || "[]"); } catch { j.interview_log = []; }

    if (j.ai_artifact?.differentials && typeof j.ai_artifact.differentials === "string") {
      try { j.ai_artifact.differentials = JSON.parse(j.ai_artifact.differentials); } catch { }
    }

    res.json(j);
  } catch (e) { next(e); }
});


router.get("/:id/pdf", auth, requirePatient, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const row = await Case.findOne({
      where: { id, patientProfileId: req.patientProfile.id },
      include: [
        { model: AIArtifact, as: "ai_artifact" },
        { model: Consensus, as: "consensus" },
      ],
    });

    if (!row) return res.status(404).json({ error: "Case not found" });

    if (!row.consensus) {
      return res.status(409).json({ error: "Consensus not ready yet" });
    }

    const u = await User.findByPk(req.user.userId, {
      attributes: ["id", "name", "surname", "email", "phone", "address", "dob"],
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    const j = row.toJSON();

    try { j.symptoms = JSON.parse(j.symptoms || "[]"); } catch { j.symptoms = []; }
    try { j.interview_log = JSON.parse(j.interview_log || "[]"); } catch { j.interview_log = []; }

    if (j.ai_artifact?.differentials && typeof j.ai_artifact.differentials === "string") {
      try { j.ai_artifact.differentials = JSON.parse(j.ai_artifact.differentials); } catch { }
    }

    const html = buildCaseReportHtml({
      user: u.toJSON(),
      patient: req.patientProfile?.toJSON ? req.patientProfile.toJSON() : req.patientProfile,
      caseRow: j,
      aiArtifact: j.ai_artifact || null,
      consensus: j.consensus || null,
    });

    const pdfBuffer = await htmlToPdfBuffer(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="TesaHealth_case_${id}.pdf"`
    );

    return res.send(pdfBuffer);
  } catch (e) {
    next(e);
  }
});


router.post("/", auth, requirePatient, (req, res) => {
  return res.status(410).json({ error: "Deprecated. Use POST /api/interview/start" });
});

router.post("/:id/ai", auth, requirePatient, (req, res) => {
  return res.status(410).json({ error: "Deprecated. Use POST /api/interview/:caseId/finish" });
});

module.exports = router;
