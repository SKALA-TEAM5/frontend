import type { ReportDraft, ReportTable } from './report-draft';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const encoder = new TextEncoder();

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const paragraph = (text: string, style?: 'Title' | 'Heading1' | 'Heading2' | 'Note' | 'Signature' | 'TableText') => {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const lines = text.split('\n');
  const runs = lines.map((line, index) => `<w:r>${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('');
  return `<w:p>${styleXml}${runs}</w:p>`;
};

const PAGE_TEXT_WIDTH = 9072;

const columnWidths = (table: ReportTable) => {
  const columnCount = Math.max(table.headers.length, ...table.rows.map((row) => row.length));
  if (columnCount <= 0) return [];
  if (table.headers[0] === 'No.') {
    const noWidth = 520;
    const remaining = PAGE_TEXT_WIDTH - noWidth;
    if (table.headers.includes('실행 내용') && columnCount === 5) return [520, 2100, 3850, 1580, 1588];
    return [noWidth, ...Array.from({ length: columnCount - 1 }, () => Math.floor(remaining / (columnCount - 1)))];
  }
  if (table.headers.length === 0 && columnCount === 2) return [1800, PAGE_TEXT_WIDTH - 1800];
  if (table.headers.length === 0 && columnCount === 4) return [1800, 3019, 1800, 3019];
  return Array.from({ length: columnCount }, () => Math.floor(PAGE_TEXT_WIDTH / columnCount));
};

const tableXml = (table: ReportTable) => {
  const rows = table.headers.length ? [table.headers, ...table.rows] : table.rows;
  const widths = columnWidths(table);
  return `<w:tbl>
    <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${PAGE_TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:left w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:right w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/></w:tblBorders></w:tblPr>
    <w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
    ${rows.map((row, rowIndex) => `<w:tr>${row.map((cell, cellIndex) => `<w:tc><w:tcPr><w:tcW w:w="${widths[cellIndex] || Math.floor(PAGE_TEXT_WIDTH / Math.max(row.length, 1))}" w:type="dxa"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar><w:shd w:fill="${(rowIndex === 0 && table.headers.length) || (!table.headers.length && cellIndex % 2 === 0) ? 'EEF3F0' : 'FFFFFF'}"/></w:tcPr>${paragraph(cell || ' ', 'TableText')}</w:tc>`).join('')}</w:tr>`).join('')}
  </w:tbl>`;
};

const titleParagraphs = (title: string) => {
  if (title.includes('산업안전보건관리비') && title.includes('집행 증빙 검토 결과 보고서')) {
    return `${paragraph('산업안전보건관리비', 'Title')}${paragraph('집행 증빙 검토 결과 보고서', 'Title')}`;
  }
  return paragraph(title, 'Title');
};

const documentXml = (draft: ReportDraft) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph(' ')}
    ${paragraph(' ')}
    ${paragraph(' ')}
    ${titleParagraphs(draft.title)}
    ${draft.report_sections.map((section) => `
      ${section.section_id === 'cover' ? '' : paragraph(section.title, 'Heading1')}
      ${section.paragraphs.map((item, index) => paragraph(item, section.section_id === 'overall_opinion' && index >= 2 ? 'Signature' : index === 0 && item.startsWith('※') ? 'Note' : undefined)).join('')}
      ${section.tables.map((table) => `${table.title ? paragraph(table.title, 'Heading2') : ''}${tableXml(table)}`).join('')}
    `).join('')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="19"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="normal"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="64"/></w:rPr><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="24"/></w:rPr><w:pPr><w:spacing w:before="320" w:after="140"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="2A3B32"/></w:pBdr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="21"/></w:rPr><w:pPr><w:spacing w:before="80" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Note"><w:name w:val="note"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="18"/></w:rPr><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Signature"><w:name w:val="signature"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="19"/></w:rPr><w:pPr><w:jc w:val="right"/><w:spacing w:before="80" w:after="80"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="table text"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="19"/></w:rPr><w:pPr><w:spacing w:after="0"/></w:pPr></w:style>
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:left w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:right w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="B8DEC4"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const writeU16 = (target: number[], value: number) => {
  target.push(value & 0xff, (value >>> 8) & 0xff);
};

const writeU32 = (target: number[], value: number) => {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
};

const dosDateTime = () => {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
};

const createZip = (files: Array<{ name: string; content: string | Uint8Array }>) => {
  const localParts: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(contentBytes);
    const local: number[] = [];
    writeU32(local, 0x04034b50);
    writeU16(local, 20);
    writeU16(local, 0x0800);
    writeU16(local, 0);
    writeU16(local, time);
    writeU16(local, date);
    writeU32(local, crc);
    writeU32(local, contentBytes.length);
    writeU32(local, contentBytes.length);
    writeU16(local, nameBytes.length);
    writeU16(local, 0);
    localParts.push(Uint8Array.from(local), nameBytes, contentBytes);

    writeU32(central, 0x02014b50);
    writeU16(central, 20);
    writeU16(central, 20);
    writeU16(central, 0x0800);
    writeU16(central, 0);
    writeU16(central, time);
    writeU16(central, date);
    writeU32(central, crc);
    writeU32(central, contentBytes.length);
    writeU32(central, contentBytes.length);
    writeU16(central, nameBytes.length);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU32(central, 0);
    writeU32(central, offset);
    central.push(...nameBytes);
    offset += local.length + nameBytes.length + contentBytes.length;
  });

  const centralOffset = offset;
  const centralBytes = Uint8Array.from(central);
  const end: number[] = [];
  writeU32(end, 0x06054b50);
  writeU16(end, 0);
  writeU16(end, 0);
  writeU16(end, files.length);
  writeU16(end, files.length);
  writeU32(end, centralBytes.length);
  writeU32(end, centralOffset);
  writeU16(end, 0);

  const totalLength = localParts.reduce((sum, part) => sum + part.length, 0) + centralBytes.length + end.length;
  const output = new Uint8Array(totalLength);
  let position = 0;
  [...localParts, centralBytes, Uint8Array.from(end)].forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  return output;
};

const readU16 = (buffer: Buffer, offset: number) => buffer.readUInt16LE(offset);
const readU32 = (buffer: Buffer, offset: number) => buffer.readUInt32LE(offset);

const parseZip = (buffer: Buffer) => {
  const entries: Array<{ name: string; content: Uint8Array }> = [];
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (readU32(buffer, index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid DOCX ZIP: missing central directory');

  const entryCount = readU16(buffer, eocdOffset + 10);
  let centralOffset = readU32(buffer, eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(buffer, centralOffset) !== 0x02014b50) throw new Error('Invalid DOCX ZIP: corrupt central directory');
    const method = readU16(buffer, centralOffset + 10);
    const compressedSize = readU32(buffer, centralOffset + 20);
    const nameLength = readU16(buffer, centralOffset + 28);
    const extraLength = readU16(buffer, centralOffset + 30);
    const commentLength = readU16(buffer, centralOffset + 32);
    const localOffset = readU32(buffer, centralOffset + 42);
    const centralNameStart = centralOffset + 46;
    const name = buffer.subarray(centralNameStart, centralNameStart + nameLength).toString('utf8');

    if (readU32(buffer, localOffset) !== 0x04034b50) throw new Error(`Invalid DOCX ZIP: missing local header for ${name}`);
    const localNameLength = readU16(buffer, localOffset + 26);
    const localExtraLength = readU16(buffer, localOffset + 28);
    const nameStart = localOffset + 30;
    const dataStart = nameStart + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = new Uint8Array(compressed);
    else if (method === 8) content = new Uint8Array(zlib.inflateRawSync(compressed));
    else throw new Error(`Unsupported ZIP compression method: ${method}`);
    entries.push({ name, content });
    centralOffset = centralNameStart + nameLength + extraLength + commentLength;
  }
  return entries;
};

const decode = (value: Uint8Array) => Buffer.from(value).toString('utf8');

const extractRows = (table: string) => table.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
const extractCells = (row: string) => row.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];

const replaceCellText = (cell: string, value: string) => {
  const text = xmlEscape(value || '');
  let used = false;
  const replaced = cell.replace(/<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t(\s[^>]*)?\/>/g, (_match, attrsA = '', attrsB = '') => {
    if (used) return '';
    used = true;
    const rawAttrs = attrsA || attrsB || '';
    const attrs = rawAttrs.includes('xml:space=') ? rawAttrs : `${rawAttrs} xml:space="preserve"`;
    return `<w:t${attrs}>${text}</w:t>`;
  });
  if (used) return replaced;
  if (replaced.includes('</w:r>')) return replaced.replace('</w:r>', `<w:t xml:space="preserve">${text}</w:t></w:r>`);
  return replaced.replace('</w:tc>', `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`);
};

const replaceRowValues = (row: string, values: string[]) => {
  const cells = extractCells(row);
  let index = 0;
  return row.replace(/<w:tc[\s\S]*?<\/w:tc>/g, (cell) => replaceCellText(cell, values[index++] ?? ''));
};

const replaceTableRows = (table: string, values: string[][], headerRows = 0) => {
  const rows = extractRows(table);
  if (!rows.length) return table;
  const prefix = table.slice(0, table.indexOf(rows[0]));
  const suffix = table.slice(table.lastIndexOf(rows[rows.length - 1]) + rows[rows.length - 1].length);
  const header = rows.slice(0, headerRows);
  const templateRows = rows.slice(headerRows);
  const nextRows = templateRows.map((templateRow, index) => replaceRowValues(templateRow, values[index] || Array.from({ length: extractCells(templateRow).length }, () => '')));
  return `${prefix}${[...header, ...nextRows].join('')}${suffix}`;
};

const templatePath = process.env.REPORT_DOCX_TEMPLATE_PATH || path.join(process.cwd(), 'public', 'templates', 'report-template.docx');

const buildTemplateDocumentXml = (document: string, draft: ReportDraft) => {
  const section = (id: string) => draft.report_sections.find((item) => item.section_id === id);
  const cover = section('cover')?.tables[0]?.rows || [];
  const basic = section('basic_info')?.tables[0]?.rows || [];
  const execution = section('execution_summary')?.tables || [];
  const evidence = section('evidence_validation')?.tables[0]?.rows || [];
  const tax = section('tax_settlement')?.tables[0]?.rows || [];
  const itemReviews = section('item_reviews')?.tables[0]?.rows || [];
  const issueTables = section('issue_details')?.tables || [];
  const supplements = section('supplement_actions')?.tables[0]?.rows || [];
  const tables = document.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || [];
  const replacements: Record<number, string> = {};
  replacements[0] = replaceTableRows(tables[0], cover);
  replacements[1] = replaceTableRows(tables[1], basic);
  replacements[2] = replaceTableRows(tables[2], execution[0]?.rows || [], 1);
  replacements[3] = replaceTableRows(tables[3], execution[1]?.rows || [], 1);
  replacements[4] = replaceTableRows(tables[4], evidence, 1);
  replacements[5] = replaceTableRows(tables[5], tax, 1);
  replacements[6] = replaceTableRows(tables[6], itemReviews, 1);
  [7, 8, 9].forEach((tableIndex, issueIndex) => {
    if (tables[tableIndex]) replacements[tableIndex] = replaceTableRows(tables[tableIndex], issueTables[issueIndex]?.rows || [['집행 금액', ''], ['확인된 문제', ''], ['법령 근거', ''], ['필요 조치', '']]);
  });
  replacements[10] = replaceTableRows(tables[10], supplements, 1);
  let tableIndex = 0;
  return document.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, (table) => replacements[tableIndex++] || table);
};

const buildFromTemplate = (draft: ReportDraft) => {
  const entries = parseZip(fs.readFileSync(templatePath));
  const nextEntries = entries.map((entry) => {
    if (entry.name !== 'word/document.xml') return entry;
    return { ...entry, content: encoder.encode(buildTemplateDocumentXml(decode(entry.content), draft)) };
  });
  return createZip(nextEntries);
};

export const buildReportDocx = (draft: ReportDraft) => {
  if (fs.existsSync(templatePath)) return buildFromTemplate(draft);
  return createZip([
  { name: '[Content_Types].xml', content: contentTypesXml },
  { name: '_rels/.rels', content: relsXml },
  { name: 'word/document.xml', content: documentXml(draft) },
  { name: 'word/_rels/document.xml.rels', content: documentRelsXml },
  { name: 'word/styles.xml', content: stylesXml },
  ]);
};
