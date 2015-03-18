'use strict';

var chai = require('chai')
  , expect = chai.expect
  , Support = require(__dirname + '/../../support')
  , sinon = require('sinon')
  , DataTypes = require(__dirname + '/../../../../lib/data-types');

chai.config.includeStack = true;

if (Support.getTestDialect().match(/^universe/)) {
  describe('[Universe Specific] Connector Manager', function() {
  
    it('should maintain connection', function() {
      var sequelize = Support.createSequelizeInstance({pool: {min: 1, max: 1, handleDisconnects: true, idle: 5000}})
        , cm = sequelize.connectionManager;
  
      return cm.validate()
    });
  
  });
}
