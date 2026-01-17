const express = require('express');
const sequelize = require("../database");
const auth = require('../middleware/auth');
const { requireClinicianVerified, requireClinician } = require('../middleware/profiles');
const { maybeCloseConsensus } = require("../utils/consensusService");

const { Op } = require("sequelize");
const { money: Money } = sequelize.models;

const router = express.Router();
const {
  case: Case,
  ai_artifact: AIArtifact,
  review: Review,
  consensus: Consensus,
  user: User,
  clinician_profile: ClinicianProfile
} = sequelize.models;

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

router.get("/profile", auth, requireClinician, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId, {
      attributes: ["id", "name", "surname", "email", "phone", "address", "dob"],
    });
    if (!u) return res.status(404).json({ error: "User not found" });

    return res.json({ user: u, clinician: req.clinicianProfile });
  } catch (e) { next(e); }
});


router.put("/profile", auth, requireClinician, async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { user = {}, clinician = {} } = req.body || {};

    const u = await User.findByPk(req.user.userId, { transaction: t });
    if (!u) { await t.rollback(); return res.status(404).json({ error: "User not found" }); }

    let c = await ClinicianProfile.findOne({ where: { userId: u.id }, transaction: t });
    if (!c) c = await ClinicianProfile.create({ userId: u.id }, { transaction: t });

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

    await c.update({
      medical_college_reg_no: clinician.medical_college_reg_no ?? c.medical_college_reg_no,
      provincial_college: clinician.provincial_college ?? c.provincial_college,
      specialty: clinician.specialty ?? c.specialty,
      mir_year: clinician.mir_year ?? c.mir_year,
      liability_insurance: clinician.liability_insurance ?? c.liability_insurance,
    }, { transaction: t });

    await t.commit();
    return res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});


router.get('/queue', auth, requireClinicianVerified, async (req, res, next) => {
  try {

    const answered = await Review.findAll({
      where: { clinicianProfileId: req.clinicianProfile.id },
      attributes: ["caseId"]
    });
    const answeredIds = answered.map(x => x.caseId);

    const list = await Case.findAll({
      where: { status: { [Op.in]: ["ai_ready", "in_review"] }, id: { [Op.notIn]: answeredIds.length ? answeredIds : [0] } },
      include: [{ model: AIArtifact, as: "ai_artifact" }],
      order: [['created_at', 'ASC']],
      limit: 20
    });

    const out = list.map((row) => {
      const j = row.toJSON();
      if (j.ai_artifact?.differentials) {
        const d = safeJsonParse(j.ai_artifact.differentials, {});
        if (d.private) delete d.private;
        j.ai_artifact.differentials = d;
      }
      return j;
    });

    res.json(out);
  } catch (e) { next(e); }
});


router.post('/cases/:id/reviews', auth, requireClinicianVerified, async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    const { answer, urgency, solution, final_diagnosis } = req.body; const note = (final_diagnosis ?? solution ?? null);

    if (!["A", "B", "C", "D", "E"].includes(answer)) {
      return res.status(400).json({ error: "answer must be A|B|C|D|E" });
    }

    const c = await Case.findByPk(caseId);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (!["ai_ready", "in_review"].includes(c.status)) return res.status(400).json({ error: "Case not available for review" });

    const ai = await AIArtifact.findOne({ where: { caseId } });
    if (!ai) return res.status(400).json({ error: 'AI artifact not ready for this case' });

    const d = ai.differentials ? safeJsonParse(ai.differentials, {}) : {};
    const options = d.public?.options || [];
    const validKeys = new Set(options.map((o) => o.key));
    validKeys.add("E");
    if (options.length && !validKeys.has(answer)) {
      return res.status(400).json({ error: "Selected option not valid for this question" });
    }

    const urg = urgency && String(urgency).trim() ? String(urgency).trim() : "within_72h";

    if (!["seek_now", "within_24_48h", "within_72h", "self_care"].includes(urg)) {
      return res.status(400).json({ error: "urgency invalid" });
    }

    const already = await Review.findOne({
      where: { caseId, clinicianProfileId: req.clinicianProfile.id }
    });
    if (already) return res.status(409).json({ error: "You already reviewed this case" });


    const r = await Review.create({
      caseId,
      aiArtifactId: ai.id,
      clinicianProfileId: req.clinicianProfile.id,
      mir_question: ai.vignette,
      answer,
      urgency: urg,
      solution: note,
      submitted_at: new Date()
    });

    if (c.status === "ai_ready") {
      await c.update({ status: "in_review" });
    }

    const { getIO } = require("../utils/socket");

    getIO()?.to("admins").emit("case:update", { caseId, status: c.status });
    getIO()?.to("admins").emit("dashboard:update");

    getIO()?.to("clinicians").emit("queue:update", { caseId });

    try {
      await maybeCloseConsensus({ sequelize, caseId });
    } catch (e) {
      console.error("[CONSENSUS] maybeCloseConsensus failed:", e);
    }

    await Money.create({
      clinicianProfileId: req.clinicianProfile.id,
      caseId,
      reviewId: r.id,
      type: "review_reward",
      amount_cents: 1000, // 10€
      currency: "EUR",
      status: "pending",
      meta: JSON.stringify({ reason: "review submitted" }),
      created_at: new Date()
    });


    res.status(201).json(r);
  } catch (e) { next(e); }
});


