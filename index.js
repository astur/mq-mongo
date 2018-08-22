const crypto = require('crypto');

module.exports = (db, {
    name = 'mq',
    ttl = 30000,
    tries = 10,
    clean = false,
    insistent = false,
    items = null,
    strict = false,
} = {}) => {
    const after = (ttl = 0) => Date.now() + ttl;
    const id = () => crypto.randomBytes(16).toString('hex');
    const prepare = items => {
        if([null, undefined].includes(items)) return null;
        const prepared = (Array.isArray(items) ? items : [items])
            .map(item => Object.assign(
                {data: item, created: after(), expires: 0},
                tries === null ? {} : {tries: 0},
            ));
        if(prepared.length === 0) return null;
        return prepared;
    };

    const coll = (async () => {
        const coll = (await db).collection(name);
        await coll.createIndex({expires: 1, created: 1});
        await coll.createIndex({tag: 1}, {unique: true, sparse: true});
        if(clean) await coll.deleteMany({});
        const prepared = prepare(items);
        if(prepared !== null) await coll.insertMany(prepared);
        return coll;
    })();

    const total = async () => (await coll).countDocuments();

    const waiting = async () => (await coll).countDocuments(Object.assign(
        {expires: {$lte: after()}},
        tries === null ? {} : {tries: {$lt: tries}},
    ));

    const active = async () => (await coll).countDocuments({expires: {$gt: after()}});

    const failed = async () => tries === null ? 0 : (await coll).countDocuments({
        tries: {$gte: tries},
        expires: {$lte: after()},
    });

    const stats = async () => {
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
        return Object.assign(
            {
                active: 0,
                waiting: 0,
                failed: 0,
            },
            ...(await st).map(v => ({[v.type]: v.count})),
        );
    };

    const add = async items => {
        const prepared = prepare(items);
        if(prepared === null) return [];
        const result = await (await coll).insertMany(prepared);
        return Object.values(result.insertedIds).map(id => `${id}`);
    };

    const get = async (t = ttl) => (await coll).findOneAndUpdate(
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
    ).then(async result => {
        if(strict && result.value === null){
            const e = new Error('Unable to get task from queue');
            e.stats = await stats();
            e.name = 'QueueGetError';
            throw e;
        }
        return result.value;
    });

    const ack = async tag => (await coll).findOneAndDelete({
        tag,
        expires: {$gt: after()},
    }).then(result => result.value ? `${result.value._id}` : result.value);

    const ping = async (tag, t = ttl) => (await coll).findOneAndUpdate(
        {
            tag,
            expires: {$gt: after()},
        },
        {$set: {expires: after(t)}},
        {returnOriginal: false},
    ).then(result => result.value);

    return {
        add,
        get,
        ack,
        ping,
        total,
        waiting,
        active,
        failed,
        stats,

        get options(){
            return {ttl, tries, insistent};
        },
    };
};
