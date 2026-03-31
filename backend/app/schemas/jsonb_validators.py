"""JSONB field validators — Pydantic models for structured JSONB columns (Spec Section 20)."""

from __future__ import annotations

from typing import Any, Literal, Union
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class BilingualText(BaseModel):
    """Bilingual text field (Hebrew required, English optional)."""
    he: str
    en: str = ""


class MissionSlot(BaseModel):
    """A required slot within a mission type."""
    slot_id: str
    label: dict[str, str]
    work_role_id: UUID | None = None
    resource_id: UUID | None = None
    count: int = Field(ge=1)
    role_mode: Literal["specific", "all", "all_except"] | None = None
    exclude_role_ids: list[str] | None = None

    @model_validator(mode="after")
    def must_have_role_or_resource(self) -> "MissionSlot":
        # When role_mode is "all" or "all_except", work_role_id can be None
        if self.role_mode in ("all", "all_except"):
            return self
        if not self.work_role_id and not self.resource_id:
            raise ValueError("slot must have work_role_id or resource_id")
        return self


class Condition(BaseModel):
    """A single rule condition."""
    field: str
    # Accept both short ("gt", "eq") and long ("greater_than", "equals") operator forms
    op: str | None = None
    operator: str | None = None  # Alias — frontend sometimes sends "operator" instead of "op"
    value: Any = None

    @model_validator(mode='after')
    def normalize_op(self):
        # Accept "operator" as alias for "op"
        resolved = self.op or self.operator or "eq"
        # Normalize short forms to long forms for storage consistency
        VALID_OPS = {
            "gt", "gte", "lt", "lte", "eq", "neq",
            "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal",
            "equals", "not_equals",
            "in", "not_in", "between",
            "is_null", "is_not_null", "is_true", "is_false",
            "contains", "starts_with",
        }
        if resolved not in VALID_OPS:
            raise ValueError(f"operator '{resolved}' is not valid. Use one of: {', '.join(sorted(VALID_OPS))}")
        self.op = resolved
        return self


class ConditionGroup(BaseModel):
    """A group of conditions combined with AND/OR/NOT."""
    operator: str  # Accept any case: "AND", "and", "And", "OR", "or", "NOT", "not"
    conditions: list[Union["ConditionGroup", Condition]] = []

    @model_validator(mode='before')
    @classmethod
    def check_is_group(cls, values):
        """Ensure this is actually a group (operator is AND/OR/NOT), not a leaf condition."""
        if isinstance(values, dict):
            op = (values.get("operator") or "").upper()
            if op not in ("AND", "OR", "NOT"):
                raise ValueError(f"Not a condition group: operator '{op}' is not AND/OR/NOT")
        return values

    @model_validator(mode='after')
    def normalize_operator(self):
        self.operator = self.operator.upper()
        return self


class ActionExpression(BaseModel):
    """What happens when a rule matches."""
    severity: Literal["hard", "soft"] = "soft"
    message_template: dict[str, str] | None = None
    message: dict[str, str] | None = None  # Alias for message_template (frontend sends this)
    type: str | None = None  # Frontend sends "type" instead of "severity" sometimes
    block: bool = False
    score_delta: int = 0

    @model_validator(mode='after')
    def normalize_fields(self):
        # Accept "message" as alias for "message_template"
        if self.message and not self.message_template:
            self.message_template = self.message
        # Accept "type" for backwards compat
        return self


class TimelineItem(BaseModel):
    """An item in a mission timeline."""
    item_id: str
    offset_minutes: int | None = None
    exact_time: str | None = None
    time_mode: Literal["relative", "exact"] = "relative"
    label: dict[str, str]
    description: dict[str, str] | None = None
    responsible_slot_id: str | None = None

    @model_validator(mode="after")
    def validate_time_fields(self) -> "TimelineItem":
        if self.time_mode == "exact" and not self.exact_time:
            raise ValueError("exact_time is required when time_mode is 'exact'")
        if self.time_mode == "relative" and self.offset_minutes is None:
            self.offset_minutes = 0
        return self


class RecurrencePattern(BaseModel):
    """Recurrence definition for mission templates."""
    type: Literal["daily", "weekly", "custom", "one_time"]
    days_of_week: list[int] | None = None
    active_weeks: str | list[int] | None = None
    exceptions: list[str] | None = None
    extra_dates: list[str] | None = None


# Rebuild forward refs for recursive ConditionGroup
ConditionGroup.model_rebuild()


class PostMissionRule(BaseModel):
    """Defines what happens after a mission ends (e.g., create standby after patrol)."""
    auto_transition_to_mission_type_id: str  # UUID of follow-up mission type
    auto_assign_same_crew: bool = True  # Copy assignments from parent
    condition: Literal["always", "if_not_activated"] = "always"
    # Advanced settings
    delay_minutes: int = Field(default=0, ge=0)  # Delay before follow-up starts
    override_duration_hours: float | None = None  # Override follow-up duration
    notify_crew: bool = True  # Send notification to assigned crew
    allow_manual_override: bool = True  # Can scheduler change assignments
