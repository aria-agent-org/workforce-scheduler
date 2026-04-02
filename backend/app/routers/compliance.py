"""Compliance engine router — work law validation and violation tracking."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.compliance import ComplianceRule, ComplianceViolation, DEFAULT_COMPLIANCE_RULES
from app.models.scheduling import Mission, MissionAssignment
from app.models.employee import Employee
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compliance"])


# --- Schemas ---

class ComplianceRuleCreate(BaseModel):
    name: str
    description: str | None = None
    rule_type: str
    parameters: dict
    severity: str = "warning"


class ComplianceCheckResult(BaseModel):
    employee_id: str
    employee_name: str
    violations: list[dict]
    is_compliant: bool


# --- Endpoints ---

@router.get("/compliance/rules")
async def list_rules(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List compliance rules (tenant-specific + system defaults)."""
    result = await db.execute(
        select(ComplianceRule).where(
            ComplianceRule.tenant_id.in_([tenant.id, None]),
            ComplianceRule.is_active.is_(True),
        ).order_by(ComplianceRule.name)
    )
    rules = result.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "name": r.name,
                "description": r.description,
                "rule_type": r.rule_type,
                "parameters": r.parameters,
                "severity": r.severity,
                "is_system": r.tenant_id is None,
            }
            for r in rules
        ]
    }


