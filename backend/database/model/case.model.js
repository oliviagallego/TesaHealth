const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('case', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    patientProfileId: { type: DataTypes.INTEGER, allowNull: false },

    interview_id: { type: DataTypes.STRING, allowNull: true },

    last_question: { type: DataTypes.TEXT, allowNull: true },
    interview_log: { type: DataTypes.TEXT, allowNull: true },
    symptoms: { type: DataTypes.TEXT, allowNull: false },

    status: {
      type: DataTypes.ENUM(
        'in_interview',
        'ai_pending',
        'ai_ready',
        'in_review',
        'consensus_ready',
        'closed'
      ),
      defaultValue: 'in_interview',
      allowNull: false
    },

    submitted_at: { type: DataTypes.DATE, allowNull: true },
    closed_at: { type: DataTypes.DATE, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }

  }, { underscored: true, updatedAt: false, createdAt: false });
};
