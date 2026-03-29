import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle, Search, ChevronDown, ChevronUp, BookOpen,
  Users, Calendar, ShieldCheck, Settings, Lightbulb,
} from "lucide-react";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
}

const categories = [
  { key: "getting-started", label: "מדריך למתחילים", icon: Lightbulb, color: "bg-blue-100 text-blue-700" },
  { key: "soldiers", label: "ניהול חיילים", icon: Users, color: "bg-green-100 text-green-700" },
  { key: "scheduling", label: "שיבוץ", icon: Calendar, color: "bg-purple-100 text-purple-700" },
  { key: "rules", label: "חוקים", icon: ShieldCheck, color: "bg-orange-100 text-orange-700" },
  { key: "settings", label: "הגדרות", icon: Settings, color: "bg-gray-100 text-gray-700" },
];

const articles: Article[] = [
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
  {
    id: "sol-1",
    title: "הוספת חיילים וניהול תפקידים",
    category: "soldiers",
    content: `## ניהול חיילים

### הוספת חייל
1. עברו ל**חיילים** ← **חייל חדש**
2. מלאו: שם מלא, מספר אישי
3. בחרו תפקידים ראשיים ומשניים

### תפקידים
כל חייל יכול לקבל מספר תפקידים:
- **תפקיד ראשי** — בעדיפות גבוהה לשיבוץ
- **תפקיד משני** — כגיבוי

### סטטוסים
- ✅ נוכח — ניתן לשיבוץ
- 🏠 בבית — לא זמין
- 🤒 חולה — לא זמין
- 📚 הכשרה — זמין חלקית

### קודי הרשמה
לאחר הוספת חייל, ניתן ליצור **קוד הרשמה** בן 6 ספרות. החייל ישתמש בקוד כדי ליצור חשבון ולצפות בשיבוצים שלו.`,
  },
  {
    id: "sch-1",
    title: "שיבוץ אוטומטי — איך זה עובד",
    category: "scheduling",
    content: `## אלגוריתם השיבוץ

השיבוץ האוטומטי עובד ב-5 שלבים:

### 1. סינון קשיח
מסנן חיילים שלא יכולים לבצע את המשימה:
- לא נוכחים
- אין להם את התפקיד הנדרש
- התנגשות זמנים קשיחה

### 2. ניקוד
לכל חייל מתאים — ציון:
- **100** — בסיס
- **-10** — לכל משימה נוספת באותו יום
- **-20** — פחות מ-18 שעות מנוחה
- **-30** — פחות מ-16 שעות מנוחה
- **+10** — עדיפות גבוהה (תפקיד ראשי)

### 3. אופטימיזציה
המערכת מנסה לאזן עומסים — חייל שעבד הרבה השבוע יקבל ציון נמוך יותר.

### 4. בדיקת התנגשויות
כל שיבוץ נבדק מול חוקי המערכת (מנוחה מינימלית, שעות עבודה מקסימליות).

### 5. פלט
התוצאה: שיבוצים מוצעים עם ציונים ואזהרות. מנהל מאשר/דוחה.`,
  },
  {
    id: "sch-2",
    title: "תבניות משימה — הגדרת חזרתיות",
    category: "scheduling",
    content: `## תבניות משימה

תבנית מגדירה משימה חוזרת:

### סוגי חזרתיות
- **יומי** — כל יום
- **שבועי** — ימים ספציפיים (א-ש)
- **מותאם** — שבועות זוגיים/אי-זוגיים
- **חד פעמי** — תאריך ספציפי

### משמרות
הגדירו זמני משמרת:
- **בוקר**: 07:00-15:00
- **צהריים**: 15:00-23:00
- **לילה**: 23:00-07:00
- **מותאם**: שעות לבחירתכם

### תאריכים חריגים
- **דלג** — תאריכים שבהם לא ליצור משימה (חג, יום מיוחד)
- **הוסף** — תאריכים נוספים מעבר לחזרתיות`,
  },
  {
    id: "rul-1",
    title: "איך לבנות חוק שיבוץ",
    category: "rules",
    content: `## בונה החוקים

### מבנה חוק
כל חוק מורכב מ:
1. **תנאי** — מתי החוק חל
2. **חומרה** — קשיח (חוסם) או רך (מזהיר)
3. **פעולה** — מה קורה כשהתנאי מתקיים

### שדות תנאי זמינים
| שדה | תיאור | דוגמה |
|------|--------|--------|
| employee.hours_since_last_mission | שעות מאז המשימה האחרונה | < 16 |
| employee.total_work_hours_today | סה"כ שעות עבודה היום | > 8 |
| employee.last_mission_was_night | האם המשימה האחרונה הייתה לילית | true |
| mission.start_hour | שעת התחלת משימה | < 12 |

### דוגמה: מנוחה מינימלית
- **תנאי**: employee.hours_since_last_mission < 16
- **חומרה**: קשיח (חוסם)
- **הודעה**: "לעובד {name} נותרו {hours} שעות מנוחה, נדרש מינימום 16"

### חוקים מובנים
המערכת מגיעה עם 3 חוקים מוכנים:
- מנוחה מינימלית (16 שעות)
- שעות עבודה מקסימליות (8 ביום)
- מנוחה אחרי לילה`,
  },
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

### תפקידים
תפקידים תפעוליים (נהג, ראש צוות, חובש...) — משפיעים על שיבוץ.

### הגדרות נוכחות
ניתן להגדיר סטטוסים מותאמים עם צבע, אייקון, וסימון האם ניתן לשיבוץ.`,
  },
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

### WhatsApp (בקרוב)
שליחת התראות ישירות ל-WhatsApp:
1. **הגדרות → אינטגרציות → WhatsApp**
2. סרקו קוד QR מהטלפון
3. בחרו אירועים לשליחה

### התראות Push
התראות PWA פעילות כברירת מחדל לכל המשתמשים.`,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary-500" />
          מרכז עזרה
        </h1>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש במאמרים..."
          className="ps-10"
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            !selectedCategory ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          הכל
        </button>
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
              selectedCategory === cat.key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <cat.icon className="h-3.5 w-3.5" />
            {cat.label}
          </button>
        ))}
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
                  className="w-full text-start p-4 flex items-center justify-between"
                  onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                >
                  <div className="flex items-center gap-3">
                    {cat && <Badge className={cat.color}>{cat.label}</Badge>}
                    <span className="font-medium">{article.title}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-0 border-t">
                    <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-line mt-3">
                      {article.content.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(3)}</h2>;
                        if (line.startsWith("### ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
                        if (line.startsWith("- **")) {
                          const parts = line.slice(2).split("**");
                          return <p key={i} className="ms-4">• <strong>{parts[1]}</strong>{parts[2]}</p>;
                        }
                        if (line.startsWith("- ")) return <p key={i} className="ms-4">• {line.slice(2)}</p>;
                        if (line.startsWith("| ")) return <p key={i} className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{line}</p>;
                        if (line.trim() === "") return <br key={i} />;
                        return <p key={i}>{line}</p>;
                      })}
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
