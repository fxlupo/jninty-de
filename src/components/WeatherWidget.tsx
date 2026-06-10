import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "../hooks/useSettings";
import {
  fetchCurrentWeather,
  formatTemp,
  getConditionEmoji,
  type WeatherData,
} from "../services/weather";
import { checkAndNotifyFrost } from "../services/notifications.ts";
import { get } from "../db/api/client.ts";
import Card from "./ui/Card";
import Skeleton from "./ui/Skeleton";

interface EcowittSnapshot {
  ecowittOk: boolean;
  outTempC: number | null;
  outHumidity: number | null;
  updatedAt: string | null;
  soilSensors: Array<{
    channel: number;
    soilMoisture: number | null;
    soilTemp: number | null;
    createdAt: string;
    zoneName: string;
  }>;
}

function formatRelativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  return `vor ${Math.floor(diffH / 24)} Tag(en)`;
}

function EcowittCard({
  snapshot,
  temperatureUnit,
}: {
  snapshot: EcowittSnapshot;
  temperatureUnit: "celsius" | "fahrenheit";
}) {
  const hasSoil = snapshot.soilSensors.length > 0;
  const hasAir = snapshot.outTempC != null || snapshot.outHumidity != null;
  if (!hasAir && !hasSoil) return null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Vor Ort · Ecowitt
        </span>
        {snapshot.updatedAt && (
          <span className="text-[11px] text-text-muted">
            {formatRelativeTime(snapshot.updatedAt)}
          </span>
        )}
      </div>

      {hasAir && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {snapshot.outTempC != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-text-muted text-xs">Temp</span>
              <span className="font-semibold text-text-primary">
                {formatTemp(snapshot.outTempC, temperatureUnit)}
              </span>
            </div>
          )}
          {snapshot.outHumidity != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-text-muted text-xs">Feuchte</span>
              <span className="font-semibold text-text-primary">
                {Math.round(snapshot.outHumidity)} %
              </span>
            </div>
          )}
        </div>
      )}

      {hasSoil && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {snapshot.soilSensors.map((s) => (
            <div
              key={s.channel}
              className="rounded-lg bg-surface-muted px-2.5 py-2"
            >
              <p className="truncate text-[11px] text-text-muted">{s.zoneName}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {s.soilMoisture != null ? `${Math.round(s.soilMoisture)} %` : "—"}
              </p>
              {s.soilTemp != null && (
                <p className="text-[11px] text-text-secondary">
                  {formatTemp(s.soilTemp, temperatureUnit)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function useEcowittSnapshot() {
  const [snapshot, setSnapshot] = useState<EcowittSnapshot | null>(null);

  useEffect(() => {
    void get<EcowittSnapshot>("/api/irrigation/weather-snapshot")
      .then(setSnapshot)
      .catch(() => {
        // server not configured or unreachable — silent
      });
  }, []);

  return snapshot;
}

function WeatherFetcher({
  latitude,
  longitude,
  temperatureUnit,
  ecowitt,
}: {
  latitude: number;
  longitude: number;
  temperatureUnit: "fahrenheit" | "celsius";
  ecowitt: EcowittSnapshot | null;
}) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchCurrentWeather(latitude, longitude);
      if (cancelled) return;
      if (data) {
        setWeather(data);
        checkAndNotifyFrost(data.frostWarning);
      } else {
        setUnavailable(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Card>
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {weather?.frostWarning && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{"❄️"}</span>
            <div>
              <p className="text-sm font-bold text-red-800">Frostwarnung</p>
              <p className="text-xs text-red-600">
                Tiefstwert heute Nacht:{" "}
                {formatTemp(weather.lowC, temperatureUnit)} — empfindliche Pflanzen schützen
              </p>
            </div>
          </div>
        </div>
      )}

      {unavailable || !weather ? (
        <Card className="border-border-strong bg-brown-50/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{"🌥️"}</span>
            <p className="text-sm text-text-secondary">
              Wetter nicht verfügbar — Verbindung prüfen
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-4">
            <span className="text-4xl">{getConditionEmoji(weather.conditionCode, weather.isDay)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-text-primary">
                  {formatTemp(weather.currentTempC, temperatureUnit)}
                </span>
                <span className="text-sm text-text-secondary">
                  {weather.conditions}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-secondary">
                <span>
                  H: {formatTemp(weather.highC, temperatureUnit)} / T:{" "}
                  {formatTemp(weather.lowC, temperatureUnit)}
                </span>
                {weather.precipitationMm > 0 && (
                  <span>
                    {"💧"} {String(weather.precipitationMm)} mm
                  </span>
                )}
                <span>Luftfeuchte: {String(weather.humidity)} %</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {ecowitt && (
        <EcowittCard snapshot={ecowitt} temperatureUnit={temperatureUnit} />
      )}
    </div>
  );
}

export default function WeatherWidget() {
  const { settings } = useSettings();
  const ecowitt = useEcowittSnapshot();

  if (settings.latitude == null || settings.longitude == null) {
    return (
      <div className="space-y-2">
        <Link to="/settings" className="block">
          <Card className="border-border-strong bg-brown-50/30 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{"🌤️"}</span>
              <div>
                <p className="text-sm font-medium text-text-secondary">
                  Standort für Wetter festlegen
                </p>
                <p className="text-xs text-text-secondary">
                  Tippen, um Koordinaten in den Einstellungen einzutragen
                </p>
              </div>
            </div>
          </Card>
        </Link>
        {ecowitt && (
          <EcowittCard snapshot={ecowitt} temperatureUnit={settings.temperatureUnit} />
        )}
      </div>
    );
  }

  return (
    <WeatherFetcher
      latitude={settings.latitude}
      longitude={settings.longitude}
      temperatureUnit={settings.temperatureUnit}
      ecowitt={ecowitt}
    />
  );
}
