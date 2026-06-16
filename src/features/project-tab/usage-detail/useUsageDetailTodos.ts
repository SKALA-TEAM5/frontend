import { useEffect, useMemo, useState } from 'react';
import { getAgentFailureMessage } from '../../../lib/agent-failure';
import { confirmAgentTodo, getOrchestratorStatus, getVisionValidationResults, type VisionValidationResult } from '../../../lib/agent-api';
import { CATS, type UsageLineItem } from '../../../lib/evidence-utils';
import type { SafetyDocAgentRequiredEvidenceMap } from '../../../lib/archive-api';
import type { ArchiveSeed, FolderEvidenceCategory } from '../../../types/domain';
import type { UsageDetailTodoItem } from './usage-statement-detail-types';
import {
  buildUsageDetailTodoGroups,
  extractActionRequestEvidenceNames,
  findCategoryFromTodoText,
  findUsageItemFromTodoText,
  getTodoDisplayTitle,
  inferEvidenceKindFromText,
  normalizeTodoIdText,
  resolveTodoUsageItem,
  toNounPhraseDetail,
  toOrchestratorTodos,
} from './usage-detail-todo-utils';

interface UseUsageDetailTodosInput {
  projectId: string;
  usageStatementId?: number;
  todoStorageKey?: string;
  actionRequest?: { title: string; message: string; dueDate?: string };
  fileCategories: ArchiveSeed['categories'];
  usageItems: UsageLineItem[];
  onTodoCountChange?: (count: number) => void;
  onActionError: (message: string) => void;
}

