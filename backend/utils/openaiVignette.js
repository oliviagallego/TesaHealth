let OpenAI = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!OpenAI) {
    const mod = require("openai");
    OpenAI = mod.default || mod;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function generateMirVignette(context) {
  const client = getClient();

  if (!client) {
    return `STUB MIR:
    Paciente ${context.sex}, ${context.age} años. Motivo de consulta: ${context.evidence?.map(e => e.id).join(", ")}.
    (Activa OPENAI_API_KEY para generar esto de verdad).`;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const prompt = `
  Eres un médico y profesor del MIR. 
  Genera una viñeta estilo MIR (en español) basada en este JSON.
  No des la respuesta, solo el caso clínico y 4 opciones A/B/C/D + opción "Blanco".
  JSON:
  ${JSON.stringify(context, null, 2)}
  `;

  const resp = await client.responses.create({
    model,
    input: prompt,
  });

  return resp.output_text || "";
}

module.exports = { generateMirVignette };
