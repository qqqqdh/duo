const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

test('the local API rejects cross-origin and invalid sprint requests', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/sprint/start`;

  const crossOrigin = await fetch(url, {
    method: 'POST',
    headers: { origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test', runMode: 'sim' })
  });
  assert.equal(crossOrigin.status, 403);

  const invalid = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: {}, runMode: 'sim' })
  });
  assert.equal(invalid.status, 400);
});
