'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Repos', 'update_available', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether there is a newer version available than the currently used version'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Repos', 'update_available');
  }
}; 