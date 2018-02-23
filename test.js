const test = require('ava');
const delay = require('delay');
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
    await q.add('test1').then(delay(10));
    await q.add('test2').then(delay(10));
    await q.add('test3');
    t.deepEqual(
        [
            await q.get(1).then(delay(10)),
            await q.get(),
            await q.get(),
            await q.get(),
            await q.get(),
        ].map(v => v === null ? v : v.data),
        ['test1', 'test2', 'test3', 'test1', null],
    );
    t.is(await db.collection('mq').count(), 3);
});

test.serial('ack', async t => {
    const db = await DB;
    await db.collection('mq').remove({});
    const q = mq(DB);
    t.is(await db.collection('mq').count(), 0);
    await q.add('test');
    const msg1 = await q.get(1);
    t.is(msg1.data, 'test');
    t.is(await q.ack(msg1.tag), null);
    t.is(await db.collection('mq').count(), 1);
    const msg2 = await q.get();
    t.is(msg2.data, 'test');
    t.is(typeof await q.ack(msg2.tag), 'string');
    t.is(await db.collection('mq').count(), 0);
});

test.serial('ping', async t => {
    const db = await DB;
    await db.collection('mq').remove({});
    const q = mq(DB);
    t.is(await db.collection('mq').count(), 0);
    await q.add('test');
    const msg = await q.get();
    t.is((await q.ping(msg.tag, 1)).data, 'test');
    await delay(100);
    t.is(await q.ping(msg.tag, 1), null);
});

test.serial('name', async t => {
    const db = await DB;
    await db.collection('named').remove({});
    const q = mq(DB, {name: 'named'});
    await q.add('test');
    t.is(await db.collection('named').count(), 1);
    t.is((await db.collection('named').findOne({})).data, 'test');
    const msg = await q.get();
    t.is(msg.data, 'test');
});

test.after(async t => {
    const db = await DB;
    await db.dropCollection('mq');
    await db.dropCollection('named');
    await db.close();
});
