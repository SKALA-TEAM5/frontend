import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableBordersOptions,
} from 'docx';
import type { ReportDraft, ReportTable } from './report-draft';

const FONT = 'Malgun Gothic';
const PAGE_TEXT_WIDTH = 9072;
const BORDER_COLOR = 'B8DEC4';
const LABEL_FILL = 'EEF3F0';
const WHITE = 'FFFFFF';
const TEXT_COLOR = '1F2933';
const HEADING_COLOR = '2A3B32';

const tableBorder = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: BORDER_COLOR,
};

const tableBorders: ITableBordersOptions = {
  top: tableBorder,
  bottom: tableBorder,
  left: tableBorder,
  right: tableBorder,
  insideHorizontal: tableBorder,
  insideVertical: tableBorder,
};

const lineBreakRuns = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  (text || ' ').split('\n').flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ break: 1 })] : []),
    new TextRun({
      text: line || ' ',
      font: FONT,
      size: options.size ?? 19,
      color: options.color ?? TEXT_COLOR,
      bold: options.bold,
    }),
  ]);

const textParagraph = (
  text: string,
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    size?: number;
    color?: string;
    before?: number;
    after?: number;
    style?: string;
  } = {},
) =>
  new Paragraph({
    style: options.style,
    alignment: options.alignment,
    spacing: { before: options.before ?? 0, after: options.after ?? 120 },
    children: lineBreakRuns(text, options),
  });

const titleParagraphs = (title: string) => {
  if (title.includes('산업안전보건관리비') && title.includes('집행 증빙 검토 결과 보고서')) {
    return [textParagraph('산업안전보건관리비', { style: 'ReportTitle' }), textParagraph('집행 증빙 검토 결과 보고서', { style: 'ReportTitle' })];
  }
  return [textParagraph(title, { style: 'ReportTitle' })];
};

const headingParagraph = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 12,
        space: 8,
        color: HEADING_COLOR,
      },
    },
    children: [new TextRun({ text, font: FONT, bold: true, size: 24, color: HEADING_COLOR })],
  });

const subHeadingParagraph = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text, font: FONT, bold: true, size: 21, color: HEADING_COLOR })],
  });

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

const tableCell = (value: string, width: number, shaded: boolean) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: shaded ? LABEL_FILL : WHITE },
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      textParagraph(value || ' ', {
        bold: shaded,
        size: 19,
        after: 0,
      }),
    ],
  });

const reportTable = (table: ReportTable) => {
  const rows = table.headers.length ? [table.headers, ...table.rows] : table.rows;
  const widths = columnWidths(table);

  return new Table({
    width: { size: PAGE_TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows: rows.map((row, rowIndex) => {
      const fallbackWidth = Math.floor(PAGE_TEXT_WIDTH / Math.max(row.length, 1));
      return new TableRow({
        children: row.map((cell, cellIndex) =>
          tableCell(cell, widths[cellIndex] || fallbackWidth, Boolean((rowIndex === 0 && table.headers.length) || (!table.headers.length && cellIndex % 2 === 0))),
        ),
      });
    }),
  });
};

const sectionContent = (draft: ReportDraft) => {
  const children: Array<Paragraph | Table> = [
    textParagraph(' ', { after: 120 }),
    textParagraph(' ', { after: 120 }),
    textParagraph(' ', { after: 120 }),
    ...titleParagraphs(draft.title),
  ];

  draft.report_sections.forEach((section) => {
    if (section.section_id !== 'cover') children.push(headingParagraph(section.title));

    section.paragraphs.forEach((item, index) => {
      if (section.section_id === 'overall_opinion' && index >= 2) {
        children.push(textParagraph(item, { alignment: AlignmentType.RIGHT, before: 80, after: 80 }));
        return;
      }
      children.push(textParagraph(item, { size: item.startsWith('※') ? 18 : 19, before: item.startsWith('※') ? 80 : 0, after: item.startsWith('※') ? 80 : 120 }));
    });

    section.tables.forEach((table) => {
      if (table.title) children.push(subHeadingParagraph(table.title));
      children.push(reportTable(table));
      children.push(textParagraph(' ', { after: 80 }));
    });
  });

  return children;
};

export const buildReportDocx = async (draft: ReportDraft) => {
  const document = new Document({
    creator: 'SHE Safety Cost Review System',
    title: draft.title,
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: 19,
            color: TEXT_COLOR,
          },
          paragraph: {
            spacing: { after: 120 },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'ReportTitle',
          name: 'Report Title',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            font: FONT,
            bold: true,
            size: 64,
            color: TEXT_COLOR,
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 1417,
              right: 1417,
              bottom: 1417,
              left: 1417,
              header: 708,
              footer: 708,
              gutter: 0,
            },
          },
        },
        children: sectionContent(draft),
      },
    ],
  });

  return Packer.toArrayBuffer(document);
};
