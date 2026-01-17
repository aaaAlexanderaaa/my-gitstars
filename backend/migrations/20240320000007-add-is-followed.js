'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check which columns exist to handle both fresh installs and existing databases
    const tableInfo = await queryInterface.describeTable('Repos');
    const hasOldColumn = 'isFollowed' in tableInfo;
    const hasNewColumn = 'is_followed' in tableInfo;

    if (hasOldColumn && !hasNewColumn) {
      // Rename existing camelCase column to snake_case (preserves data)
      await queryInterface.renameColumn('Repos', 'isFollowed', 'is_followed');
    } else if (!hasOldColumn && !hasNewColumn) {
      // Fresh install: add the column
      await queryInterface.addColumn('Repos', 'is_followed', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
    // If hasNewColumn is true, column already exists correctly - nothing to do
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Repos');
    if ('is_followed' in tableInfo) {
      // Revert to original column name
      await queryInterface.renameColumn('Repos', 'is_followed', 'isFollowed');
    }
  }
};
