import { useEffect, useState } from "react";
import type { DefectTrendBucket } from "../types/qcTypes";

interface TrendState {
  buckets: DefectTrendBucket[];
  isLoading: boolean;
}

// AI Assisted Logic
export function useDefectTrends(apiBaseUrl: string, lineId: string | null): TrendState {
  const [buckets, setBuckets] = useState<DefectTrendBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchTrends(): Promise<void> {
      const query = new URLSearchParams({ minutes: "60" });
      if (lineId) {
        query.set("lineId", lineId);
      }
      setIsLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/defects/trends?${query.toString()}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { buckets: DefectTrendBucket[] };
          setBuckets(data.buckets);
        }
      } catch {
        if (!controller.signal.aborted) {
          setBuckets((currentBuckets) => currentBuckets);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchTrends();
    const timer = window.setInterval(fetchTrends, 15000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiBaseUrl, lineId]);

  return { buckets, isLoading };
}
