import { buildReportDocx } from '../../../lib/docx-builder';
import type { ReportDraft } from '../../../lib/report-draft';

export async function POST(request: Request) {
  const draft = await request.json() as ReportDraft;
  const bytes = await buildReportDocx(draft);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(`${draft.report_no || 'report'}.docx`)}"`,
    },
  });
}
