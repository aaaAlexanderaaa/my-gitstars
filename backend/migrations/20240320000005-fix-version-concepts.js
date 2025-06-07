'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Remove the old columns
    await queryInterface.removeColumn('Repos', 'selected_version');
    await queryInterface.removeColumn('Repos', 'latest_at_addition');

    // Add the correct columns with proper concepts
    await queryInterface.addColumn('Repos', 'latest_version', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Always updated to the most recent version during sync (unmodifiable by user)'
    });

    await queryInterface.addColumn('Repos', 'currently_used_version', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'User-selectable version, defaults to latest when first added, persists user choice'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the new columns
    await queryInterface.removeColumn('Repos', 'latest_version');
    await queryInterface.removeColumn('Repos', 'currently_used_version');

    // Restore the old columns
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
  }
}; 