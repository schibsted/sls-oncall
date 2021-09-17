const { assert } = require('chai');

const teams = require('../teams.json');

describe('teams.json', () => {
  it('should be an array of objects', () => {
    assert.isArray(teams);
    teams.map((t) => assert.isObject(t));
  });
  it('should follow schema', () => teams.map((t) => {
    assert.isString(t.name);

    assert.isArray(t.schedules);
    t.schedules.map((s) => assert.isString(s));

    assert.isArray(t.tags);
    t.tags.map((s) => assert.isString(s));
    return true;
  }));
  it('should contain unique team names', () => {
    const names = teams.map((t) => t.name);
    const uniques = [...new Set(names)];
    return assert.equal(names.length, uniques.length);
  });
  it('should contain unique tags and names', () => {
    const tags = teams.reduce((a, t) => [...a, ...t.tags, t.name], []);
    const uniques = [...new Set(tags)];
    return assert.equal(tags.length, uniques.length, `Duplicate ${tags.filter((s, i) => tags.indexOf(s) !== i)}`);
  });
  it('should only contain lower case letter', () => {
    const tags = teams.reduce((a, t) => [...a, ...t.tags, t.name], []);
    const notLowerCase = tags.filter((t) => t !== t.toLowerCase());
    assert.isEmpty(notLowerCase);
  });
});
