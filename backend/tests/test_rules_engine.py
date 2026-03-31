"""Unit tests for the rules engine — evaluate_condition + _resolve_field."""


from app.services.rules_engine import evaluate_condition, _resolve_field, _num


# ---------------------------------------------------------------------------
# _resolve_field
# ---------------------------------------------------------------------------

class TestResolveField:
    def test_simple_key(self):
        assert _resolve_field("name", {"name": "Alice"}) == "Alice"

    def test_dotted_path(self):
        ctx = {"employee": {"status": "present"}}
        assert _resolve_field("employee.status", ctx) == "present"

    def test_deep_dotted_path(self):
        ctx = {"a": {"b": {"c": 42}}}
        assert _resolve_field("a.b.c", ctx) == 42

    def test_missing_key_returns_none(self):
        assert _resolve_field("missing", {"name": "x"}) is None

    def test_missing_nested_returns_none(self):
        assert _resolve_field("a.b.c", {"a": {"b": {}}}) is None

    def test_non_dict_intermediate_returns_none(self):
        ctx = {"a": "not_a_dict"}
        assert _resolve_field("a.b", ctx) is None


# ---------------------------------------------------------------------------
# _num helper
# ---------------------------------------------------------------------------

class TestNum:
    def test_int(self):
        assert _num(5) == 5.0

    def test_string_number(self):
        assert _num("3.14") == 3.14

    def test_none(self):
        assert _num(None) == 0

    def test_non_numeric(self):
        assert _num("abc") == 0


# ---------------------------------------------------------------------------
# evaluate_condition — comparison operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionOperators:
    def test_eq_match(self):
        cond = {"field": "status", "operator": "eq", "value": "present"}
        assert evaluate_condition(cond, {"status": "present"}) is True

    def test_eq_no_match(self):
        cond = {"field": "status", "operator": "eq", "value": "present"}
        assert evaluate_condition(cond, {"status": "home"}) is False

    def test_neq(self):
        cond = {"field": "status", "operator": "neq", "value": "home"}
        assert evaluate_condition(cond, {"status": "present"}) is True

    def test_gt(self):
        cond = {"field": "hours", "operator": "gt", "value": 8}
        assert evaluate_condition(cond, {"hours": 10}) is True
        assert evaluate_condition(cond, {"hours": 5}) is False

    def test_lt(self):
        cond = {"field": "hours", "operator": "lt", "value": 8}
        assert evaluate_condition(cond, {"hours": 5}) is True
        assert evaluate_condition(cond, {"hours": 10}) is False

    def test_gte(self):
        cond = {"field": "hours", "operator": "gte", "value": 8}
        assert evaluate_condition(cond, {"hours": 8}) is True
        assert evaluate_condition(cond, {"hours": 7}) is False

    def test_lte(self):
        cond = {"field": "hours", "operator": "lte", "value": 8}
        assert evaluate_condition(cond, {"hours": 8}) is True
        assert evaluate_condition(cond, {"hours": 9}) is False

    def test_between(self):
        cond = {"field": "hours", "operator": "between", "value": [6, 12]}
        assert evaluate_condition(cond, {"hours": 8}) is True
        assert evaluate_condition(cond, {"hours": 4}) is False
        assert evaluate_condition(cond, {"hours": 14}) is False

    def test_between_boundaries(self):
        cond = {"field": "val", "operator": "between", "value": [5, 10]}
        assert evaluate_condition(cond, {"val": 5}) is True
        assert evaluate_condition(cond, {"val": 10}) is True

    def test_between_invalid_value(self):
        cond = {"field": "hours", "operator": "between", "value": "bad"}
        assert evaluate_condition(cond, {"hours": 8}) is False

    def test_in_operator(self):
        cond = {"field": "status", "operator": "in", "value": ["present", "sick"]}
        assert evaluate_condition(cond, {"status": "present"}) is True
        assert evaluate_condition(cond, {"status": "home"}) is False

    def test_not_in_operator(self):
        cond = {"field": "status", "operator": "not_in", "value": ["home", "sick"]}
        assert evaluate_condition(cond, {"status": "present"}) is True
        assert evaluate_condition(cond, {"status": "home"}) is False

    def test_contains(self):
        cond = {"field": "name", "operator": "contains", "value": "Ali"}
        assert evaluate_condition(cond, {"name": "Alice"}) is True
        assert evaluate_condition(cond, {"name": "Bob"}) is False

    def test_contains_none_field(self):
        cond = {"field": "name", "operator": "contains", "value": "Ali"}
        assert evaluate_condition(cond, {"name": None}) is False

    def test_is_true(self):
        cond = {"field": "active", "operator": "is_true"}
        assert evaluate_condition(cond, {"active": True}) is True
        assert evaluate_condition(cond, {"active": False}) is False
        assert evaluate_condition(cond, {"active": 1}) is True
        assert evaluate_condition(cond, {"active": 0}) is False

    def test_is_false(self):
        cond = {"field": "active", "operator": "is_false"}
        assert evaluate_condition(cond, {"active": False}) is True
        assert evaluate_condition(cond, {"active": True}) is False

    def test_is_null(self):
        cond = {"field": "value", "operator": "is_null"}
        assert evaluate_condition(cond, {"value": None}) is True
        assert evaluate_condition(cond, {}) is True  # missing → None
        assert evaluate_condition(cond, {"value": "x"}) is False

    def test_is_not_null(self):
        cond = {"field": "value", "operator": "is_not_null"}
        assert evaluate_condition(cond, {"value": "x"}) is True
        assert evaluate_condition(cond, {"value": None}) is False


