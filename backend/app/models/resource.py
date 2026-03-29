"""Resource model (vehicles, equipment, etc.)."""

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class Resource(TenantBase):
    """A schedulable resource (vehicle, equipment, etc.)."""

    __tablename__ = "resources"

    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="equipment")
    quantity_total: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class WorkRole(TenantBase):
    """Work role definition (driver, team lead, etc.)."""

    __tablename__ = "work_roles"

    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_resource_type: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RoleDefinition(TenantBase):
    """System/tenant role definition with permissions."""

    __tablename__ = "role_definitions"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[dict] = mapped_column(JSONB, nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ui_visibility: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class GoogleSheetsConfig(TenantBase):
    """Google Sheets integration configuration."""

    __tablename__ = "google_sheets_configs"

    schedule_window_id: Mapped[str | None] = mapped_column(nullable=True)
    spreadsheet_id: Mapped[str] = mapped_column(String(255), nullable=False)
    sheet_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sync_direction: Mapped[str] = mapped_column(String(20), default="bidirectional", nullable=False)
    auto_sync_inbound: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_sync_outbound: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ask_before_push: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    column_mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status_code_mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    conflict_notification_user_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    last_sync_at: Mapped[str | None] = mapped_column(nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    credentials_secret_arn: Mapped[str | None] = mapped_column(String(500), nullable=True)
