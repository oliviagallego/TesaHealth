const express = require("express");
const auth = require("../middleware/auth");
const { geocodeSpainCached, hospitalsCached } = require("../utils/geoService");

const router = express.Router();


router.get("/ping", (req, res) => res.json({ ok: true, where: "geo router" }));

router.get("/geocode", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing q" });

    const r = await geocodeSpainCached(q);
    if (!r) return res.status(404).json({ error: "Address not found" });

    res.json({ ok: true, ...r });
  } catch (e) {
    console.error("[GEO] geocode failed:", e);
    res.status(502).json({ error: "Geocode failed", detail: String(e?.message || e) });
  }
});

router.get("/hospitals", auth, async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radiusKm = Number(req.query.radiusKm || 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Missing/invalid lat/lon" });
    }

    const out = await hospitalsCached({ lat, lon, radiusKm });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (String(e.message) === "RATE_LIMIT") return res.status(429).json({ error: "RATE_LIMIT" });
    console.error("[GEO] hospitals failed:", e);
    res.status(502).json({ error: "Overpass failed", detail: String(e?.message || e) });
  }
});

module.exports = router;
