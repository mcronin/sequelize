'use strict';

var Utils = require('../../utils')
  , AbstractQuery = require('../abstract/query')
  , uuid = require('node-uuid')
  , sequelizeErrors = require('../../errors.js')
  , async = require('async');

var dataTypes = {};

[
  [-7, 'BIT'],
  [-6, 'TINYINT'],
  [5, 'SMALLINT'],
  [4, 'INTEGER'],
  [-5, 'SMALLINT'],
  [6, 'FLOAT'],
  [7, 'REAL'],
  [8, 'DOUBLE'],
  [2, 'NUMERIC'],
  [3, 'DECIMAL'],
  [1, 'CHAR'],
  [12, 'VARCHAR'],
  [-1, 'LONGVARCHAR'],
  [91, 'DATE'],
  [92, 'TIME'],
  [93, 'TIMESTAMP'],
  [-2, 'BINARY'],
  [-3, 'VARBINARY'],
  [-4, 'LONGVARBINARY'],
  [0, 'NULL'],
  [1111, 'OTHER'],
  [2000, 'JAVA_OBJECT'],
  [2001, 'DISTINCT'],
  [2002, 'STRUCT'],
  [2003, 'ARRAY'],
  [2004, 'BLOB'],
  [2005, 'CLOB'],
  [2006, 'REF'],
  [70, 'DATALINK'],
  [16, 'BOOLEAN'],
  [-8, 'ROWID'],
  [-15, 'NCHAR'],
  [-9, 'NVARCHAR'],
  [-16, 'LONGNVARCHAR'],
  [2001, 'NCLOB'],
  [2009, 'SQLXML'],
].forEach(function(pair) {
  dataTypes[pair[0]] = pair[1];
});

