const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const User = sequelize.define('user', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    },
    last_profile: {
      type: DataTypes.ENUM('patient', 'clinician', 'admin'),
      allowNull: true
    },

    name: { type: DataTypes.STRING, allowNull: true },
    surname: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, validate: { isEmail: true } },
    password: { type: DataTypes.STRING, allowNull: true },

    phone: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    dob: { type: DataTypes.DATEONLY, allowNull: true },

    privacy_accepted_at: { type: DataTypes.DATE, allowNull: true },
    consent_data_processing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    email_verified: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    email_verified_at: { type: DataTypes.DATE, allowNull: true },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },

    status: { type: DataTypes.ENUM('pending', 'valid', 'invalid'), defaultValue: 'pending', allowNull: false },

    onboarding_stage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

  }, {
    underscored: true, updatedAt: false, createdAt: false, indexes: [{ unique: true, fields: ["email", "last_profile"] }],
    hooks: {
      beforeSave: async (u) => {
        if (u.changed("email")) u.email = String(u.email).trim().toLowerCase();
        if (u.changed("password")) u.password = await bcrypt.hash(u.password, 10);
        const stage = Number(u.onboarding_stage || 1);
        if (stage >= 4) {
          if (!u.name || !u.surname || !u.address || !u.dob || !u.phone) {
            throw new Error("Your user profile must not be missing name/surname/address/dob/phone");
          }
        }
      },

    },
  });

  return User;
};