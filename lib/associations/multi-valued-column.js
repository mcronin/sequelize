'use strict';

var Utils = require('./../utils')
  , Helpers = require('./helpers')
  , _ = require('lodash')
  , Association = require('./base')
  , Transaction = require('../transaction')
  , Model = require('../model')
  , CounterCache = require('../plugins/counter-cache')
  , util = require('util')
  , deprecatedSeen = {}
  , deprecated = function(message) {
    if (deprecatedSeen[message]) return;
    console.warn(message);
    deprecatedSeen[message] = true;
  };

var HasManySingleLinked = require('./has-many-single-linked');

module.exports = (function() {
  var MultiValuedColumn = function(source, target, options) {
    Association.call(this);
    var self = this;

    this.associationType = 'MultiValuedColumn';
    this.source = source;
    this.target = target;
    this.targetAssociation = null;
    this.options = options || {};
    this.sequelize = source.daoFactoryManager.sequelize;
    this.scope = options.scope;
    this.isMultiAssociation = true;
    this.isSelfAssociation = false;
    this.doubleLinked = false;
    this.combinedTableName = Utils.combineTableNames(
      this.source.tableName,
      this.target.tableName
    );
    
    this.source.hasMultiValuedColumns = true;

    this.foreignKeyAttribute = this.source.rawAttributes[this.source.primaryKeyAttribute];
    this.foreignKey = this.source.primaryKeyField;

    this.through = {
      model: true
    };

    this.associationAccessor = this.target.tableName;

    this.throughModel = this.through.model;

    this.options.tableName = this.combinedName = true;

    this.as = this.target.options.name.plural;
    this.options.name = this.target.options.name;

    // Get singular and plural names, trying to uppercase the first letter, unless the model forbids it
    var plural = Utils.uppercaseFirst(this.options.name.plural)
      , singular = Utils.uppercaseFirst(this.options.name.singular);

    this.accessors = {
      get: 'get' + plural,
      set: 'set' + plural,
      addMultiple: 'add' + plural,
      add: 'add' + singular,
      create: 'create' + singular,
      remove: 'remove' + singular,
      removeMultiple: 'remove' + plural,
      hasSingle: 'has' + singular,
      hasAll: 'has' + plural
    };

    if (this.options.counterCache) {
      new CounterCache(this, this.options.counterCache !== true ? this.options.counterCache : {});
    }
  };

  util.inherits(MultiValuedColumn, Association);

  // the id is in the target table
  // or in an extra table which connects two tables
  MultiValuedColumn.prototype.injectAttributes = function() {

    this.identifier = this.foreignKeyAttribute.fieldName;

    var newAttributes = {};
    var constraintOptions = _.clone(this.options); // Create a new options object for use with addForeignKeyConstraints, to avoid polluting this.options in case it is later used for a n:m
    newAttributes[this.identifier] = _.defaults(this.foreignKeyAttribute, { type: this.options.keyType || this.source.rawAttributes[this.source.primaryKeyAttribute].type });

    if (this.options.constraints !== false) {
      constraintOptions.onDelete = constraintOptions.onDelete || 'SET NULL';
      constraintOptions.onUpdate = constraintOptions.onUpdate || 'CASCADE';
    }
    Helpers.addForeignKeyConstraints(newAttributes[this.identifier], this.source, this.target, constraintOptions);
    Utils.mergeDefaults(this.target.rawAttributes, newAttributes);

    this.identifierField = this.target.rawAttributes[this.identifier].field || this.identifier;

    // Sync attributes and setters/getters to DAO prototype
    this.target.refreshAttributes();
    this.source.refreshAttributes();

    Helpers.checkNamingCollision(this);

    return this;
  };

  MultiValuedColumn.prototype.injectGetter = function(obj) {
    var association = this;

    obj[this.accessors.get] = function(options, queryOptions) {
      options = association.target.__optClone(options) || {};
      queryOptions = queryOptions || {};
      return new HasManySingleLinked(association, this).injectGetter(options, queryOptions);
    };

    obj[this.accessors.hasAll] = function(instances, options) {
      var instance = this
        , where;

      options = options || {};

      instances.forEach(function(instance) {
        if (instance instanceof association.target.Instance) {
          where = new Utils.or([where, instance.primaryKeyValues]);
        } else {
          var _where = {};
          _where[association.target.primaryKeyAttribute] = instance;
          where = new Utils.or([where, _where]);
        }
      });

      options.where = new Utils.and([
        where,
        options.where
      ]);

      return instance[association.accessors.get](
        options,
        { raw: true }
      ).then(function(associatedObjects) {
        return associatedObjects.length === instances.length;
      });
    };

    obj[this.accessors.hasSingle] = function(param, options) {
      var instance = this
        , where;

      options = options || {};

      if (param instanceof association.target.Instance) {
        where = param.primaryKeyValues;
      } else {
        where = {};
        where[association.target.primaryKeyAttribute] = param;
      }

      options.where = new Utils.and([
        where,
        options.where
      ]);

      return instance[association.accessors.get](
        options,
        { raw: true }
      ).then(function(associatedObjects) {
        return associatedObjects.length !== 0;
      });
    };
    return this;
  };

  MultiValuedColumn.prototype.injectSetter = function(obj) {
    var association = this
      , primaryKeyAttribute = association.target.primaryKeyAttribute;

    obj[this.accessors.set] = function(newAssociatedObjects, additionalAttributes) {
      additionalAttributes = additionalAttributes || {};

      if (newAssociatedObjects === null) {
        newAssociatedObjects = [];
      } else {
        newAssociatedObjects = newAssociatedObjects.map(function(newAssociatedObject) {
          if (!(newAssociatedObject instanceof association.target.Instance)) {
            var tmpInstance = {};
            tmpInstance[primaryKeyAttribute] = newAssociatedObject;
            return association.target.build(tmpInstance, {
              isNewRecord: false
            });
          }
          return newAssociatedObject;
        });
      }

      var instance = this;

      return instance[association.accessors.get]({}, {
        transaction: (additionalAttributes || {}).transaction,
        logging: (additionalAttributes || {}).logging
      }).then(function(oldAssociatedObjects) {
        return new HasManySingleLinked(association, instance).injectSetter(oldAssociatedObjects, newAssociatedObjects, additionalAttributes);
      });
    };

    obj[this.accessors.addMultiple] = obj[this.accessors.add] = function(newInstance, additionalAttributes) {
      // If newInstance is null or undefined, no-op
      if (!newInstance) return Utils.Promise.resolve();

      var instance = this
        , primaryKeyAttribute = association.target.primaryKeyAttribute;

      additionalAttributes = additionalAttributes || {};
      if (association.through && association.through.scope) {
        Object.keys(association.through.scope).forEach(function (attribute) {
          additionalAttributes[attribute] = association.through.scope[attribute];
        });
      }

      if (Array.isArray(newInstance)) {
        var newInstances = newInstance.map(function(newInstance) {
          if (!(newInstance instanceof association.target.Instance)) {
            var tmpInstance = {};
            tmpInstance[primaryKeyAttribute] = newInstance;
            return association.target.build(tmpInstance, {
              isNewRecord: false
            });
          }
          return newInstance;
        });

        return new HasManySingleLinked(association, this).injectSetter([], newInstances, additionalAttributes);
      } else {
        if (!(newInstance instanceof association.target.Instance)) {
          var tmpInstance = {};
          tmpInstance[primaryKeyAttribute] = newInstance;
          newInstance = association.target.build(tmpInstance, {
            isNewRecord: false
          });
        }

        return instance[association.accessors.get]({
          where: newInstance.primaryKeyValues
        }, {
          transaction: (additionalAttributes || {}).transaction
        }).then(function(currentAssociatedObjects) {
          if (currentAssociatedObjects.length === 0 || Object(association.through.model) === association.through.model) {
            return new HasManySingleLinked(association, instance).injectAdder(newInstance, additionalAttributes, !!currentAssociatedObjects.length);
          } else {
            return Utils.Promise.resolve(currentAssociatedObjects[0]);
          }
        });
      }
    };

    obj[this.accessors.remove] = function(oldAssociatedObject, options) {
      var instance = this;
      return instance[association.accessors.get]({}, options).then(function(currentAssociatedObjects) {
        var newAssociations = [];

        if (!(oldAssociatedObject instanceof association.target.Instance)) {
          var tmpInstance = {};
          tmpInstance[primaryKeyAttribute] = oldAssociatedObject;
          oldAssociatedObject = association.target.build(tmpInstance, {
            isNewRecord: false
          });
        }

        currentAssociatedObjects.forEach(function(association) {
          if (!Utils._.isEqual(oldAssociatedObject.identifiers, association.identifiers)) {
            newAssociations.push(association);
          }
        });

        return instance[association.accessors.set](newAssociations, options);
      });
    };

    obj[this.accessors.removeMultiple] = function(oldAssociatedObjects, options) {
      var instance = this;
      return instance[association.accessors.get]({}, options).then(function(currentAssociatedObjects) {
        var newAssociations = [];

        // Ensure the oldAssociatedObjects array is an array of target instances
        oldAssociatedObjects = oldAssociatedObjects.map(function(oldAssociatedObject) {
          if (!(oldAssociatedObject instanceof association.target.Instance)) {
            var tmpInstance = {};
            tmpInstance[primaryKeyAttribute] = oldAssociatedObject;
            oldAssociatedObject = association.target.build(tmpInstance, {
              isNewRecord: false
            });
          }
          return oldAssociatedObject;
        });

        currentAssociatedObjects.forEach(function(association) {

          // Determine is this is an association we want to remove
          var obj = Utils._.find(oldAssociatedObjects, function(oldAssociatedObject) {
            return Utils._.isEqual(oldAssociatedObject.identifiers, association.identifiers);
          });

          // This is not an association we want to remove. Add it back
          // to the set of associations we will associate our instance with
          if (!obj) {
            newAssociations.push(association);
          }
        });

        return instance[association.accessors.set](newAssociations, options);
      });
    };

    return this;
  };

  MultiValuedColumn.prototype.injectCreator = function(obj) {
    var association = this;

    obj[this.accessors.create] = function(values, options) {
      var instance = this;
      options = options || {};

      if (Array.isArray(options)) {
        options = {
          fields: options
        };
      }

      if (values === undefined) {
        values = {};
      }

      if (association.scope) {
        Object.keys(association.scope).forEach(function (attribute) {
          values[attribute] = association.scope[attribute];
          if (options.fields) options.fields.push(attribute);
        });
      }

      if (Object(association.through.model) === association.through.model) {
        // Create the related model instance
        return association.target.create(values, options).then(function(newAssociatedObject) {
          return instance[association.accessors.add](newAssociatedObject, _.omit(options, ['fields'])).return(newAssociatedObject);
        });
      } else {
        values[association.identifier] = instance.get(association.source.primaryKeyAttribute);
        if (options.fields) options.fields.push(association.identifier);
        return association.target.create(values, options);
      }
    };

    return this;
  };

  /**
   * The method checks if it is ok to delete the previously defined foreign key.
   * This is done because we need to keep the foreign key if another association
   * is depending on it.
   *
   * @param  {DaoFactory}  daoFactory The source or target DaoFactory of this association
   * @param  {[type]}  identifier     The name of the foreign key identifier
   * @return {Boolean}                Whether or not the deletion of the foreign key is ok.
   */
  var isForeignKeyDeletionAllowedFor = function(daoFactory, identifier) {
    var isAllowed = true
      , associationNames = Utils._.without(Object.keys(daoFactory.associations), this.associationAccessor);

    associationNames.forEach(function(associationName) {
      if (daoFactory.associations[associationName].identifier === identifier) {
        isAllowed = false;
      }
    });

    return isAllowed;
  };

  return MultiValuedColumn;
})();
