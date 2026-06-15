import { useCallback, useState } from 'react';
import { getAgentFailureMessage } from '../../../lib/agent-failure';
import { runEvidenceReviewAgent, waitForAgentButtonEnabled, type VisionValidationResult } from '../../../lib/agent-api';
import type { UsageDetailLoadingMessage, UsageDetailVerificationStep, UsageDetailTodoItem } from './usage-statement-detail-types';

type UsageDetailValidationStatus = 'idle' | 'running' | 'done';

interface UseUsageDetailVerificationInput {
  projectId: string;
  usageStatementId?: number;
  refreshOrchestratorStatusTodos: () => Promise<UsageDetailTodoItem[]>;
  refreshVisionValidationResults: () => Promise<Record<string, VisionValidationResult>>;
  applyVisionValidationResults: (todos: UsageDetailTodoItem[], validationByFileId: Record<string, VisionValidationResult>) => void;
  onVerificationComplete?: () => void | Promise<void>;
  onMissingUsageStatement: () => void;
}

const loadingMessages: Record<UsageDetailVerificationStep, UsageDetailLoadingMessage> = {
  ocr: {
    title: '증빙 연결 상태를 확인하고 있어요',
    body: '사용내역서와 증빙 파일의 날짜, 빈값, 연결 가능성을 먼저 점검합니다.',
  },
  safety: {
    title: '필수 증빙을 확인하고 있어요',
    body: '세부 항목별로 필요한 증빙과 보완 대상을 확인합니다.',
  },
  vision: {
    title: '현장사진을 확인하고 있어요',
    body: '사진 속 현장 상태와 세부 항목의 적합성을 판단합니다.',
  },
};

const getLoadingMessage = (step: UsageDetailVerificationStep | null) => (
  step ? loadingMessages[step] : null
);

const waitForVerificationStep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function useUsageDetailVerification({
  projectId,
  usageStatementId,
  refreshOrchestratorStatusTodos,
  refreshVisionValidationResults,
  applyVisionValidationResults,
  onVerificationComplete,
  onMissingUsageStatement,
}: UseUsageDetailVerificationInput) {
  const [matchingStatus, setMatchingStatus] = useState<UsageDetailValidationStatus>('idle');
  const [photoValidationStatus, setPhotoValidationStatus] = useState<UsageDetailValidationStatus>('idle');
  const [step, setStep] = useState<UsageDetailVerificationStep | null>(null);
  const [matchingError, setMatchingError] = useState('');
  const [matchingNotice, setMatchingNotice] = useState('');
  const [photoValidationNotice, setPhotoValidationNotice] = useState<{ type: 'ok' | 'bad'; message: string } | null>(null);

  const running = Boolean(step) || matchingStatus === 'running' || photoValidationStatus === 'running';
  const done = matchingStatus === 'done' || photoValidationStatus === 'done';

  const dismissMatchingError = useCallback(() => setMatchingError(''), []);
  const dismissActionNotices = useCallback(() => {
    setMatchingNotice('');
    setPhotoValidationNotice(null);
  }, []);
  const resetVerificationState = useCallback(() => {
    setMatchingStatus('idle');
    setMatchingNotice('');
    setPhotoValidationNotice(null);
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    if (!usageStatementId) {
      onMissingUsageStatement();
      return;
    }
    setStep('ocr');
    setMatchingStatus('running');
    setPhotoValidationStatus('running');
    setMatchingNotice('');
    setPhotoValidationNotice(null);
    try {
      await runEvidenceReviewAgent(projectId, usageStatementId);
      await waitForVerificationStep(1800);
      setStep('safety');
      await waitForVerificationStep(2100);
      setStep('vision');
      await waitForVerificationStep(2100);
      await waitForAgentButtonEnabled(projectId, usageStatementId, 'validate');
      const [nextTodos, nextVisionResults] = await Promise.all([
        refreshOrchestratorStatusTodos(),
        refreshVisionValidationResults(),
      ]);
      applyVisionValidationResults(nextTodos, nextVisionResults);
      await waitForVerificationStep(700);
      const [confirmedTodos, confirmedVisionResults] = await Promise.all([
        refreshOrchestratorStatusTodos(),
        refreshVisionValidationResults(),
      ]);
      applyVisionValidationResults(confirmedTodos, confirmedVisionResults);
      setMatchingStatus('done');
      setPhotoValidationStatus('done');
      setMatchingNotice('증빙 유효성 검증 결과를 보완 TODO에 반영했습니다.');
      setPhotoValidationNotice({ type: 'ok', message: '현장사진 검증 결과를 확인했습니다.' });
      await onVerificationComplete?.();
    } catch (error) {
      setMatchingStatus('idle');
      setPhotoValidationStatus('idle');
      setMatchingError(getAgentFailureMessage('evidence-matching', error));
      setPhotoValidationNotice({ type: 'bad', message: getAgentFailureMessage('photo-validation', error) });
    } finally {
      setStep(null);
    }
  }, [
    applyVisionValidationResults,
    onMissingUsageStatement,
    onVerificationComplete,
    projectId,
    refreshOrchestratorStatusTodos,
    refreshVisionValidationResults,
    running,
    usageStatementId,
  ]);

  return {
    running,
    done,
    label: running ? '검증 중...' : '유효성 검증',
    step,
    loadingMessage: getLoadingMessage(step),
    matchingError,
    matchingNotice,
    photoValidationNotice,
    run,
    dismissMatchingError,
    dismissActionNotices,
    resetVerificationState,
  };
}
