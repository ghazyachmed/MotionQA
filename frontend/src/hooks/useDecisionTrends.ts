import { useEffect, useState } from "react";
import { apiJson, describeError } from "../lib/apiClient";
import type { DecisionTrendBucket } from "../types/qcTypes";

interface TrendState {
  buckets: DecisionTrendBucket[];
  isLoading: boolean;
  error: string | null;
}

// AI Assisted Logic
// Trends always come from REAL_INFERENCE records; simulated demo events are excluded server-side.
export function useDecisionTrends(apiBaseUrl: string, token: string, refreshKey: number): TrendState {
  const [buckets, setBuckets] = useState<DecisionTrendBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchTrends(): Promise<void> {
      setIsLoading(true);
      try {
        const data = await apiJson<{ buckets: DecisionTrendBucket[] }>(apiBaseUrl, "/api/v1/inspections/trends?minutes=240&processingMode=REAL_INFERENCE", token);
        if (isActive) {
          setBuckets(data.buckets);
          setError(null);
        }
      } catch (fetchError) {
        if (isActive) {
          setError(describeError(fetchError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void fetchTrends();
    const timer = window.setInterval(fetchTrends, 15000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [apiBaseUrl, refreshKey, token]);

  return { buckets, isLoading, error };
}
