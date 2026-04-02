"""GPS check-in model for time clock with location."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class GpsCheckin(Base):
    """GPS-based check-in/check-out record."""

    __tablename__ = "gps_checkins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False)
    mission_id = Column(UUID(as_uuid=True), ForeignKey("missions.id"), nullable=True)
    check_type = Column(String(10), nullable=False)  # 'in' or 'out'
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_meters = Column(Float, nullable=True)
    is_within_geofence = Column(Boolean, default=False)
    distance_from_target_m = Column(Float, nullable=True)
    device_info = Column(Text, nullable=True)
    photo_url = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    employee = relationship("Employee", backref="gps_checkins")


class Location(Base):
    """Physical location with geofence for check-in validation."""

    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(200), nullable=False)
    address = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geofence_radius_m = Column(Float, default=200)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
