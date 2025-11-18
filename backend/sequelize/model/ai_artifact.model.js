const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ai_artifact', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    caseId: { 
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vignette: DataTypes.TEXT,
    differentials: DataTypes.TEXT,
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    closed_at: DataTypes.DATE
  }, { underscored: true, updatedAt: false, createdAt: false });
};