router.get('/reviews', auth, requireClinicianVerified, async (req, res, next) => {
  try {
    const list = await Review.findAll({
      where: { clinicianProfileId: req.clinicianProfile.id },
      order: [['submitted_at', 'DESC']]
    });
    res.json(list);

  } catch (e) { next(e); }
});

router.get('/reviews-with-result', auth, requireClinicianVerified, async (req, res, next) => {
  try {
    const rows = await Review.findAll({
      where: { clinicianProfileId: req.clinicianProfile.id },
      include: [
        {
          model: Case,
          attributes: ['id', 'status', 'created_at'],
          include: [
            { model: Consensus, as: "consensus", attributes: ['final_answer', 'final_diagnosis', 'final_urgency', 'closed_at'] },
            { model: AIArtifact, as: "ai_artifact", attributes: ['id', 'vignette', 'differentials', 'created_at'] },
          ]
        }
      ],
      order: [['submitted_at', 'DESC']]
    });

    const items = rows.map(r => {
      const review = r.toJSON();
      const c = review.case || null;
      const cons = c?.consensus || null;
      const ai = c?.ai_artifact || null;

      let pub = {};
      if (ai?.differentials) {
        const d = safeJsonParse(ai.differentials, {});
        if (d.private) delete d.private;
        pub = d.public || {};
      }

      const stem =
        `${pub.vignette || ai?.vignette || ""}\n\n${pub.lead_in || ""}`.trim()
        || (pub.question_text ? String(pub.question_text) : "")
        || (ai?.vignette ? String(ai.vignette) : "—");

      const options = Array.isArray(pub.options)
        ? pub.options
          .filter(o => o && o.key)
          .map(o => ({ key: String(o.key).toUpperCase(), label: String(o.label || o.key) }))
        : [];

      const labelFor = (k) => {
        if (!k) return null;
        const kk = String(k).toUpperCase();
        const opt = options.find(o => o.key === kk);
        return opt?.label || null;
      };

      const clinicianKey = String(review.answer || "").toUpperCase();
      const consensusKey = cons?.final_answer ? String(cons.final_answer).toUpperCase() : null;

      const hasResult = !!cons;
      const isCorrect = hasResult && clinicianKey && consensusKey && clinicianKey === consensusKey;

      const rewardReview = 10;
      const rewardBonus = isCorrect ? 10 : 0;

      return {
        reviewId: review.id,
        caseId: review.caseId,
        status: c?.status || "—",
        submitted_at: review.submitted_at,

        mir: {
          stem,
          options
        },

        clinician: {
          key: clinicianKey || null,
          label: labelFor(clinicianKey)
        },

        consensus: hasResult ? {
          key: consensusKey,
          label: labelFor(consensusKey) || cons.final_diagnosis || null,
          final_diagnosis: cons.final_diagnosis || null,
          final_urgency: cons.final_urgency || null,
          closed_at: cons.closed_at || null
        } : null,

        solution: review.solution || null,
        urgency: review.urgency || null,

        is_correct: isCorrect,

        earnings: {
          review_eur: rewardReview,
          bonus_eur: rewardBonus,
          total_eur: rewardReview + rewardBonus
        }
      };
    });

    const totals = items.reduce((acc, it) => {
      acc.review_eur += it.earnings.review_eur;
      acc.bonus_eur += it.earnings.bonus_eur;
      acc.total_eur += it.earnings.total_eur;
      return acc;
    }, { review_eur: 0, bonus_eur: 0, total_eur: 0 });

    res.json({ items, totals });
  } catch (e) { next(e); }
});

router.get("/wallet", auth, requireClinicianVerified, async (req, res, next) => {
  try {
    const txs = await Money.findAll({
      where: { clinicianProfileId: req.clinicianProfile.id },
      order: [["created_at", "DESC"]],
      limit: 200
    });

    const totals = txs.reduce((acc, t) => {
      const cents = t.amount_cents || 0;
      acc.total_cents += cents;
      if (t.status === "pending") acc.pending_cents += cents;
      if (t.status === "paid") acc.paid_cents += cents;
      return acc;
    }, { total_cents: 0, pending_cents: 0, paid_cents: 0 });

    res.json({
      items: txs,
      totals: {
        total_eur: totals.total_cents / 100,
        pending_eur: totals.pending_cents / 100,
        paid_eur: totals.paid_cents / 100
      }
    });
  } catch (e) { next(e); }
});



module.exports = router;
