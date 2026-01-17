const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require("fs");


const dbPath = path.resolve(__dirname, "tesahealth.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dbPath,
  logging: false,
});

console.log("SQLite storage:", sequelize.options.storage);

const modelDefiners = [
  require('./model/user.model'),
  require('./model/patient_profile.model'),
  require('./model/clinician_profile.model'),
  require('./model/admin_profile.model'),
  require('./model/case.model'),
  require('./model/ai_artifact.model'),
  require('./model/review.model'),
  require('./model/consensus.model'),
  require('./model/logging.model'),
  require('./model/notification.model'),
  require("./model/token.model"),
  require("./model/money.model"),


];

for (const modelDefiner of modelDefiners) {
  modelDefiner(sequelize);
}


const {
  user: User,
  patient_profile: PatientProfile,
  clinician_profile: ClinicianProfile,
  admin_profile: AdminProfile,
  case: Case,
  ai_artifact: AIArtifact,
  review: Review,
  consensus: Consensus,
  logging: Logging,
  notification: Notification,
  user_token: UserToken,
  money: Money,
} = sequelize.models;


User.hasOne(PatientProfile, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
PatientProfile.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(ClinicianProfile, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
ClinicianProfile.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(AdminProfile, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
AdminProfile.belongsTo(User, { foreignKey: 'userId' });


PatientProfile.hasMany(Case, {
  foreignKey: { name: 'patientProfileId', allowNull: false },
  onDelete: 'CASCADE',
});
Case.belongsTo(PatientProfile, { foreignKey: 'patientProfileId' });


Case.hasOne(AIArtifact, {
  foreignKey: "caseId",
  as: "ai_artifact"
});
AIArtifact.belongsTo(Case, {
  foreignKey: "caseId"
});

Case.hasMany(Review, { as: "reviews", foreignKey: "caseId" });
Review.belongsTo(Case, { foreignKey: "caseId" });

ClinicianProfile.hasMany(Review, {
  foreignKey: { name: 'clinicianProfileId', allowNull: false },
  onDelete: 'CASCADE',
});
Review.belongsTo(ClinicianProfile, { foreignKey: 'clinicianProfileId' });

Case.hasOne(Consensus, {
  foreignKey: "caseId",
  as: "consensus"
});
Consensus.belongsTo(Case, {
  foreignKey: "caseId"
});

AIArtifact.hasOne(Consensus, {
  foreignKey: { name: 'aiArtifactId', allowNull: false },
  onDelete: 'CASCADE',
});
Consensus.belongsTo(AIArtifact, { foreignKey: 'aiArtifactId' });

AIArtifact.hasMany(Review, {
  foreignKey: { name: 'aiArtifactId', allowNull: false },
  onDelete: 'CASCADE',
});
Review.belongsTo(AIArtifact, { foreignKey: 'aiArtifactId' });


User.hasMany(Logging, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
Logging.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
Notification.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UserToken, { foreignKey: { name: "userId", allowNull: false }, onDelete: "CASCADE" });
UserToken.belongsTo(User, { foreignKey: "userId" });

ClinicianProfile.hasMany(Money, {
  foreignKey: { name: "clinicianProfileId", allowNull: false },
  onDelete: "CASCADE",
});
Money.belongsTo(ClinicianProfile, { foreignKey: "clinicianProfileId" });
Review.hasMany(Money, {
  foreignKey: { name: "reviewId", allowNull: true },
  onDelete: "SET NULL",
});
Money.belongsTo(Review, { foreignKey: "reviewId" });

Case.hasMany(Money, {
  foreignKey: { name: "caseId", allowNull: true },
  onDelete: "SET NULL",
});
Money.belongsTo(Case, { foreignKey: "caseId" });


module.exports = sequelize;
