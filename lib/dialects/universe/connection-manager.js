"use strict";

var AbstractConnectionManager = require('../abstract/connection-manager')
  , ConnectionManager
  , Utils = require('../../utils')
  , Promise = require('../../promise')
  , sequelizeErrors = require('../../errors')
  , async = require('async')
  , JDBC = require('jdbc');

ConnectionManager = function(dialect, sequelize) {
  AbstractConnectionManager.call(this, dialect, sequelize);

  this.sequelize = sequelize;
  this.sequelize.config.port = this.sequelize.config.port || 31438;
  this.jdbc = new JDBC();
};

Utils._.extend(ConnectionManager.prototype, AbstractConnectionManager.prototype);

ConnectionManager.prototype.connect = function(config) {
	
  var self = this;
  
  return new Promise(function (resolve, reject) {

    var connectionConfig = {
      drivername: 'com.rs.u2.jdbc.UniJDBCDriver',
      url: 'jdbc:rs-u2://' + config.host + '/' + config.database + ';dbmstype=UNIVERSE',
      user: config.username,
      password: config.password
    };

    if (config.dialectOptions) {
      Object.keys(config.dialectOptions).forEach(function(key) {
        connectionConfig[key] = config.dialectOptions[key];
      });
    }
    
    async.series([function(callback) {
      self.jdbc.initialize(connectionConfig, function(err, res) {
        callback(err);
      });
    }, function(callback) {
      self.jdbc.open(function(err, conn) {
        self.conn = conn;
        callback(err);
      });
    }], function(err) {
      if (err) {
        return reject(new sequelizeErrors.ConnectionError(err));
      }
      resolve(self);
    });
  });
};

ConnectionManager.prototype.disconnect = function(connection) {
	
  var self = this;
  
  return new Promise(function (resolve, reject) {
    self.jdbc.close(function(err) {
      if (err) {
        return reject(new sequelizeErrors.ConnectionError(err));
      }
      resolve();
    });
  });
};

ConnectionManager.prototype.validate = function(connection) {
  return this.jdbc._conn !== null;
};

module.exports = ConnectionManager;