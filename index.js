module.exports = (db, {
    name = 'mq',
    ttl = 30000,
    tries = 10,
} = {}) => {
    db = (async () => {
        const _db = await db;
        // Here will be indexes, cleanups, inits, etc.
        return _db;
    })();
    return {
        add: async () => {},
        get: async () => {},
        ack: async () => {},
        ping: async () => {},
    };
};
