import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, apiJson, describeError } from "../lib/apiClient";
import type { InspectionDecision, InspectionResult, InspectionSessionView, ModelStatus } from "../types/qcTypes";

export interface RealInspectionState {
  modelStatus: ModelStatus | null;
  modelStatusError: string | null;
  isSubmitting: boolean;
  submitError: string | null;
  isSubmitErrorRetryable: boolean;
  lastResult: InspectionResult | null;
  session: InspectionSessionView | null;
  startNewPart: () => void;
  submitImage: (image: Blob, componentId?: string) => Promise<void>;
  retryLast: () => Promise<void>;
  reviewInspection: (inspectionId: string, reviewerDecision: Extract<InspectionDecision, "PASS" | "FAIL">, reviewedBy: string) => Promise<InspectionResult | null>;
  refreshModelStatus: () => Promise<void>;
}

// AI Assisted Logic
export function useRealInspection(apiBaseUrl: string, token: string, lineId: string): RealInspectionState {
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [modelStatusError, setModelStatusError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitErrorRetryable, setIsSubmitErrorRetryable] = useState(false);
  const [lastResult, setLastResult] = useState<InspectionResult | null>(null);
  const [session, setSession] = useState<InspectionSessionView | null>(null);
  // One physical part = one session. Recapture after RETAKE / NO_PART / ERROR stays in the same session (bounded attempts).
  const pendingRef = useRef<{ sessionId: string; attemptNumber: number; image: Blob; componentId?: string; isNewSession: boolean } | null>(null);

  const refreshModelStatus = useCallback(async () => {
    try {
      setModelStatus(await apiJson<ModelStatus>(apiBaseUrl, "/api/v1/model/status", ""));
      setModelStatusError(null);
    } catch (error) {
      setModelStatus(null);
      setModelStatusError(describeError(error));
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void refreshModelStatus();
  }, [refreshModelStatus]);

  const send = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (pending.isNewSession) {
        await apiFetch(apiBaseUrl, "/api/v1/sessions", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: pending.sessionId, componentId: pending.componentId, lineId }),
        });
        pending.isNewSession = false;
      }
      const form = new FormData();
      form.append("image", pending.image, "capture.jpg");
      form.append("attemptNumber", String(pending.attemptNumber));
      form.append("capturedAt", new Date().toISOString());
      const response = await apiFetch(apiBaseUrl, `/api/v1/sessions/${encodeURIComponent(pending.sessionId)}/attempts`, token, { method: "POST", body: form });
      const body = (await response.json()) as { session: InspectionSessionView; inspection: InspectionResult };
      pendingRef.current = null;
      setSession(body.session);
      setLastResult(body.inspection);
    } catch (error) {
      // Session id and attempt number are kept, so a retry replays on the server. Client errors (bad image) are not retried.
      setSubmitError(describeError(error));
      setIsSubmitErrorRetryable(!(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500);
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, lineId, token]);

  const submitImage = useCallback(
    async (image: Blob, componentId?: string) => {
      const continuing = session && session.status === "OPEN" && session.nextAttemptAllowed;
      pendingRef.current = continuing
        ? { sessionId: session.sessionId, attemptNumber: session.attempts.length + 1, image, isNewSession: false }
        : { sessionId: `sess-${crypto.randomUUID()}`, attemptNumber: 1, image, componentId: componentId?.trim() || undefined, isNewSession: true };
      await send();
    },
    [send, session],
  );

  const startNewPart = useCallback(() => {
    pendingRef.current = null;
    setSession(null);
    setLastResult(null);
    setSubmitError(null);
  }, []);

  const reviewInspection = useCallback(
    async (inspectionId: string, reviewerDecision: Extract<InspectionDecision, "PASS" | "FAIL">, reviewedBy: string) => {
      try {
        const result = await apiJson<InspectionResult>(apiBaseUrl, `/api/v1/inspections/${encodeURIComponent(inspectionId)}/review`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewerDecision, reviewedBy }),
        });
        setLastResult((current) => (current?.inspectionId === inspectionId ? result : current));
        return result;
      } catch (error) {
        setSubmitError(describeError(error));
        return null;
      }
    },
    [apiBaseUrl, token],
  );

  return {
    modelStatus,
    modelStatusError,
    isSubmitting,
    submitError,
    isSubmitErrorRetryable,
    lastResult,
    session,
    startNewPart,
    submitImage,
    retryLast: send,
    reviewInspection,
    refreshModelStatus,
  };
}