export default function useUsageDetailTodos({
  projectId,
  usageStatementId,
  actionRequest,
  fileCategories,
  usageItems,
  onTodoCountChange,
  onActionError,
}: UseUsageDetailTodosInput) {
  const [completedTodoIds, setCompletedTodoIds] = useState<Record<string, boolean>>({});
  const [dismissedTodoIds, setDismissedTodoIds] = useState<Record<string, boolean>>({});
  const [dismissedBackendTodoIds, setDismissedBackendTodoIds] = useState<Record<number, boolean>>({});
  const [orchestratorTodoItems, setOrchestratorTodoItems] = useState<UsageDetailTodoItem[]>([]);
  const [todoConfirmingIds, setTodoConfirmingIds] = useState<Record<string, boolean>>({});
  const [visionValidationByFileId, setVisionValidationByFileId] = useState<Record<string, VisionValidationResult>>({});

  const refreshOrchestratorStatusTodos = async () => {
    if (!usageStatementId) return [] as UsageDetailTodoItem[];
    try {
      const status = await getOrchestratorStatus(projectId, usageStatementId);
      const nextTodos = (status.todos || []).flatMap((todo) => toOrchestratorTodos(todo, usageItems));
      setOrchestratorTodoItems(nextTodos);
      return nextTodos;
    } catch {
      setOrchestratorTodoItems([]);
      return [] as UsageDetailTodoItem[];
    }
  };

  const refreshVisionValidationResults = async () => {
    if (!usageStatementId) {
      setVisionValidationByFileId({});
      return {} as Record<string, VisionValidationResult>;
    }
    try {
      const results = await getVisionValidationResults(projectId, usageStatementId);
      setVisionValidationByFileId(results);
      return results;
    } catch {
      setVisionValidationByFileId({});
      return {} as Record<string, VisionValidationResult>;
    }
  };

  useEffect(() => {
    void refreshOrchestratorStatusTodos();
    void refreshVisionValidationResults();
  }, [projectId, usageStatementId, usageItems]);

  const todoItems = useMemo<UsageDetailTodoItem[]>(() => {
    const hasVisionValidatedPhotos = Object.values(fileCategories || {}).some((lineMap) =>
      Object.values(lineMap).some((kindMap) => (kindMap.site_photo || []).some((file) => file.visionValidation?.status === 'unsuitable'))
    );
    const todos: UsageDetailTodoItem[] = hasVisionValidatedPhotos
      ? orchestratorTodoItems.filter((todo) => todo.source !== 'vision')
      : [...orchestratorTodoItems];
    const actionRequestRawText = `${actionRequest?.title || ''} ${actionRequest?.message || ''}`;
    const actionRequestText = normalizeTodoIdText(actionRequestRawText);
    const actionRequestUsageItem = actionRequestText ? findUsageItemFromTodoText(actionRequestRawText, usageItems) : undefined;
    const actionRequestCategory = actionRequestUsageItem
      ? CATS.find((cat) => cat.id === actionRequestUsageItem.categoryId)
      : findCategoryFromTodoText(actionRequestRawText);
    const legalEvidenceNames = extractActionRequestEvidenceNames(actionRequest?.message);
    if (legalEvidenceNames.length > 0) {
      legalEvidenceNames.forEach((name, index) => {
        const kind = inferEvidenceKindFromText(name);
        todos.push({
          id: `law:add:${normalizeTodoIdText(actionRequest?.title || '보완요청')}:${normalizeTodoIdText(name)}:${index}`,
          mode: 'add',
          source: 'law',
          kind,
          title: `${name}`,
          context: actionRequestUsageItem?.name || '',
          categoryId: actionRequestUsageItem?.categoryId || actionRequestCategory?.id,
          usageItemId: actionRequestUsageItem?.id,
          detail: toNounPhraseDetail(actionRequest?.message),
        });
      });
    } else if (actionRequest?.message) {
      todos.push({
        id: `law:add:${normalizeTodoIdText(actionRequest.title || actionRequest.message)}`,
        mode: 'add',
        source: 'law',
        kind: inferEvidenceKindFromText(actionRequest.message),
        title: '보완 요청 내용 확인',
        context: actionRequestUsageItem?.name || '',
        categoryId: actionRequestUsageItem?.categoryId || actionRequestCategory?.id,
        usageItemId: actionRequestUsageItem?.id,
        detail: toNounPhraseDetail(actionRequest.message),
      });
    }
    Object.entries(fileCategories || {}).forEach(([catId, lineMap]) => {
      Object.entries(lineMap).forEach(([usageItemId, kindMap]) => {
        const usageItem = usageItems.find((item) => item.id === usageItemId);
        const categoryName = CATS.find((cat) => String(cat.id) === catId)?.short;
        (kindMap.site_photo || []).forEach((file) => {
          if (file.visionValidation?.status !== 'unsuitable') return;
          todos.push({
            id: `vision:remove:${usageItemId}:${file.id}`,
            mode: 'remove',
            source: 'vision',
            kind: 'site_photo',
            title: file.name,
            context: usageItem?.name || categoryName || '현장사진',
            categoryId: Number(catId),
            usageItemId,
            detail: toNounPhraseDetail(file.visionValidation.summary || '현장사진 검증 결과 부적합'),
          });
        });
      });
    });
    const seen = new Set<string>();
    return todos.filter((todo) => {
      if (seen.has(todo.id)) return false;
      if (!todo.backendTodoId && dismissedTodoIds[todo.id]) return false;
      if (todo.backendTodoId && dismissedBackendTodoIds[todo.backendTodoId]) return false;
      seen.add(todo.id);
      return true;
    });
  }, [actionRequest?.message, actionRequest?.title, dismissedBackendTodoIds, dismissedTodoIds, fileCategories, orchestratorTodoItems, usageItems]);

  const requiredEvidenceByLine = useMemo<SafetyDocAgentRequiredEvidenceMap>(() => {
    const next: SafetyDocAgentRequiredEvidenceMap = {};
    todoItems.forEach((todo) => {
      if (!todo.usageItemId || !todo.requiredEvidenceTypeCode) return;
      const currentLine = next[todo.usageItemId] || {};
      const currentKindCodes = currentLine[todo.kind] || [];
      next[todo.usageItemId] = {
        ...currentLine,
        [todo.kind]: Array.from(new Set([...currentKindCodes, todo.requiredEvidenceTypeCode])),
      };
    });
    return next;
  }, [todoItems]);

  const isTodoDone = (todo: UsageDetailTodoItem) => {
    if (!todo.backendTodoId) return Boolean(completedTodoIds[todo.id]);
    return Boolean(todo.backendConfirmed);
  };

  const getTodoConfirmingKey = (todo: UsageDetailTodoItem) => (
    todo.backendTodoId ? `backend:${todo.backendTodoId}` : todo.id
  );

  const activeTodoCount = todoItems.filter((todo) => !isTodoDone(todo)).length;
  const todoGroups = buildUsageDetailTodoGroups(todoItems, usageItems);

  useEffect(() => {
    onTodoCountChange?.(activeTodoCount);
  }, [activeTodoCount, onTodoCountChange]);

  const handleTodoToggle = async (todo: UsageDetailTodoItem) => {
    const nextDone = !isTodoDone(todo);
    if (!todo.backendTodoId) {
      setCompletedTodoIds((current) => ({ ...current, [todo.id]: nextDone }));
      return;
    }
    const todoId = todo.backendTodoId;
    const confirmingKey = getTodoConfirmingKey(todo);
    setTodoConfirmingIds((current) => ({ ...current, [confirmingKey]: true }));
    setOrchestratorTodoItems((current) => current.map((item) => (
      item.backendTodoId === todoId ? { ...item, backendConfirmed: nextDone } : item
    )));
    try {
      await confirmAgentTodo(projectId, todoId, nextDone);
    } catch (error) {
      setOrchestratorTodoItems((current) => current.map((item) => (
        item.backendTodoId === todoId ? { ...item, backendConfirmed: !nextDone } : item
      )));
      onActionError(getAgentFailureMessage('evidence-matching', error));
    } finally {
      setTodoConfirmingIds((current) => {
        const next = { ...current };
        delete next[confirmingKey];
        return next;
      });
    }
  };

  const dismissCompletedLocalTodos = () => {
    setDismissedTodoIds((current) => {
      const next = { ...current };
      todoItems.forEach((todo) => {
        if (!todo.backendTodoId && isTodoDone(todo)) next[todo.id] = true;
      });
      return next;
    });
    setDismissedBackendTodoIds((current) => {
      const next = { ...current };
      todoItems.forEach((todo) => {
        if (todo.backendTodoId && isTodoDone(todo)) next[todo.backendTodoId] = true;
      });
      return next;
    });
    setCompletedTodoIds((current) => {
      const next = { ...current };
      todoItems.forEach((todo) => {
        if (current[todo.id]) delete next[todo.id];
      });
      return next;
    });
  };

  const removeTodoStateForUsageItem = (usageItemId: string) => {
    setCompletedTodoIds((current) => (
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.includes(`:${usageItemId}:`) && !key.includes(`-${usageItemId}-`)))
    ));
  };

  const isSupplementTarget = (catId: number, usageItemId?: string) => {
    if (usageItemId) {
      return todoItems.some((todo) => {
        const usageItem = usageItems.find((item) => item.id === usageItemId);
        const todoUsageItem = resolveTodoUsageItem(todo, usageItems);
        return usageItem?.categoryId === catId && (todoUsageItem?.id === usageItemId || todo.usageItemId === usageItemId);
      });
    }
    return todoItems.some((todo) => {
      const usageItem = resolveTodoUsageItem(todo, usageItems);
      if (usageItem) return usageItem.categoryId === catId;
      if (todo.categoryId) return todo.categoryId === catId;
      const categoryName = CATS.find((cat) => cat.id === catId)?.short;
      return Boolean(categoryName && todo.context.includes(categoryName));
    });
  };

  return {
    requiredEvidenceByLine,
    todoItems,
    todoGroups,
    activeTodoCount,
    todoConfirmingIds,
    orchestratorTodoItems,
    visionValidationByFileId,
    refreshOrchestratorStatusTodos,
    refreshVisionValidationResults,
    isTodoDone,
    getTodoConfirmingKey,
    getTodoDisplayTitle,
    handleTodoToggle,
    dismissCompletedLocalTodos,
    removeTodoStateForUsageItem,
    isSupplementTarget,
  };
}
