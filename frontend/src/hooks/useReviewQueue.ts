import { useCallback, useEffect, useState } from "react";
import { apiJson, describeError } from "../lib/apiClient";
import type { InspectionResult } from "../types/qcTypes";

interface ReviewQueueState {
  pending: InspectionResult[];
  error: string | null;
  refresh: () => Promise<void>;
}

// AI Assisted Logic
export function useReviewQueue(apiBaseUrl: string, token: string, refreshKey: number): ReviewQueueState {
  const [pending, setPending] = useState<InspectionResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPending(await apiJson<InspectionResult[]>(apiBaseUrl, "/api/v1/inspections?processingMode=REAL_INFERENCE&reviewStatus=PENDING&limit=20", token));
      setError(null);
    } catch (fetchError) {
      setError(describeError(fetchError));
    }
  }, [apiBaseUrl, token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshKey]);

  return { pending, error, refresh };
}
