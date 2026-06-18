import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { parseUsageStatementWithOcr } from '../../lib/agent-api';
import {
  deleteProjectFile,
  deleteUsageStatement,
  getUsageStatementArchiveById,
  uploadProjectFile,
  type UsageStatementArchiveData,
} from '../../lib/archive-api';
import { ApiClientError } from '../../lib/api-client';
import { getProject } from '../../lib/project-api';
import { USAGE_WORKFLOW_STATUS, type MonthlyUsageStatementSummary, type ProjectSummary } from '../../lib/project-data';
import type { ArchiveSeed } from '../../types/domain';
import type { UsageLineItem } from '../../lib/evidence-utils';
import type { ClassificationMoveNotice, MonthUsageStatementArchiveData, UsageUploadStage } from './project-detail-types';
import {
  EMPTY_OVERVIEW_ROWS,
  formatMonthLabel,
  isMonthInProjectPeriod,
  normalizeMonthKey,
  outOfProjectPeriodMessage,
  parseUsageStatementMonth,
  readPendingUsageMonths,
  writePendingUsageMonths,
} from './project-detail-utils';
import { extractClassificationMoveNotices, getUsageStatementOcrFailureReason } from './usage-statement-upload-utils';

interface UseUsageStatementUploadInput {
  canUploadEvidence: boolean;
  selectedMonthHasUploadedStatement: boolean;
  selectedStatement: MonthlyUsageStatementSummary;
  selectedMonth: string;
  project: ProjectSummary;
  dbUsageStatementsByMonth: Record<string, MonthUsageStatementArchiveData>;
  userName: string;
  setDbUsageStatementsByMonth: Dispatch<SetStateAction<Record<string, MonthUsageStatementArchiveData>>>;
  setArchiveSeed: Dispatch<SetStateAction<ArchiveSeed | null>>;
  setArchiveUsageItems: Dispatch<SetStateAction<UsageLineItem[]>>;
  setProject: Dispatch<SetStateAction<ProjectSummary>>;
  setSelectedMonth: Dispatch<SetStateAction<string>>;
  refreshArchiveData: (projectId: string) => Promise<void>;
  openArchiveView: () => void;
}

