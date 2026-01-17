const express = require('express');
const sequelize = require("../database");
const auth = require('../middleware/auth');

const router = express.Router();

const {
  user: User,
  patient_profile: PatientProfile,
  clinician_profile: ClinicianProfile,
  admin_profile: AdminProfile,
} = sequelize.models;

router.get('/me', auth, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const [p, c, a] = await Promise.all([
      PatientProfile.findOne({ where: { userId: u.id } }),
      ClinicianProfile.findOne({ where: { userId: u.id } }),
      AdminProfile.findOne({ where: { userId: u.id } }),
    ]);

    res.json({
      user: {
        id: u.id,
        name: u.name,
        surname: u.surname,
        email: u.email,
        last_profile: u.last_profile || null,
        consents: {
          privacy_accepted_at: u.privacy_accepted_at,
          consent_push: u.consent_push,
          consent_data_processing: u.consent_data_processing,
        },
        email_verified: u.email_verified,
      },
      profiles: {
        patient: p || null,
        clinician: c || null,
        admin: a || null,
      },
    });
  } catch (e) { next(e); }
});

router.get("/verification-status", auth, async (req, res, next) => {
  try {
    const u = await User.findByPk(req.user.userId);
    const c = await ClinicianProfile.findOne({ where: { userId: u.id } });
    const a = await AdminProfile.findOne({ where: { userId: u.id } });
    res.json({
      clinician: c ? c.verification_status : null,
      admin: a ? a.verification_status : null
    });
  } catch (e) { next(e); }
});


router.post('/patient', auth, async (req, res, next) => {
  try {
    const exists = await PatientProfile.findOne({ where: { userId: req.user.userId } });
    if (exists) return res.status(409).json({ error: 'Patient profile already exists' });

    const p = await PatientProfile.create({ userId: req.user.userId, ...req.body });
    res.status(201).json(p);
  } catch (e) { next(e); }
});

router.put('/patient', auth, async (req, res, next) => {
  try {
    const p = await PatientProfile.findOne({ where: { userId: req.user.userId } });
    if (!p) return res.status(404).json({ error: 'Patient profile not found' });

    await p.update(req.body);
    res.json(p);
  } catch (e) { next(e); }
});


router.post('/clinician', auth, async (req, res, next) => {
  try {
    const exists = await ClinicianProfile.findOne({ where: { userId: req.user.userId } });
    if (exists) return res.status(409).json({ error: 'Clinician profile already exists' });

    const c = await ClinicianProfile.create({ userId: req.user.userId, ...req.body, verification_status: 'pending' });
    res.status(201).json(c);
  } catch (e) { next(e); }
});

router.put('/clinician', auth, async (req, res, next) => {
  try {
    const c = await ClinicianProfile.findOne({ where: { userId: req.user.userId } });
    if (!c) return res.status(404).json({ error: 'Clinician profile not found' });

    await c.update(req.body);
    res.json(c);
  } catch (e) { next(e); }
});


router.post('/admin', auth, async (req, res, next) => {
  try {
    const exists = await AdminProfile.findOne({ where: { userId: req.user.userId } });
    if (exists) return res.status(409).json({ error: 'Admin profile already exists' });

    const a = await AdminProfile.create({ userId: req.user.userId, verification_status: 'pending' });
    res.status(201).json(a);
  } catch (e) { next(e); }
});

module.exports = router;
