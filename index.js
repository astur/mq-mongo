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
    db = (async () => {
        const _db = await db;
        await _db.collection(name).createIndex({expires: 1, created: 1});
        await _db.collection(name).createIndex({tag: 1}, {unique: true, sparse: true});
        if(clean) await _db.collection(name).deleteMany({});
        items = prepare(items);
        if(items !== null) await _db.collection(name).insertMany(items);
        return _db;
    })();
    return {
        add: async items => {
            items = prepare(items);
            if(items === null) return [];
            const result = await (await db).collection(name).insertMany(items);
            return Object.values(result.insertedIds).map(id => `${id}`);
        },
        get: async (t = ttl) => {
            const result = await (await db).collection(name).findOneAndUpdate(
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
            );
            return result.value;
        },
        ack: async tag => {
            const result = await (await db).collection(name).findOneAndDelete({
                tag,
                expires: {$gt: after()},
            });
            return result.value ? `${result.value._id}` : result.value;
        },
        ping: async (tag, t = ttl) => {
            const result = await (await db).collection(name).findOneAndUpdate(
                {
                    tag,
                    expires: {$gt: after()},
                },
                {$set: {expires: after(t)}},
                {returnOriginal: false},
            );
            return result.value;
        },
        total: async () => (await db).collection(name).count(),
        waiting: async () => (await db).collection(name).count(Object.assign(
            {expires: {$lte: after()}},
            tries === null ? {} : {tries: {$lt: tries}},
        )),
        active: async () => (await db).collection(name).count(Object.assign(
            {expires: {$gt: after()}},
            tries === null ? {} : {tries: {$lt: tries}},
        )),
        failed: async () => (await db).collection(name).count({$or: [{tries: {$gte: tries}}, {tries: null}]}),
    };
};
