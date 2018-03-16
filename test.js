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
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB);
    const result = await q.add('test');
    t.is(result.length, 1);
    t.is(typeof result[0], 'string');
    t.is(await coll.count(), 1);
    t.is((await coll.findOne({})).data, 'test');
    t.deepEqual(await q.add(), []);
    t.deepEqual(await q.add(null), []);
    t.deepEqual(await q.add([]), []);
});

test.serial('get', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB);
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
    t.is(await coll.count(), 3);
});

test.serial('ack', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB);
    await q.add('test');
    const msg1 = await q.get(1);
    t.is(msg1.data, 'test');
    await delay(10);
    t.is(await q.ack(msg1.tag), null);
    t.is(await coll.count(), 1);
    const msg2 = await q.get();
    t.is(msg2.data, 'test');
    t.is(typeof await q.ack(msg2.tag), 'string');
    t.is(await coll.count(), 0);
});

test.serial('ping', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB);
    await q.add('test');
    const msg = await q.get();
    t.is((await q.ping(msg.tag, 1)).data, 'test');
    await delay(100);
    t.is(await q.ping(msg.tag, 1), null);
});

test.serial('name', async t => {
    const coll = (await DB).collection('named');
    await coll.remove({});
    const q = mq(DB, {name: 'named'});
    await q.add('test');
    t.is(await coll.count(), 1);
    t.is((await coll.findOne({})).data, 'test');
    const msg = await q.get();
    t.is(msg.data, 'test');
});

test.serial('tries', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {tries: 1});
    await q.add('test');
    t.is((await q.get(100)).data, 'test');
    await delay(200);
    t.is(await q.get(100), null);
    t.is(await coll.count(), 1);
});

test.serial('ttl', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {ttl: 100});
    await q.add('test');
    t.is(await coll.count(), 1);
    t.is((await q.get()).data, 'test');
    await delay(200);
    t.is((await q.get()).data, 'test');
    t.is(await q.get(), null);
});

test.serial('null-tries', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {tries: null});
    await q.add('test');
    t.is(await coll.count(), 1);
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    t.is((await q.get(1).then(delay(10))).tries, undefined);
    t.is((await q.get(1).then(delay(10))).data, 'test');
});

test.serial('clean', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    await coll.insertMany([{}, {}, {}]);
    const q = mq(DB, {clean: true});
    await q.get();
    t.is(await coll.count(), 0);
});

test.serial('insistent', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {insistent: true});
    await q.add('test1').then(delay(10));
    await q.add('test2');
    t.is((await q.get(1)).data, 'test1');
    await delay(10);
    t.is((await q.get(1)).data, 'test1');
});

test.serial('size', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {tries: 1});
    await q.add(Array(9).fill(''));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get(1).then(delay(10));
    await q.get();
    await q.get();
    t.deepEqual(await q.stats(), {active: 2, failed: 3, waiting: 4});
    t.is(await q.total(), 9);
    t.is(await q.waiting(), 4);
    t.is(await q.active(), 2);
    t.is(await q.failed(), 3);
});

test.serial('init items', async t => {
    const coll = (await DB).collection('mq');
    await coll.remove({});
    const q = mq(DB, {items: ['test1', 'test2']});
    t.is(await q.total(), 2);
    t.is(await q.waiting(), 2);
});

test.after(async t => {
    const db = await DB;
    await db.dropCollection('mq');
    await db.dropCollection('named');
    await db.close();
});
