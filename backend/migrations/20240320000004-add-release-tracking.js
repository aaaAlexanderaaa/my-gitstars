'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create Releases table to store release information for repositories
    await queryInterface.createTable('Releases', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      repoId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Repos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      githubReleaseId: {
        type: Sequelize.STRING,
        allowNull: false
      },
      tagName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING
      },
      body: {
        type: Sequelize.TEXT
      },
      publishedAt: {
        type: Sequelize.DATE
      },
      isPrerelease: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      isDraft: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    // Add indexes for better query performance
    await queryInterface.addIndex('Releases', ['repoId']);
    await queryInterface.addIndex('Releases', ['repoId', 'tagName'], {
      unique: true
    });

    // Add release tracking fields to Repos table
    await queryInterface.addColumn('Repos', 'selected_version', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'User-selected version tag. Null means using latest_at_addition'
    });

    await queryInterface.addColumn('Repos', 'latest_at_addition', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Latest version tag available when repo was first added'
    });

    await queryInterface.addColumn('Repos', 'has_releases', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: 'Indicates if the repository has any releases'
    });

    await queryInterface.addColumn('Repos', 'releases_last_fetched', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp of last release data fetch'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove added columns from Repos table
    await queryInterface.removeColumn('Repos', 'selected_version');
    await queryInterface.removeColumn('Repos', 'latest_at_addition');
    await queryInterface.removeColumn('Repos', 'has_releases');
    await queryInterface.removeColumn('Repos', 'releases_last_fetched');

    // Drop Releases table
    await queryInterface.dropTable('Releases');
  }
}; 