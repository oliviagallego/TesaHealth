const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('review', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    mir_question: DataTypes.TEXT,
    
    answer: DataTypes.TEXT,
    urgency: {
      type: DataTypes.ENUM('seek_now','within_24_48h','within_72h','self_care'),
      allowNull: true
    },
    solution: DataTypes.TEXT,

    aiArtifactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    submitted_at: { 
      type: DataTypes.DATE, 
      defaultValue: DataTypes.NOW 
    },

    clinicianProfileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    }

  }, { underscored: true, updatedAt: false, createdAt: false });
};
