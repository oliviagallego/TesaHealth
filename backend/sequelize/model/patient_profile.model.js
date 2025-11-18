const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('patient_profile', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sex: { type: DataTypes.ENUM('M','W'), allowNull:true },
    height: DataTypes.FLOAT,
    weight: DataTypes.FLOAT,
    pregnant: { type: DataTypes.BOOLEAN, defaultValue: false },
    smoking: { type: DataTypes.ENUM('yes','no','na'), defaultValue: 'na' },
    high_blood_pressure: { type: DataTypes.ENUM('yes','no','na'), defaultValue: 'na' },
    diabetes: { type: DataTypes.ENUM('yes','no','na'), defaultValue: 'na' },
    chronic_condition: DataTypes.TEXT,  
    prior_surgery: DataTypes.TEXT,      
    allergies: DataTypes.TEXT
  });
};
