const express = require("express");
const sequelize = require("../database");

const router = express.Router();

router.get("/stats", async (req, res, next) => {
  try {
    const {
      user: User,
      patient_profile: PatientProfile,
      clinician_profile: ClinicianProfile,
      admin_profile: AdminProfile,
      case: Case,
    } = sequelize.models;

    const [totalUsers, totalPatients, totalClinicians, verifiedClinicians, totalAdmins, verifiedAdmins, totalCases, closedCases] =
      await Promise.all([
        User.count(),
        PatientProfile.count(),
        ClinicianProfile.count(),
        ClinicianProfile.count({ where: { verification_status: "verified" } }),
        AdminProfile.count(),
        AdminProfile.count({ where: { verification_status: "verified" } }),
        Case.count(),
        Case.count({ where: { status: "closed" } }),
      ]);

    res.json({
      totalUsers,
      totalPatients,
      totalClinicians,
      verifiedClinicians,
      totalAdmins,
      verifiedAdmins,
      totalCases,
      closedCases,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
