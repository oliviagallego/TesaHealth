const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('clinician_profile', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },

    medical_college_reg_no: DataTypes.STRING,
    provincial_college: DataTypes.STRING,
    specialty: DataTypes.STRING,
    mir_year: DataTypes.INTEGER,
    liability_insurance: DataTypes.STRING,

    documents: { type: DataTypes.TEXT, allowNull: true },

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
