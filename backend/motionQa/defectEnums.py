from enum import Enum


class DefectType(str, Enum):
    castingDefect = "casting_defect"
    scratch = "scratch"
    dimensionalDeviation = "dimensional_deviation"
    none = "none"


class InspectionStatus(str, Enum):
    passed = "PASSED"
    failed = "FAILED"


class IntegrationStatus(str, Enum):
    synchronized = "SYNCHRONIZED"
    configurationRequired = "CONFIGURATION_REQUIRED"
    failed = "FAILED"

