# mq-mongo

Easy message queue on mongo

[![Build Status][travis-image]][travis-url]
[![NPM version][npm-image]][npm-url]

## Install

```bash
npm i mq-mongo
```

## Usage

```js
const mq = require('mq-mongo');
const q = mq(db, options);
q.get().then(msg => {/* Do something */});
```

* __`db`__ - mongo db object (or promise resolves to). Only required parameter.

#### options

* __`options.name`__ - name of mongo collection for queue. Defaults to `'mq'`.
* __`options.ttl`__ - time-to-live (ms) for taken message before it will be acked or returned to queue. Defaults to 30000.
* __`options.tries`__ - just how many times single message may be taken and returned to queue without ack. Defaults to 10.

#### methods (all asinc)

* __`q.add(something)`__ - adds single message or array of messages to queue. Returns array of `_id` strings for added messages.
* __`q.get(ttl)`__ - gets message from queue. Optional parameter is individual `ttl` for that specific message. Returns message object or `null` (if no messages ready).
* __`q.ack(tag)`__ - deletes successfully handled message (specified by tag field) from queue. Returns `_id` string of deleted message or null (if no message with such tag or if ttl expires).
* __`q.ping(tag, ttl)`__ - prolong ttl of message specified by tag field. Optional parameter `ttl` defaults to `options.ttl` of queue.

#### message fields

* __`msg._id`__ - mongo objectID of message.
* __`msg.data`__ - payload data of message.
* __`msg.created`__ - time (unix TS, number) when message was added to queue.
* __`msg.expires`__ - time (unix TS, number) when message will returns to queue.
* __`msg.tries`__ - just how many times this message was getted from queue.
* __`msg.tag`__ - unique tag for this try (for use in `ack` and `ping`).

## Example

```js
const mq = require('mq-mongo');

(async () => {
    const q = mq(db, {
        name = 'mq', // default mongo collection name
        ttl = 30000, // default message ttl
        tries = 10,  // default tries to handle message
    });
    await q.add('test');
    const msg = await q.get();
    await doSomethingWithData(msg.data);
    await q.ack(msg.tag);
})();

```

See tests for more complicated examples.

## License

MIT

[npm-url]: https://npmjs.org/package/mq-mongo
[npm-image]: https://badge.fury.io/js/mq-mongo.svg
[travis-url]: https://travis-ci.org/astur/mq-mongo
[travis-image]: https://travis-ci.org/astur/mq-mongo.svg?branch=master