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

    return res.json({ user: u, patient: req.patientProfile });
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

    const commonUpdate = {
      name: user.name ?? u.name,
      surname: user.surname ?? u.surname,
      phone: user.phone ?? u.phone,
      address: user.address ?? u.address,
      dob: user.dob ?? u.dob,
    };

    await User.update(commonUpdate, {
      where: { email: u.email },
      transaction: t
    });

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

module.exports = router;
