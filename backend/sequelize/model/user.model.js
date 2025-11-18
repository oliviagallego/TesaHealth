const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const User = sequelize.define('user', {
    id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        autoIncrement: true, 
        primaryKey: true },
    role: {
      type: DataTypes.ENUM('patient','clinician','admin'),
      allowNull: false,
      defaultValue: 'patient' 
    },
    name:  { type: DataTypes.STRING, allowNull:false },
    surname:  { type: DataTypes.STRING, allowNull:false },
    email: { type: DataTypes.STRING, unique: true, validate:{ isEmail:true }, allowNull:false },
    password: { type: DataTypes.STRING, allowNull:false },
    phone:  { type: DataTypes.STRING, allowNull:false },
    address:  { type: DataTypes.STRING, allowNull:false },
    dob: {  type: DataTypes.DATEONLY, allowNull:false },
    status: {type: DataTypes.ENUM('pending','valid','invalid'), defaultValue: 'pending', allowNull: false }
  }, {
    hooks: {
      beforeSave: async (u) => { 
        if (u.changed('password')) {
            u.password = await bcrypt.hash(u.password, 10); 
        }
     }
    }
  });

  return User;
};