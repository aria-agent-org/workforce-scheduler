import { useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DailyBoardMission {
  id: string;
  name: string;
  date: string;
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
  mission_type_id: string;
  assignments?: Array<{
    id: string;
    employee_id: string;
    employee_name: string;
    slot_id: string;
    work_role_id?: string;
    status?: string;
  }>;
}

export interface DailyBoardEmployee {
  id: string;
  full_name: string;
  employee_number?: string;
}

export interface DailyBoardMissionType {
  id: string;
  name: { he: string; en?: string } | string;
  color?: string;
  icon?: string;
  required_slots?: Array<{
    slot_id: string;
    label?: { he: string; en?: string } | string;
    work_role_id?: string;
    count?: number;
  }>;
}

export interface TimeShift {
  label: string;      // e.g. "07:00-11:00"
  start: string;      // "07:00"
  end: string;        // "11:00"
}

export interface BoardSectionDef {
  mission_type_id: string;
  label?: string;      // override mission type name
  color?: string;      // override color
}

export interface BoardTableDef {
  title?: string;
  sections: BoardSectionDef[];
}

export interface DailyBoardViewProps {
  date: string;                          // YYYY-MM-DD
  windowId?: string;
  missions: DailyBoardMission[];
  employees: DailyBoardEmployee[];
  missionTypes: DailyBoardMissionType[];
  timeShifts?: TimeShift[];              // if not provided, auto-derive from missions
  tables?: BoardTableDef[];              // if not provided, one table with all missions
  onPrint?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_TIME_SHIFTS: TimeShift[] = [
  { label: "07:00-11:00", start: "07:00", end: "11:00" },
  { label: "11:00-15:00", start: "11:00", end: "15:00" },
  { label: "15:00-19:00", start: "15:00", end: "19:00" },
  { label: "19:00-23:00", start: "19:00", end: "23:00" },
  { label: "23:00-03:00", start: "23:00", end: "03:00" },
  { label: "03:00-07:00", start: "03:00", end: "07:00" },
];

function getName(name: { he: string; en?: string } | string): string {
  if (typeof name === "string") return name;
  return name.he || name.en || "";
}

function getSlotLabel(label?: { he: string; en?: string } | string): string {
  if (!label) return "";
  return getName(label as { he: string; en?: string } | string);
}

/** HH:MM or HH:MM:SS → minutes from midnight (handles overnight wrap) */
function timeToMinutes(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Does a mission [start,end) overlap the shift [shiftStart, shiftEnd)?
 *  Both may cross midnight (end < start). */
function missionOverlapsShift(
  missionStart: string,
  missionEnd: string,
  shiftStart: string,
  shiftEnd: string,
): boolean {
  const ms = timeToMinutes(missionStart);
  const me = timeToMinutes(missionEnd);
  const ss = timeToMinutes(shiftStart);
  const se = timeToMinutes(shiftEnd);

  // Normalize to 0-1440 range, treating overnight as wrapping
  const missionOvernight = me <= ms;
  const shiftOvernight = se <= ss;

  // Simple overlap check: missions that overlap midnight spans
  if (!missionOvernight && !shiftOvernight) {
    return ms < se && me > ss;
  }
  if (missionOvernight && !shiftOvernight) {
    // mission wraps midnight: [ms,1440) ∪ [0,me)
    return ss < 1440 && se > ms || ss < me;
  }
  if (!missionOvernight && shiftOvernight) {
    // shift wraps midnight: [ss,1440) ∪ [0,se)
    return ms < 1440 && me > ss || ms < se;
  }
  // Both wrap: always overlap
  return true;
}

/** Hebrew day names */
const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function formatHebrewDate(dateStr: string): { day: string; date: string } {
  const d = new Date(dateStr + "T12:00:00");
  const day = HE_DAYS[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { day, date: `${dd}/${mm}/${yyyy}` };
}

// ─── Sub-component: one board table ──────────────────────────────────────────

interface BoardTableProps {
  tableDef: BoardTableDef;
  missions: DailyBoardMission[];
  missionTypes: DailyBoardMissionType[];
  timeShifts: TimeShift[];
}

function BoardTable({ tableDef, missions, missionTypes, timeShifts }: BoardTableProps) {
  // Build column definitions per section
  const columns = useMemo(() => {
    const cols: Array<{
      sectionLabel: string;
      sectionColor: string;
      totalSize: number;
      slotColumns: Array<{
        slotId: string;
        slotLabel: string;
        roleLabel: string;
        missionTypeId: string;
      }>;
    }> = [];

    for (const sec of tableDef.sections) {
      const mt = missionTypes.find(m => m.id === sec.mission_type_id);
      if (!mt) continue;

      const color = sec.color || mt.color || "#166534";
      const label = sec.label || getName(mt.name);
      const slots = mt.required_slots || [];

      const slotColumns: Array<{
        slotId: string;
        slotLabel: string;
        roleLabel: string;
        missionTypeId: string;
      }> = [];

      if (slots.length === 0) {
        // Fallback: single column
        slotColumns.push({
          slotId: "default",
          slotLabel: label,
          roleLabel: "",
          missionTypeId: mt.id,
        });
      } else {
        for (const slot of slots) {
          slotColumns.push({
            slotId: slot.slot_id,
            slotLabel: getSlotLabel(slot.label) || slot.slot_id,
            roleLabel: getSlotLabel(slot.label) || slot.slot_id,
            missionTypeId: mt.id,
          });
        }
      }

      // Total team size
      const totalSize = (mt.required_slots || []).reduce((s, sl) => s + (sl.count || 1), 0) || slotColumns.length;

      cols.push({ sectionLabel: label, sectionColor: color, totalSize, slotColumns });
    }

    return cols;
  }, [tableDef.sections, missionTypes]);

  // Build cell lookup: shift × (missionTypeId, slotId) → soldier name
  const cellData = useMemo(() => {
    // key: `${shiftLabel}|${missionTypeId}|${slotId}` → soldier name[]
    const map = new Map<string, string[]>();

    for (const shift of timeShifts) {
      for (const mission of missions) {
        if (!missionOverlapsShift(
          mission.start_time?.slice(0, 5) || "00:00",
          mission.end_time?.slice(0, 5) || "00:00",
          shift.start,
          shift.end,
        )) continue;

        for (const assignment of (mission.assignments || [])) {
          if (assignment.status === "replaced") continue;
          const key = `${shift.label}|${mission.mission_type_id}|${assignment.slot_id}`;
          const existing = map.get(key) || [];
          existing.push(assignment.employee_name || "—");
          map.set(key, existing);
        }
      }
    }

    return map;
  }, [missions, timeShifts]);

  const getSoldier = (shiftLabel: string, missionTypeId: string, slotId: string): string => {
    const key = `${shiftLabel}|${missionTypeId}|${slotId}`;
    const names = cellData.get(key);
    if (!names || names.length === 0) return "—";
    return names.join(", ");
  };

  const totalCols = columns.reduce((s, c) => s + c.slotColumns.length, 0);
  if (totalCols === 0) return null;

  return (
    <div className="daily-board-table-wrapper" style={{ marginBottom: "16px" }}>
      {tableDef.title && (
        <div style={{
          background: "#14532d",
          color: "white",
          padding: "4px 10px",
          fontWeight: "bold",
          fontSize: "13px",
          borderRadius: "4px 4px 0 0",
        }}>{tableDef.title}</div>
      )}
      <table className="daily-board-table">
        <thead>
          {/* Row 1: Mission section names (colspan per section) */}
          <tr>
            {columns.map((col, ci) => (
              <th
                key={ci}
                colSpan={col.slotColumns.length}
                style={{ background: col.sectionColor, color: "white" }}
                className="section-header-cell"
              >
                {col.sectionLabel}
              </th>
            ))}
            <th className="time-header-cell" rowSpan={3}>שעות</th>
          </tr>
          {/* Row 2: Team size per section */}
          <tr>
            {columns.map((col, ci) => (
              <th
                key={ci}
                colSpan={col.slotColumns.length}
                style={{ background: col.sectionColor + "cc", color: "white", fontSize: "11px" }}
              >
                ({col.totalSize})
              </th>
            ))}
          </tr>
          {/* Row 3: Role/slot labels */}
          <tr>
            {columns.map((col) =>
              col.slotColumns.map((sc, si) => (
                <th
                  key={`${sc.missionTypeId}-${sc.slotId}-${si}`}
                  className="role-header-cell"
                  style={{ background: col.sectionColor + "33", color: "#14532d" }}
                >
                  {sc.roleLabel}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {timeShifts.map((shift) => (
            <tr key={shift.label}>
              {columns.map((col) =>
                col.slotColumns.map((sc, si) => {
                  const name = getSoldier(shift.label, sc.missionTypeId, sc.slotId);
                  const isEmpty = name === "—";
                  return (
                    <td
                      key={`${sc.missionTypeId}-${sc.slotId}-${si}`}
                      className={`soldier-cell ${isEmpty ? "empty-cell" : ""}`}
                    >
                      {name}
                    </td>
                  );
                })
              )}
              <td className="time-cell">{shift.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyBoardView({
  date,
  missions,
  employees: _employees,
  missionTypes,
  timeShifts: timeShiftsProp,
  tables: tablesProp,
  onPrint,
}: DailyBoardViewProps) {
  const { day, date: formattedDate } = formatHebrewDate(date);

  // Auto-derive time shifts from mission start/end times if not provided
  const timeShifts = useMemo<TimeShift[]>(() => {
    if (timeShiftsProp && timeShiftsProp.length > 0) return timeShiftsProp;
    if (missions.length === 0) return DEFAULT_TIME_SHIFTS;

    // Collect unique start times → build consecutive shifts
    const starts = new Set<string>();
    for (const m of missions) {
      if (m.start_time) starts.add(m.start_time.slice(0, 5));
    }
    if (starts.size === 0) return DEFAULT_TIME_SHIFTS;

    // Sort by minutes
    const sorted = Array.from(starts).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    const shifts: TimeShift[] = sorted.map((s, i) => {
      const next = sorted[(i + 1) % sorted.length];
      return {
        label: `${s}-${next}`,
        start: s,
        end: next,
      };
    });
    return shifts.length > 0 ? shifts : DEFAULT_TIME_SHIFTS;
  }, [timeShiftsProp, missions]);

  // Auto-build table definitions from mission types if not provided
  const tables = useMemo<BoardTableDef[]>(() => {
    if (tablesProp && tablesProp.length > 0) return tablesProp;

    // Group all missions by mission type
    const typeIds = new Set<string>();
    for (const m of missions) {
      if (m.mission_type_id) typeIds.add(m.mission_type_id);
    }

    // Include mission types that have missions on this date
    const sections: BoardSectionDef[] = [];
    for (const mt of missionTypes) {
      if (typeIds.has(mt.id)) {
        sections.push({ mission_type_id: mt.id });
      }
    }

    if (sections.length === 0) return [];
    return [{ sections }];
  }, [tablesProp, missions, missionTypes]);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className="daily-board" dir="rtl">
      {/* CSS injected inline for print portability */}
      <style>{`
        .daily-board {
          font-family: 'Arial', 'Helvetica', sans-serif;
          direction: rtl;
          background: white;
        }
        .daily-board-title {
          background: #166534;
          color: white;
          text-align: center;
          padding: 8px 16px;
          font-weight: bold;
          font-size: 16px;
          border-radius: 4px 4px 0 0;
          margin-bottom: 4px;
        }
        .daily-board-table {
          border-collapse: collapse;
          width: 100%;
          table-layout: auto;
        }
        .daily-board-table th,
        .daily-board-table td {
          border: 1px solid #9ca3af;
          padding: 4px 6px;
          text-align: center;
          font-size: 12px;
          white-space: nowrap;
          vertical-align: middle;
        }
        .daily-board-table .section-header-cell {
          font-weight: bold;
          font-size: 13px;
          padding: 6px 8px;
          border-bottom: 2px solid rgba(255,255,255,0.4);
        }
        .daily-board-table .role-header-cell {
          font-weight: bold;
          font-size: 11px;
          padding: 3px 4px;
        }
        .daily-board-table .time-header-cell {
          background: #166534;
          color: white;
          font-weight: bold;
          font-size: 12px;
          min-width: 90px;
          text-align: center;
        }
        .daily-board-table .time-cell {
          background: #f0fdf4;
          font-weight: bold;
          font-size: 12px;
          color: #14532d;
          white-space: nowrap;
          text-align: center;
          direction: ltr;
        }
        .daily-board-table .soldier-cell {
          min-width: 70px;
          max-width: 120px;
          font-size: 12px;
        }
        .daily-board-table .empty-cell {
          color: #9ca3af;
        }
        .daily-board-table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .daily-board-print-bar {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-bottom: 8px;
        }
        .daily-board-print-btn {
          background: #166534;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 6px 14px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }
        .daily-board-print-btn:hover {
          background: #14532d;
        }
        @media print {
          .daily-board-print-bar {
            display: none !important;
          }
          .daily-board {
            page-break-inside: avoid;
          }
          .daily-board-table th,
          .daily-board-table td {
            font-size: 11px;
            padding: 3px 4px;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            margin: 0;
          }
        }
      `}</style>

      {/* Print / action bar (no-print) */}
      <div className="daily-board-print-bar no-print">
        <button className="daily-board-print-btn" onClick={handlePrint}>
          🖨️ הדפס לוח
        </button>
      </div>

      {/* Title */}
      <div className="daily-board-title">
        שבצ&quot;ק יום {day} {formattedDate}
      </div>

      {/* Tables */}
      {tables.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#6b7280", background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: "4px" }}>
          אין משימות להצגה ביום זה
        </div>
      ) : (
        tables.map((table, ti) => (
          <BoardTable
            key={ti}
            tableDef={table}
            missions={missions}
            missionTypes={missionTypes}
            timeShifts={timeShifts}
          />
        ))
      )}
    </div>
  );
}
