const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ai_artifact', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    caseId: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: false,
    },

    vignette: { type: DataTypes.TEXT, allowNull: true },
    differentials: { type: DataTypes.TEXT, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true }

  }, {
    underscored: true, updatedAt: false, createdAt: false
  });
};
