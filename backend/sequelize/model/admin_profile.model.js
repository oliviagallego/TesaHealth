const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('admin_profile', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true, 
      allowNull: false 
    },
    userId: {                       
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,               
    },
    verification_status: {
      type: DataTypes.ENUM('pending','verified','denied'),
      defaultValue: 'pending', allowNull: false
    }
  });
};
