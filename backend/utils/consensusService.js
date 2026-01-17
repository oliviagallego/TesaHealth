const { generatePatientSummary } = require("./openaiPatientSummary");
const { getIO } = require("./socket");

function safeParseJSON(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}

function majority(values) {
    const c = new Map();
    for (const v of values) {
        if (!v) continue;
        c.set(v, (c.get(v) || 0) + 1);
    }
    if (!c.size) return null;
    return [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
}

function topNotes(reviews, max = 3) {
    const notes = reviews
        .map(r => String(r.solution || "").trim())
        .filter(Boolean)
        .slice(0, 20);
    return notes.slice(0, max);
}

function statsPct(values, allowedKeys) {
    const total = values.length || 0;
    const counts = {};
    for (const k of allowedKeys) counts[k] = 0;
    for (const v of values) if (v && counts[v] !== undefined) counts[v]++;

    const out = {};
    for (const k of allowedKeys) {
        out[k] = { count: counts[k], pct: total ? Math.round((counts[k] / total) * 1000) / 10 : 0 };
    }
    return { total, by: out };
}

const URGENCY_ORDER = ["seek_now", "within_24_48h", "within_72h", "self_care"];

function highestUrgency(values) {
    const allowed = new Set(URGENCY_ORDER);
    const clean = (values || []).filter(v => allowed.has(v));

    if (!clean.length) return null;

    return clean.reduce((best, cur) => {
        if (!best) return cur;
        return URGENCY_ORDER.indexOf(cur) < URGENCY_ORDER.indexOf(best) ? cur : best;
    }, null);
}


async function maybeCloseConsensus({ sequelize, caseId }) {
    const {
        case: Case,
        ai_artifact: AIArtifact,
        review: Review,
        consensus: Consensus,
        money: Money,
        notification: Notification,
        patient_profile: PatientProfile,
        clinician_profile: ClinicianProfile,
    } = sequelize.models;

    const MIN = Number(process.env.MIN_REVIEWS_FOR_CONSENSUS || 3);

    const c = await Case.findByPk(caseId);
    if (!c) return null;

    const existing = await Consensus.findOne({ where: { caseId } });
    if (existing) {
        if (c.status !== "consensus_ready") {
            await c.update({ status: "consensus_ready", closed_at: existing.closed_at || new Date() });
        }
        return existing;
    }

    const ai = await AIArtifact.findOne({ where: { caseId } });
    if (!ai) return null;

    const reviews = await Review.findAll({ where: { caseId } });
    if (reviews.length < MIN) return null;

    const diff = safeParseJSON(ai.differentials || "{}", {});
    const pubOptions = diff?.public?.options || [];
    const infermedica = diff?.infermedica || null;
    const patient_context = diff?.patient_context || null;

    const answers = reviews.map(r => r.answer).filter(Boolean);
    const final_answer = majority(answers) || "E";

    const urgencies = reviews.map(r => r.urgency).filter(Boolean);
    const final_urgency = highestUrgency(urgencies) || "within_72h";

    const label =
        (pubOptions.find(o => String(o.key).toUpperCase() === String(final_answer).toUpperCase())?.label)
        || (final_answer === "E" ? "No clear option selected" : final_answer);

    const notesArr = topNotes(reviews, 3);
    const notesText = notesArr.length ? notesArr.map(n => `- ${n}`).join("\n") : null;

    const answerStats = statsPct(answers, ["A", "B", "C", "D", "E"]);
    const urgencyStats = statsPct(urgencies, ["seek_now", "within_24_48h", "within_72h", "self_care"]);

    let patientResult;
    try {
        patientResult = await generatePatientSummary({
            patient_context,
            final_diagnosis_label: label,
            final_urgency,
            clinician_notes: notesArr,
            infermedica
        });
    } catch (e) {
        console.error("[OPENAI] generatePatientSummary failed, using fallback:", e?.message || e);
        patientResult = {
            summary: `Result: ${label}`,
            explanation_simple: "Your clinician report is ready. Please review the urgency and next steps.",
            next_steps: [
                "Follow the recommended urgency timeframe.",
                "Seek immediate care if symptoms worsen.",
                "If you feel worse, contact emergency services."
            ]
        };
    }

    const closedAt = new Date();
    const nextSteps = Array.isArray(patientResult?.next_steps) ? patientResult.next_steps : [];
    const cons = await Consensus.create({
        caseId,
        aiArtifactId: ai.id,
        final_answer,
        final_diagnosis: label,
        final_urgency,

        patient_summary: (patientResult?.summary || `Result: ${label}`) + "\n\n" + nextSteps.map(x => `- ${x}`).join("\n"),
        patient_explanation: patientResult?.explanation_simple || null,

        clinician_notes: notesText,

        total_reviews: answerStats.total,
        answer_stats: JSON.stringify(answerStats),
        urgency_stats: JSON.stringify(urgencyStats),

        closed_at: closedAt
    });

    await c.update({ status: "consensus_ready", closed_at: closedAt });

    if (!ai.closed_at) {
        await ai.update({ closed_at: closedAt });
    }
    const io = getIO();

    const pp = await PatientProfile.findByPk(c.patientProfileId, { attributes: ["id", "userId"] });

    const uniqueClinicianIds = [...new Set(reviews.map(r => r.clinicianProfileId).filter(Boolean))];
    const clinicianProfiles = uniqueClinicianIds.length
        ? await ClinicianProfile.findAll({ where: { id: uniqueClinicianIds }, attributes: ["id", "userId"] })
        : [];

    if (pp?.userId) {
        io?.to(`user:${pp.userId}`).emit("case:update", { caseId, status: "consensus_ready" });
        io?.to(`user:${pp.userId}`).emit("notification:new", { type: "consensus_ready", caseId, consensusId: cons.id });

        await Notification.create({
            userId: pp.userId,
            type: "consensus_ready",
            payload: JSON.stringify({ caseId, consensusId: cons.id })
        }).catch(() => { });
    }

    for (const cp of clinicianProfiles) {
        if (!cp.userId) continue;
        io?.to(`user:${cp.userId}`).emit("review:result", { caseId, consensusId: cons.id });

        await Notification.create({
            userId: cp.userId,
            type: "consensus_ready",
            payload: JSON.stringify({ caseId, consensusId: cons.id })
        }).catch(() => { });
    }

    io?.to("admins").emit("dashboard:update");
    io?.to("admins").emit("case:update", { caseId, status: "consensus_ready" });

    const winners = reviews.filter(r => r.answer === final_answer);
    for (const r of winners) {
        await Money.create({
            clinicianProfileId: r.clinicianProfileId,
            caseId,
            reviewId: r.id,
            type: "correct_bonus",
            amount_cents: 1000,
            currency: "EUR",
            status: "pending",
            meta: JSON.stringify({ reason: "matched consensus", final_answer }),
            created_at: new Date()
        }).catch(() => { });
    }

    try {
        if (pp?.userId) {
            const patientUser = await sequelize.models.user.findByPk(pp.userId, {
                attributes: ["id", "name", "email"]
            });

            if (patientUser?.email) {
                const { sendConsensusReadyEmail } = require("./sendConsensusReadyEmail");
                const FRONT = process.env.FRONTEND_URL || "http://localhost:3001";

                const reportUrl = `${FRONT}/pages/new_case.html?caseId=${encodeURIComponent(String(caseId))}`;

                await sendConsensusReadyEmail({
                    user: patientUser,
                    caseId,
                    reportUrl
                });
            }
        }
    } catch (e) {
        console.error("[EMAIL] consensus ready email failed:", e?.message || e);
    }

    return cons;
}

module.exports = { maybeCloseConsensus };