module.exports = (function() {
  var Query = function(connection, sequelize, callee, options) {
    this.connection = connection;
    this.callee = callee;
    this.sequelize = sequelize;
    this.uuid = uuid.v4();
    this.options = Utils._.extend({
      logging: console.log,
      plain: false,
      raw: false
    }, options || {});

    var self = this;
    this.checkLoggingOption();
  };

  Utils.inherit(Query, AbstractQuery);
  
  Query.prototype.run = function(sql) {
    
    var self = this;
    this.sql = sql;
    
    this.sequelize.log('Executing: ' + this.sql, this.options);

    var promise = new Utils.Promise(function(resolve, reject) {
      
      if (self.isShowTablesQuery()) {
        
        async.waterfall([function(callback) {
          self.connection.conn.getMetaData(callback);
        }, function(dbMetaData, callback) {
          var types = self.connection.jdbc.java.newArray('java.lang.String', [ 'TABLE' ]);
          dbMetaData.getTables(null, null, null, types, callback);
        }], function(err, resultset) {
          self.connection.jdbc.processResultSet(err, resultset, function(err, results) {
            if (err) {
              return reject(self.formatError(err));
            }
            resolve(results ? self.formatResults(results) : null);
          });
        });
        
        return;
      }
      
      if (self.isDescribeQuery()) {
        
        sql = JSON.parse(sql);
        
        async.waterfall([function(callback) {
          self.connection.conn.getMetaData(callback);
        }, function(dbMetaData, callback) {
          dbMetaData.getColumns(null, sql.schema, sql.tableName, null, function(err, resultset) {
            callback(err, dbMetaData, resultset);
          });
        }, function(dbMetaData, resultset, callback) {
          self.connection.jdbc.processResultSet(null, resultset, function(err, tableColumns) {
            callback(err, dbMetaData, tableColumns);
          });
        }, function(dbMetaData, tableColumns, callback) {
          dbMetaData.getPrimaryKeys(null, sql.schema, sql.tableName, function(err, resultset) {
            callback(err, tableColumns, resultset);
          });
        }, function(tableColumns, resultset, callback) {
          self.connection.jdbc.processResultSet(null, resultset, function(err, primaryKeys) {
            callback(err, tableColumns, primaryKeys);
          });
        }, function(tableColumns, primaryKeys, callback) {
          self.connection.jdbc.executeQuery('SELECT * FROM CATALOG.UV_COLUMNS WHERE TABLE_SCHEMA=\'' +
              sql.schema + '\' AND TABLE_NAME=\'' + sql.tableName + '\'', function(err, resultset) {
            callback(err, tableColumns, primaryKeys, resultset);
          });
        }], function(err, tableColumns, primaryKeys, columnData) {
          if (err) {
            return reject(self.formatError(err));
          }
          resolve(self.formatResults(tableColumns, primaryKeys, columnData));
        });
        
        return;
      }
      
      if (sql === '') {
        resolve();
      }
      
      if (self.sql.toUpperCase().indexOf('SELECT ') === 0) {
        
        self.connection.jdbc.executeQuery(self.sql, function(err, results) {
          promise.emit('sql', self.sql);
  
          if (err) {
            err.sql = sql;
  
            reject(self.formatError(err));
          } else {
            resolve(self.formatResults(results));
          }
        });
        
      } else {
        
        self.connection.jdbc.executeUpdate(self.sql, function(err, results) {
          promise.emit('sql', self.sql);
  
          if (err) {
            err.sql = sql;
  
            reject(self.formatError(err));
          } else {
            resolve(results);
          }
        });
      }
    });

    return promise;
  };

  /**
   * High level function that handles the results of a query execution.
   *
   *
   * Example:
   *  query.formatResults([
   *    {
   *      id: 1,              // this is from the main table
   *      attr2: 'snafu',     // this is from the main table
   *      Tasks.id: 1,        // this is from the associated table
   *      Tasks.title: 'task' // this is from the associated table
   *    }
   *  ])
   *
   * @param {Array} data - The result of the query execution.
   */
  Query.prototype.formatResults = function(data, secondaryData, tertiaryData) {
    var result = this.callee;

    if (this.isInsertQuery(data)) {
      this.handleInsertQuery(data);

      if (!this.callee) {
        result = data[this.getInsertIdField()];
      }
    }

    if (this.isSelectQuery()) {
      result = this.handleSelectQuery(data);
    } else if (this.isShowTablesQuery()) {
      result = [];
      data.forEach(function(table) {
        result.push({ tableName: table.TABLE_NAME, schema: table.TABLE_SCHEM });
      });
    } else if (this.isDescribeQuery()) {
      
      result = {};

      data.forEach(function(_result) {
        
        result[_result.COLUMN_NAME] = {
          type: dataTypes[_result.DATA_TYPE],
          allowNull: (_result.IS_NULLABLE === 'YES'),
        };
        
        if (_result.COLUMN_DEF === 'YES') {
          result[_result.COLUMN_NAME].defaultValue = _result.COLUMN_DEF;
        }        
      });
      
      secondaryData.forEach(function(_result) {
        result[_result.COLUMN_NAME]['primaryKey'] = true;
      });
      
      tertiaryData.forEach(function(_result) {
        if (_result.MULTI_VALUE === 'M') {
          result[_result.COLUMN_NAME].multiValued = _result.TABLE_NAME + '_' +
            (_result.IN_ASSOCIATION ? _result.IN_ASSOCIATION : _result.COLUMN_NAME);
        }
      });
      
    } else if (this.isShowIndexesQuery()) {
      result = this.handleShowIndexesQuery(data);
    } else if (this.isCallQuery()) {
      result = data[0];
    } else if (this.isBulkUpdateQuery() || this.isBulkDeleteQuery() || this.isUpsertQuery()) {
      result = data.affectedRows;
    } else if (this.isVersionQuery()) {
      result = data[0].version;
    } else if (this.isForeignKeysQuery()) {
      result = data;
    } else if (this.isRawQuery()) {
      result = data;
    } else if (this.isBaseTableQuery()) {
      result = data.length === 1;
    }

    return result;
  };


  Query.prototype.formatError = function (err) {
    var match;

    switch (err.errno || err.code) {
      case 1062:
        match = err.message.match(/Duplicate entry '(.*)' for key '?((.|\s)*?)'?$/);

        var values = match[1].split('-')
          , fields = {}
          , message = 'Validation error'
          , uniqueKey = this.callee && this.callee.__options.uniqueKeys[match[2]];

        if (!!uniqueKey) {
          if (!!uniqueKey.msg) {
            message = uniqueKey.msg;
          }
          fields = Utils._.zipObject(uniqueKey.fields, values);
        } else {
          fields[match[2]] = match[1];
        }

        var errors = [];
        Utils._.forOwn(fields, function(value, field) {
          errors.push(new sequelizeErrors.ValidationErrorItem(
            field + ' must be unique', 'unique violation', field, value));
        });

        return new sequelizeErrors.UniqueConstraintError({
          message: message,
          errors: errors,
          parent: err,
          fields: fields
        });

      case 1451:
        match = err.message.match(/FOREIGN KEY \(`(.*)`\) REFERENCES `(.*)` \(`(.*)`\)(?: ON .*)?\)$/);

        return new sequelizeErrors.ForeignKeyConstraintError({
          fields: null,
          index: match[3],
          parent: err
        });

      case 1452:
        match = err.message.match(/FOREIGN KEY \(`(.*)`\) REFERENCES `(.*)` \(`(.*)`\)(.*)\)$/);

        return new sequelizeErrors.ForeignKeyConstraintError({
          fields: null,
          index: match[1],
          parent: err
        });

      default:
        return new sequelizeErrors.DatabaseError(err);
    }
  };

  Query.prototype.handleShowIndexesQuery = function (data) {
    // Group by index name, and collect all fields
    data = Utils._.foldl(data, function (acc, item) {
      if (!(item.Key_name in acc)) {
        acc[item.Key_name] = item;
        item.fields = [];
      }

      acc[item.Key_name].fields[item.Seq_in_index - 1] = {
        attribute: item.Column_name,
        length: item.Sub_part || undefined,
        order: item.Collation === 'A' ? 'ASC' : undefined
      };
      delete item.column_name;

      return acc;
    }, {});

    return Utils._.map(data, function(item) {
      return {
        primary: item.Key_name === 'PRIMARY',
        fields: item.fields,
        name: item.Key_name,
        tableName: item.Table,
        unique: (item.Non_unique !== 1),
        type: item.Index_type,
      };
    });
  };

  return Query;
})();
