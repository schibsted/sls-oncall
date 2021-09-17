const { WebClient } = require('@slack/web-api');
const PD = require('node-pagerduty');
const processor = require('./processor');
const teams = require('./teams.json');

const slackWebClient = new WebClient(process.env.SLACK_TOKEN);
const pagerdutyClient = new PD(process.env.PD_TOKEN);
const slackSignSecret = process.env.SLACK_SIGN_SECRET;
const slackValidTime = process.env.SLACK_VALID_TIME || 300;

module.exports.handler = async (event) => {
  console.log('Received request', event);
  return processor.process(event, {
    slackWebClient,
    pagerdutyClient,
    teams,
  }, {
    slackSignSecret,
    slackValidTime,
  });
};
