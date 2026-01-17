const { DataTypes: DataTypes2 } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('notification', {
    id: { type: DataTypes2.INTEGER, autoIncrement: true, primaryKey: true },

    userId: { type: DataTypes2.INTEGER, allowNull: false },

    type: {
      type: DataTypes2.ENUM(
        'ai_ready',
        'consensus_ready',
        'clinician_verified',
        'clinician_denied',
        'admin_verified',
        'admin_denied',
        'generic'
      ),
      defaultValue: 'generic',
      allowNull: false
    },

    payload: { type: DataTypes2.TEXT, allowNull: true },
    read_at: { type: DataTypes2.DATE, allowNull: true },

    created_at: { type: DataTypes2.DATE, defaultValue: DataTypes2.NOW }
  }, { underscored: true, updatedAt: false, createdAt: false });
};
