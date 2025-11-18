const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('consensus', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    final_diagnosis: DataTypes.TEXT,

    final_urgency: {
      type: DataTypes.ENUM('seek_now','within_24_48h','within_72h','self_care'),
      allowNull: false
    },

    closed_at: DataTypes.DATE,

    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    aiArtifactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

  }, { underscored: true, updatedAt: false, createdAt: false });
};
