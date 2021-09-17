const crypto = require('crypto');

const shouldIgnore = (event) => {
  const { channel_type: channelType, bot_id: botId } = event;
  return channelType === 'im' && botId;
};

const validateRequest = (signature, time, rawBody, signSecret, validFor = 300) => {
  const requestValidFrom = Math.floor(Date.now() / 1000) - validFor;
  if (time < requestValidFrom) {
    throw new Error(`Request outdated: !(${time} < ${requestValidFrom})`);
  }

  const hmac = crypto.createHmac('sha256', signSecret);
  const [version, hash] = signature.split('=');
  hmac.update(`${version}:${time}:${rawBody}`);
  const digest = hmac.digest('hex');
  if (hash !== digest) {
    throw new Error(`Request signature mismatch: !('${hash}' === '${digest}')`);
  }
};

const teamsFromText = (text, teams) => {
  const tags = teams.reduce((acc, team) => [...acc, ...team.tags, team.name], []);
  const keywords = text.toLowerCase().split(' ').filter((word) => tags.includes(word));

  if (!keywords.length) {
    const names = teams.map((team) => team.name).join(' ');
    throw new Error(`Don't know any team to match that too. Available teams are \`${names}\`.`);
  }

  return teams.filter((team) => [team.name, ...team.tags].some((tag) => keywords.includes(tag)));
};

const getOncallForSchedule = async (team, id, pd) => {
  const userOnCall = await pd.schedules.listUsersOnCall(id, {
    time_zone: 'UTC',
    since: new Date().toISOString(),
    until: new Date(Date.now() + 1000).toISOString(),
  });
  const user = JSON.parse(userOnCall.body).users.pop();

  const contactMethods = await pd.users.listContactMethods(user.id);
  const userDetails = JSON.parse(contactMethods.body);
  const contact = userDetails.contact_methods.find((e) => e.type === 'phone_contact_method');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: contact ? `+${contact.country_code}${contact.address}` : null,
    time_zone: user.time_zone,
    team,
  };
};

const getOncallForTeams = async (teams, pd) => {
  const promises = teams.map((team) => team.schedules.map(async (scheduleId) => {
    try {
      return await getOncallForSchedule(team.name, scheduleId, pd);
    } catch (e) {
      return { error: `Unexpected error when fetching oncallee for ${team.name}` };
    }
  })).flat();
  return Promise.all(promises);
};

const formatResponse = (oncalls) => oncalls
  .map((user) => {
    if (user.error) {
      return user.error;
    }
    const details = user.phone ? `Call at <tel:${user.phone}.>` : 'There\'s no number to call.';
    return `${user.name} is oncall for ${user.team}. ${details}`;
  })
  .join('\n');

module.exports.process = async (event, di, config) => {
  const { body, rawBody } = event;

  if (body.challenge) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: body.challenge };
  }

  if (body.event) {
    if (shouldIgnore(body.event)) {
      return { statusCode: 200 };
    }

    try {
      const { 'X-Slack-Signature': sign, 'X-Slack-Request-Timestamp': ts } = event.headers;
      validateRequest(sign, ts, rawBody, config.slackSignSecret, config.slackValidTime);
    } catch (e) {
      console.log('Request invalid', e);
      return { statusCode: 200 };
    }

    const { channel, text } = body.event;
    let response;
    try {
      const teams = teamsFromText(text, di.teams);
      const oncalls = await getOncallForTeams(teams, di.pagerdutyClient);
      response = formatResponse(oncalls);
    } catch (e) {
      response = e.message;
    }

    return di.slackWebClient.chat.postMessage({ channel, text: response });
  }

  return { statusCode: 200 };
};
