const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decodePdfUploads } = require('../lib/pdfUploads');
const projectManager = require('../lib/projectManager');
const orchestrator = require('../lib/orchestrator');
const agentRunner = require('../lib/agentRunner');

function textPdf(text) {
  const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('uploaded PDF text reaches both agents', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-pdf-'));
  const previousBase = projectManager.baseDir;
  const previousAntigravity = agentRunner.runAntigravity;
  const previousCodex = agentRunner.runCodex;
  const prompts = [];
  projectManager.baseDir = base;
  agentRunner.runAntigravity = async ({ prompt }) => {
    prompts.push(prompt);
    return { output: 'Draft plan' };
  };
  agentRunner.runCodex = async ({ prompt }) => {
    prompts.push(prompt);
    return { output: 'Reviewed plan' };
  };
  t.after(() => {
    projectManager.baseDir = previousBase;
    agentRunner.runAntigravity = previousAntigravity;
    agentRunner.runCodex = previousCodex;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const bytes = textPdf('Duo PDF text');
  const pdfs = decodePdfUploads([{ name: 'notes.pdf', data: bytes.toString('base64') }]);
  await orchestrator.startSprint({ prompt: 'Summarize the PDF', mode: 'debate_only', pdfs });

  assert.equal(orchestrator.currentSession.status, 'completed');
  assert.equal(prompts.length, 2);
  assert.ok(prompts.every(prompt => prompt.includes('references/document-1.txt')));
  const textPath = path.join(orchestrator.currentSession.projectPath, 'references', 'document-1.txt');
  assert.match(fs.readFileSync(textPath, 'utf8'), /Duo PDF text/);
  assert.deepEqual(fs.readFileSync(path.join(orchestrator.currentSession.projectPath, 'references', 'document-1.pdf')), bytes);
});

test('invalid PDF uploads are rejected', () => {
  assert.throws(() => decodePdfUploads([{ name: 'notes.txt', data: 'aGVsbG8=' }]), /PDF 파일만/);
  assert.throws(() => decodePdfUploads([{ name: 'notes.pdf', data: 'aGVsbG8=' }]), /PDF 형식/);
  assert.throws(() => decodePdfUploads([{ name: 'notes.pdf', data: 'not base64' }]), /잘못된 PDF 데이터/);
});