# ---------------------------------------------------------------------------
# evaluate_condition — logical operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionLogical:
    def test_and_all_true(self):
        cond = {
            "operator": "and",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
                {"field": "b", "operator": "eq", "value": "2"},
            ],
        }
        assert evaluate_condition(cond, {"a": "1", "b": "2"}) is True

    def test_and_one_false(self):
        cond = {
            "operator": "and",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
                {"field": "b", "operator": "eq", "value": "2"},
            ],
        }
        assert evaluate_condition(cond, {"a": "1", "b": "3"}) is False

    def test_or_one_true(self):
        cond = {
            "operator": "or",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
                {"field": "b", "operator": "eq", "value": "2"},
            ],
        }
        assert evaluate_condition(cond, {"a": "1", "b": "3"}) is True

    def test_or_none_true(self):
        cond = {
            "operator": "or",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
                {"field": "b", "operator": "eq", "value": "2"},
            ],
        }
        assert evaluate_condition(cond, {"a": "x", "b": "x"}) is False

    def test_not_negates(self):
        cond = {
            "operator": "not",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
            ],
        }
        assert evaluate_condition(cond, {"a": "1"}) is False
        assert evaluate_condition(cond, {"a": "2"}) is True

    def test_not_empty_conditions(self):
        cond = {"operator": "not", "conditions": []}
        assert evaluate_condition(cond, {}) is True

    def test_nested_and_or(self):
        cond = {
            "operator": "and",
            "conditions": [
                {"field": "x", "operator": "gt", "value": 0},
                {
                    "operator": "or",
                    "conditions": [
                        {"field": "y", "operator": "eq", "value": "a"},
                        {"field": "y", "operator": "eq", "value": "b"},
                    ],
                },
            ],
        }
        assert evaluate_condition(cond, {"x": 5, "y": "a"}) is True
        assert evaluate_condition(cond, {"x": 5, "y": "c"}) is False
        assert evaluate_condition(cond, {"x": -1, "y": "a"}) is False

    def test_case_insensitive_logical_operators(self):
        cond = {
            "operator": "AND",
            "conditions": [
                {"field": "a", "operator": "eq", "value": "1"},
            ],
        }
        assert evaluate_condition(cond, {"a": "1"}) is True


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEvaluateConditionEdgeCases:
    def test_empty_condition_returns_true(self):
        assert evaluate_condition({}, {}) is True

    def test_missing_field_eq_none(self):
        cond = {"field": "missing", "operator": "eq", "value": None}
        assert evaluate_condition(cond, {}) is True

    def test_value_param_resolution(self):
        cond = {
            "field": "employee.hours_since_last_mission",
            "operator": "lt",
            "value_param": "min_rest_hours",
        }
        ctx = {
            "employee": {"hours_since_last_mission": 6},
            "_params": {"min_rest_hours": 8},
        }
        assert evaluate_condition(cond, ctx) is True

    def test_value_param_missing_falls_back_to_value(self):
        cond = {
            "field": "x",
            "operator": "eq",
            "value": "fallback",
            "value_param": "nonexistent",
        }
        ctx = {"x": "fallback", "_params": {}}
        assert evaluate_condition(cond, ctx) is True

    def test_unknown_operator_returns_true(self):
        """Unknown operators default to True (safe fallback)."""
        cond = {"field": "x", "operator": "some_future_op", "value": 5}
        assert evaluate_condition(cond, {"x": 5}) is True

    def test_dotted_field_in_condition(self):
        cond = {"field": "employee.status", "operator": "eq", "value": "present"}
        ctx = {"employee": {"status": "present"}}
        assert evaluate_condition(cond, ctx) is True

    def test_eq_with_numeric_types(self):
        """eq uses str() comparison so '10' == 10."""
        cond = {"field": "count", "operator": "eq", "value": 10}
        assert evaluate_condition(cond, {"count": 10}) is True
