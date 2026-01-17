function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];

  return evidence
    .filter((e) => e && typeof e.id === "string" && typeof e.choice_id === "string")
    .map((e) => ({
      id: e.id,
      choice_id: e.choice_id,
      ...(typeof e.name === "string" && e.name.trim() ? { name: e.name.trim() } : {}),
    }));
}

function upsertEvidence(existing, incoming) {
  const map = new Map();

  for (const e of existing || []) {
    if (!e?.id) continue;
    map.set(e.id, { choice_id: e.choice_id, name: e.name });
  }

  for (const e of incoming || []) {
    if (!e?.id) continue;
    const prev = map.get(e.id);
    map.set(e.id, {
      choice_id: e.choice_id,
      name: (typeof e.name === "string" && e.name.trim()) ? e.name.trim() : prev?.name,
    });
  }

  return Array.from(map.entries()).map(([id, v]) => ({
    id,
    choice_id: v.choice_id,
    ...(v.name ? { name: v.name } : {}),
  }));
}

module.exports = { normalizeEvidence, upsertEvidence };
