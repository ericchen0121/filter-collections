FilterCollections = {};

FilterCollections._extendedPublishCursor = function (cursor, sub, collection, name) {
    var observeHandle = cursor.observeChanges({
        added: function (id, fields) {
            // Add the name of this filter collection
            if (name) {
                fields.__filter = name;
            }
            sub.added(collection, id, fields);
        },
        changed: function (id, fields) {
            if (name) {
                fields.__filter = name;
            }
            sub.changed(collection, id, fields);
        },
        removed: function (id) {
            sub.removed(collection, id);
        }
    });

    // We don't call sub.ready() here: it gets called in livedata_server, after
    // possibly calling _publishCursor on multiple returned cursors.

    // register stop callback (expects lambda w/ no args).
    sub.onStop(function () {
        observeHandle.stop();
    });
};

FilterCollections.publish = function (collection, options) {
    var optionalFunction = Match.Optional(Function);

    check(collection, Mongo.Collection);
    var optionalString = Match.Optional(String);
    check(options, Match.Optional({
        name: optionalString,
        callbacks: Match.Optional({
            allow: optionalFunction,
            beforePublish: optionalFunction,
            afterPublish: optionalFunction
        })
    }));
    options = options || {};
    var callbacks = options.callbacks || {};

    _.defaults(options, {
        name: collection._name
    });

    var publisherResultsCollectionName = options.name;
    var publisherResultsId = 'fc-' + options.name + '-results';
    var publisherCountId = 'fc-' + options.name + '-count';
    var publisherCountCollectionName = options.name + 'CountFC';

    /**
     * Publish query results.
     */

    Meteor.publish(publisherResultsId, function (query) {
        var self = this;
        var allow = true;

        // Check if this publish is allowed.
        if (callbacks.allow) {
            allow = callbacks.allow(query, this);
        }

        if (!allow) {
            throw new Meteor.Error(417, 'Not allowed');
        }

        query = query || {};

        _.defaults(query, {
            selector: {},
            options: {}
        });

        _.defaults(query.options, {
            sort: [],
            skip: 0,
            limit: 10
        });

        if (callbacks.beforePublish) {
            query = callbacks.beforePublish(query, this) || query;
        }


        var cursor = collection.find(query.selector, query.options);

        if (callbacks.afterPublish) {
            cursor = callbacks.afterPublish('results', cursor, this) || cursor;
        }

        FilterCollections._extendedPublishCursor(cursor, this, publisherResultsCollectionName, publisherResultsId);

        // Call ready since the extended publish cursor, like the official publish cursor version, does not call
        // ready by itself.
        self.ready();
    });

    /**
     * Publish result count.
     */

    Meteor.publish(publisherCountId, function (query) {
        var self = this;
        var allow = true;
        var cursor = {};

        if (callbacks.allow
            && _.isFunction(callbacks.allow)) {
            allow = callbacks.allow(query, this);
        }

        if (!allow) {
            throw new Meteor.Error(417, 'Not allowed');
        }

        query = query || {};
        _.defaults(query, {
            selector: {}
        });

        if (callbacks.beforePublish) {
            query = callbacks.beforePublish(query, this) || query;
        }

        var count = collection.find(query.selector).count() || 0;

        if (callbacks.afterPublish) {
            cursor = callbacks.afterPublish('count', cursor, this) || cursor;
        }

        self.added(publisherCountCollectionName, Meteor.uuid(), {
            count: count,
            query: query
        });

        self.ready();
    });
};
