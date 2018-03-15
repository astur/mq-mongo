module.exports = (db, {
    name = 'mq',
    ttl = 30000,
    tries = 10,
    clean = false,
    insistent = false,
    items = null,
} = {}) => {
    const after = (ttl = 0) => Date.now() + ttl;
    const id = () => require('crypto').randomBytes(16).toString('hex');
    const prepare = items => {
        if([null, undefined].includes(items)) return null;
        items = (Array.isArray(items) ? items : [items])
            .map(item => Object.assign(
                {data: item, created: after(), expires: 0},
                tries === null ? {} : {tries: 0},
            ));
        if(!items.length) return null;
        return items;
    };

    const coll = (async () => {
        const coll = (await db).collection(name);
        await coll.createIndex({expires: 1, created: 1});
        await coll.createIndex({tag: 1}, {unique: true, sparse: true});
        if(clean) await coll.deleteMany({});
        items = prepare(items);
        if(items !== null) await coll.insertMany(items);
        return coll;
    })();

    return {
        add: async items => {
            items = prepare(items);
            if(items === null) return [];
            const result = await (await coll).insertMany(items);
            return Object.values(result.insertedIds).map(id => `${id}`);
        },

        get: async (t = ttl) => (await coll).findOneAndUpdate(
            Object.assign(
                {expires: {$lte: after()}},
                tries === null ? {} : {tries: {$lt: tries}},
            ),
            Object.assign(
                {$set: {tag: id(), expires: after(t)}},
                tries === null ? {} : {$inc: {tries: 1}},
            ),
            {
                returnOriginal: false,
                sort: {
                    expires: insistent ? -1 : 1,
                    created: 1,
                },
            },
        ).then(result => result.value),

        ack: async tag => (await coll).findOneAndDelete({
            tag,
            expires: {$gt: after()},
        }).then(result => result.value ? `${result.value._id}` : result.value),

        ping: async (tag, t = ttl) => (await coll).findOneAndUpdate(
            {
                tag,
                expires: {$gt: after()},
            },
            {$set: {expires: after(t)}},
            {returnOriginal: false},
        ).then(result => result.value),

        total: async () => (await coll).count(),

        waiting: async () => (await coll).count(Object.assign(
            {expires: {$lte: after()}},
            tries === null ? {} : {tries: {$lt: tries}},
        )),

        active: async () => (await coll).count({expires: {$gt: after()}}),

        failed: async () => tries === null ? 0 : (await coll).count({
            tries: {$gte: tries},
            expires: {$lte: after()},
        }),

        stats: async () => {
            const st = (await coll).aggregate([
                {
                    $group: {
                        _id: {
                            type: {
                                $cond: [
                                    {$gt: ['$expires', after()]},
                                    'active',
                                    tries === null ? 'waiting' :
                                        {$cond: [{$gte: ['$tries', tries]}, 'failed', 'waiting']},
                                ],
                            },
                        },
                        count: {$sum: 1},
                    },
                },
                {
                    $project: {
                        type: '$_id.type',
                        count: 1,
                        _id: 0,
                    },
                },
            ]).toArray();
            return Object.assign(...(await st).map(v => ({[v.type]: v.count})));
        },
    };
};
