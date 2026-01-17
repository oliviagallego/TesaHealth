const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("money", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    clinicianProfileId: { type: DataTypes.INTEGER, allowNull: false },
    caseId: { type: DataTypes.INTEGER, allowNull: true },
    reviewId: { type: DataTypes.INTEGER, allowNull: true },

    type: {
      type: DataTypes.ENUM("review_reward", "correct_bonus", "adjustment"),
      allowNull: false
    },

    amount_cents: { type: DataTypes.INTEGER, allowNull: false }, // 1000 = 10€
    currency: { type: DataTypes.STRING, allowNull: false, defaultValue: "EUR" },

    status: {
      type: DataTypes.ENUM("pending", "paid", "void"),
      allowNull: false,
      defaultValue: "pending"
    },

    meta: { type: DataTypes.TEXT, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

  }, {
    underscored: true,
    updatedAt: false,
    createdAt: false,
    indexes: [
      { unique: true, fields: ["clinician_profile_id", "case_id", "type"] }
    ]
  });
};
