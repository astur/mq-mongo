module.exports = (db, {
    name = 'mq',
    ttl = 30000,
    tries = 10,
} = {}) => {
    const after = (ttl = 0) => Date.now() + ttl;
    const id = () => require('crypto').randomBytes(16).toString('hex');
    db = (async () => {
        const _db = await db;
        // Here will be indexes, cleanups, inits, etc.
        return _db;
    })();
    return {
        add: async items => {
            const _db = await db;
            if([null, undefined].includes(items)) return [];
            items = (Array.isArray(items) ? items : [items])
                .map(item => ({
                    data: item,
                    created: after(),
                    expires: 0,
                    tries: 0,
                }));
            const result = await _db.collection('mq').insertMany(items);
            return Object.values(result.insertedIds).map(id => `${id}`);
        },
        get: async (t = ttl) => {
            const _db = await db;
            const result = await _db.collection('mq').findOneAndUpdate(
                {
                    expires: {$lte: after()},
                    tries: {$lte: tries},
                },
                {
                    $inc: {tries: 1},
                    $set: {
                        tag: id(),
                        expires: after(t),
                    },
                },
                {
                    returnOriginal: false,
                    sort: {
                        expires: 1,
                        created: 1,
                    },
                },
            );
            return result.value;
        },
        ack: async tag => {
            const _db = await db;
            const result = await _db.collection('mq').findOneAndDelete({
                tag,
                expires: {$gt: after()},
            });
            return result.value ? `${result.value._id}` : result.value;
        },
        ping: async () => {},
    };
};
