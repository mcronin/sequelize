'use strict';

var _ = require('lodash')
  , Abstract = require('../abstract')
  , ConnectionManager = require('./connection-manager')
  , Query = require('./query')
  , QueryGenerator = require('./query-generator')
  , DataTypes = require('./data-types');

var UniverseDialect = function(sequelize) {
  this.sequelize = sequelize;
  this.connectionManager = new ConnectionManager(this, sequelize);
  this.connectionManager.initPools();
  this.QueryGenerator = _.extend({}, QueryGenerator, {
    options: sequelize.options,
    _dialect: this,
    sequelize: sequelize
  });
};

UniverseDialect.prototype.supports = _.merge(_.cloneDeep(Abstract.prototype.supports), {
  'VALUES ()': true,
  'LIMIT ON UPDATE': true,
  'IGNORE': ' IGNORE',
  lock: true,
  forShare: 'LOCK IN SHARE MODE',
  index: {
    collate: false,
    length: true,
    parser: true,
    type: true,
    using: 1,
  }
});

UniverseDialect.prototype.Query = Query;
UniverseDialect.prototype.QueryGenerator = QueryGenerator;
UniverseDialect.prototype.DataTypes = DataTypes;
UniverseDialect.prototype.name = 'universe';
UniverseDialect.prototype.TICK_CHAR = '`';
UniverseDialect.prototype.TICK_CHAR_LEFT = UniverseDialect.prototype.TICK_CHAR;
UniverseDialect.prototype.TICK_CHAR_RIGHT = UniverseDialect.prototype.TICK_CHAR;

module.exports = UniverseDialect;