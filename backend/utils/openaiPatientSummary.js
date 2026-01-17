let OpenAI = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!OpenAI) {
    const mod = require("openai");
    OpenAI = mod.default || mod;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const PATIENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "urgency_text", "next_steps", "explanation_simple"],
  properties: {
    summary: { type: "string", minLength: 60 },
    urgency_text: { type: "string", minLength: 20 },
    next_steps: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string", minLength: 8 }
    },
    explanation_simple: { type: "string", minLength: 120 }
  }
};

function fallbackPatientSummary({ final_diagnosis_label, final_urgency }) {
  return {
    summary: `After clinician review, the most likely explanation is: ${final_diagnosis_label || "unclear"}.\nUrgency: ${final_urgency}.`,
    urgency_text: `Urgency level: ${final_urgency}.`,
    next_steps: ["Monitor symptoms", "Seek care if worsening", "Follow local medical guidance"],
    explanation_simple:
      `This is an educational orientation, not a diagnosis. ${final_diagnosis_label || "The selected option"} is explained in simple terms: it refers to a common clinical pattern that may fit your symptoms.`
  };
}

async function generatePatientSummary({
  patient_context,
  final_diagnosis_label,
  final_urgency,
  clinician_notes,
  infermedica
}) {
  const client = getClient();

  if (!client) return fallbackPatientSummary({ final_diagnosis_label, final_urgency });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const developer = `You are a clinician writing a patient-friendly explanation.
  Write in simple English for low health literacy.
  Do NOT prescribe drugs or give dosing.
  Goal:
  - short summary of the likely diagnosis
  - urgency explained in plain language
  - 3–6 next steps (actionable)
  - explain what the diagnosis means in simple terms
  Use only the provided data. Return STRICT JSON.`;

  const payload = {
    patient_context,
    final_diagnosis_label,
    final_urgency,
    clinician_notes: clinician_notes || [],
    infermedica: infermedica || null
  };

  try {
    const resp = await client.responses.create({
      model,
      input: [
        { role: "developer", content: developer },
        { role: "user", content: `Create patient-friendly result from:\n${JSON.stringify(payload, null, 2)}` }
      ],
      text: { format: { type: "json_schema", name: "patient_summary", strict: true, schema: PATIENT_SCHEMA } }
    });

    return JSON.parse(resp.output_text);
  } catch (err) {
    console.error("[OPENAI] generatePatientSummary failed:", err?.status, err?.code, err?.message);
    return fallbackPatientSummary({ final_diagnosis_label, final_urgency });
  }
}

module.exports = { generatePatientSummary };
