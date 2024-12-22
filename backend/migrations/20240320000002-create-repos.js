'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Repos', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      githubId: {
        type: Sequelize.STRING,
        unique: true
      },
      name: Sequelize.STRING,
      full_name: Sequelize.STRING,
      owner: Sequelize.STRING,
      description: Sequelize.TEXT,
      url: Sequelize.STRING,
      language: Sequelize.STRING,
      stargazersCount: {
        type: Sequelize.INTEGER,
        field: 'stargazers_count'
      },
      topics: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      customTags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        field: 'tags'
      },
      starredAt: {
        type: Sequelize.DATE,
        field: 'starred_at'
      },
      fork: Sequelize.BOOLEAN,
      forksCount: {
        type: Sequelize.INTEGER,
        field: 'forks_count'
      },
      watchersCount: {
        type: Sequelize.INTEGER,
        field: 'watchers_count'
      },
      defaultBranch: {
        type: Sequelize.STRING,
        field: 'default_branch'
      },
      isTemplate: {
        type: Sequelize.BOOLEAN,
        field: 'is_template'
      },
      archived: Sequelize.BOOLEAN,
      visibility: Sequelize.STRING,
      pushedAt: {
        type: Sequelize.DATE,
        field: 'pushed_at'
      },
      githubCreatedAt: {
        type: Sequelize.DATE,
        field: 'github_created_at'
      },
      githubUpdatedAt: {
        type: Sequelize.DATE,
        field: 'github_updated_at'
      },
      isFollowed: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      UserId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Repos');
  }
}; 