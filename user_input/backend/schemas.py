from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SubmissionKind = Literal["feature", "data_report"]
IssueCategory = Literal[
    "missing_route",
    "missing_bus",
    "missing_stop",
    "incorrect_information",
    "other",
]
FeatureArea = Literal["journey_planning", "route_details", "accessibility", "usability", "other"]


class SubmissionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    kind: SubmissionKind
    category: IssueCategory | None = None
    feature_area: FeatureArea | None = None
    title: str = Field(min_length=5, max_length=120)
    details: str = Field(min_length=20, max_length=5000)
    route_number: str | None = Field(default=None, max_length=60)
    bus_number: str | None = Field(default=None, max_length=60)
    origin: str | None = Field(default=None, max_length=120)
    destination: str | None = Field(default=None, max_length=120)
    stop_name: str | None = Field(default=None, max_length=160)
    direction: str | None = Field(default=None, max_length=120)
    operator: str | None = Field(default=None, max_length=120)
    context: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address, or leave this field blank.")
        return value

    @model_validator(mode="after")
    def validate_kind_fields(self) -> "SubmissionCreate":
        if self.kind == "data_report" and self.category is None:
            raise ValueError("Choose the type of bus information to report.")
        if self.kind == "feature" and self.category is not None:
            raise ValueError("Feature ideas cannot have a bus data category.")
        return self


class AdminLogin(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)
