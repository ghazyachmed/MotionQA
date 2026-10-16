"""Recapture policy for one inspection session (one physical part at a fixed station).

Recapture means placing the same part again in the same fixture, camera position, and lighting. The validated
profile covers that geometry only, so guidance never asks for a new angle or distance. Attempts are capped; when the
cap is reached without a conclusive decision, the session is escalated to a person.
"""
from dataclasses import dataclass

defaultMaxAttempts = 3
terminalDecisions = {"PASS", "FAIL", "REVIEW"}
recapturableDecisions = {"RETAKE", "NO_PART", "ERROR"}

guidanceByReason = {
    "BLURRED": "Re-seat the part in the fixture, keep it still until the image is sharp, and capture again from the same camera position.",
    "UNDEREXPOSED": "Check that the station light is on and unobstructed, then capture again. Do not move the camera.",
    "OVEREXPOSED": "Remove glare sources or shading changes at the station, then capture again. Do not move the camera.",
    "PART_CUT_OFF": "Place the part fully inside the fixture outline and capture again.",
    "PART_SCALE_OUT_OF_RANGE": "Place the part in the fixture at the marked position; do not change camera distance.",
    "PART_NOT_FOUND": "Place the part in the fixture and capture again.",
    "PART_NOT_RECOGNIZED": "Check that this is the specified component and that it sits in the fixture as marked. A different view is not supported.",
    "MODEL_UNAVAILABLE": "The inspection model is unavailable; contact maintenance. Retrying will not help until it is restored.",
}
defaultGuidance = "Re-seat the part in the same fixture position and capture again with unchanged lighting and camera."


@dataclass(frozen=True)
class SessionState:
    status: str
    finalDecision: str | None
    finalReasonCode: str | None
    nextAttemptAllowed: bool
    guidance: str


def evaluateSession(attempts: list[tuple[str, str]], maxAttempts: int = defaultMaxAttempts) -> SessionState:
    """attempts: (decision, reasonCode) in capture order. Returns the session state after the latest attempt."""
    # AI Assisted Logic
    if maxAttempts < 1:
        raise ValueError("maxAttempts must be at least 1")
    if not attempts:
        return SessionState("OPEN", None, None, True, "Place the part in the fixture and capture.")
    decision, reasonCode = attempts[-1]
    if decision in terminalDecisions:
        return SessionState("COMPLETED", decision, reasonCode, False, "Inspection complete." if decision != "REVIEW" else "Sent to human review.")
    if decision not in recapturableDecisions:
        raise ValueError(f"Unsupported decision {decision}")
    if reasonCode == "MODEL_UNAVAILABLE" or len(attempts) >= maxAttempts:
        return SessionState("ESCALATED", "REVIEW", "RECAPTURE_LIMIT_REACHED" if reasonCode != "MODEL_UNAVAILABLE" else "MODEL_UNAVAILABLE",
                            False, f"No conclusive result after {len(attempts)} attempt(s); sent to human review. Do not keep retaking.")
    remaining = maxAttempts - len(attempts)
    return SessionState("OPEN", None, None, True, f"{guidanceByReason.get(reasonCode, defaultGuidance)} ({remaining} attempt(s) left)")
