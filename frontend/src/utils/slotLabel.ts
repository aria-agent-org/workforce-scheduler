/**
 * Resolves a slot's display label from mission type required_slots.
 * Falls back gracefully: label[lang] → label.he → role name → "תפקיד N"
 */

export interface SlotLabel {
  he?: string;
  en?: string;
}

export interface RequiredSlot {
  slot_id: string;
  label?: SlotLabel | string;
  label_he?: string;
  label_en?: string;
  work_role_id?: string;
}

export interface MissionTypeForSlot {
  id?: string;
  required_slots?: RequiredSlot[];
}

/**
 * Resolve a slot label from a label object/string.
 * Handles both {he: "נהג", en: "Driver"} and flat string formats.
 */
export function resolveSlotLabel(
  label: SlotLabel | string | undefined | null,
  lang: 'he' | 'en' = 'he'
): string {
  if (!label) return '';
  if (typeof label === 'string') return label;
  return label[lang] || label.he || label.en || '';
}

/**
 * Get a display label for a slot, with full fallback chain:
 * 1. Slot's own label (from mission type required_slots)
 * 2. Work role name lookup
 * 3. Friendly "תפקיד N" / "Slot N" instead of raw "s1"
 */
export function getSlotDisplayLabel(
  slotId: string,
  missionTypeId: string | undefined,
  missionTypes: MissionTypeForSlot[],
  lang: 'he' | 'en' = 'he',
  roleDefinitions?: Array<{ id: string; name?: string; name_he?: string; name_en?: string }>
): string {
  if (!missionTypeId || !missionTypes?.length) {
    return formatSlotFallback(slotId, lang);
  }

  const mt = missionTypes.find(
    (m) => m.id === missionTypeId
  );

  if (!mt?.required_slots?.length) {
    return formatSlotFallback(slotId, lang);
  }

  const slot = mt.required_slots.find((s) => s.slot_id === slotId);
  if (!slot) {
    return formatSlotFallback(slotId, lang);
  }

  // Try structured label
  const fromLabel = resolveSlotLabel(slot.label, lang);
  if (fromLabel) return fromLabel;

  // Try flat label fields
  if (lang === 'he' && slot.label_he) return slot.label_he;
  if (lang === 'en' && slot.label_en) return slot.label_en;
  if (slot.label_he) return slot.label_he;

  // Try role definition name
  if (slot.work_role_id && roleDefinitions?.length) {
    const role = roleDefinitions.find((r) => r.id === slot.work_role_id);
    if (role) {
      const roleName = lang === 'he' 
        ? (role.name_he || role.name || role.name_en)
        : (role.name_en || role.name || role.name_he);
      if (roleName) return roleName;
    }
  }

  return formatSlotFallback(slotId, lang);
}

/**
 * Friendly fallback instead of raw "s1", "s2"
 */
function formatSlotFallback(slotId: string, lang: 'he' | 'en'): string {
  // Extract number from "s1", "s2", etc.
  const match = slotId.match(/^s(\d+)$/);
  if (match) {
    const num = match[1];
    return lang === 'he' ? `תפקיד ${num}` : `Role ${num}`;
  }
  return slotId;
}
