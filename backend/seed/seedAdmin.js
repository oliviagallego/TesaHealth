module.exports = async function seedAdmin(sequelize) {
  const { user: User, admin_profile: AdminProfile } = sequelize.models;

  const email = ("oliviagallegotoscano2003@gmail.com").toLowerCase().trim();
  const password = "123456789";

  const existing = await User.findOne({ where: { email, last_profile: "admin" } });
  if (existing) return;

  const u = await User.create({
    name: "Olivia",
    surname: "Gallego Toscano",
    email,
    password,
    phone: "+34000000000",
    address: "Seed address",
    dob: "2000-11-27",

    privacy_accepted_at: new Date(),
    consent_data_processing: true,
    consent_push: false,

    last_profile: "admin",
    status: "valid",
    email_verified: true,
    email_verified_at: new Date(),
    onboarding_stage: 5,
  });

  await AdminProfile.create({
    userId: u.id,
    verification_status: "verified",
  });

  console.log(`Seed admin created: ${email} / ${password}`);
};
