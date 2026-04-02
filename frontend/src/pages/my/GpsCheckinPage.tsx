import { useState, useEffect } from "react";
import api, { tenantApi } from "@/lib/api";
import { MapPin, Clock, CheckCircle, AlertTriangle } from "lucide-react";

interface CheckinStatus {
  checked_in: boolean;
  last_action: {
    type: string;
    timestamp: string;
    latitude: number;
    longitude: number;
    is_within_geofence: boolean;
  } | null;
}

export default function GpsCheckinPage() {
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [gpsAvailable, setGpsAvailable] = useState(true);

  useEffect(() => {
    loadStatus();
    if (!navigator.geolocation) {
      setGpsAvailable(false);
    }
  }, []);

  const loadStatus = async () => {
    try {
      const res = await tenantApi("get", "/gps/status");
      setStatus(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async (type: "checkin" | "checkout") => {
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const endpoint = type === "checkin" ? "/gps/checkin" : "/gps/checkout";
      const res = await tenantApi("post", endpoint, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
        device_info: navigator.userAgent.slice(0, 100),
      });

      setResult(res.data);
      await loadStatus();
    } catch (err: any) {
      if (err.code === 1) {
        setError("נדרשת הרשאת מיקום. אנא אשר גישה ל-GPS.");
      } else if (err.code === 2) {
        setError("לא ניתן לקבל מיקום. בדוק ש-GPS פעיל.");
      } else if (err.code === 3) {
        setError("זמן קבלת מיקום פג. נסה שוב.");
      } else {
        setError(err?.response?.data?.detail || "שגיאה בביצוע הפעולה");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!gpsAvailable) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold mb-2">GPS לא זמין</h2>
        <p className="text-muted-foreground">המכשיר שלך לא תומך בGPS או שהדפדפן חוסם את הגישה למיקום.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center">⏱️ שעון נוכחות</h1>

      {/* Current Status */}
      <div className={`rounded-2xl p-6 text-center ${
        status?.checked_in
          ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-300"
          : "bg-gray-50 dark:bg-gray-900/20 border-2 border-gray-300"
      }`}>
        <div className="text-4xl mb-2">
          {status?.checked_in ? "🟢" : "⚪"}
        </div>
        <p className="text-lg font-bold">
          {status?.checked_in ? "אתה בפנים" : "לא רשום כרגע"}
        </p>
        {status?.last_action && (
          <p className="text-sm text-muted-foreground mt-1">
            {status.last_action.type === "in" ? "כניסה" : "יציאה"} ב-
            {new Date(status.last_action.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            {status.last_action.is_within_geofence
              ? " ✅ בתוך האזור"
              : " ⚠️ מחוץ לאזור"}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleCheckin("checkin")}
          disabled={submitting || status?.checked_in}
          className="py-6 rounded-2xl text-lg font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2 transition-all active:scale-95"
        >
          <MapPin className="h-8 w-8" />
          כניסה
        </button>

        <button
          onClick={() => handleCheckin("checkout")}
          disabled={submitting || !status?.checked_in}
          className="py-6 rounded-2xl text-lg font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2 transition-all active:scale-95"
        >
          <Clock className="h-8 w-8" />
          יציאה
        </button>
      </div>

      {/* Loading indicator */}
      {submitting && (
        <div className="text-center py-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">מאתר מיקום...</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-4 ${
          result.is_within_geofence
            ? "bg-green-50 dark:bg-green-900/20 border border-green-200"
            : "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {result.is_within_geofence
              ? <CheckCircle className="h-5 w-5 text-green-600" />
              : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
            <span className="font-bold">{result.message}</span>
          </div>
          {result.distance_from_target_m && (
            <p className="text-sm text-muted-foreground">
              מרחק מנקודת הבסיס: {Math.round(result.distance_from_target_m)}מ׳
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-800 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
