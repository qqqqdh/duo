const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MAX_PDFS = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const pdfjsRoot = path.resolve(path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')), '../..');

function decodePdfUploads(uploads) {
  if (uploads === undefined) return [];
  if (!Array.isArray(uploads) || uploads.length > MAX_PDFS) {
    throw new Error('PDF는 최대 3개까지 업로드할 수 있습니다.');
  }

  let totalBytes = 0;
  return uploads.map((upload) => {
    const name = typeof upload?.name === 'string'
      ? path.posix.basename(upload.name.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100)
      : '';
    if (!/\.pdf$/i.test(name)) throw new Error('PDF 파일만 업로드할 수 있습니다.');

    const data = upload.data;
    if (typeof data !== 'string' || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error(`${name}: 잘못된 PDF 데이터입니다.`);
    }
    const bytes = Buffer.from(data, 'base64');
    totalBytes += bytes.length;
    if (!bytes.length || bytes.length > MAX_PDF_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('PDF는 각 10MB, 전체 20MB까지 업로드할 수 있습니다.');
    }
    if (bytes.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error(`${name}: PDF 형식이 아닙니다.`);
    }
    return { name, bytes };
  });
}

async function savePdfUploads(projectPath, uploads, signal) {
  if (!uploads.length) return [];
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const extracted = [];

  for (const { name, bytes } of uploads) {
    if (signal.aborted) return [];
    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      cMapUrl: pathToFileURL(path.join(pdfjsRoot, 'cmaps') + path.sep).href,
      standardFontDataUrl: pathToFileURL(path.join(pdfjsRoot, 'standard_fonts') + path.sep).href,
      useSystemFonts: true,
      isEvalSupported: false
    });
    try {
      const pdf = await loadingTask.promise;
      if (pdf.numPages > 100) throw new Error(`${name}: 100페이지를 초과합니다.`);
      const pages = [];
      let textLength = 0;
      let hasText = false;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (signal.aborted) return [];
        const page = await pdf.getPage(pageNumber);
        const { items } = await page.getTextContent();
        const content = items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').trim();
        if (content) hasText = true;
        const pageText = `## ${pageNumber}페이지\n${content}`;
        pages.push(pageText);
        textLength += pageText.length;
        page.cleanup();
        if (textLength > 300000) throw new Error(`${name}: 추출된 텍스트가 너무 깁니다.`);
      }
      const text = pages.join('\n\n');
      if (!hasText) {
        throw new Error(`${name}: 읽을 수 있는 텍스트가 없습니다. 이미지 스캔 PDF는 지원하지 않습니다.`);
      }
      extracted.push({ name, bytes, text });
    } finally {
      await loadingTask.destroy();
    }
  }

  if (signal.aborted) return [];
  const dir = path.join(projectPath, 'references');
  fs.mkdirSync(dir, { recursive: true });
  return extracted.map(({ name, bytes, text }, index) => {
    const base = `document-${index + 1}`;
    fs.writeFileSync(path.join(dir, `${base}.pdf`), bytes);
    fs.writeFileSync(path.join(dir, `${base}.txt`), `원본 파일: ${name}\n\n${text}\n`, 'utf8');
    return { name, pdfPath: `references/${base}.pdf`, textPath: `references/${base}.txt` };
  });
}

module.exports = { decodePdfUploads, savePdfUploads };
