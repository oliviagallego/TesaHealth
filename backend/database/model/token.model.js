const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("user_token", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },

    type: { type: DataTypes.STRING, allowNull: false },

    token_hash: { type: DataTypes.STRING, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }

  }, { underscored: true, updatedAt: false, createdAt: false });
};
