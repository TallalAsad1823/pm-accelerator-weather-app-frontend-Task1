import axios from 'axios';

// ─── API Key Validation ───────────────────────────────────────────────────────
const API_KEY = process.env.REACT_APP_WEATHER_API_KEY;


    if (!API_KEY || API_KEY.trim() === '') {
  console.error(
    '❌ [Aether Pro] OpenWeatherMap API key is missing!\n' +
    '   Create a .env.local file in your project root and add:\n' +
    '   REACT_APP_WEATHER_API_KEY=your_actual_key_here\n' +
    '   Get a free key at: https://openweathermap.org/api'
  );
}

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  params:  { units: 'metric', appid: API_KEY },
  timeout: 10000,
});

// ─── Current weather by city / zip ───────────────────────────────────────────
export const fetchWeather = async (query) => {
  const trimmed = query.trim();
  const isZip   = /^\d{4,10}$/.test(trimmed);
  const params  = isZip
    ? { zip: trimmed, units: 'metric', appid: API_KEY }
    : { q:   trimmed, units: 'metric', appid: API_KEY };
  const { data } = await api.get('/weather', { params });
  return data;
};

// ─── 5-day / 3-hour forecast ──────────────────────────────────────────────────
export const fetchForecast = async (query) => {
  const trimmed = query.trim();
  const isZip   = /^\d{4,10}$/.test(trimmed);
  const params  = isZip
    ? { zip: trimmed, cnt: 40, units: 'metric', appid: API_KEY }
    : { q:   trimmed, cnt: 40, units: 'metric', appid: API_KEY };
  const { data } = await api.get('/forecast', { params });
  return data;
};

// ─── UV Index ─────────────────────────────────────────────────────────────────
export const fetchUVI = async (lat, lon) => {
  try {
    // Try One Call API first (more reliable on free tier)
    const { data } = await api.get('/onecall', {
      params: { lat, lon, exclude: 'minutely,hourly,daily,alerts', appid: API_KEY },
    });
    return data?.current?.uvi ?? 0;
  } catch {
    try {
      const { data } = await api.get('/uvi', { params: { lat, lon, appid: API_KEY } });
      return data?.value ?? 0;
    } catch {
      return 0; // graceful fallback — free tier may not have UVI
    }
  }
};

// ─── Weather + Forecast by coordinates (GPS) ─────────────────────────────────
export const fetchWeatherByCoords = async (lat, lon) => {
  const { data } = await api.get('/weather', {
    params: { lat, lon, units: 'metric', appid: API_KEY },
  });
  return data;
};

export const fetchForecastByCoords = async (lat, lon) => {
  const { data } = await api.get('/forecast', {
    params: { lat, lon, cnt: 40, units: 'metric', appid: API_KEY },
  });
  return data;
};

// ─── Geolocation helper ───────────────────────────────────────────────────────
export const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout:            10000,
      maximumAge:         60000,
      enableHighAccuracy: true,
    });
  });

// ─── Build daily forecast summary from 3-hour list ───────────────────────────
// Uses ISO date string (YYYY-MM-DD) as key for uniqueness across timezones
export const buildDailyForecast = (forecastList) => {
  const map = new Map();

  forecastList.forEach((item) => {
    // Use UTC date string as stable key
    const d   = new Date(item.dt * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        dt:           item.dt,
        temps:        [],
        icons:        [],
        conditionIds: [],
        descriptions: [],
      });
    }

    const entry = map.get(key);
    entry.temps.push(item.main.temp);
    entry.icons.push(item.weather[0].icon);
    entry.conditionIds.push(item.weather[0].id);
    entry.descriptions.push(item.weather[0].description);
  });

  return Array.from(map.values())
    .slice(0, 5)
    .map((d) => {
      const midIdx = Math.floor(d.icons.length / 2);
      return {
        key:         d.key,
        dt:          d.dt,
        high:        Math.round(Math.max(...d.temps)),
        low:         Math.round(Math.min(...d.temps)),
        icon:        d.icons[midIdx],
        conditionId: d.conditionIds[midIdx],       // ← preserved for emoji lookup
        description: d.descriptions[midIdx],
      };
    });
};

// ─── Build 24-hour (8 x 3-hour slots) forecast from 3-hour list ──────────────
// Slices the first 8 entries (covers ~24 hours at 3h intervals)
export const buildHourlyForecast = (forecastList) =>
  forecastList.slice(0, 8).map((item) => ({
    dt:          item.dt,
    time:        new Date(item.dt * 1000).toLocaleTimeString('en-US', {
                   hour:   '2-digit',
                   minute: '2-digit',
                 }),
    temp:        Math.round(item.main.temp),
    icon:        item.weather[0].icon,
    conditionId: item.weather[0].id,
    description: item.weather[0].description,
    pop:         Math.round((item.pop || 0) * 100), // precipitation probability %
  }));


export const getWeatherTheme = (conditionId, isNight = false) => {
  if (isNight)                                     return 'night';
  if (conditionId >= 200 && conditionId < 300)     return 'storm';
  if (conditionId >= 300 && conditionId < 600)     return 'rainy';
  if (conditionId >= 600 && conditionId < 700)     return 'snow';
  if (conditionId >= 700 && conditionId < 800)     return 'foggy';
  if (conditionId === 800)                         return 'sunny';
  if (conditionId > 800)                           return 'cloudy';
  return 'sunny';
};