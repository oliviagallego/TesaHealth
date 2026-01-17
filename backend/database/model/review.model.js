const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('review', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    aiArtifactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clinicianProfileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    answer: {
      type: DataTypes.ENUM("A", "B", "C", "D", "E"),
      allowNull: false,
    },

    urgency: {
      type: DataTypes.ENUM('seek_now', 'within_24_48h', 'within_72h', 'self_care'),
      allowNull: false
    },

    mir_question: { type: DataTypes.TEXT, allowNull: true },


    solution: { type: DataTypes.TEXT, allowNull: true },

    submitted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

  }, {
    underscored: true, updatedAt: false, createdAt: false, indexes: [
      { unique: true, fields: ['case_id', 'clinician_profile_id'] }
    ]
  });
};
