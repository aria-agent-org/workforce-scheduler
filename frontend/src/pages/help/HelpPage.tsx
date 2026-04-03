import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle, Search, ChevronDown, ChevronUp, BookOpen,
  Users, Calendar, ShieldCheck, Settings, Lightbulb, ClipboardList, ArrowLeftRight,
} from "lucide-react";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
}

const categories = [
  { key: "getting-started", label: "מדריך למתחילים", icon: Lightbulb, color: "bg-primary-100 text-primary-700" },
  { key: "soldiers", label: "ניהול חיילים", icon: Users, color: "bg-green-100 text-green-700" },
  { key: "scheduling", label: "שיבוץ", icon: Calendar, color: "bg-amber-100 text-amber-700" },
  { key: "rules", label: "חוקים", icon: ShieldCheck, color: "bg-amber-100 text-amber-700" },
  { key: "attendance", label: "נוכחות", icon: ClipboardList, color: "bg-primary-100 text-primary-700" },
  { key: "swaps", label: "החלפות", icon: ArrowLeftRight, color: "bg-red-300 text-red-300" },
  { key: "settings", label: "הגדרות", icon: Settings, color: "bg-gray-100 text-gray-700" },
];

const articles: Article[] = [
  // Getting started
  {
    id: "gs-1",
    title: "צעדים ראשונים — איך מתחילים עם שבצק",
    category: "getting-started",
    content: `## ברוכים הבאים לשבצק! 🎯

שבצק היא מערכת שיבוץ חכמה לצוותים צבאיים וארגוניים.

### שלב 1: הגדרת הצוות
עברו ל**חיילים** והוסיפו את כל חברי הצוות. לכל חייל:
- שם מלא ומספר אישי
- תפקידים (נהג, ראש צוות, עובד כללי)
- סטטוס נוכחות

### שלב 2: הגדרת סוגי משימות
ב**שיבוצים → סוגי משימות**, הגדירו כל סוג משימה:
- שם ואייקון
- סלוטים נדרשים (כמה אנשים ומאיזה תפקיד)
- משך המשימה

### שלב 3: יצירת לוח עבודה
צרו **לוח עבודה** עם תאריכי התחלה וסיום, שייכו חיילים ללוח.

### שלב 4: תבניות ויצירת משימות
צרו **תבנית** עם חזרתיות (יומי/שבועי) ולחצו "צור משימות" — המערכת תיצור את כל המשימות אוטומטית.

### שלב 5: שיבוץ
השתמשו ב**שיבוץ אוטומטי** או שבצו ידנית. המערכת תתריע על התנגשויות!`,
  },
  {
    id: "gs-2",
    title: "ממשק המערכת — סיור מהיר",
    category: "getting-started",
    content: `## הכירו את הממשק

### סרגל צד שמאלי
- **לוח בקרה** — סיכום כללי ומשימות להיום
- **חיילים** — ניהול רשימת הצוות
- **שיבוצים** — לוחות עבודה, משימות, תבניות
- **נוכחות** — עדכון סטטוס חיילים
- **חוקים** — הגדרת כללי שיבוץ
- **דוחות** — ייצוא נתונים
- **הגדרות** — תפקידים, סטטוסים, אינטגרציות

### טיפים
- לחצו על **?** ליד כל שדה לעזרה מקומית
- השתמשו ב**Ctrl+K** לחיפוש מהיר
- כל הפעולות נשמרות ב**יומן פעולות**`,
  },

  // Scheduling — How to create a schedule window
  {
    id: "sch-window",
    title: "איך ליצור לוח עבודה (שלב אחר שלב)",
    category: "scheduling",
    content: `## יצירת לוח עבודה — מדריך מלא

### שלב 1: פתיחת לוח חדש
1. עברו ל**שיבוצים** מתפריט הצד
2. לחצו **"לוח עבודה חדש"** (כפתור כחול למעלה)
3. מלאו:
   - **שם** — תיאור התקופה (למשל "מאי-יוני 2026")
   - **תאריך התחלה** — היום הראשון של התקופה
   - **תאריך סיום** — היום האחרון
4. לחצו **"צור"**

### שלב 2: שיוך חיילים ללוח
ברגע שנפתח הלוח, יש שתי דרכים להוסיף חיילים:
- **ידנית** — לחצו על "הוסף חיילים" מתוך מסך הלוח
- **ייבוא מאקסל** — לחצו "ייבוא חיילים" → העלו קובץ CSV עם מספרים אישיים → אשרו

### שלב 3: הפעלת הלוח
- לוח חדש נוצר בסטטוס **טיוטה (Draft)**
- לחצו על ▶ כדי **להפעיל** — רק לוח פעיל מופיע לחיילים
- ניתן **להשהות** לוח פעיל ו**לחדש** אותו בכל עת
- לוח שהסתיים → **ארכיון**

### שלב 4: צפייה בלוח
- לחצו על שם הלוח כדי להיכנס ל**תצוגת לוח**
- בחרו **יומי** או **שבועי**
- נווטו בין תאריכים עם חצים או בחירת תאריך

### טיפ חשוב
לפני שיצרתם לוח — ודאו שהגדרתם **סוגי משימות** ו**תפקידים** בהגדרות!`,
  },

  // Scheduling — How to use auto-scheduling
  {
    id: "sch-auto",
    title: "שיבוץ אוטומטי — איך זה עובד",
    category: "scheduling",
    content: `## אלגוריתם השיבוץ האוטומטי

השיבוץ האוטומטי הוא הכלי החזק ביותר במערכת. הנה איך הוא עובד:

### 1. סינון קשיח
מסנן חיילים שלא יכולים לבצע את המשימה:
- לא נוכחים (סטטוס "בבית", "חולה" וכו')
- אין להם את התפקיד הנדרש
- התנגשות זמנים קשיחה (כבר משובצים)

### 2. ניקוד
לכל חייל מתאים — ציון:
- **100** — ציון בסיס
- **-10** — לכל משימה נוספת באותו יום
- **-20** — פחות מ-18 שעות מנוחה מהמשימה הקודמת
- **-30** — פחות מ-16 שעות מנוחה
- **+10** — תפקיד ראשי תואם (עדיפות)
- **+5** — מעט משימות השבוע (איזון עומסים)

### 3. אופטימיזציה
המערכת מנסה לאזן עומסים — חייל שעבד הרבה השבוע יקבל ציון נמוך יותר. זה מבטיח חלוקה הוגנת.

### 4. בדיקת התנגשויות
כל שיבוץ נבדק מול **חוקי המערכת**:
- חוקים **קשיחים** — חוסמים שיבוץ
- חוקים **רכים** — מייצרים אזהרה בלבד

### 5. פלט
- **שובצו בהצלחה** — כמה חיילים שובצו
- **אזהרות רכות** — שיבוצים עם הערות
- **התנגשויות קשות** — שיבוצים שנחסמו
- **סלוטים לא מאוישים** — מה נשאר ריק

### איך להפעיל
1. היכנסו ללוח עבודה פעיל
2. לחצו **"שיבוץ אוטומטי"** (אייקון שרביט)
3. המערכת תעבד ותציג תוצאות
4. בדקו את התוצאות ואשרו

### טיפ
הפעילו שיבוץ אוטומטי **אחרי** שיצרתם את כל המשימות מתבניות, וגם **אחרי** שעדכנתם נוכחות.`,
  },

  // Scheduling — Templates
  {
    id: "sch-templates",
    title: "תבניות משימה — הגדרת חזרתיות",
    category: "scheduling",
    content: `## תבניות משימה

תבנית מגדירה משימה חוזרת. במקום ליצור כל משימה ידנית, הגדירו תבנית פעם אחת.

### סוגי חזרתיות
- **יומי** — כל יום בתקופה
- **שבועי** — ימים ספציפיים (למשל: א, ג, ה)
- **מותאם** — שבועות זוגיים/אי-זוגיים
- **חד פעמי** — תאריך ספציפי בלבד

### משמרות מובנות
הגדירו זמני משמרת מתוך פריסטים:
- **בוקר**: 07:00-15:00
- **צהריים**: 15:00-23:00
- **לילה**: 23:00-07:00
- **מותאם**: שעות לבחירתכם

### תאריכים חריגים
- **דלג** — תאריכים שבהם לא ליצור משימה (חגים, אירועים)
- **הוסף** — תאריכים נוספים מעבר לחזרתיות הרגילה

### יצירת משימות מתבנית
1. צרו תבנית ובחרו חזרתיות
2. לחצו **"צור משימות"** על התבנית
3. בחרו טווח תאריכים
4. המערכת תיצור את כל המשימות אוטומטית

### משך משימה — כפתורים מהירים
בהגדרת סוג משימה, השתמשו בכפתורים המהירים:
- **4h** | **8h** | **12h** | **24h** | מותאם
- 24h מתאים למשימות שמירה ותורנות`,
  },

  // Rules — How to build rules
  {
    id: "rul-build",
    title: "איך לבנות חוק שיבוץ",
    category: "rules",
    content: `## בונה החוקים

חוקים מגדירים מתי שיבוץ מותר ומתי אסור.

### מבנה חוק
כל חוק מורכב מ:
1. **שם** — תיאור קצר (עברית + אנגלית)
2. **תנאי** — ביטוי לוגי שנבדק לכל שיבוץ
3. **חומרה** — קשיח (חוסם) או רך (מזהיר)
4. **הודעה** — טקסט שמוצג כשהתנאי מתקיים

### יצירת חוק חדש
1. עברו ל**חוקים** מתפריט הצד
2. לחצו **"חוק חדש"**
3. מלאו שם, בחרו חומרה
4. בנו את התנאי מתוך השדות הזמינים
5. כתבו הודעת אזהרה/חסימה
6. שמרו — החוק פעיל מיד

### דוגמאות לחוקים נפוצים

**מנוחה מינימלית (16 שעות)**
- תנאי: employee.hours_since_last_mission < 16
- חומרה: קשיח
- הודעה: "נדרשת מנוחה מינימלית של 16 שעות"

**שעות עבודה מקסימליות (8 ביום)**
- תנאי: employee.total_work_hours_today > 8
- חומרה: רך
- הודעה: "העובד חרג מ-8 שעות עבודה היום"

**מנוחה אחרי משמרת לילה**
- תנאי: employee.last_mission_was_night == true AND mission.start_hour < 14
- חומרה: קשיח
- הודעה: "לא ניתן לשבץ למשמרת בוקר אחרי לילה"

### חוקים מובנים
המערכת מגיעה עם 3 חוקים מוכנים שניתן לערוך:
- מנוחה מינימלית (16 שעות) — קשיח
- שעות עבודה מקסימליות (8 ביום) — רך
- מנוחה אחרי משמרת לילה — קשיח`,
  },

  // Rules — Condition fields reference
  {
    id: "rul-fields",
    title: "שדות תנאי ואופרטורים — טבלת עזר",
    category: "rules",
    content: `## שדות תנאי זמינים

בעת בניית חוק, ניתן להשתמש בשדות הבאים:

### שדות עובד (employee.*)

| שדה | תיאור | סוג | דוגמה |
|------|--------|------|--------|
| employee.hours_since_last_mission | שעות מאז סיום המשימה האחרונה | מספר | < 16 |
| employee.total_work_hours_today | סה"כ שעות עבודה היום | מספר | > 8 |
| employee.total_work_hours_week | סה"כ שעות עבודה השבוע | מספר | > 40 |
| employee.missions_today | מספר משימות היום | מספר | > 2 |
| employee.missions_week | מספר משימות השבוע | מספר | > 5 |
| employee.last_mission_was_night | האם המשימה האחרונה הייתה לילית (23:00-07:00) | בוליאני | == true |
| employee.consecutive_work_days | ימי עבודה רצופים | מספר | > 6 |
| employee.is_present | האם העובד נוכח | בוליאני | == true |
| employee.has_role | האם יש לעובד תפקיד מסוים | טקסט | == "driver" |

### שדות משימה (mission.*)

| שדה | תיאור | סוג | דוגמה |
|------|--------|------|--------|
| mission.start_hour | שעת התחלת המשימה (0-23) | מספר | < 7 |
| mission.end_hour | שעת סיום המשימה | מספר | > 23 |
| mission.duration_hours | משך המשימה בשעות | מספר | > 12 |
| mission.is_night | האם משימה לילית | בוליאני | == true |
| mission.is_standby | האם משימת כוננות | בוליאני | == true |
| mission.day_of_week | יום בשבוע (0=ראשון, 6=שבת) | מספר | == 6 |

### אופרטורים

| אופרטור | תיאור | דוגמה |
|----------|--------|--------|
| == | שווה ל | employee.is_present == true |
| != | שונה מ | employee.status != "sick" |
| < | קטן מ | employee.hours_since_last_mission < 16 |
| > | גדול מ | employee.total_work_hours_today > 8 |
| <= | קטן או שווה | employee.missions_week <= 5 |
| >= | גדול או שווה | employee.consecutive_work_days >= 7 |
| AND | וגם | condition1 AND condition2 |
| OR | או | condition1 OR condition2 |

### טיפ
ניתן לשלב תנאים מורכבים עם AND ו-OR:
employee.last_mission_was_night == true AND mission.start_hour < 14`,
  },

  // Attendance
  {
    id: "att-manage",
    title: "איך לנהל נוכחות",
    category: "attendance",
    content: `## ניהול נוכחות

### תצוגות נוכחות
עמוד הנוכחות תומך ב-3 תצוגות:
- **שבועי** — 7 ימים, מתאים לעדכון יומיומי
- **חודשי** — 30 ימים, מתאים לסקירה חודשית
- **תקופה** — כל התאריכים בלוח העבודה הפעיל

### עדכון נוכחות
1. עברו ל**נוכחות** מתפריט הצד
2. בחרו **לוח עבודה** ו**שבוע/חודש/תקופה**
3. לחצו על **תא** בטבלה
4. בחרו **סטטוס** מהרשימה
5. חזרו על כל העובדים
6. לחצו **"שמור הכל"**

### סטטוסים מובנים
- ✅ **נוכח** — ניתן לשיבוץ
- 🏠 **בבית** — לא זמין
- 🤒 **חולה** — לא זמין
- 🏖 **חופשה** — לא זמין
- 📚 **הכשרה** — זמין חלקית
- 🎖 **מילואים** — לא זמין

### סינון
- חיפוש לפי **שם** או **מספר אישי**
- סינון לפי **תפקיד**
- סינון לפי **סטטוס**

### ייצוא
- **CSV** — קובץ טקסט מופרד בפסיקים
- **Excel** — קובץ xlsx עם עיצוב

### סנכרון Google Sheets
ניתן לסנכרן נוכחות דו-כיוונית עם גיליון Google. הגדירו ב**הגדרות → Google Sheets**.

### קונפליקטים
כשיש הבדל בין נתוני המערכת לגיליון Google — מופיעה אזהרת **קונפליקט** בתחתית העמוד.`,
  },

  // Swaps
  {
    id: "swp-handle",
    title: "איך לטפל בבקשות החלפה",
    category: "swaps",
    content: `## בקשות החלפה

### סוגי בקשות
- **החלפה** — חייל A רוצה להחליף משמרת עם חייל B
- **ויתור** — חייל רוצה לוותר על משמרת (ללא מחליף)

### תהליך מצד החייל
1. נכנס ל**פורטל שלי → שיבוץ**
2. לוחץ על משמרת
3. בוחר **"בקש החלפה"**
4. כותב סיבה (אופציונלי)
5. הבקשה נשלחת למנהל

### תהליך מצד המנהל
1. עמוד **החלפות** מציג את כל הבקשות
2. כל בקשה מציגה:
   - מי מבקש ועל איזה משמרת
   - סיבה (אם ניתנה)
   - סטטוס: ממתין | אושר | נדחה
3. אפשרויות:
   - **אשר** — השיבוץ מתעדכן אוטומטית
   - **דחה** — נשלחת הודעה לחייל
   - **בדוק התנגשויות** — בדיקה לפני אישור

### התראות
- חייל מקבל התראה כשבקשתו אושרה/נדחתה
- מנהל מקבל התראה על בקשות חדשות
- ניתן להגדיר ערוצי התראות (Push, אימייל, WhatsApp)`,
  },

  // Soldiers
  {
    id: "sol-1",
    title: "הוספת חיילים וניהול תפקידים",
    category: "soldiers",
    content: `## ניהול חיילים

### הוספת חייל
1. עברו ל**חיילים** ← **חייל חדש**
2. מלאו: שם מלא, מספר אישי
3. בחרו תפקידים ראשיים ומשניים

### ייבוא בכמות
1. הורידו **תבנית CSV** מהכפתור למעלה
2. מלאו את הנתונים באקסל
3. שמרו כ-CSV
4. העלו דרך **"ייבוא"** → בדקו תצוגה מקדימה → אשרו

### פעולות מרוכזות
סמנו מספר חיילים בתיבת הסימון ובצעו:
- **שינוי תפקיד** — עדכון תפקיד לכולם
- **שינוי סטטוס** — הפעלה/השבתה
- **שליחת התראה** — הודעה לכל הנבחרים
- **יצירת קודים** — קודי הרשמה בכמות

### תפקידים
כל חייל יכול לקבל מספר תפקידים:
- **תפקיד ראשי** — בעדיפות גבוהה לשיבוץ
- **תפקיד משני** — כגיבוי

### קודי הרשמה
צרו **קוד הרשמה** בן 6 ספרות. החייל ישתמש בקוד כדי ליצור חשבון.
ב**הגדרות → קודי הרשמה** ניתן לנהל את כל הקודים.`,
  },

  // Settings
  {
    id: "set-1",
    title: "הגדרות מערכת — תפקידים והרשאות",
    category: "settings",
    content: `## תפקידים והרשאות

### תפקידי מערכת
- **מנהל מערכת** — גישה מלאה + עקיפת חוקים קשיחים
- **מנהל טננט** — ניהול הצוות + עקיפת חוקים רכים
- **משבץ** — שיבוץ + נוכחות
- **צופה** — צפייה בלבד

### תפקידים תפעוליים
תפקידים כמו נהג, ראש צוות, חובש — משפיעים על שיבוץ.
הגדירו ב**הגדרות → תפקידים**.

### הגדרות נוכחות
ניתן להגדיר סטטוסים מותאמים עם צבע, אייקון, וסימון האם ניתן לשיבוץ.

### ערוצי תקשורת
ב**הגדרות → ערוצים**, הפעילו/כבו ערוצי התראות:
- PWA Push — ללא עלות
- WhatsApp — עלות לכל הודעה
- Email — ללא עלות
- SMS — עלות לכל הודעה
- Telegram — ללא עלות`,
  },

  // Settings — Integrations
  {
    id: "set-2",
    title: "אינטגרציות — Google Sheets ו-WhatsApp",
    category: "settings",
    content: `## אינטגרציות

### Google Sheets
סנכרון דו-כיווני עם גיליון Google:
1. עברו ל**הגדרות → Google Sheets**
2. הזינו מזהה הגיליון
3. הפעילו סנכרון אוטומטי

### WhatsApp
שליחת התראות ישירות ל-WhatsApp:
1. **הגדרות → ערוצים → WhatsApp**
2. הפעילו את הערוץ
3. הגדירו עלות לכל הודעה

### התראות Push
התראות PWA פעילות כברירת מחדל לכל המשתמשים — ללא עלות.`,
  },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filtered = articles.filter(a => {
    const matchSearch = !search || a.title.includes(search) || a.content.includes(search);
    const matchCat = !selectedCategory || a.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const renderMarkdown = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(3)}</h2>;
      if (line.startsWith("### ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
      if (line.startsWith("| ") && line.includes("|")) {
        const cells = line.split("|").filter(c => c.trim()).map(c => c.trim());
        const isHeader = cells.every(c => /^-+$/.test(c));
        if (isHeader) return null;
        return (
          <div key={i} className="grid gap-2 text-xs font-mono bg-muted/50 px-3 py-1.5 rounded border-b" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
            {cells.map((cell, j) => (
              <span key={j} className={j === 0 ? "font-semibold" : ""}>{cell}</span>
            ))}
          </div>
        );
      }
      if (line.startsWith("- **")) {
        const match = line.match(/^- \*\*(.+?)\*\*(.*)$/);
        if (match) return <p key={i} className="ms-4 text-sm">• <strong>{match[1]}</strong>{match[2]}</p>;
      }
      if (line.startsWith("- ")) return <p key={i} className="ms-4 text-sm">• {line.slice(2)}</p>;
      if (/^\d+\. /.test(line)) {
        const match = line.match(/^(\d+)\. (.*)$/);
        if (match) return <p key={i} className="ms-4 text-sm"><span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold me-1">{match[1]}</span>{match[2]}</p>;
      }
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <p key={i} className="text-sm">{line}</p>;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary-500" />
          מרכז למידה
        </h1>
        <span className="text-sm text-muted-foreground">{articles.length} מאמרים</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש במאמרים..."
          className="ps-10 min-h-[44px]"
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors min-h-[36px] ${
            !selectedCategory ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          הכל ({articles.length})
        </button>
        {categories.map(cat => {
          const count = articles.filter(a => a.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors min-h-[36px] ${
                selectedCategory === cat.key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              <cat.icon className="h-3.5 w-3.5" />
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Articles */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p>לא נמצאו מאמרים מתאימים</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(article => {
            const cat = categories.find(c => c.key === article.category);
            const isExpanded = expandedArticle === article.id;
            return (
              <Card key={article.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <button
                  className="w-full text-start p-4 flex items-center justify-between gap-2 min-h-[56px]"
                  onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {cat && <Badge className={`${cat.color} flex-shrink-0`}>{cat.label}</Badge>}
                    <span className="font-medium truncate">{article.title}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                </button>
                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-0 border-t">
                    <div className="mt-3 space-y-0.5">
                      {renderMarkdown(article.content)}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
