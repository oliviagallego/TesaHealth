const express = require("express");
const sequelize = require("../database");
const auth = require("../middleware/auth");
const { requirePatient } = require("../middleware/profiles");
const { newInterviewId, searchSymptom } = require("../utils/infermedicaClient");

const router = express.Router();
const { user: User, patient_profile: PatientProfile } = sequelize.models;

function calcAge(dob) {
  if (!dob) return 30;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return Number.isFinite(age) && age > 0 ? age : 30;
}

function mapSex(patientSex) {
  if (patientSex === "W") return "female";
  if (patientSex === "M") return "male";
  return "female";
}


router.get("/search", auth, requirePatient, async (req, res, next) => {
  try {
    const phrase = String(req.query.phrase || "").trim();
    if (!phrase) return res.status(400).json({ error: "phrase is required" });

    const u = await User.findByPk(req.user.userId);
    const p = await PatientProfile.findOne({ where: { userId: u.id } });

    const ageValue = calcAge(u?.dob);
    const sex = mapSex(p?.sex);

    const interviewId = newInterviewId();
    const out = await searchSymptom({ phrase, ageValue, sex, interviewId });

    res.json(out);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
