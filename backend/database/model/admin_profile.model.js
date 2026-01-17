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
      type: DataTypes.ENUM("pending", "missing", "needs_fix", "verified", "denied"),
      allowNull: false,
      defaultValue: "pending",
    },
    verification_note: { type: DataTypes.TEXT, allowNull: true },
    verification_fix_fields: { type: DataTypes.TEXT, allowNull: true },
    verification_updated_at: { type: DataTypes.DATE, allowNull: true },



    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { underscored: true, updatedAt: false, createdAt: false });
};
