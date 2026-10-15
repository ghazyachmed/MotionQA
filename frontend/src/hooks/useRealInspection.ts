import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, apiJson, describeError } from "../lib/apiClient";
import type { InspectionDecision, InspectionResult, ModelStatus } from "../types/qcTypes";

export interface RealInspectionState {
  modelStatus: ModelStatus | null;
  modelStatusError: string | null;
  isSubmitting: boolean;
  submitError: string | null;
  isSubmitErrorRetryable: boolean;
  lastResult: InspectionResult | null;
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
  const pendingRef = useRef<{ inspectionId: string; image: Blob; componentId?: string } | null>(null);

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
      const form = new FormData();
      form.append("image", pending.image, "capture.jpg");
      form.append("inspectionId", pending.inspectionId);
      form.append("lineId", lineId);
      form.append("capturedAt", new Date().toISOString());
      if (pending.componentId) {
        form.append("componentId", pending.componentId);
      }
      const response = await apiFetch(apiBaseUrl, "/api/v1/inspections", token, { method: "POST", body: form });
      const result = (await response.json()) as InspectionResult;
      pendingRef.current = null;
      setLastResult(result);
    } catch (error) {
      // The inspection id is kept, so a retry is idempotent on the server. Client errors (bad image) are not retried.
      setSubmitError(describeError(error));
      setIsSubmitErrorRetryable(!(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500);
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, lineId, token]);

  const submitImage = useCallback(
    async (image: Blob, componentId?: string) => {
      pendingRef.current = { inspectionId: `insp-${crypto.randomUUID()}`, image, componentId: componentId?.trim() || undefined };
      await send();
    },
    [send],
  );

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
    submitImage,
    retryLast: send,
    reviewInspection,
    refreshModelStatus,
  };
}
