const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('consensus', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    aiArtifactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    final_answer: { type: DataTypes.ENUM("A", "B", "C", "D", "E"), allowNull: false },
    final_diagnosis: { type: DataTypes.TEXT, allowNull: true },

    final_urgency: {
      type: DataTypes.ENUM('seek_now', 'within_24_48h', 'within_72h', 'self_care'),
      allowNull: false
    },

    patient_summary: { type: DataTypes.TEXT, allowNull: true },
    patient_explanation: { type: DataTypes.TEXT, allowNull: true },

    total_reviews: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    answer_stats: { type: DataTypes.TEXT, allowNull: true },
    urgency_stats: { type: DataTypes.TEXT, allowNull: true },

    clinician_notes: { type: DataTypes.TEXT, allowNull: true },

    closed_at: DataTypes.DATE,

  }, { underscored: true, updatedAt: false, createdAt: false });
};
