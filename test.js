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

test.serial('default', async t => {
    const db = await DB;
    await db.collection('mq').remove({});
    await mq(DB);
    t.is(await db.collection('mq').count(), 0);
});

test.after(async t => {
    const db = await DB;
    // await db.dropCollection('mq');
    await db.close();
});
