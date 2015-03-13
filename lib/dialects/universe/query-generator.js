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
      return 'SELECT TABLE_NAME AS tableName, TABLE_SCHEMA AS schema FROM CATALOG.UV_TABLES WHERE NOT TABLE_SCHEMA=\'CATALOG\';';
    },

    describeTableQuery: function(tableName, schema, schemaDelimiter) {
      
      return 'SELECT COLUMN_NAME AS Field, ' + 'DATA_TYPE as Type, ' +
        'NULLABLE AS Null, ' + 'COL_DEFAULT AS Default ' +
        'FROM CATALOG.UV_COLUMNS '  +
        'WHERE TABLE_SCHEMA=\'' + schema + '\' AND ' +
        'TABLE_NAME=\'' + tableName + '\';';
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