@router.post("/compliance/rules")
async def create_rule(
    body: ComplianceRuleCreate,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom compliance rule for this tenant."""
    rule = ComplianceRule(
        tenant_id=tenant.id,
        name=body.name,
        description=body.description,
        rule_type=body.rule_type,
        parameters=body.parameters,
        severity=body.severity,
    )
    db.add(rule)
    await db.commit()
    return {"id": str(rule.id), "message": "Rule created"}


@router.post("/compliance/check")
async def check_compliance(
    employee_id: str | None = None,
    days: int = Query(7, ge=1, le=30),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Run compliance check on schedule.
    If employee_id is given, check just that employee.
    Otherwise, check all active employees.
    """
    # Load rules
    rules_result = await db.execute(
        select(ComplianceRule).where(
            ComplianceRule.tenant_id.in_([tenant.id, None]),
            ComplianceRule.is_active.is_(True),
        )
    )
    rules = rules_result.scalars().all()

    if not rules:
        return {"results": [], "message": "No compliance rules configured"}

    # Load employees
    emp_query = select(Employee).where(
        Employee.tenant_id == tenant.id,
        Employee.is_active.is_(True),
    )
    if employee_id:
        emp_query = emp_query.where(Employee.id == UUID(employee_id))

    emp_result = await db.execute(emp_query)
    employees = emp_result.scalars().all()

    since = datetime.now(timezone.utc) - timedelta(days=days)
    results = []

    for emp in employees:
        violations = await _check_employee_compliance(db, tenant, emp, rules, since)
        results.append(ComplianceCheckResult(
            employee_id=str(emp.id),
            employee_name=emp.full_name or str(emp.id),
            violations=violations,
            is_compliant=len(violations) == 0,
        ))

    # Save new violations to DB
    new_violations_count = 0
    for r in results:
        for v in r.violations:
            violation = ComplianceViolation(
                tenant_id=tenant.id,
                rule_id=UUID(v["rule_id"]),
                employee_id=UUID(r.employee_id),
                mission_id=UUID(v["mission_id"]) if v.get("mission_id") else None,
                violation_type=v["rule_type"],
                description=v["description"],
                severity=v["severity"],
            )
            db.add(violation)
            new_violations_count += 1

    if new_violations_count > 0:
        await db.commit()

    total_violations = sum(len(r.violations) for r in results)
    compliant_count = sum(1 for r in results if r.is_compliant)

    return {
        "results": [r.dict() for r in results],
        "summary": {
            "total_employees": len(results),
            "compliant": compliant_count,
            "violations": total_violations,
            "check_period_days": days,
        },
    }


@router.get("/compliance/violations")
async def list_violations(
    resolved: bool | None = None,
    severity: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List compliance violations."""
    query = (
        select(ComplianceViolation)
        .where(ComplianceViolation.tenant_id == tenant.id)
        .order_by(desc(ComplianceViolation.created_at))
        .limit(limit)
    )

    if resolved is not None:
        query = query.where(ComplianceViolation.resolved == resolved)
    if severity:
        query = query.where(ComplianceViolation.severity == severity)

    result = await db.execute(query)
    violations = result.scalars().all()

    return {
        "items": [
            {
                "id": str(v.id),
                "employee_id": str(v.employee_id),
                "rule_id": str(v.rule_id),
                "violation_type": v.violation_type,
                "description": v.description,
                "severity": v.severity,
                "resolved": v.resolved,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in violations
        ],
        "total": len(violations),
    }


@router.post("/compliance/seed-defaults")
async def seed_default_rules(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Seed default Israeli compliance rules for this tenant."""
    created = 0
    for rule_def in DEFAULT_COMPLIANCE_RULES:
        # Check if already exists
        existing = await db.execute(
            select(ComplianceRule).where(
                ComplianceRule.tenant_id == tenant.id,
                ComplianceRule.rule_type == rule_def["rule_type"],
            )
        )
        if existing.scalar_one_or_none():
            continue

        rule = ComplianceRule(
            tenant_id=tenant.id,
            **rule_def,
        )
        db.add(rule)
        created += 1

    await db.commit()
    return {"message": f"Created {created} default rules", "created": created}


# --- Internal compliance checks ---

async def _check_employee_compliance(db, tenant, employee, rules, since):
    """Check all compliance rules for a single employee."""
    violations = []

    # Load employee's missions in the period
    result = await db.execute(
        select(Mission, MissionAssignment)
        .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
        .where(
            Mission.tenant_id == tenant.id,
            MissionAssignment.employee_id == employee.id,
            Mission.date >= since.date(),
        )
        .order_by(Mission.date, Mission.start_time)
    )
    assignments = result.all()

    for rule in rules:
        rule_violations = _evaluate_rule(rule, employee, assignments)
        violations.extend(rule_violations)

    return violations


def _evaluate_rule(rule, employee, assignments):
    """Evaluate a single rule against an employee's assignments."""
    violations = []

    if rule.rule_type == "rest_between_shifts":
        min_hours = rule.parameters.get("min_hours", 8)
        # Check consecutive missions for rest period
        prev_end = None
        for mission, assignment in assignments:
            if mission.end_time and prev_end:
                # Calculate rest period
                from datetime import datetime, timedelta
                # Simplified: compare dates + times
                rest_hours = 24  # default if can't calculate
                if mission.start_time and prev_end:
                    # Simple same-day or next-day check
                    day_diff = (mission.date - prev_end.date()).days if hasattr(prev_end, 'date') else 0
                    rest_hours = day_diff * 24
                    if rest_hours < min_hours:
                        violations.append({
                            "rule_id": str(rule.id),
                            "rule_type": rule.rule_type,
                            "severity": rule.severity,
                            "mission_id": str(mission.id),
                            "description": f"מנוחה של {rest_hours} שעות בלבד (מינימום {min_hours})",
                        })
            prev_end = mission

    elif rule.rule_type == "max_weekly_hours":
        max_hours = rule.parameters.get("max_hours", 42)
        # Count total hours per week
        total = len(assignments) * 8  # rough estimate: 8h per shift
        if total > max_hours:
            violations.append({
                "rule_id": str(rule.id),
                "rule_type": rule.rule_type,
                "severity": rule.severity,
                "mission_id": None,
                "description": f"~{total} שעות שבועיות (מקסימום {max_hours})",
            })

    elif rule.rule_type == "max_consecutive_days":
        max_days = rule.parameters.get("max_days", 6)
        # Check for consecutive days
        dates = sorted(set(m.date for m, a in assignments))
        consecutive = 1
        for i in range(1, len(dates)):
            if (dates[i] - dates[i - 1]).days == 1:
                consecutive += 1
                if consecutive > max_days:
                    violations.append({
                        "rule_id": str(rule.id),
                        "rule_type": rule.rule_type,
                        "severity": rule.severity,
                        "mission_id": None,
                        "description": f"{consecutive} ימים רצופים (מקסימום {max_days})",
                    })
                    break
            else:
                consecutive = 1

    elif rule.rule_type == "fair_distribution":
        # This is checked at tenant level, not per employee
        pass

    return violations
