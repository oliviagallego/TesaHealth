let OpenAI = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!OpenAI) {
    const mod = require("openai");
    OpenAI = mod.default || mod;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildStubMir({ payloadContext, options, focus, difficulty, topic, reason }) {
  const lead_in = "Which diagnosis is most likely?";
  const vignette =
    `Patient: ${payloadContext.patient.sex || "unknown"}, ${payloadContext.patient.age || "unknown"} years old.\n` +
    `Key findings: ${(payloadContext.evidence || []).slice(0, 8).map(x => x.name).join(", ") || "N/A"}.\n` +
    `Infermedica top: ${(payloadContext.infermedica?.top_conditions || []).slice(0, 4).map(x => x.name).join(", ") || "N/A"}.\n`;

  const question_text = `${vignette}\n${lead_in}`;

  return {
    public: { language: "en", vignette, lead_in, options, question_text },
    private: { correct_option_id: "A", why_correct: reason || "Fallback mode." },
    meta: { focus, difficulty, topic },
    _fallback: true
  };
}

const MIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["public", "private", "meta"],
  properties: {
    public: {
      type: "object",
      additionalProperties: false,
      required: ["language", "vignette", "lead_in", "options", "question_text"],
      properties: {
        language: { type: "string", enum: ["en"] },
        vignette: { type: "string", minLength: 80 },
        lead_in: { type: "string", minLength: 8 },
        options: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "label"],
            properties: {
              key: { type: "string", enum: ["A", "B", "C", "D", "E"] },
              label: { type: "string", minLength: 1 }
            }
          }
        },
        question_text: { type: "string", minLength: 80 }
      }
    },
    private: {
      type: "object",
      additionalProperties: false,
      required: ["correct_option_id", "why_correct"],
      properties: {
        correct_option_id: { type: "string", enum: ["A", "B", "C", "D", "E"] },
        why_correct: { type: "string", minLength: 20 }
      }
    },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["focus", "difficulty", "topic"],
      properties: {
        focus: { type: "string", enum: ["diagnosis", "confirmatory_test", "next_step", "treatment"] },
        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        topic: { type: "string", minLength: 3, maxLength: 80 }
      }
    }
  }
};

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function removeTrailingQuestionFromVignette(vignette, leadIn) {
  let v = String(vignette || "").trim();
  const l = String(leadIn || "").trim();
  if (!v) return v;

  const nl = norm(l);
  if (nl) {
    while (norm(v).endsWith(nl)) {
      const nv = norm(v);
      const idx = nv.lastIndexOf(nl);
      v = v.slice(0, idx).trim();
    }
  }

  for (let i = 0; i < 3; i++) {
    if (!/\?\s*$/.test(v)) break;

    const qIdx = v.lastIndexOf("?");
    const start = Math.max(
      v.lastIndexOf(".", qIdx),
      v.lastIndexOf("\n", qIdx),
      v.lastIndexOf("!", qIdx)
    );

    const lastChunk = v.slice(start + 1, qIdx + 1).trim(); // incluye '?'

    const looksLikeLeadIn =
      /^(what|which|based on)\b/i.test(lastChunk) ||
      /most likely/i.test(lastChunk) ||
      /diagnos/i.test(lastChunk);

    if (!looksLikeLeadIn) break;

    v = (start >= 0 ? v.slice(0, start + 1) : v.slice(0, qIdx)).trim();
  }

  return v.trim();
}


function buildOpenAiCasePayload({ context, infermedica, interview_log }) {
  const ctx = context || {};
  return {
    patient: {
      age: infermedica?.age ?? ctx.age ?? null,
      sex: infermedica?.sex ?? ctx.sex ?? null,
      pregnant: ctx.pregnant ?? null,
      height: ctx.height ?? null,
      weight: ctx.weight ?? null,
      bmi: ctx.bmi ?? null,
      bmi_category: ctx.bmi_category ?? null,
      smoking: ctx.smoking ?? null,
      high_blood_pressure: ctx.high_blood_pressure ?? null,
      diabetes: ctx.diabetes ?? null,
      chronic_condition: ctx.chronic_condition ?? null,
      prior_surgery: ctx.prior_surgery ?? null,
      allergies: ctx.allergies ?? null,
      medications: ctx.medications ?? null,
    },
    evidence: (Array.isArray(ctx.evidence) ? ctx.evidence : []).map(e => ({
      id: e.id,
      choice_id: e.choice_id,
      name: e.name || e.id
    })),
    infermedica: {
      top_conditions: (infermedica?.conditions || []).slice(0, 6).map(c => ({
        id: c.id,
        name: c.common_name || c.name || c.id,
        probability: c.probability
      })),
      triage_level: infermedica?.triage?.triage_level || null,
      has_emergency_evidence: !!infermedica?.has_emergency_evidence
    },
    interview_log: Array.isArray(interview_log) ? interview_log.slice(-40) : []
  };
}


