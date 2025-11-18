const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('logging', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    entity: DataTypes.STRING,  
    action: DataTypes.STRING, 
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, { timestamps: false });
};
