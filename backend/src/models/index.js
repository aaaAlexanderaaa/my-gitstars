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
  },
  // Release tracking fields
  latestVersion: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'latest_version'
  },
  currentlyUsedVersion: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'currently_used_version'
  },
  updateAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'update_available'
  },
  hasReleases: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'has_releases'
  },
  releasesLastFetched: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'releases_last_fetched'
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

const Release = sequelize.define('Release', {
  repoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Repos',
      key: 'id'
    }
  },
  githubReleaseId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tagName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: DataTypes.STRING,
  body: DataTypes.TEXT,
  publishedAt: DataTypes.DATE,
  isPrerelease: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDraft: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

// Define relationships
User.hasMany(Repo);
Repo.belongsTo(User);
User.hasMany(SyncStatus);
SyncStatus.belongsTo(User, { 
  foreignKey: 'userId',
  as: 'user'
});

// Release relationships
Repo.hasMany(Release, { foreignKey: 'repoId' });
Release.belongsTo(Repo, { foreignKey: 'repoId' });

module.exports = {
  sequelize,
  User,
  Repo,
  SyncStatus,
  Release
}; 