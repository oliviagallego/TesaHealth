const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SecurityCode = sequelize.define("security_code", {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    timestamps: false
  });

  return SecurityCode;
};
