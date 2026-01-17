const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('patient_profile', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },

    sex: { type: DataTypes.ENUM('M', 'W'), allowNull: true },
    height: DataTypes.FLOAT,
    weight: DataTypes.FLOAT,
    pregnant: { type: DataTypes.BOOLEAN, defaultValue: false },

    smoking: { type: DataTypes.ENUM('yes', 'no', 'na'), defaultValue: 'na' },
    high_blood_pressure: { type: DataTypes.ENUM('yes', 'no', 'na'), defaultValue: 'na' },
    diabetes: { type: DataTypes.ENUM('yes', 'no', 'na'), defaultValue: 'na' },

    chronic_condition: DataTypes.TEXT,
    prior_surgery: DataTypes.TEXT,
    allergies: DataTypes.TEXT,
    medications: DataTypes.TEXT,

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, { underscored: true, updatedAt: false, createdAt: false });
};
