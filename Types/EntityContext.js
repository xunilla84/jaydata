$data.Class.define('$data.StorageModel', null, null, {
    constructor: function () {
        ///<field name="LogicalType" type="$data.Entity">User defined type</field>
    },
    LogicalType: {},
    LogicalTypeName: {},
    PhysicalType: {},
    PhysicalTypeName: {},
    TableName: {},
    ComplexTypes: {},
    Associations: {},
    EntitySetReference: {}
}, null);
$data.Class.define('$data.Assiociation', null, null, {
    constructor: function (initParam) {
        if (initParam) {
            this.From = initParam.From;
            this.FromType = initParam.FromType;
            this.FromMultiplicity = initParam.FromMultiplicity;
            this.FromPropertyName = initParam.FromPropertyName;
            this.To = initParam.To;
            this.ToType = initParam.ToType;
            this.ToMultiplicity = initParam.ToMultiplicity;
            this.ToPropertyName = initParam.ToPropertyName;
        }
    },
    From: {},
    FromType: {},
    FromMultiplicity: {},
    FromPropertyName: {},
    To: {},
    ToType: {},
    ToMultiplicity: {},
    ToPropertyName: {},
    ReferentialConstraint: {}
}, null);
$data.Class.define('$data.ComplexType', $data.Assiociation, null, {}, null);

