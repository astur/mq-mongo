const test = require('ava');
const mq = require('.');

const mongo = require('mongodb').MongoClient;
const mongoString = process.env.MONGO_URI ||
    'mongodb://localhost:27017/test';

const DB = mongo.connect(mongoString)
    .then(client => {
        const db = client.db(mongoString.split('/').pop());
        db.close = client.close.bind(client);
        return db;
    })
    .catch(e => {
        console.log(e.message);
        process.exit(1);
    });

test.serial('add', async t => {
    const db = await DB;
    await db.collection('mq').remove({});
    const q = mq(DB);
    t.is(await db.collection('mq').count(), 0);
    const result = await q.add('test');
    t.is(result.length, 1);
    t.is(typeof result[0], 'string');
    t.is(await db.collection('mq').count(), 1);
    t.is((await db.collection('mq').findOne({})).data, 'test');
});

test.serial('get', async t => {
    const db = await DB;
    await db.collection('mq').remove({});
    const q = mq(DB);
    t.is(await db.collection('mq').count(), 0);
    await q.add('test1');
    await q.add('test2');
    await q.add('test3');
    t.deepEqual(
        [
            await q.get(1),
            await q.get(),
            await q.get(),
            await q.get(),
            await q.get(),
        ].map(v => v === null ? v : v.data),
        ['test1', 'test2', 'test3', 'test1', null],
    );
    t.is(await db.collection('mq').count(), 3);
});

test.after(async t => {
    const db = await DB;
    await db.dropCollection('mq');
    await db.close();
});
