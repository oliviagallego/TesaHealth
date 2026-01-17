const { newInterviewId, diagnosis, triage } = require("./infermedicaClient");

function toInfermedicaSex(sex) {
  if (sex === "W") return "female";
  if (sex === "M") return "male";
  return "female";
}

function toAgeValue(age) {
  return Number.isFinite(age) && age > 0 ? age : 30;
}

function buildEvidenceFromSymptoms(symptoms) {

  const evidence = [];
  for (const s of symptoms || []) {
    const id = s.infermedica_id || s.infermedicaId || s.id;
    if (id) evidence.push({ id, choice_id: "present" });
  }
  return evidence;
}

async function generateAiOutputs(context) {
  if (!process.env.INFERMEDICA_APP_ID || !process.env.INFERMEDICA_APP_KEY) {
    throw new Error("Missing INFERMEDICA_APP_ID/INFERMEDICA_APP_KEY in .env");
  }

  const interviewId = newInterviewId();
  const sex = toInfermedicaSex(context.sex);
  const ageValue = toAgeValue(context.age);

  const evidence = buildEvidenceFromSymptoms(context.symptoms);
  if (evidence.length === 0) {
    throw new Error("No infermedica_id in symptoms. Add infermedica_id (e.g. s_21).");
  }

  const diag = await diagnosis({ sex, ageValue, evidence, interviewId });

  const topConditions = (diag.conditions || [])
    .sort((a, b) => (b.probability || 0) - (a.probability || 0))
    .slice(0, 4)
    .map((c) => c.name || c.common_name || c.id);

  const differentials = [...topConditions, "blank"];

  const tri = await triage({ sex, ageValue, evidence, interviewId });

  const vignette = `Paciente ${context.sex || "?"}, ${context.age ?? "?"} años.
  Motivo: ${context.symptoms.map(s => s.name || s.infermedica_id || "symptom").join(", ")}.
  Posibles diagnósticos: ${differentials.join(", ")}.
  Triage: ${tri.triage_level || "unknown"}.
  `;

  return {
    vignette,
    differentials,
    triage_level: tri.triage_level || null,
    infermedica_raw: diag,
  };
}

module.exports = { generateAiOutputs };
