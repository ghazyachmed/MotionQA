from enum import Enum


class DefectType(str, Enum):
    # Real inference uses `anomaly`: the normal-only scorer localizes deviations but does not classify them.
    # The other labels are only produced by the simulated browser demo.
    anomaly = "anomaly"
    castingDefect = "casting_defect"
    scratch = "scratch"
    dimensionalDeviation = "dimensional_deviation"
    none = "none"


class InspectionDecision(str, Enum):
    noPart = "NO_PART"
    retake = "RETAKE"
    review = "REVIEW"
    passed = "PASS"
    failed = "FAIL"
    error = "ERROR"


class ProcessingMode(str, Enum):
    realInference = "REAL_INFERENCE"
    simulatedDemo = "SIMULATED_DEMO"


class ReviewStatus(str, Enum):
    notRequired = "NOT_REQUIRED"
    pending = "PENDING"
    confirmed = "CONFIRMED"
    overridden = "OVERRIDDEN"


class IntegrationStatus(str, Enum):
    synchronized = "SYNCHRONIZED"
    configurationRequired = "CONFIGURATION_REQUIRED"
    failed = "FAILED"
