module.exports = (sequelize, DataTypes) => {
  const Repo = sequelize.define('Repo', {
    githubId: DataTypes.INTEGER,
    name: DataTypes.STRING,
    owner: DataTypes.STRING,
    description: DataTypes.TEXT,
    language: DataTypes.STRING,
    stargazersCount: DataTypes.INTEGER,
    topics: DataTypes.ARRAY(DataTypes.STRING),
    customTags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    starredAt: DataTypes.DATE,
    isFollowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  });

  Repo.associate = function(models) {
    Repo.belongsTo(models.User);
  };

  return Repo;
}; 