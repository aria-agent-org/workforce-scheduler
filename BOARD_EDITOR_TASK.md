# Board Template Editor - Complete Rewrite

## Goal
Rewrite `frontend/src/pages/settings/BoardTemplateEditor.tsx` to be a single unified spreadsheet-like grid editor (like Excel/Google Sheets), NOT separated into multiple sections/tabs.

## Reference Image
See `reference-board.jpg` in the repo root — this is the exact layout the user wants to create.

## Key Requirements

### 1. Single Unified Grid (MOST IMPORTANT)
- ONE big grid — no separate sections/tabs
- The entire board is ONE table on ONE page
- User can freely design the layout by editing cells, merging them, coloring them
- Think of it as a simplified Excel where the user designs the duty board template

### 2. Grid Structure from the Reference Image
The board has this structure:
- **Row 0**: Main title spanning full width (e.g., "שבצ"ק יום רביעי 11.3") — dark green background
- **Row 1**: Mission type headers that span multiple columns (e.g., "כרמל א'" spans 4 cols, "סיור" spans 4 cols)
- **Row 2**: Numbers (personnel count per mission) — e.g., "12", "12", "9", "3"
- **Row 3**: Role sub-headers (מפקד, נהג, לוחמ/ת, etc.)
- **Rows 4+**: Time slots on the RIGHT column, soldier names in cells
- **Below**: Another section within the SAME grid (כרמל ב) — separated by empty rows or separator rows

### 3. Cell Merging (Critical)
- Select multiple cells → merge into one
- Merged cells span multiple rows AND/OR columns
- This is how mission headers span their sub-columns
- This is how the title row spans the entire width

### 4. Features to Keep
- Cell background color picker (with presets including military green #166534)
- Cell text color
- Bold / text alignment (right/center/left)
- Cell borders toggle
- Column width resize by dragging
- Row height option
- Undo (Ctrl+Z)
- Save to DB via API (POST/PATCH /daily-board-templates)
- Export/Import JSON
- Preview mode
- Context menu (right-click) for add/delete row/col, merge/split
- Keyboard: Delete to clear, Escape to deselect, Tab to move between cells

### 5. Features to REMOVE
- NO section tabs (the old design had separate sections)
- NO "add section" button
- NO activeSectionId state
- NO section up/down reordering
- Keep it as ONE grid

### 6. Side Panel (keep but simplify)
- Mission types (draggable to cells)
- Work roles (draggable to cells)
- Time ranges (draggable to cells)
- Template variables (draggable to cells)
- Cell properties panel when a cell is selected

### 7. Default Template
When creating a new template, start with a grid that resembles the reference:
- ~15 columns, ~12 rows
- First row: merged title cell spanning all columns
- Second row: mission type headers with merged cells
- Time column on the far right
- Empty cells for soldier placement

### 8. RTL Layout
- The entire grid is RTL (dir="rtl")
- Time slots appear on the RIGHT side
- Hebrew text throughout the UI

### 9. Generate Board from Template
Keep the "generate daily boards" dialog that creates actual boards from templates for date ranges.

### 10. Mobile
On mobile, show read-only view with a message to use desktop for editing.

## Technical Notes
- Keep all existing imports and UI components (Card, Button, Input, Dialog, etc.)
- Keep the API integration (tenantApi, api.get/post/patch)
- Keep the save/load logic but adapt the data structure:
  - Instead of `sections: BoardSection[]`, use a flat grid: `grid: GridCell[][]`
  - Keep `globalStyles`, `layoutMode` can be removed or set to "single"
- The DB model `DailyBoardTemplate` stores `layout` as JSONB — no backend changes needed
- Keep backward compatibility: if loading an old template with sections, flatten them into one grid

## Data Structure (new)
```typescript
interface BoardTemplate {
  id: string;
  _dbId?: string;
  name: string;
  scheduleWindowId?: string;
  grid: GridCell[][];  // flat 2D grid, no sections
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];  // NEW: per-row height
  globalStyles: {
    headerColor: string;
    subheaderColor: string;
    borderColor: string;
    fontFamily: string;
  };
}
```

## File to Edit
`frontend/src/pages/settings/BoardTemplateEditor.tsx` — complete rewrite of the default export function and types.

## DO NOT TOUCH
- `frontend/src/pages/settings/SettingsPage.tsx` (it imports BoardTemplateEditor correctly already)
- Backend files
- Any other frontend files
