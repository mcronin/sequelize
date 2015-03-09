"use strict";

var AbstractConnectionManager = require('../abstract/connection-manager')
  , ConnectionManager
  , Utils = require('../../utils')
  , Promise = require('../../promise')
  , JDBC = new (require('jdbc') )
  , sequelizeErrors = require('../../errors');

var config = {
  libpath: __dirname + 'C:/ARCHITECT/UniDK/jdbc/lib',
  libs: [__dirname + 'C:/ARCHITECT/UniDK/jdbc/lib/unijdbc.jar'],
  drivername: 'com.rs.u2.jdbc.UniJDBCDriver',
  url: 'jdbc:rs-u2://localhost/C:/U2/UV/HS.ADMIN;dbmstype=UNIVERSE',
  // optionally   
  user: 'ASCORP\\mcronin',
  password: 'Welcome#4',
};

JDBC.initialize(config, function(err, res) {
  if (err) {
    console.log(err);
  }
});

ConnectionManager = function(dialect, sequelize) {
  AbstractConnectionManager.call(this, dialect, sequelize);

  this.sequelize = sequelize;
  this.sequelize.config.port = this.sequelize.config.port || 31438;
  try {
    this.lib = require(sequelize.config.dialectModulePath || 'universe');
  } catch (err) {
    throw new Error('Please install universe package manually');
  }
};

Utils._.extend(ConnectionManager.prototype, AbstractConnectionManager.prototype);

ConnectionManager.prototype.connect = function(config) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var connectionConfig = {
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      timezone: self.sequelize.options.timezone
    };

    if (config.dialectOptions) {
      Object.keys(config.dialectOptions).forEach(function(key) {
        connectionConfig[key] = config.dialectOptions[key];
      });
    }

    var connection = self.lib.createConnection(connectionConfig);

    connection.connect(function(err) {
      if (err) {
        if (err.code) {
          switch (err.code) {
          case 'ECONNREFUSED':
            reject(new sequelizeErrors.ConnectionRefusedError(err));
            break;
          case 'ER_ACCESS_DENIED_ERROR':
            reject(new sequelizeErrors.AccessDeniedError(err));
            break;
          case 'ENOTFOUND':
            reject(new sequelizeErrors.HostNotFoundError(err));
            break;
          case 'EHOSTUNREACH':
            reject(new sequelizeErrors.HostNotReachableError(err));
            break;
          case 'EINVAL':
            reject(new sequelizeErrors.InvalidConnectionError(err));
            break;
          default:
            reject(new sequelizeErrors.ConnectionError(err));
            break;
          }
        } else {
          reject(new sequelizeErrors.ConnectionError(err));
        }
	        return;
      }

      if (config.pool.handleDisconnects) {
        connection.on('error', function (err) {
          if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            // Remove it from read/write pool
            self.pool.destroy(connection);
          }
        });
      }
      resolve(connection);
    });

  }).tap(function (connection) {
    connection.query("SET time_zone = '" + self.sequelize.options.timezone + "'");
  });
};

ConnectionManager.prototype.disconnect = function(connection) {
  // Dont disconnect connections with an ended protocol
  // That wil trigger a connection error
  if (connection._protocol._ended) {
    return Promise.resolve();
  }

  return new Promise(function (resolve, reject) {
    connection.end(function(err) {
      if (err) return reject(new sequelizeErrors.ConnectionError(err));
      resolve();
    });
  });
};

ConnectionManager.prototype.validate = function(connection) {
  return connection && ['disconnected', 'protocol_error'].indexOf(connection.state) === -1;
};

module.exports = ConnectionManager;