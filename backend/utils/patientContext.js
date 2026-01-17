const express = require("express");
const sequelize = require("../database");
const auth = require("../middleware/auth");
const { requirePatient } = require("../middleware/profiles");

const router = express.Router();
const { user: User, patient_profile: PatientProfile } = sequelize.models;


router.get("/profile", auth, requirePatient, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId, {
      attributes: ["id", "name", "surname", "email", "phone", "address", "dob"],
    });

    if (!u) return res.status(404).json({ error: "User not found" });

    let p = await PatientProfile.findOne({ where: { userId: u.id } });
    if (!p) p = await PatientProfile.create({ userId: u.id });

    return res.json({ user: u, patient: p });
  } catch (e) {
    next(e);
  }
});


router.put("/profile", auth, requirePatient, async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { user = {}, patient = {} } = req.body || {};

    const u = await User.findByPk(req.user.userId, { transaction: t });
    if (!u) { await t.rollback(); return res.status(404).json({ error: "User not found" }); }

    let p = await PatientProfile.findOne({ where: { userId: u.id }, transaction: t });
    if (!p) p = await PatientProfile.create({ userId: u.id }, { transaction: t });

    await u.update(
      {
        name: user.name ?? u.name,
        surname: user.surname ?? u.surname,
        phone: user.phone ?? u.phone,
        address: user.address ?? u.address,
        dob: user.dob ?? u.dob,
      },
      { transaction: t }
    );

    await p.update(
      {
        sex: patient.sex ?? p.sex,
        pregnant: patient.pregnant ?? p.pregnant,
        height: patient.height ?? p.height,
        weight: patient.weight ?? p.weight,
        smoking: patient.smoking ?? p.smoking,
        high_blood_pressure: patient.high_blood_pressure ?? p.high_blood_pressure,
        diabetes: patient.diabetes ?? p.diabetes,
        chronic_condition: patient.chronic_condition ?? p.chronic_condition,
        prior_surgery: patient.prior_surgery ?? p.prior_surgery,
        allergies: patient.allergies ?? p.allergies,
        medications: patient.medications ?? p.medications,
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

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

function buildPatientContext({ user, patientProfile, evidence }) {
  return {
    sex: mapSex(patientProfile?.sex),
    age: calcAge(user?.dob),
    evidence: Array.isArray(evidence) ? evidence : [],

    pregnant: patientProfile?.pregnant ?? null,
    height: patientProfile?.height ?? null,
    weight: patientProfile?.weight ?? null,
    smoking: patientProfile?.smoking ?? null,
    high_blood_pressure: patientProfile?.high_blood_pressure ?? null,
    diabetes: patientProfile?.diabetes ?? null,
    chronic_condition: patientProfile?.chronic_condition ?? null,
    prior_surgery: patientProfile?.prior_surgery ?? null,
    allergies: patientProfile?.allergies ?? null,
    medications: patientProfile?.medications ?? null,
  };
}

module.exports = { buildPatientContext, calcAge, mapSex };