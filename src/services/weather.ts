// ─── Types ───

export type WeatherData = {
  currentTempC: number;
  conditions: string;
  conditionCode: number;
  highC: number;
  lowC: number;
  precipitationMm: number;
  humidity: number;
  frostWarning: boolean;
  isDay: boolean;
};

export type GeoSearchResult = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
};

// ─── WMO weather code mapping ───

const WMO_CONDITIONS: Record<number, string> = {
  0: "Klarer Himmel",
  1: "Überwiegend klar",
  2: "Teilweise bewölkt",
  3: "Bedeckt",
  45: "Nebel",
  48: "Reifnebel",
  51: "Leichter Nieselregen",
  53: "Nieselregen",
  55: "Starker Nieselregen",
  56: "Leichter gefrierender Nieselregen",
  57: "Gefrierender Nieselregen",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  66: "Leichter gefrierender Regen",
  67: "Gefrierender Regen",
  71: "Leichter Schneefall",
  73: "Schneefall",
  75: "Starker Schneefall",
  77: "Schneekörner",
  80: "Leichte Schauer",
  81: "Schauer",
  82: "Starke Schauer",
  85: "Leichte Schneeschauer",
  86: "Starke Schneeschauer",
  95: "Gewitter",
  96: "Gewitter mit Hagel",
  99: "Schweres Gewitter",
};

export function getConditionLabel(code: number): string {
  return WMO_CONDITIONS[code] ?? "Unbekannt";
}

export function getConditionEmoji(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600\uFE0F" : "\uD83C\uDF19";
  if (code <= 3) return isDay ? "\u26C5" : "\uD83C\uDF19";
  if (code <= 48) return "\uD83C\uDF2B\uFE0F";
  if (code <= 57) return "\uD83C\uDF27\uFE0F";
  if (code <= 65) return "\uD83C\uDF27\uFE0F";
  if (code <= 67) return "\u2744\uFE0F\uD83C\uDF27\uFE0F";
  if (code <= 77) return "\uD83C\uDF28\uFE0F";
  if (code <= 82) return "\uD83C\uDF26\uFE0F";
  if (code <= 86) return "\uD83C\uDF28\uFE0F";
  return "\u26C8\uFE0F";
}

// ─── Temperature conversion ───

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function formatTemp(
  tempC: number,
  unit: "fahrenheit" | "celsius",
): string {
  if (unit === "fahrenheit") {
    return `${String(celsiusToFahrenheit(tempC))}\u00B0F`;
  }
  return `${String(Math.round(tempC))}\u00B0C`;
}

// ─── API response types ───

type OpenMeteoResponse = {
  current_weather: {
    temperature: number;
    weathercode: number;
    is_day: 0 | 1;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
  hourly: {
    relative_humidity_2m: number[];
  };
};

type GeocodingResponse = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    admin1?: string;
  }>;
};

// ─── Cache config ───

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour


// In-memory cache for instant reads within a session.
let memoryCache: {
  data: WeatherData;
  fetchedAt: number;
  latitude: number;
  longitude: number;
} | null = null;

// ─── Core API function ───

async function fetchFromApi(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current_weather: "true",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "relative_humidity_2m",
    forecast_days: "1",
    timezone: "auto",
  });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Weather API error: ${String(response.status)}`);
  }

  const json = (await response.json()) as OpenMeteoResponse;

  const currentHour = new Date().getHours();
  const humidity = json.hourly.relative_humidity_2m[currentHour] ?? 0;
  const highC = json.daily.temperature_2m_max[0] ?? 0;
  const lowC = json.daily.temperature_2m_min[0] ?? 0;
  const precipitationMm = json.daily.precipitation_sum[0] ?? 0;

  return {
    currentTempC: json.current_weather.temperature,
    conditions: getConditionLabel(json.current_weather.weathercode),
    conditionCode: json.current_weather.weathercode,
    highC,
    lowC,
    precipitationMm,
    humidity,
    frostWarning: lowC <= 0,
    isDay: json.current_weather.is_day === 1,
  };
}

// ─── Cache helpers ───

const LS_CACHE_KEY = "jninty_weather_cache";

type WeatherCacheEntry = {
  weather: WeatherData;
  latitude: number;
  longitude: number;
  fetchedAt: number;
};

async function readCache(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  // Check memory cache first — must match coordinates
  if (
    memoryCache &&
    memoryCache.latitude === latitude &&
    memoryCache.longitude === longitude &&
    Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS
  ) {
    return memoryCache.data;
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;

    const entry = JSON.parse(raw) as WeatherCacheEntry;

    if (entry.latitude !== latitude || entry.longitude !== longitude) {
      return null;
    }

    if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;

    memoryCache = {
      data: entry.weather,
      fetchedAt: entry.fetchedAt,
      latitude,
      longitude,
    };
    return entry.weather;
  } catch {
    return null;
  }
}

async function writeCache(
  data: WeatherData,
  latitude: number,
  longitude: number,
): Promise<void> {
  const now = Date.now();
  memoryCache = { data, fetchedAt: now, latitude, longitude };

  try {
    const entry: WeatherCacheEntry = { weather: data, latitude, longitude, fetchedAt: now };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-critical
  }
}

// ─── Public API ───

/**
 * Fetch current weather for the given coordinates.
 * Returns cached data if fresh (< 1 hour old).
 * Returns null if offline or API fails (graceful degradation).
 */
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  // Check cache (coordinate-aware)
  const cached = await readCache(latitude, longitude);
  if (cached) return cached;

  // Fetch fresh data
  try {
    const data = await fetchFromApi(latitude, longitude);
    await writeCache(data, latitude, longitude);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch a lightweight weather snapshot for journal entry auto-capture.
 * Returns the subset of data matching WeatherSnapshot schema.
 */
export async function fetchWeatherSnapshot(
  latitude: number,
  longitude: number,
): Promise<{ tempC: number; humidity: number; conditions: string } | null> {
  const weather = await fetchCurrentWeather(latitude, longitude);
  if (!weather) return null;
  return {
    tempC: weather.currentTempC,
    humidity: weather.humidity,
    conditions: weather.conditions,
  };
}

/**
 * Search for locations by name using Open-Meteo geocoding API.
 */
export async function searchLocation(
  query: string,
): Promise<GeoSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const params = new URLSearchParams({
      name: query.trim(),
      count: "5",
      language: "de",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
    );

    if (!response.ok) return [];

    const json = (await response.json()) as GeocodingResponse;
    if (!json.results) return [];

    return json.results.map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      ...(r.admin1 ? { admin1: r.admin1 } : {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Invalidate the weather cache (e.g. when location changes).
 */
export async function clearWeatherCache(): Promise<void> {
  memoryCache = null;
  try {
    localStorage.removeItem(LS_CACHE_KEY);
  } catch {
    // Non-critical
  }
}
