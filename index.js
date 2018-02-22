module.exports = (db, {
    name = 'mq',
    ttl = 30000,
    tries = 10,
} = {}) => {
    const after = (ttl = 0) => Date.now() + ttl;
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
        get: async () => {},
        ack: async () => {},
        ping: async () => {},
    };
};
