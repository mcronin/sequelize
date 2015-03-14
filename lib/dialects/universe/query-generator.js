'use strict';

var Utils = require('../../utils')
  , DataTypes = require('../../data-types')
  , util = require('util')
  , Promise = require('../../promise');

module.exports = (function() {
  var QueryGenerator = {
    dialect: 'universe',

    createSchema: function(schema) {
      return 'CREATE SCHEMA ' + schema + ';';
    },

    showSchemasQuery: function() {
      return 'SELECT SCHEMA_NAME as schema_name FROM CATALOG.UV_SCHEMA;';
    },

    showTablesQuery: function() {
      return JSON.stringify({ cmd: 'conn.getMetadata().getTables(...)' });
    },

    describeTableQuery: function(tableName, schema, schemaDelimiter) {
      return JSON.stringify({ cmd: 'conn.getMetadata().getColumns(...)', tableName: tableName, schema: schema });
    },

    quoteIdentifier: function(identifier, force) {
      return identifier;
    },
    
    /**
     * Generates an SQL query that returns all foreign keys of a table.
     *
     * @param  {String} tableName  The name of the table.
     * @param  {String} schemaName The name of the schema.
     * @return {String}            The generated sql query.
     */
    getForeignKeysQuery: function(tableName, schemaName) {
      return 'SELECT FK_NAME as constraint_name FROM CATALOG.UV_FKEY where PK_TABLE=\'' + tableName + '\' AND PK_SCHEMA=\'' + schemaName + '\' AND FK_TABLE IS NOT NULL;';
    },
  };
    
  return Utils._.extend(Utils._.clone(require('../abstract/query-generator')), QueryGenerator);
})();