async function generateMirQuestion({
  context,
  infermedica,
  interview_log,
  optionLabels,
  focus = "diagnosis",
  difficulty = "medium",
  topic = "clinical diagnosis",
}) {
  const client = getClient();

  const options = [
    { key: "A", label: optionLabels?.[0] || "Option A" },
    { key: "B", label: optionLabels?.[1] || "Option B" },
    { key: "C", label: optionLabels?.[2] || "Option C" },
    { key: "D", label: optionLabels?.[3] || "Option D" },
    { key: "E", label: "BLANK" }
  ];

  const payloadContext = buildOpenAiCasePayload({ context, infermedica, interview_log });

  if (!client) {
    return buildStubMir({
      payloadContext, options, focus, difficulty, topic,
      reason: "No OPENAI_API_KEY set."
    });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const developer = `You are an experienced Spanish MIR exam item writer, but you must write in ENGLISH.
  Write ONE MIR-style single-best-answer MCQ in ENGLISH based strictly on the provided case context.
  You will be given the allowed answer options (A–D). Use those option labels verbatim; do not invent new options.
  Rules:
  - Start the vignette with: "A <age>-year-old man/woman..."
  - Realistic clinical vignette (3–6 lines) + clear lead-in
  - Exactly one best answer among A–D
  - No PII
  - IMPORTANT: The vignette must NOT contain any question/lead-in. Put the question ONLY in lead_in.
  Return STRICT JSON following schema.`;

  const payload = { context: payloadContext, focus, difficulty, topic, options };

  try {
    const resp = await client.responses.create({
      model,
      input: [
        { role: "developer", content: developer },
        { role: "user", content: `Generate the MIR question from this JSON:\n${JSON.stringify(payload, null, 2)}` },
      ],
      text: {
        format: { type: "json_schema", name: "mir_question", strict: true, schema: MIR_SCHEMA },
      },
    });

    const parsed = JSON.parse(resp.output_text);

    const pub = parsed.public || {};
    let vignette = (pub.vignette || "").trim();
    const lead_in = (pub.lead_in || "").trim();
    vignette = removeTrailingQuestionFromVignette(vignette, lead_in);
    parsed.public.vignette = vignette;
    parsed.public.lead_in = lead_in;

    parsed.public.question_text = `${vignette}\n\n${lead_in}`.trim();
    parsed.public.options = pub.options || options;

    (function enforceUniqueOptions() {
      const opts = Array.isArray(parsed.public.options) ? parsed.public.options : [];
      const map = new Map(opts.map(o => [String(o.key || "").toUpperCase(), String(o.label || "")]));

      const keys = ["A", "B", "C", "D"];
      const seen = new Set();
      let hasDup = false;

      for (const k of keys) {
        const lab = map.get(k) || "";
        const norm = String(lab).toLowerCase().replace(/\s+/g, " ").trim();
        if (!norm) { hasDup = true; break; }
        if (seen.has(norm)) { hasDup = true; break; }
        seen.add(norm);
      }

      if (hasDup) {
        parsed.public.options = options;
      }
    })();

    return parsed;
  } catch (err) {
    console.error("[OPENAI] generateMirQuestion failed:", err?.status, err?.code, err?.message);

    return buildStubMir({
      payloadContext,
      options,
      focus,
      difficulty,
      topic,
      reason: `OpenAI error: ${err?.code || err?.status || "unknown"}`
    });
  }
}

module.exports = { generateMirQuestion };
