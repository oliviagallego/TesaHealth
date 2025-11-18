const {Sequelize} = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', '..', 'ops', 'db', 'tesahealth.db'),
  logging: false,
});


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
];

for (const modelDefiner of modelDefiners){
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
  foreignKey: { name: 'caseId', allowNull: false },
  onDelete: 'CASCADE',
});
AIArtifact.belongsTo(Case, { foreignKey: 'caseId' });


ClinicianProfile.hasMany(Review, {
  foreignKey: { name: 'clinicianProfileId', allowNull: false },
  onDelete: 'CASCADE',
});
Review.belongsTo(ClinicianProfile, { foreignKey: 'clinicianProfileId' });

Case.hasMany(Review, {
  foreignKey: { name: 'caseId', allowNull: false },
  onDelete: 'CASCADE',
});
Review.belongsTo(Case, { foreignKey: 'caseId' });


Case.hasOne(Consensus, {
  foreignKey: { name: 'caseId', allowNull: false },
  onDelete: 'CASCADE',
});
Consensus.belongsTo(Case, { foreignKey: 'caseId' });

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

(async () => {
  await sequelize.sync({ alter: true }); 
})();

module.exports = sequelize;
