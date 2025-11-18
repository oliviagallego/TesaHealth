const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('case', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    symptoms: DataTypes.TEXT,         
    intensity: DataTypes.INTEGER,    
    fever: DataTypes.FLOAT,         
    extra_answers: DataTypes.TEXT,  
    status: { type: DataTypes.ENUM('open','closed'), defaultValue: 'open' },
    submitted_at: DataTypes.DATE,
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, { underscored: true, updatedAt: false, createdAt: false });
};
