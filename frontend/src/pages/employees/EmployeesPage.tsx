import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Search, Download, Upload } from "lucide-react";

export default function EmployeesPage() {
  const { t } = useTranslation("employees");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="me-1 h-4 w-4" />
            {t("bulkImport")}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="me-1 h-4 w-4" />
            {t("exportList")}
          </Button>
          <Button size="sm">
            <UserPlus className="me-1 h-4 w-4" />
            {t("addEmployee")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filter === f
                  ? "bg-primary-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-sm">
                <th className="px-4 py-3 text-start font-medium">{t("employeeNumber")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("fullName")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("role")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("common:actions")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noEmployees")}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
