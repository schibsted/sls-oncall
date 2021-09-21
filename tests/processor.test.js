const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const processor = require('../processor');
const testEvent = require('./event');

chai.use(chaiAsPromised);
const { assert } = chai;

describe('processor.js', () => {
  it('should respond with challenge when given challenge', async () => {
    const event = {
      body: { challenge: 'xyz' },
    };
    const r = processor.process(event, {}, {});
    return assert.eventually.deepEqual(r, { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'xyz' });
  });

  it('should throw error when event is missing', async () => {
    const event = {
      body: { noevent: {} },
    };
    const r = processor.process(event, {}, {});
    return assert.isRejected(r, /Event missing/);
  });

  it('should throw error when message is in im from bot', () => {
    const event = {
      body: { event: { channel_type: 'im', bot_id: '123' } },
    };
    const r = processor.process(event, {}, {});
    return assert.isRejected(r, /Message ignored/);
  });

  it('should throw error when message is outdated', () => {
    const c = {
      slackSignSecret: 'xyz',
      slackValidTime: 10,
    };
    const r = processor.process({ ...testEvent }, {}, c);
    return assert.isRejected(r, /Request outdated: .*/);
  });

  it('should throw error when message has invalid signature', () => {
    const c = {
      slackSignSecret: 'xyzz',
      slackValidTime: Number.MAX_SAFE_INTEGER,
    };
    const r = processor.process({ ...testEvent }, {}, c);
    return assert.isRejected(r, /Request signature mismatch: .*/);
  });

  it('should call Slack with message when no team match ', async () => {
    const c = {
      slackSignSecret: 'xyz',
      slackValidTime: Number.MAX_SAFE_INTEGER,
    };
    const slackWebClient = { chat: { postMessage: sinon.spy() } };
    const teams = [{ name: 'abc', schedules: ['P9XYZ9K'], tags: ['xyz'] }];

    await processor.process({ ...testEvent }, { slackWebClient, teams }, c);
    assert.isTrue(slackWebClient.chat.postMessage.calledOnce);
    const args = slackWebClient.chat.postMessage.getCall(0).firstArg;
    assert.equal(args.channel, testEvent.body.event.channel);
    return assert.equal(args.text, "Don't know any team to match that too. Available teams are `abc`.");
  });

  it('should request PagerDuty with schedule', async () => {
    const c = {
      slackSignSecret: 'xyz',
      slackValidTime: Number.MAX_SAFE_INTEGER,
    };
    const slackWebClient = { chat: { postMessage: sinon.spy() } };

    const listUsersOnCall = sinon.stub().resolves({
      body: JSON.stringify({
        users: [{
          id: '123', name: 'John', email: 'john@doe.org', time_zone: 'Europe/Oslo',
        }],
      }),
    });
    const listContactMethods = sinon.stub().resolves({
      body: JSON.stringify({
        contact_methods: [{ type: 'phone_contact_method', country_code: 46, address: '123' }],
      }),
    });
    const pagerdutyClient = {
      schedules: { listUsersOnCall },
      users: { listContactMethods },
    };
    const teams = [{ name: 'ab', schedules: ['P9XYZ9K'], tags: ['xyz'] }];

    await processor.process({ ...testEvent }, { slackWebClient, pagerdutyClient, teams }, c);
    assert.isTrue(listUsersOnCall.calledOnceWith('P9XYZ9K'));
    assert.isTrue(listContactMethods.calledOnceWith('123'));
    assert.isTrue(slackWebClient.chat.postMessage.calledOnce);

    const args = slackWebClient.chat.postMessage.getCall(0).firstArg;
    assert.equal(args.channel, testEvent.body.event.channel);
    return assert.equal(args.text, 'John is oncall for ab. Call at <tel:+46123.>');
  });
});
