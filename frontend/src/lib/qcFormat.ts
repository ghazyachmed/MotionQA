import type { DefectType } from "../types/qcTypes";

const defectLabels: Record<DefectType, string> = {
  casting_defect: "Casting defect",
  scratch: "Scratch",
  dimensional_deviation: "Dimensional deviation",
  none: "None",
};

// AI Assisted Logic
export function formatDefect(defectType: DefectType): string {
  return defectLabels[defectType] ?? defectType;
}

export function formatPercent(value: number | string): string {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numericValue)) {
    return "0.0%";
  }
  return `${(numericValue * 100).toFixed(1)}%`;
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

