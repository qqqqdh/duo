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

  const invalidPdf = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Read this PDF', pdfs: [{ name: 'notes.pdf', data: Buffer.from('not a PDF').toString('base64') }] })
  });
  assert.equal(invalidPdf.status, 400);
  assert.match((await invalidPdf.json()).error, /PDF 형식/);

  const simulationPdf = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Read this PDF', runMode: 'sim', pdfs: [{ name: 'notes.pdf', data: Buffer.from('%PDF-1.4').toString('base64') }] })
  });
  assert.equal(simulationPdf.status, 400);
  assert.match((await simulationPdf.json()).error, /실제 CLI/);
});
