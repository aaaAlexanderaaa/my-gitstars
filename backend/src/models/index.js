const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/database.js');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  {
    ...dbConfig,
    logging: false  // Disable SQL logging for all database operations
  }
);

const User = sequelize.define('User', {
  githubId: {
    type: DataTypes.STRING,
    unique: true
  },
  username: DataTypes.STRING,
  email: DataTypes.STRING,
  avatarUrl: DataTypes.STRING,
  accessToken: DataTypes.STRING
});

const Repo = sequelize.define('Repo', {
  githubId: {
    type: DataTypes.STRING,
    unique: true
  },
  name: DataTypes.STRING,
  fullName: {
    type: DataTypes.STRING,
    field: 'full_name'
  },
  description: DataTypes.TEXT,
  url: DataTypes.STRING,
  customTags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'tags'
  },
  starredAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'starred_at'
  },
  language: DataTypes.STRING,
  owner: DataTypes.STRING,
  topics: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  fork: DataTypes.BOOLEAN,
  forksCount: {
    type: DataTypes.INTEGER,
    field: 'forks_count'
  },
  stargazersCount: {
    type: DataTypes.INTEGER,
    field: 'stargazers_count'
  },
  watchersCount: {
    type: DataTypes.INTEGER,
    field: 'watchers_count'
  },
  defaultBranch: {
    type: DataTypes.STRING,
    field: 'default_branch'
  },
  isTemplate: {
    type: DataTypes.BOOLEAN,
    field: 'is_template'
  },
  archived: DataTypes.BOOLEAN,
  visibility: DataTypes.STRING,
  pushedAt: {
    type: DataTypes.DATE,
    field: 'pushed_at'
  },
  githubCreatedAt: {
    type: DataTypes.DATE,
    field: 'github_created_at'
  },
  githubUpdatedAt: {
    type: DataTypes.DATE,
    field: 'github_updated_at'
  }
});

const SyncStatus = sequelize.define('SyncStatus', {
  userId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  progress: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  error: DataTypes.TEXT
}, {
  tableName: 'SyncStatuses',
  underscored: true
});

// Define relationships
User.hasMany(Repo);
Repo.belongsTo(User);
User.hasMany(SyncStatus);
SyncStatus.belongsTo(User, { 
  foreignKey: 'userId',
  as: 'user'
});

module.exports = {
  sequelize,
  User,
  Repo,
  SyncStatus
}; 