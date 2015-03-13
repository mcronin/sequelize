'use strict';

var _ = require('lodash')
  , Abstract = require('../abstract')
  , ConnectionManager = require('./connection-manager')
  , Query = require('./query')
  , QueryGenerator = require('./query-generator')
  , DataTypes = require('./data-types');

var UniVerseDialect = function(sequelize) {
  this.sequelize = sequelize;
  this.connectionManager = new ConnectionManager(this, sequelize);
  this.connectionManager.initPools();
  this.QueryGenerator = _.extend({}, QueryGenerator, {
    options: sequelize.options,
    _dialect: this,
    sequelize: sequelize
  });
};

UniVerseDialect.prototype.supports = _.merge(_.cloneDeep(Abstract.prototype.supports), {
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
  },
  schemas: true
});

UniVerseDialect.prototype.Query = Query;
UniVerseDialect.prototype.QueryGenerator = QueryGenerator;
UniVerseDialect.prototype.DataTypes = DataTypes;
UniVerseDialect.prototype.name = 'universe';
UniVerseDialect.prototype.TICK_CHAR = '`';
UniVerseDialect.prototype.TICK_CHAR_LEFT = UniVerseDialect.prototype.TICK_CHAR;
UniVerseDialect.prototype.TICK_CHAR_RIGHT = UniVerseDialect.prototype.TICK_CHAR;

module.exports = UniVerseDialect;