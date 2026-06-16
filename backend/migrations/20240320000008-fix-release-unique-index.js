'use strict';

async function removeUniqueIndex(queryInterface, tableName, fields) {
  const indexes = await queryInterface.showIndex(tableName);
  const index = indexes.find(candidate => {
    const indexFields = candidate.fields.map(field => field.attribute || field.name);
    return candidate.unique &&
      indexFields.length === fields.length &&
      fields.every((field, index) => indexFields[index] === field);
  });

  if (index) {
    await queryInterface.removeIndex(tableName, index.name);
  }
}

async function addUniqueIndexIfMissing(queryInterface, tableName, fields, name) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(candidate => {
    const indexFields = candidate.fields.map(field => field.attribute || field.name);
    return candidate.unique &&
      indexFields.length === fields.length &&
      fields.every((field, index) => indexFields[index] === field);
  });

  if (!exists) {
    await queryInterface.addIndex(tableName, fields, { name, unique: true });
  }
}

module.exports = {
  up: async (queryInterface) => {
    await removeUniqueIndex(queryInterface, 'Releases', ['repoId', 'tagName']);
    await addUniqueIndexIfMissing(
      queryInterface,
      'Releases',
      ['repoId', 'githubReleaseId'],
      'releases_repo_id_github_release_id_unique'
    );
  },

  down: async (queryInterface) => {
    await removeUniqueIndex(queryInterface, 'Releases', ['repoId', 'githubReleaseId']);
    await addUniqueIndexIfMissing(
      queryInterface,
      'Releases',
      ['repoId', 'tagName'],
      'releases_repo_id_tag_name_unique'
    );
  }
};