export default function useUsageStatementUpload({
  canUploadEvidence,
  selectedMonthHasUploadedStatement,
  selectedStatement,
  selectedMonth,
  project,
  dbUsageStatementsByMonth,
  userName,
  setDbUsageStatementsByMonth,
  setArchiveSeed,
  setArchiveUsageItems,
  setProject,
  setSelectedMonth,
  refreshArchiveData,
  openArchiveView,
}: UseUsageStatementUploadInput) {
  const [usageUploadStage, setUsageUploadStage] = useState<UsageUploadStage>('idle');
  const [usageUploadFailureMessage, setUsageUploadFailureMessage] = useState('');
  const [ocrFailureReason, setOcrFailureReason] = useState('');
  const [duplicateUsageMonthWarning, setDuplicateUsageMonthWarning] = useState('');
  const [classificationMoveNotices, setClassificationMoveNotices] = useState<ClassificationMoveNotice[]>([]);
  const usageUploadTimersRef = useRef<number[]>([]);

  useEffect(() => () => {
    usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    usageUploadTimersRef.current = [];
  }, []);

  const clearUploadTimers = () => {
    usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    usageUploadTimersRef.current = [];
  };

  const uploadUsageStatementFromOverview = () => {
    if (!canUploadEvidence || usageUploadStage !== 'idle' || selectedMonthHasUploadedStatement)
      return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.accept = 'application/pdf,.pdf';
    input.onchange = (event) => {
      try {
        const pickedFile = Array.from((event.target as HTMLInputElement).files || [])[0];
        if (!pickedFile)
          return;
        clearUploadTimers();
        const ocrFailure = getUsageStatementOcrFailureReason(pickedFile);
        if (ocrFailure) {
          setUsageUploadStage('idle');
          setOcrFailureReason(ocrFailure);
          return;
        }
        const usageStatementMonth = parseUsageStatementMonth(selectedStatement.month);
        if (!usageStatementMonth) {
          setUsageUploadStage('idle');
          setOcrFailureReason('사용내역서를 업로드할 월을 먼저 선택해 주세요.');
          return;
        }
        const selectedMonthKey = normalizeMonthKey(selectedStatement.month);
        if (!isMonthInProjectPeriod(selectedMonthKey, project.period)) {
          setUsageUploadStage('idle');
          setUsageUploadFailureMessage(outOfProjectPeriodMessage(selectedMonthKey, project.period));
          return;
        }
        const existingUploadedMonths = new Set(
          Object.entries(dbUsageStatementsByMonth)
            .filter(([, data]) => {
              const summary = data.statementSummary;
              return Boolean(summary?.sourceFileName && summary.sourceFileName !== '-');
            })
            .map(([month]) => month),
        );
        setUsageUploadStage('ocr');
        uploadProjectFile(project.id, pickedFile, 'usage_statement')
          .then(async (uploadedEntry) => {
            let savedArchive: UsageStatementArchiveData | null = null;
            const uploadedFileId = Number(uploadedEntry.fileId);
            if (!Number.isFinite(uploadedFileId) || uploadedFileId <= 0) {
              throw new Error('업로드된 사용내역서 파일 ID가 없습니다.');
            }
            let ocrWorkflow: Awaited<ReturnType<typeof parseUsageStatementWithOcr>>;
            try {
              setUsageUploadStage('classifying');
              ocrWorkflow = await parseUsageStatementWithOcr(
                project.id,
                uploadedFileId,
                usageStatementMonth.year,
                usageStatementMonth.month,
              );
              if (!ocrWorkflow.usageStatementId) {
                throw new Error('사용내역서 OCR 결과에 사용내역서 ID가 없습니다.');
              }
            } catch (error) {
              await deleteProjectFile(project.id, uploadedFileId).catch(() => null);
              throw error;
            }
            savedArchive = await getUsageStatementArchiveById(project.id, ocrWorkflow.usageStatementId).catch(() => null);
            const moveNotices = extractClassificationMoveNotices(ocrWorkflow);
            const uploadedAt = uploadedEntry.uploadedAt || new Date().toISOString().slice(0, 10);
            const month = normalizeMonthKey(savedArchive?.statementSummary.month) || selectedMonth || uploadedAt.slice(0, 7);
            if (!isMonthInProjectPeriod(month, project.period)) {
              await Promise.all([
                deleteUsageStatement(project.id, ocrWorkflow.usageStatementId).catch(() => null),
                deleteProjectFile(project.id, uploadedFileId).catch(() => null),
              ]);
              setUsageUploadFailureMessage(outOfProjectPeriodMessage(month, project.period));
              setUsageUploadStage('idle');
              return;
            }
            if (savedArchive && existingUploadedMonths.has(month)) {
              setDuplicateUsageMonthWarning(`${formatMonthLabel(month)} 사용내역서가 이미 존재합니다.\n파일의 세부항목 사용일자를 확인한 뒤 다시 업로드해주세요.`);
              setUsageUploadStage('idle');
              return;
            }
            writePendingUsageMonths(project.id, readPendingUsageMonths(project.id).filter((pendingMonth) => pendingMonth !== month));
            if (moveNotices.length) {
              setClassificationMoveNotices(moveNotices);
            }
            const statementSummary: MonthlyUsageStatementSummary = savedArchive?.statementSummary || {
              month,
              label: formatMonthLabel(month),
              sourceFileName: uploadedEntry.name,
              revisionNo: 1,
              documentWrittenDate: '-',
              uploadedAt,
              uploadedBy: userName,
              parseStatus: '업로드 완료',
              validationStatus: '미검증',
              currentAmount: '0',
              cumulativeAmount: project.accumulatedAmount || '0',
              evidenceCount: 1,
              issueCount: 0,
            };
            setDbUsageStatementsByMonth((current) => ({
              ...current,
              [month]: {
                archiveSeed: savedArchive?.archiveSeed || current[month]?.archiveSeed || { usage_statement: [], categories: {} },
                usageItems: savedArchive?.usageItems || current[month]?.usageItems || [],
                overviewRows: savedArchive?.overviewRows || current[month]?.overviewRows || EMPTY_OVERVIEW_ROWS,
                statementSummary,
                usageStatementId: savedArchive?.usageStatementId || current[month]?.usageStatementId,
                workflowStatus: savedArchive?.workflowStatus || USAGE_WORKFLOW_STATUS.DRAFT,
              },
            }));
            setArchiveSeed((current) => savedArchive?.archiveSeed || ({
              usage_statement: [uploadedEntry, ...(current?.usage_statement || []).filter((file) => file.fileId !== uploadedEntry.fileId)],
              categories: current?.categories || {},
            }));
            if (savedArchive) {
              setArchiveUsageItems(savedArchive.usageItems);
            }
            const latestProject = await getProject(project.id).catch(() => null);
            setProject((current) => ({
              ...current,
              ...(latestProject || {}),
              hasUploads: true,
            }));
            setSelectedMonth(month);
            await refreshArchiveData(project.id);
            setUsageUploadStage('idle');
            openArchiveView();
          })
          .catch((error) => {
            setUsageUploadStage('idle');
            const message = error instanceof ApiClientError
              ? error.message
              : error instanceof Error
                ? error.message
                : '사용내역서 업로드 후 OCR/classi 처리에 실패했습니다.';
            setUsageUploadFailureMessage(message);
          });
      } catch {
        clearUploadTimers();
        setUsageUploadStage('idle');
        setUsageUploadFailureMessage('사용내역서 업로드 처리를 하지 못했습니다.');
      }
    };
    input.click();
  };

  return {
    usageUploadStage,
    uploadUsageStatementFromOverview,
    usageUploadFailureMessage,
    setUsageUploadFailureMessage,
    ocrFailureReason,
    setOcrFailureReason,
    duplicateUsageMonthWarning,
    setDuplicateUsageMonthWarning,
    classificationMoveNotices,
    setClassificationMoveNotices,
  };
}
