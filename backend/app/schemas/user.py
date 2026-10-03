from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.permissions import ALLOWED_PERMISSIONS
from app.core.security import validate_password as validate_password_value
from app.schemas.common import normalize_string_list, normalize_text, validate_email


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: Literal["admin", "assistente"] = "assistente"
    permissions: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_text(value, min_length=3, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email_value(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_value(value, min_length=8)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str]) -> list[str]:
        return normalize_string_list(
            value,
            max_items=20,
            item_max_length=60,
            allowed_values=ALLOWED_PERMISSIONS,
        )


class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_value(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_value(value)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    permissions: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class UserPasswordReset(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_value(value, min_length=8)


class UserAccessUpdate(BaseModel):
    role: Literal["admin", "assistente"]
    permissions: list[str] = Field(default_factory=list)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str]) -> list[str]:
        return normalize_string_list(
            value,
            max_items=20,
            item_max_length=60,
            allowed_values=ALLOWED_PERMISSIONS,
        )


class PermissionOptionOut(BaseModel):
    code: str
    label: str
