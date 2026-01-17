let OpenAI = null;

function getClient() {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!OpenAI) {
        const mod = require("openai");
        OpenAI = mod.default || mod;
    }
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalizeLabel(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const EXTRA_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
        options: {
            type: "array",
            minItems: 0,
            maxItems: 4,
            items: { type: "string", minLength: 2, maxLength: 80 }
        }
    }
};

async function generateExtraDifferentials({ payloadContext, existingLabels, needed }) {
    const client = getClient();
    if (!client || !needed || needed <= 0) return [];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const existing = (existingLabels || []).map(String).filter(Boolean);

    const developer = `You are a clinician writing plausible DIFFERENTIAL DIAGNOSES for an educational single-best-answer MCQ.
    Task: propose exactly ${needed} additional diagnosis labels to complete the options list.
    Rules:
    - Output MUST be strict JSON with key "options": [string...]
    - Each option MUST be a diagnosis label (short, 2–8 words), NOT a sentence.
    - Must be clinically plausible given the case context.
    - Must NOT duplicate or paraphrase any existing labels provided.
    - Avoid overly generic labels like "Non-specific condition".
    - No drug names, no patient instructions, no PII.`;

    const input = {
        context: payloadContext,
        existing_labels: existing,
        needed
    };

    try {
        const resp = await client.responses.create({
            model,
            input: [
                { role: "developer", content: developer },
                { role: "user", content: `Generate extra differentials from this JSON:\n${JSON.stringify(input, null, 2)}` }
            ],
            text: { format: { type: "json_schema", name: "extra_differentials", strict: true, schema: EXTRA_SCHEMA } }
        });

        const parsed = JSON.parse(resp.output_text || "{}");
        const raw = Array.isArray(parsed.options) ? parsed.options : [];

        const seen = new Set(existing.map(normalizeLabel));
        const out = [];

        for (const r of raw) {
            const label = String(r || "").trim();
            const k = normalizeLabel(label);
            if (!label) continue;
            if (seen.has(k)) continue;

            const bad = ["unknown", "unclear", "non-specific", "other diagnosis", "not listed", "insufficient data"];
            if (bad.some(w => k.includes(w))) continue;

            seen.add(k);
            out.push(label);
            if (out.length >= needed) break;
        }


        return out;
    } catch (e) {
        console.error("[OPENAI] generateExtraDifferentials failed:", e?.status, e?.code, e?.message);
        return [];
    }
}

module.exports = { generateExtraDifferentials };