$data.Class.define('$data.EntityContext', null, null,
{
    constructor: function (storageProviderCfg) {
        ///<summary>Provides facilities for querying and working with entity data as objects.</summary>
        ///<param name="storageProviderCfg">???</param>

        //Initialize properties
        this.lazyLoad = false;
        this.trackChanges = false;
        this._entitySetReferences = {};
        this._storageModel = [];

        var ctx = this;
        this._storageModel.getStorageModel = function (typeName) {
            var resolvedType = Container.resolveType(typeName);
            return ctx._storageModel.filter(function (s) { return s.LogicalType === resolvedType; })[0];
        };
        var providerType = $data.StorageProviderBase.getProvider(storageProviderCfg.name);
        this.storageProvider = new providerType(storageProviderCfg, this);
        this.storageProvider.setContext(this);
        this.stateManager = new $data.EntityStateManager(this);

        if (storageProviderCfg.name in this.getType()._storageModelCache) {
            this._storageModel = this.getType()._storageModelCache[storageProviderCfg.name];
        } else {
        this._initializeStorageModel();
            this.getType()._storageModelCache[storageProviderCfg.name] = this._storageModel;
        }
        this._initializeEntitySets(this.constructor);


        this._isOK = false;
        var callBack = $data.typeSystem.createCallbackSetting({ success: this._successInitProvider });
        this.storageProvider.initializeStore(callBack);
    },
    getDataType: function (dataType) {
        if (typeof dataType == "string") {
            var memDef_dataType = this[dataType];
            if (memDef_dataType === undefined || memDef_dataType === null) { memDef_dataType = eval(dataType); }
            return memDef_dataType;
        }
        return dataType;
    },
    _initializeEntitySets: function (ctor) {
        if (ctor.inheritsFrom !== null && ctor.inheritsFrom !== undefined) {
            this._initializeEntitySets(ctor.inheritsFrom);
        }
        this._storageModel.forEach(function (storageModel) {
            this[storageModel.ItemName] = new $data.EntitySet(storageModel.LogicalType, this, storageModel.ItemName);
            this[storageModel.ItemName].name = storageModel.ItemName;
            this[storageModel.ItemName].tableName = storageModel.TableName;
            this._entitySetReferences[storageModel.LogicalType.name] = this[storageModel.ItemName];

            storageModel.EntitySetReference = this[storageModel.ItemName];
        }, this);
    },
    _initializeStorageModel: function () {

        this.constructor.memberDefinitions.forEach(function (item) {
            if ('dataType' in item) {
                var itemResolvedDataType = Container.resolveType(item.dataType);
                if (itemResolvedDataType && itemResolvedDataType.isAssignableTo && itemResolvedDataType.isAssignableTo($data.EntitySet)) {
                    var storageModel = new $data.StorageModel();
                    storageModel.TableName = item.tableName || item.name;
                    storageModel.ItemName = item.name;
                    storageModel.LogicalType = Container.resolveType(item.elementType);
                    storageModel.LogicalTypeName = storageModel.LogicalType.name;
                    storageModel.PhysicalTypeName = $data.EntityContext._convertLogicalTypeNameToPhysical(storageModel.LogicalTypeName);
                    this._storageModel.push(storageModel);
                }
            }
        }, this);

        this._storageModel.forEach(function (storageModel) {
            ///<param name="storageModel" type="$data.StorageModel">Storage model item</param>
            var dbEntityInstanceDefinition = {};

            storageModel.Associations = storageModel.Associations || [];
            storageModel.ComplexTypes = storageModel.ComplexTypes || [];
            storageModel.LogicalType.memberDefinitions.getPublicMappedProperties().forEach(function (memDef) {
                ///<param name="memDef" type="MemberDefinition">Member definition instance</param>

                var memDefResolvedDataType = Container.resolveType(memDef.dataType);
               
                if ((this.storageProvider.supportedDataTypes.indexOf(memDefResolvedDataType) > -1) && Object.isNullOrUndefined(memDef.inverseProperty)) {
                    //copy member definition
                    var t = JSON.parse(JSON.stringify(memDef));
                    //change datatype to resolved type
                    t.dataType = memDefResolvedDataType;
                    dbEntityInstanceDefinition[memDef.name] = t;
                    return;
                }

                this._buildDbType_navigationPropertyComplite(memDef, memDefResolvedDataType, storageModel);
                


                //var memDef_dataType = this.getDataType(memDef.dataType);
                if ((memDefResolvedDataType === $data.Array || (memDefResolvedDataType.isAssignableTo && memDefResolvedDataType.isAssignableTo($data.EntitySet))) && (memDef.inverseProperty && memDef.inverseProperty !== '$$unbound')) {
                    this._buildDbType_Collection_OneManyDefinition(dbEntityInstanceDefinition, storageModel, memDefResolvedDataType, memDef);
                } else {
                    if (memDef.inverseProperty) {
                        if (memDef.inverseProperty === '$$unbound') {
                            //member definition is navigation but not back reference
                            //Guard.raise("NOT SUPPORTED YET");
                        } else {
                            //member definition is navigation property one..one or one..many case
                            var fields = memDefResolvedDataType.memberDefinitions.filter(function (m) { return m.name === memDef.inverseProperty; }, this);
                            if (fields.length == 1) {
                                if (fields[0].elementType) {
                                    //member definition is one..many connection
                                    var referealResolvedType = Container.resolveType(fields[0].elementType);
                                    if (referealResolvedType === storageModel.LogicalType) {
                                        this._buildDbType_ElementType_OneManyDefinition(dbEntityInstanceDefinition, storageModel, memDefResolvedDataType, memDef);
                                    } else {
                                        if (typeof intellisense === 'undefined') {
                                            Guard.raise(new Exception('Inverse property not valid, refereed item element type not match: ' + storageModel.LogicalTypeName, ', property: ' + memDef.name));
                                        }
                                    }
                                } else {
                                    //member definition is one..one connection
                                    this._buildDbType_ElementType_OneOneDefinition(dbEntityInstanceDefinition, storageModel, memDefResolvedDataType, memDef);
                                }
                            } else {
                                if (typeof intellisense === 'undefined') {
                                    Guard.raise(new Exception('Inverse property not valid'));
                                }
                            }
                        }
                    } else {
                        //member definition is a complex type
                        this._buildDbType_addComplexTypePropertyDefinition(dbEntityInstanceDefinition, storageModel, memDefResolvedDataType, memDef);
                    }
                }
            }, this);
            this._buildDbType_modifyInstanceDefinition(dbEntityInstanceDefinition, storageModel, this);
            var dbEntityClassDefinition = {};
            dbEntityClassDefinition.convertTo = this._buildDbType_generateConvertToFunction(storageModel, this);
            this._buildDbType_modifyClassDefinition(dbEntityClassDefinition, storageModel, this);

            //create physical type
            storageModel.PhysicalType = $data.Class.define(storageModel.PhysicalTypeName, $data.Entity, null, dbEntityInstanceDefinition, dbEntityClassDefinition);
        }, this);
    },
    _buildDbType_navigationPropertyComplite: function (memDef, memDefResolvedDataType, storageModel) {
        if (!memDef.inverseProperty) {
            var refMemDefs = null;
            if (memDefResolvedDataType === $data.Array || (memDefResolvedDataType.isAssignableTo && memDefResolvedDataType.isAssignableTo($data.EntitySet))) {
                var refStorageModel = this._storageModel.getStorageModel(Container.resolveType(memDef.elementType));
                if (refStorageModel) {
                    refMemDefs = refStorageModel.LogicalType.memberDefinitions.getPublicMappedProperties().filter(function (m) {
                        return ((m.inverseProperty == memDef.name) && (Container.resolveType(m.dataType) === Container.resolveType(storageModel.LogicalType)))
                    });
                }
            } else {
                var refStorageModel = this._storageModel.getStorageModel(memDefResolvedDataType);
                if (refStorageModel) {
                    refMemDefs = refStorageModel.LogicalType.memberDefinitions.getPublicMappedProperties().filter(function (m) {
                        if (m.elementType) {
                            return ((m.inverseProperty == memDef.name) && (Container.resolveType(m.elementType) === storageModel.LogicalType))
                        } else {
                            return ((m.inverseProperty == memDef.name) && (Container.resolveType(m.dataType) === storageModel.LogicalType))
                        }

                    });
                }
            }
            if (refMemDefs) {
                if (refMemDefs.length > 1) {
                    if (typeof intellisense !== 'undefined') {
                        Guard.raise(new Exception('More than one inverse property refer to this member definition: ' + memDef.name + ', type: ' + Container.resolveName(storageModel.LogicalType)));
                    }
                }
                var refMemDef = refMemDefs.pop();
                if (refMemDef) {
                    memDef.inverseProperty = refMemDef.name;
                }
            }
        } else {
            var refStorageModel = null;
            if (memDefResolvedDataType === $data.Array || (memDefResolvedDataType.isAssignableTo && memDefResolvedDataType.isAssignableTo($data.EntitySet))) {
                refStorageModel = this._storageModel.getStorageModel(Container.resolveType(memDef.elementType));

            } else {
                refStorageModel = this._storageModel.getStorageModel(memDefResolvedDataType);
            }

            var p = refStorageModel.LogicalType.memberDefinitions.filter(function (mdef) { return mdef.name == memDef.inverseProperty; }).pop();
            if (p) {
                if (p.inverseProperty) {
                    if (p.inverseProperty != memDef.name) {
                        if (typeof intellisense === 'undefined') {
                            Guard.raise(new Exception('Inverse property mismatch'));
                        }
                    }
                } else {
                    p.inverseProperty = memDef.name;
                }
            }

        }
    },
    _buildDbType_generateConvertToFunction: function (storageModel) { return function (instance) { return instance; }; },
    _buildDbType_modifyInstanceDefinition: function (instanceDefinition, storageModel) { return; },
    _buildDbType_modifyClassDefinition: function (classDefinition, storageModel) { return; },
    _buildDbType_addComplexTypePropertyDefinition: function (dbEntityInstanceDefinition, storageModel, memDef_dataType, memDef) {
        this._addNavigationPropertyDefinition(dbEntityInstanceDefinition, memDef, memDef.name, $data.MemberTypes.complexProperty);
        var complexType = this._createComplexElement(storageModel.LogicalType, "", memDef.name, memDef_dataType, "", "");
        storageModel.ComplexTypes[memDef.name] = complexType;
        storageModel.ComplexTypes.push(complexType);
    },
    _buildDbType_Collection_OneManyDefinition: function (dbEntityInstanceDefinition, storageModel, memDef_dataType, memDef) {
        var refereedType = Container.resolveType(memDef.elementType);
        if (refereedType === undefined || refereedType === null) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("Element type definition error", "Field definition", memDef));
            }
        }
        var refereedStorageModel = this._storageModel.filter(function (s) { return s.LogicalType === refereedType; })[0];
        if (!refereedStorageModel) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("No EntitySet definition for the following element type", "Field definition", memDef));
            }
        }

        this._addNavigationPropertyDefinition(dbEntityInstanceDefinition, memDef, memDef.name);
        var association = this._addAssociationElement(storageModel.LogicalType, "0..1", memDef.name, refereedStorageModel.LogicalType, "*", memDef.inverseProperty);
        storageModel.Associations[memDef.name] = association;
        storageModel.Associations.push(association);
    },
    _buildDbType_ElementType_OneManyDefinition: function (dbEntityInstanceDefinition, storageModel, memDef_dataType, memDef) {
        var refereedType = Container.resolveType(memDef.dataType);
        if (refereedType === undefined || refereedType === null) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("Element type definition error", "Field definition", memDef));
            }
        }
        var refereedStorageModel = this._storageModel.filter(function (s) { return s.LogicalType === refereedType; })[0];
        if (!refereedStorageModel) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("No EntitySet definition for the following element type", "Field definition", memDef));
            }
        }

        this._addNavigationPropertyDefinition(dbEntityInstanceDefinition, memDef, memDef.name);
        var association = this._addAssociationElement(storageModel.LogicalType, "*", memDef.name, refereedStorageModel.LogicalType, "0..1", memDef.inverseProperty);
        storageModel.Associations[memDef.name] = association;
        storageModel.Associations.push(association);
    },
    _buildDbType_ElementType_OneOneDefinition: function (dbEntityInstanceDefinition, storageModel, memDef_dataType, memDef) {
        var refereedType = Container.resolveType(memDef.dataType);
        if (refereedType === undefined || refereedType === null) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("Element type definition error", "Field definition", memDef));
            }
        }
        var refereedStorageModel = this._storageModel.filter(function (s) { return s.LogicalType === refereedType; })[0];
        if (!refereedStorageModel) {
            if (typeof intellisense === 'undefined') {
                Guard.raise(new Exception("No EntitySet definition following element type", "Field definition", memDef));
            }
        }

        var refereedMemberDefinition = refereedStorageModel.LogicalType.memberDefinitions.filter(function (m) { return m.name == memDef.inverseProperty; })[0];
        if (!refereedMemberDefinition.required && !memDef.required) { if (typeof intellisense === 'undefined') { if (typeof intellisense === 'undefined') { Guard.raise(new Exception('In one to one connection, one side must required!', 'One to One connection', memDef)); } } }

        this._addNavigationPropertyDefinition(dbEntityInstanceDefinition, memDef, memDef.name);

        association = this._addAssociationElement(storageModel.LogicalType,
                                                 memDef.required ? "0..1" : "1",
                                                 memDef.name,
                                                 refereedStorageModel.LogicalType,
                                                 memDef.required ? "1" : "0..1",
                                                 memDef.inverseProperty);
        storageModel.Associations[memDef.name] = association;
        storageModel.Associations.push(association);
    },
    _addNavigationPropertyDefinition: function (definition, member, associationName, kind) {
        var t = JSON.parse(JSON.stringify(member));
        t.dataType = $data.EntitySet;
        t.notMapped = true;
        t.kind = kind ? kind : $data.MemberTypes.navProperty;
        t.association = associationName;
        definition[member.name] = t;
    },
    _addAssociationElement: function (fromType, fromMultiplicity, fromPropName, toType, toMultiplicity, toPropName) {
        return new $data.Assiociation({
            From: fromType.name,
            FromType: fromType,
            FromMultiplicity: fromMultiplicity,
            FromPropertyName: fromPropName,
            To: toType.name,
            ToType: toType,
            ToMultiplicity: toMultiplicity,
            ReferentialConstraint: [],
            ToPropertyName: toPropName
        });
    },
    _createComplexElement: function (fromType, fromMultiplicity, fromPropName, toType, toMultiplicity, toPropName) {
        return new $data.ComplexType({
            From: fromType.name,
            FromType: fromType,
            FromMultiplicity: fromMultiplicity,
            FromPropertyName: fromPropName,
            To: toType.name,
            ToType: toType,
            ToMultiplicity: toMultiplicity,
            ReferentialConstraint: [],
            ToPropertyName: toPropName
        });
    },

    _successInitProvider: function (result) {
        if (result != undefined && result._isOK != undefined) {
            result._isOK = true;
            if (result.onReadyFunction) {
                result.onReadyFunction(result);
            }
        }

    },
    onReady: function (fn) {
        var pHandler = new $data.PromiseHandler();
        var callBack = pHandler.createCallback(fn);
        this.onReadyFunction = callBack.success;
        if (this._isOK) {
            callBack.success(this);
        }
        return pHandler.getPromise();
    },
    getEntitySetFromElementType: function (elementType) {
        var result = this._entitySetReferences[elementType];
        if (!result) {
            try {
                result = this._entitySetReferences[eval(elementType).name];
            } catch (ex) { }
        }
        return result;
    },
    executeQuery: function (queryable, callBack) {
        var query = new $data.Query(queryable.expression, queryable.entitySet, this);
        callBack = $data.typeSystem.createCallbackSetting(callBack);
        var that = this;
        var clbWrapper = {};
        clbWrapper.success = function (query) {
            query.buildResultSet(that);
            if (query.expression.nodeType === $data.Expressions.ExpressionType.Single ||
                query.expression.nodeType === $data.Expressions.ExpressionType.Count) {
                    if (query.result.length !== 1) {
                        callBack.error(new Exception('result count failed'));
                        return;
                        }

                    callBack.success(query.result[0]);
                } else if (query.expression.nodeType === $data.Expressions.ExpressionType.First) {
                    if (query.result.length === 0) {
                        callBack.error(new Exception('result count failed'));
                        return;
                    }

                    callBack.success(query.result[0]);
                } else {
                    callBack.success(query.result);
                }
        };
        clbWrapper.error = callBack.error;
        this.storageProvider.executeQuery(query, clbWrapper);
    },
    saveChanges: function (callback) {
        ///<summary>
        /// Adatforráson végrehajtott módosítások mentése, véglegesítése
        ///</summary>
        var changedEntities = [];
        var trackedEntities = this.stateManager.trackedEntities;
        var pHandler = new $data.PromiseHandler();
        var clbWrapper = pHandler.createCallback(callback);
        var pHandlerResult = pHandler.getPromise();

        //validate entities
        var errors = [];
        trackedEntities.forEach(function (entity) {
            if ((entity.data.entityState != $data.EntityState.Added || entity.data.entityState != $data.EntityState.Modified)
                && !entity.data.isValid()) {
                    errors.push({ item: entity.data, errors: entity.data.ValidationErrors });
                }
        });
        if (errors.length > 0) {
            clbWrapper.error(errors);
            return pHandlerResult;
        }
        var skipItems = [];
        while (trackedEntities.length > 0) {
            var additionalEntities = [];
            trackedEntities.forEach(function (entityCachedItem) {
                var sModel = this._storageModel.getStorageModel(entityCachedItem.data.getType());
                if (entityCachedItem.data.entityState == $data.EntityState.Unchanged) {
                    entityCachedItem.skipSave = true;
                    skipItems.push(entityCachedItem.data);
                } else {
                    if (entityCachedItem.data.entityState == $data.EntityState.Modified) {
                        if (entityCachedItem.data.changedProperties) {
                            var changeStoredProperty = entityCachedItem.data.changedProperties.some(function (p) {
                                var pMemDef = sModel.PhysicalType.memberDefinitions.filter(function (m) { return m.name == p.name; }).pop();
                                if (pMemDef.kind == $data.MemberTypes.navProperty) {
                                    var a = sModel.Associations[pMemDef.association];
                                    var multiplicity = a.FromMultiplicity + a.ToMultiplicity;
                                    return ((multiplicity == '*0..1') || (multiplicity == '0..11'))
                                }
                                return true;
                            });
                            if (!changeStoredProperty) {
                                entityCachedItem.skipSave = true;
                                skipItems.push(entityCachedItem.data);
                            }
                        }
                    }
                }

                var navigationProperties = sModel.PhysicalType.memberDefinitions.filter(function (p) { return p.kind == $data.MemberTypes.navProperty; });
                navigationProperties.forEach(function (navProp) {
                    var association = sModel.Associations[navProp.name]; //eg.:"Profile"
                    var name = navProp.name; //eg.: "Profile"
                    var navPropertyName = association.ToPropertyName; //eg.: User

                    var connectedDataList = [].concat(entityCachedItem.data[name]);
                    connectedDataList.forEach(function (data) {
                        if (data) {
                            var value = data[navPropertyName];
                            var associationType = association.FromMultiplicity + association.ToMultiplicity;
                            switch (associationType) {
                                case "*0..1": //Array
                                    if (value) {
                                        if (value instanceof Array) {
                                            if (value.indexOf(entityCachedItem.data) == -1) {
                                                value.push(entityCachedItem.data);
                                            }
                                        } else {
                                            if (typeof intellisense === 'undefined') {
                                                Guard.raise("Item must be array or subtype of array");
                                            }
                                        }
                                    } else {
                                        data[navPropertyName] = [entityCachedItem.data];
                                    }
                                    break;
                                default: //Item
                                    if (value) {
                                        if (value !== entityCachedItem.data) {
                                            if (typeof intellisense === 'undefined') {
                                                Guard.raise("Integrity check error! Item assigned to another entity!");
                                            }
                                        }
                                    } else {
                                        data[navPropertyName] = entityCachedItem.data; //set back reference for live object
                                    }
                                    break;
                            }
                            switch (associationType) {
                                case "*0..1":
                                case "0..11":
                                    entityCachedItem.dependentOn = entityCachedItem.dependentOn || [];
                                    if ((entityCachedItem.dependentOn.indexOf(data) < 0) && (data.skipSave !== true)) {
                                        entityCachedItem.dependentOn.push(data);
                                    }
                                    break;
                            }
                            if (!data.entityState) {
                                data.entityState = $data.EntityState.Added;
                            }
                            if (additionalEntities.indexOf(data) == -1) {
                                additionalEntities.push(data);
                            }
                        }
                    }, this);
                }, this);
            }, this);
            
            trackedEntities.forEach(function (entity) {
                if (entity.skipSave !== true) { changedEntities.push(entity); }
            });

            trackedEntities = [];
            additionalEntities.forEach(function (item) {
                if (!skipItems.some(function (entity) { return entity == item; })) {
                    if (!changedEntities.some(function (entity) { return entity.data == item; })) {
                        trackedEntities.push({ data: item, entitySet: this.getEntitySetFromElementType(item.getType().name) });
                    }
                }
            }, this);
        }


        changedEntities.forEach(function (d) {
            if (d.dependentOn) {
                var temp = [];
                for (var i = 0; i < d.dependentOn.length; i++) {
                    if (skipItems.indexOf(d.dependentOn[i]) < 0) {
                        temp.push(d.dependentOn[i]);
                    }
                }
                d.dependentOn = temp;
            }
        });
        skipItems = null;
        var ctx = this;
        if (changedEntities.length == 0) { clbWrapper.success(); return pHandlerResult; }

        this.storageProvider.saveChanges({
            success: function () {
                ctx._postProcessSavedItems(clbWrapper, changedEntities);
            }, error: clbWrapper.error
        }, changedEntities);
        return pHandlerResult;
    },
    prepareRequest: function () { },
    _postProcessSavedItems: function (callBack, changedEntities) {
        if (this.ChangeCollector && this.ChangeCollector instanceof $data.Notifications.ChangeCollectorBase)
            this.ChangeCollector.processChangedData(changedEntities);

        changedEntities.forEach(function (entity) {
            entity.data.entityState = $data.EntityState.Unchanged;
            entity.data.changedProperties = [];
            entity.physicalData = undefined;
        });
        if (!this.trackChanges) {
            this.stateManager.reset();
        }
        callBack.success(changedEntities.length);
    },
    forEachEntitySet: function (fn, ctx) {
        for (var entitySetName in this._entitySetReferences) {
            var actualEntitySet = this._entitySetReferences[entitySetName];
            fn.call(ctx, actualEntitySet);
        }
    },

    loadItemProperty: function (entity, property, callback) {
        Guard.requireType('entity', entity, $data.Entity);

        var memberDefinition = typeof property === 'string' ? $data.typeSystem.lookupMemberDefinition(entity.getType().memberDefinitions, property) : property;

        if (entity[memberDefinition.name] != undefined) {
            callback(entity[memberDefinition.name]);
            return;
        }

        var isSingleSide = true;
        var storageModel = this._storageModel.getStorageModel(entity.getType().fullName);
        var elementType = Container.resolveType(memberDefinition.dataType);
        if (elementType === $data.Array || (elementType.isAssignableTo && elementType.isAssignableTo($data.EntitySet))) {
            elementType = Container.resolveType(memberDefinition.elementType);

            isSingleSide = false;

        } else {
            var associations = storageModel.Associations.filter(function (assoc) { return assoc.FromPropertyName == memberDefinition.name; })[0];
            if (associations && associations.FromMultiplicity === "0..1" && associations.ToMultiplicity === "1")
                isSingleSide = false;
        }

        if (isSingleSide === true) {
            //singleSide

            var filterFunc = "function (e) { return";
            var filterParams = {};
            storageModel.LogicalType.memberDefinitions.getKeyProperties().forEach(function (memDefKey, index) {
                if (index > 0)
                    filterFunc += ' &&';
                filterFunc += " e." + memDefKey.name + " == this.key" + index;
                filterParams['key' + index] = entity[memDefKey.name];
            });
            filterFunc += "; }"

            return storageModel.EntitySetReference
                .map('function (e) { return e.' + memberDefinition.name + ' }')
                .single(filterFunc, filterParams, callback);
        } else {
            //multipleSide

            var filterFunc = "function (e) { return"
            var filterParams = {};
            storageModel.LogicalType.memberDefinitions.getKeyProperties().forEach(function (memDefKey, index) {
                if (index > 0)
                    filterFunc += ' &&';
                filterFunc += " e." + memberDefinition.inverseProperty + "." + memDefKey.name + " == this.key" + index;
                filterParams['key' + index] = entity[memDefKey.name];
            });
            filterFunc += "; }"

            var entitySet = this.getEntitySetFromElementType(elementType);
            return entitySet
                .filter(filterFunc, filterParams)
                .toArray(callback);
        }

    },

    getTraceString: function (queryable) {
        var query = new $data.Query(queryable.expression, queryable.entitySet);
        return this.storageProvider.getTraceString(query);
    },
    log: function (logInfo) {
        //noop as do nothing
    },

    resolveBinaryOperator: function (operator, expression, frameType) {
        return this.storageProvider.resolveBinaryOperator(operator, expression, frameType);
    },

    resolveUnaryOperator: function (operator, expression, frameType) {
        return this.storageProvider.resolveUnaryOperator(operator, expression, frameType);
    },

    resolveFieldOperation: function (operation, expression, frameType) {
        return this.storageProvider.resolveFieldOperation(operation, expression, frameType);
    },    
    attach: function(entity) {
        var entitySet = this.getEntitySetFromElementType(entity.getType());        
        return entitySet.attach(entity);
    },
    attachOrGet: function(entity) {
        var entitySet = this.getEntitySetFromElementType(entity.getType());
        return entitySet.attachOrGet(entity);
    },    
    add: function(entity) {
        var entitySet = this.getEntitySetFromElementType(entity.getType());
        return entitySet.add(entity);
    },
    remove: function (entity) {
        var entitySet = this.getEntitySetFromElementType(entity.getType());
        return entitySet.remove(entity);
    }
}, {
    _convertLogicalTypeNameToPhysical: function (name) {
        return name + '_$db$';
    },
    _storageModelCache: {
        get: function () {
            if(!this.__storageModelCache)
                this.__storageModelCache = {};
            return this.__storageModelCache;
        },
        set: function() {
            //todo exception
        }
    }
});
//TODO: remove "types" namespace
$data.EntityContext = $data.EntityContext;
