"""Unit tests for scheduling service — scoring factors and utilities."""

import pytest
from datetime import date, time, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.scheduling_service import AutoScheduler


# ---------------------------------------------------------------------------
# Helper: create a mock mission
# ---------------------------------------------------------------------------

def _make_mission(start_h=8, start_m=0, end_h=16, end_m=0, mission_date=None):
    m = MagicMock()
    m.id = uuid4()
    m.tenant_id = uuid4()
    m.schedule_window_id = uuid4()
    m.mission_type_id = uuid4()
    m.date = mission_date or date(2026, 4, 1)
    m.start_time = time(start_h, start_m)
    m.end_time = time(end_h, end_m)
    m.status = "draft"
    m.name = "Test Mission"
    m.is_activated = False
    return m


def _make_employee(emp_id=None, status="present", is_active=True):
    e = MagicMock()
    e.id = emp_id or uuid4()
    e.tenant_id = uuid4()
    e.full_name = "Test Employee"
    e.status = status
    e.is_active = is_active
    return e


# ---------------------------------------------------------------------------
# _calc_duration
# ---------------------------------------------------------------------------

class TestCalcDuration:
    def test_normal_day_shift(self):
        m = _make_mission(8, 0, 16, 0)
        assert AutoScheduler._calc_duration(m) == 8.0

    def test_cross_midnight(self):
        m = _make_mission(22, 0, 6, 0)
        assert AutoScheduler._calc_duration(m) == 8.0

    def test_short_shift(self):
        m = _make_mission(10, 0, 12, 30)
        assert AutoScheduler._calc_duration(m) == 2.5

    def test_full_day(self):
        m = _make_mission(0, 0, 0, 0)
        # 0 - 0 ≤ 0, so +24 → 24h
        assert AutoScheduler._calc_duration(m) == 24.0

    def test_none_times(self):
        m = MagicMock()
        m.start_time = None
        m.end_time = None
        assert AutoScheduler._calc_duration(m) == 0

    def test_half_hour_precision(self):
        m = _make_mission(14, 30, 18, 0)
        assert AutoScheduler._calc_duration(m) == 3.5


# ---------------------------------------------------------------------------
# Scoring factors — load balance
# ---------------------------------------------------------------------------

class TestScoringLoadBalance:
    """Test that scoring correctly applies load_balance factor."""

    @pytest.mark.asyncio
    async def test_below_avg_gets_bonus(self):
        """Employee with fewer assignments than avg gets +20."""
        db = AsyncMock()
        scheduler = AutoScheduler(db, uuid4(), uuid4())

        emp = _make_employee()
        mission = _make_mission()
        mt = MagicMock()
        mt.duration_hours = 8

        # Mock all DB calls in _calculate_score
        scheduler._recent_same_type_count = AsyncMock(return_value=0)
        scheduler._yesterday_standby_not_activated = AsyncMock(return_value=False)

        with patch("app.services.scheduling_service.build_employee_context", new_callable=AsyncMock) as mock_ctx, \
             patch("app.services.scheduling_service.simulate_future_impact", new_callable=AsyncMock) as mock_impact:
            mock_ctx.return_value = {
                "hours_since_last_mission": 999,
                "last_mission_was_night": False,
                "assignments_count_today": 0,
                "total_work_hours_today": 0,
            }
            mock_impact.return_value = {"has_conflict": False, "conflicts": [], "total_hours_in_window": 0}

            # Employee has 1 assignment, average is 5 → below avg → +20
            week_counts = {str(emp.id): 1, str(uuid4()): 5, str(uuid4()): 5}

            score = await scheduler._calculate_score(
                emp, mission, mt, [], {},
                {}, {}, [emp], [],
                week_counts, [],
            )
            assert score["breakdown"]["load_balance"] == 20

    @pytest.mark.asyncio
    async def test_above_avg_gets_penalty(self):
        """Employee with many more assignments than avg gets -15."""
        db = AsyncMock()
        scheduler = AutoScheduler(db, uuid4(), uuid4())

        emp = _make_employee()
        mission = _make_mission()
        mt = MagicMock()
        mt.duration_hours = 8

        scheduler._recent_same_type_count = AsyncMock(return_value=0)
        scheduler._yesterday_standby_not_activated = AsyncMock(return_value=False)

        with patch("app.services.scheduling_service.build_employee_context", new_callable=AsyncMock) as mock_ctx, \
             patch("app.services.scheduling_service.simulate_future_impact", new_callable=AsyncMock) as mock_impact:
            mock_ctx.return_value = {
                "hours_since_last_mission": 999,
                "last_mission_was_night": False,
                "assignments_count_today": 0,
                "total_work_hours_today": 0,
            }
            mock_impact.return_value = {"has_conflict": False, "conflicts": [], "total_hours_in_window": 0}

            # Employee has 10, others have 2 → avg ~4.67, 10 > 4.67+2 → penalty
            week_counts = {str(emp.id): 10, str(uuid4()): 2, str(uuid4()): 2}

            score = await scheduler._calculate_score(
                emp, mission, mt, [], {},
                {}, {}, [emp], [],
                week_counts, [],
            )
            assert score["breakdown"]["load_balance"] == -15


# ---------------------------------------------------------------------------
# Partner preference boost (second pass)
# ---------------------------------------------------------------------------

class TestPartnerBoost:
    def test_mutual_partner_boost(self):
        """Two employees who prefer each other get +25 each."""
        db = AsyncMock()
        scheduler = AutoScheduler(db, uuid4(), uuid4())

        emp1 = _make_employee()
        emp2 = _make_employee()

        prefs = {
            str(emp1.id): MagicMock(partner_preferences=[{"employee_id": str(emp2.id)}]),
            str(emp2.id): MagicMock(partner_preferences=[{"employee_id": str(emp1.id)}]),
        }

        scored = [
            (emp1, {"total": 100, "breakdown": {}}),
            (emp2, {"total": 100, "breakdown": {}}),
        ]

        result = scheduler._apply_partner_boost(scored, [], prefs)
        assert result[0][1]["total"] == 125
        assert result[1][1]["total"] == 125
        assert result[0][1]["breakdown"]["mutual_partner"] == 25

    def test_one_sided_no_boost(self):
        """One-sided preference does not trigger mutual boost."""
        db = AsyncMock()
        scheduler = AutoScheduler(db, uuid4(), uuid4())

        emp1 = _make_employee()
        emp2 = _make_employee()

        prefs = {
            str(emp1.id): MagicMock(partner_preferences=[{"employee_id": str(emp2.id)}]),
            str(emp2.id): MagicMock(partner_preferences=[]),  # no reciprocal
        }

        scored = [
            (emp1, {"total": 100, "breakdown": {}}),
            (emp2, {"total": 100, "breakdown": {}}),
        ]

        result = scheduler._apply_partner_boost(scored, [], prefs)
        assert result[0][1]["total"] == 100
        assert result[1][1]["total"] == 100
