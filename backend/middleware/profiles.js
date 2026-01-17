const sequelize = require("../database");

async function requireUserConsents(req) {
  const { user: User } = sequelize.models;
  const u = await User.findByPk(req.user.userId);
  if (!u) return { ok: false, status: 401, error: "User not found" };
  const ok = !!u.privacy_accepted_at && !!u.consent_data_processing;
  if (!ok) return { ok: false, status: 403, error: "Privacy/data consents required" };
  if (u.status !== "valid") {
    return { ok: false, status: 403, error: "Account disabled" };
  }
  return { ok: true, user: u };
}

const requirePatient = async (req, res, next) => {
  const { patient_profile: PatientProfile } = sequelize.models;

  const c = await requireUserConsents(req);
  if (!c.ok) return res.status(c.status).json({ error: c.error });

  let p = await PatientProfile.findOne({ where: { userId: req.user.userId } });
  if (!p) p = await PatientProfile.create({ userId: req.user.userId });

  req.patientProfile = p;
  req.dbUser = c.user;
  next();
};

const requireClinicianVerified = async (req, res, next) => {
  const { clinician_profile: ClinicianProfile } = sequelize.models;
  const c = await requireUserConsents(req);
  if (!c.ok) return res.status(c.status).json({ error: c.error });

  const cp = await ClinicianProfile.findOne({ where: { userId: req.user.userId } });
  if (!cp) return res.status(403).json({ error: "Clinician profile required" });
  if (cp.verification_status !== "verified") return res.status(403).json({ error: "Clinician not verified" });

  req.clinicianProfile = cp;
  req.dbUser = c.user;
  next();
};

const requireClinician = async (req, res, next) => {
  const { clinician_profile: ClinicianProfile } = sequelize.models;

  const c = await requireUserConsents(req);
  if (!c.ok) return res.status(c.status).json({ error: c.error });

  let cp = await ClinicianProfile.findOne({ where: { userId: req.user.userId } });
  if (!cp) cp = await ClinicianProfile.create({ userId: req.user.userId });

  req.clinicianProfile = cp;
  req.dbUser = c.user;
  next();
};


const requireAdminVerified = async (req, res, next) => {
  const { admin_profile: AdminProfile } = sequelize.models;
  const c = await requireUserConsents(req);
  if (!c.ok) return res.status(c.status).json({ error: c.error });

  const a = await AdminProfile.findOne({ where: { userId: req.user.userId } });
  if (!a) return res.status(403).json({ error: "Admin profile required" });
  if (a.verification_status !== "verified") return res.status(403).json({ error: "Admin not verified" });

  req.adminProfile = a;
  req.dbUser = c.user;
  next();
};

const requireAdmin = async (req, res, next) => {
  const { admin_profile: AdminProfile } = sequelize.models;

  const c = await requireUserConsents(req);
  if (!c.ok) return res.status(c.status).json({ error: c.error });

  let a = await AdminProfile.findOne({ where: { userId: req.user.userId } });
  if (!a) a = await AdminProfile.create({ userId: req.user.userId });

  req.adminProfile = a;
  req.dbUser = c.user;
  next();
};


module.exports = { requirePatient, requireClinicianVerified, requireClinician, requireAdminVerified, requireAdmin };
