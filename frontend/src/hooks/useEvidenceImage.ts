import { useEffect, useState } from "react";
import { apiFetch, describeError } from "../lib/apiClient";
import type { InspectionResult } from "../types/qcTypes";

// AI Assisted Logic
// Evidence is private: it is fetched with the operator token and shown through a revocable object URL.
export function useEvidenceImage(apiBaseUrl: string, token: string, inspection: InspectionResult | null, kind = "overlay"): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inspectionId = inspection?.inspectionId;
  const hasEvidence = Boolean(inspection?.evidence.some((item) => item.kind === kind));

  useEffect(() => {
    let objectUrl: string | null = null;
    let isActive = true;
    setUrl(null);
    setError(null);
    if (!inspectionId || !hasEvidence) {
      return;
    }
    apiFetch(apiBaseUrl, `/api/v1/inspections/${encodeURIComponent(inspectionId)}/evidence/${kind}`, token)
      .then((response) => response.blob())
      .then((blob) => {
        if (!isActive) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((fetchError: unknown) => {
        if (isActive) {
          setError(describeError(fetchError));
        }
      });
    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiBaseUrl, hasEvidence, inspectionId, kind, token]);

  return { url, error };
}
