'use strict';

var chai = require('chai')
  , expect = chai.expect
  , Support = require(__dirname + '/../../support')
  , sinon = require('sinon')
  , DataTypes = require(__dirname + '/../../../../lib/data-types');

chai.config.includeStack = true;

describe('[Universe Specific] Connector Manager', function() {
  it('works correctly after being idle', function(done) {
    var User = this.sequelize.define('User', { username: DataTypes.STRING })
      , spy = sinon.spy();

    User.sync({force: true}).on('success', function() {
      User.create({username: 'user1'}).on('success', function() {
        User.count().on('success', function(count) {
          expect(count).to.equal(1);
          spy();

          setTimeout(function() {
            User.count().on('success', function(count) {
              expect(count).to.equal(1);
              spy();
              if (spy.calledTwice) {
                done();
              }
            });
          }, 1000);
        });
      });
    });
  });

  it('should maintain connection', function() {
    var sequelize = Support.createSequelizeInstance({pool: {min: 1, max: 1, handleDisconnects: true, idle: 5000}})
      , cm = sequelize.connectionManager
      , conn;

    return sequelize.sync()
      .then(function() {
        return cm.getConnection();
      })
      .then(function(connection) {
        // Save current connection
        conn = connection;
      })
      .then(function() {
        return cm.releaseConnection(conn);
      })
      .then(function() {
        // Get next available connection
        return cm.getConnection();
      })
      .then(function(connection) {
        // Old threadId should be different from current new one
        expect(conn.threadId).to.be.equal(connection.threadId);
        expect(cm.validate(conn)).to.be.ok;

        return cm.releaseConnection(connection);
      });
  });

  it('should work with handleDisconnects', function() {
    var sequelize = Support.createSequelizeInstance({pool: {min: 1, max: 1, handleDisconnects: true, idle: 5000}})
      , cm = sequelize.connectionManager
      , conn;
     return sequelize.sync()
      .then(function() {
        return cm.getConnection();
      })
      .then(function(connection) {
        // Save current connection
        conn = connection;
         // simulate a unexpected end
        connection._protocol.end();
      })
      .then(function() {
        return cm.releaseConnection(conn);
      })
      .then(function() {
        // Get next available connection
        return cm.getConnection();
      })
      .then(function(connection) {
        // Old threadId should be different from current new one
        expect(conn.threadId).to.not.be.equal(connection.threadId);
        expect(cm.validate(conn)).to.not.be.ok;

        return cm.releaseConnection(connection);
      });
  });
});
