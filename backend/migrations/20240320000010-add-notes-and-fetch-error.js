'use strict';

/**
 * `releases_fetch_error` lets a failed release fetch be recorded without pretending
 * the fetch succeeded (previously `releases_last_fetched` was stamped on errors too,
 * which cached the failure for a full day).
 *
 * `notes` backs the per-repository note feature.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('Repos');

    if (!('releases_fetch_error' in table)) {
      await queryInterface.addColumn('Repos', 'releases_fetch_error', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Message from the last failed release fetch, cleared on success'
      });
    }

    if (!('notes' in table)) {
      await queryInterface.addColumn('Repos', 'notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Free-form user note (markdown) for this repository'
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('Repos');
    if ('notes' in table) await queryInterface.removeColumn('Repos', 'notes');
    if ('releases_fetch_error' in table) await queryInterface.removeColumn('Repos', 'releases_fetch_error');
  }
};
