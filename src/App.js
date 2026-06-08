import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  fetchWeather, fetchForecast, fetchUVI,
  fetchWeatherByCoords, fetchForecastByCoords,
  getCurrentPosition, buildDailyForecast, buildHourlyForecast, getWeatherTheme,
} from './weatherService';
import './App.css';

function useDebounce(value, delay = 450) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const getWeatherEmoji = (iconCode = '', conditionId = 800) => {
  const night = String(iconCode).endsWith('n');
  const id    = Number(conditionId);
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) {
    if (id >= 511) return '🌨️';
    return id >= 502 ? '🌧️' : '🌦️';
  }
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return night ? '🌙' : '☀️';
  if (id === 801) return '🌤️';
  if (id === 802) return '⛅';
  if (id >= 803)  return '☁️';
  return night ? '🌙' : '🌤️';
};

const getUVLabel = (uvi) => {
  const v = Number(uvi);
  if (v <= 2)  return 'Low';
  if (v <= 5)  return 'Moderate';
  if (v <= 7)  return 'High';
  if (v <= 10) return 'Very High';
  return 'Extreme';
};

const fmtTime = (unix) =>
  new Date(unix * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

/* ── Landscape SVG ── */
const LandscapeSVG = React.memo(({ theme }) => {
  const mt1  = theme === 'night' ? '#0D1525' : theme === 'rainy' ? '#1A3050' : '#1C5560';
  const mt2  = theme === 'night' ? '#0A1020' : theme === 'rainy' ? '#152840' : '#2D4458';
  const hill = theme === 'night' ? '#1A1028' : theme === 'rainy' ? '#1E2A44' : '#4E3758';
  const tree = theme === 'night' ? '#0A0818' : '#163A41';
  return (
    <div className="landscape-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 500" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 380 L180 200 L340 310 L520 120 L700 260 L880 170 L1060 285 L1240 145 L1440 240 L1440 500 L0 500 Z"
              fill={mt1} opacity="0.9"/>
        <path d="M0 420 L120 310 L260 375 L420 265 L580 345 L740 285 L900 375 L1060 305 L1220 385 L1380 330 L1440 355 L1440 500 L0 500 Z"
              fill={mt2} opacity="0.95"/>
        <path d="M0 460 Q150 418 300 448 Q450 430 580 458 Q720 435 860 462 Q1000 440 1140 464 Q1280 448 1440 462 L1440 500 L0 500 Z"
              fill={hill}/>
        <g fill={tree}>
          <polygon points="38,460 43,418 47,404 51,418 56,460"/>
          <polygon points="64,460 69,425 74,412 79,425 84,460"/>
          <polygon points="90,460 94,430 99,418 104,430 108,460"/>
        </g>
        <g fill={tree}>
          <polygon points="1332,455 1337,420 1341,408 1345,420 1349,455"/>
          <polygon points="1355,458 1359,424 1364,411 1369,424 1373,458"/>
          <polygon points="1378,457 1382,428 1387,416 1392,428 1396,457"/>
        </g>
        <ellipse cx="195" cy="90"  rx="105" ry="34" fill="rgba(200,235,240,0.26)"/>
        <ellipse cx="270" cy="78"  rx="78"  ry="26" fill="rgba(200,235,240,0.20)"/>
        <ellipse cx="900" cy="72"  rx="115" ry="30" fill="rgba(200,235,240,0.20)"/>
        <ellipse cx="975" cy="60"  rx="88"  ry="24" fill="rgba(200,235,240,0.16)"/>
      </svg>
    </div>
  );
});

/* ── Rain Particles ── */
const RainParticles = React.memo(() => (
  <div className="weather-particles" aria-hidden="true">
    {Array.from({ length: 28 }).map((_, i) => (
      <div key={i} className="rain-drop" style={{
        left:              `${(i * 37 + 11) % 100}%`,
        height:            `${60 + (i * 13) % 80}px`,
        animationDelay:    `${(i * 0.07) % 2}s`,
        animationDuration: `${0.55 + (i * 0.02) % 0.55}s`,
        opacity:           0.4 + (i % 3) * 0.15,
      }}/>
    ))}
  </div>
));

/* ── Snow Particles ── */
const SnowParticles = React.memo(() => (
  <div className="weather-particles" aria-hidden="true">
    {Array.from({ length: 22 }).map((_, i) => {
      const size = 3 + (i % 5);
      return (
        <div key={i} className="snow-flake" style={{
          left:              `${(i * 43 + 7) % 100}%`,
          width:             `${size}px`,
          height:            `${size}px`,
          animationDelay:    `${(i * 0.18) % 4}s`,
          animationDuration: `${3 + (i * 0.15) % 4}s`,
        }}/>
      );
    })}
  </div>
));

/* ── Skeleton Loader ── */
const SkeletonLoader = () => (
  <div className="skeleton-wrapper">
    <div className="skeleton-card">
      <div className="skel skel-title"/>
      <div className="skel skel-big"/>
      <div className="skel skel-med"/>
      <div className="skel skel-sm"/>
      <div className="skel-stats">
        {[0,1,2,3].map(i => <div key={i} className="skel skel-stat"/>)}
      </div>
    </div>
    <div className="skeleton-card">
      <div className="skel skel-title" style={{ width: '42%' }}/>
      <div className="skel-forecast">
        {[0,1,2,3,4].map(i => <div key={i} className="skel skel-frow"/>)}
      </div>
    </div>
  </div>
);

/* ── Error State ── */
const ErrorState = ({ message, onRetry }) => (
  <div className="error-state" role="alert" aria-live="assertive">
    <div className="error-icon" aria-hidden="true">🔍</div>
    <h2 className="error-title">Location Not Found</h2>
    <p className="error-msg">{message}</p>
    {onRetry && (
      <button className="error-retry-btn" onClick={onRetry} type="button">Try Again</button>
    )}
  </div>
);

/* ── Stat Card ── */
const StatCard = ({ icon, value, label }) => (
  <div className="stat-card">
    <div className="stat-icon"  aria-hidden="true">{icon}</div>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

/* ── Forecast Card ── */
const ForecastCard = ({ day, idx }) => {
  const d     = useMemo(() => new Date(day.dt * 1000), [day.dt]);
  const emoji = useMemo(() => getWeatherEmoji(day.icon, day.conditionId || 800), [day.icon, day.conditionId]);
  return (
    <div className="forecast-card">
      <div>
        <div className="forecast-day">
          {idx === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="forecast-date">
          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className="forecast-icon" role="img" aria-label={day.description}>{emoji}</div>
      <div className="forecast-desc">{day.description}</div>
      <div className="forecast-temps">
        <div className="forecast-high">{day.high}°</div>
        <div className="forecast-low">{day.low}°</div>
      </div>
    </div>
  );
};

/* ── Hourly Strip ── */
const HourlyStrip = ({ items }) => (
  <div className="hourly-scroll" role="list" aria-label="Next 24-hour forecast">
    {items.map((h, i) => (
      <div key={h.dt} className={`hourly-item${i === 0 ? ' now' : ''}`} role="listitem">
        <div className="hourly-time">{i === 0 ? 'Now' : h.time}</div>
        <div className="hourly-icon" aria-hidden="true">{getWeatherEmoji(h.icon, h.conditionId)}</div>
        <div className="hourly-temp">{h.temp}°</div>
        {h.pop > 0 && <div className="hourly-rain">💧 {h.pop}%</div>}
      </div>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════════════ */
export default function App() {
  const [query,       setQuery]       = useState('');
  const [weather,     setWeather]     = useState(null);
  const [forecast,    setForecast]    = useState(null);
  const [hourly,      setHourly]      = useState(null);
  const [uvi,         setUvi]         = useState(null);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [theme,       setTheme]       = useState('sunny');
  const [lastUpdated, setLastUpdated] = useState(null);

  const debouncedQuery = useDebounce(query, 500);
  const abortRef       = useRef(null);

  
  useEffect(() => () => abortRef.current?.abort(), []);

 
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) runSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  
  const loadData = useCallback(async (wPromise, fPromise) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError('');
    setWeather(null); setForecast(null); setHourly(null); setUvi(null);

    try {
      const [w, f] = await Promise.all([wPromise, fPromise]);

      setWeather(w);
      setForecast(buildDailyForecast(f.list));
      setHourly(buildHourlyForecast(f.list));
      setLastUpdated(new Date());

      const isNight = w.weather[0].icon.endsWith('n');
      setTheme(getWeatherTheme(w.weather[0].id, isNight));

      fetchUVI(w.coord.lat, w.coord.lon).then(setUvi).catch(() => setUvi(0));

    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      const s = err?.response?.status;
      if (s === 404 || s === 400)
        setError('City not found. Please check the spelling or try a different city / zip code.');
      else if (err?.code === 'ECONNABORTED')
        setError('Request timed out. Please check your internet connection and try again.');
      else if (s === 401)
        setError('Invalid API key. Please check your REACT_APP_WEATHER_API_KEY in .env.local');
      else
        setError('Unable to fetch weather data. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Search ── */
  const runSearch   = useCallback((q) => { const t = q.trim(); if (t) loadData(fetchWeather(t), fetchForecast(t)); }, [loadData]);
  const handleSearch  = useCallback(() => runSearch(query), [query, runSearch]);
  const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } };

  /* ── GPS ── */
  const handleGPS = useCallback(async () => {
    setGpsLoading(true); setError('');
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      await loadData(fetchWeatherByCoords(lat, lon), fetchForecastByCoords(lat, lon));
    } catch (err) {
      const c = err?.code;
      if      (c === 1) setError('Location access denied. Please enable location permissions in your browser settings.');
      else if (c === 2) setError('Your location is currently unavailable. Please try searching manually.');
      else if (c === 3) setError('Location request timed out. Please try again or search manually.');
      else              setError('Could not detect your location. Please try searching manually.');
    } finally {
      setGpsLoading(false);
    }
  }, [loadData]);

  /* ── Extra details ── */
  const extraDetails = useMemo(() => {
    if (!weather) return [];
    const dewPoint = Math.round(weather.main.temp - ((100 - weather.main.humidity) / 5));
    return [
      { icon: '🧭', label: 'Pressure',    value: `${weather.main.pressure} hPa`                       },
      { icon: '👁️', label: 'Visibility',  value: `${((weather.visibility ?? 0) / 1000).toFixed(1)} km` },
      { icon: '💦', label: 'Dew Point',   value: `${dewPoint}°C`                                       },
      { icon: '🌅', label: 'Sunrise',     value: fmtTime(weather.sys.sunrise)                          },
      { icon: '🌇', label: 'Sunset',      value: fmtTime(weather.sys.sunset)                           },
      { icon: '☁️', label: 'Cloud Cover', value: `${weather.clouds.all}%`                              },
    ];
  }, [weather]);

  const showRain  = theme === 'rainy' || theme === 'storm';
  const showSnow  = theme === 'snow';
  const mainEmoji = weather ? getWeatherEmoji(weather.weather[0].icon, weather.weather[0].id) : null;

  return (
    <div className="app-wrapper">
      <LandscapeSVG theme={theme} />
      {showRain && <RainParticles />}
      {showSnow && <SnowParticles />}

      {/* Header */}
      <header className="app-header">
        <div>
          <div className="brand-name">Aether Pro</div>
          <div className="brand-tagline">PM Accelerator · Weather Assessment #1</div>
        </div>
        {lastUpdated && (
          <div className="last-updated" aria-live="polite">
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </header>

      {/* Search + GPS */}
      <section className="search-section" role="search" aria-label="Weather search">
        <div className="search-bar">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            placeholder="Search city, zip code or location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search location"
            autoComplete="off"
            spellCheck="false"
            disabled={loading}
          />
          <button
            className="search-submit-btn"
            onClick={handleSearch}
            disabled={loading || gpsLoading}
            aria-label="Search weather"
            type="button"
          >
            {loading
              ? <><span className="btn-spinner" aria-hidden="true"/> Searching…</>
              : 'Search'
            }
          </button>
        </div>

        <button
          className={`gps-btn${gpsLoading ? ' pulsing' : ''}`}
          onClick={handleGPS}
          disabled={loading || gpsLoading}
          title="Use my current location"
          aria-label="Use current GPS location"
          type="button"
        >
          {gpsLoading ? <span className="btn-spinner" aria-hidden="true"/> : '📍'}
        </button>
      </section>

      {gpsLoading && (
        <div className="locating-banner" role="status" aria-live="polite">
          <div className="locating-spinner" aria-hidden="true"/>
          Detecting your location…
        </div>
      )}

      {/* Main grid */}
      <main className="main-content" id="main-content">

        {loading && <SkeletonLoader />}

        {!loading && error && (
          <ErrorState message={error} onRetry={query.trim() ? handleSearch : undefined}/>
        )}

        {!loading && !error && !weather && (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">🌤️</div>
            <h1 className="empty-title">Aether Pro</h1>
            <p className="empty-subtitle">
              Search any city, zip code, or tap the GPS button for beautiful real-time weather.
            </p>
          </div>
        )}

        {/* Current Weather Card */}
        {!loading && weather && (
          <article className="current-weather-card" aria-label="Current weather">
            <div className="city-name">{weather.name}</div>
            <div className="city-country">{weather.sys.country}</div>

            <div className="weather-hero">
              <div className="temperature-display">{Math.round(weather.main.temp)}°C</div>
              <div className="weather-icon-large" role="img" aria-label={weather.weather[0].description}>
                {mainEmoji}
              </div>
            </div>

            <div className="weather-condition">{weather.weather[0].description}</div>
            <div className="max-min-row">
              H: {Math.round(weather.main.temp_max)}°&ensp;·&ensp;L: {Math.round(weather.main.temp_min)}°
            </div>

            <div className="stats-grid">
              <StatCard icon="🌡️" value={`${Math.round(weather.main.feels_like)}°C`}      label="Feels Like"/>
              <StatCard icon="💧" value={`${weather.main.humidity}%`}                      label="Humidity"/>
              <StatCard icon="💨" value={`${Math.round(weather.wind.speed * 3.6)} km/h`}  label="Wind Speed"/>
              <StatCard icon="☀️" value={uvi !== null ? `${uvi} ${getUVLabel(uvi)}` : '—'} label="UV Index"/>
            </div>
          </article>
        )}

        {/* Right Column */}
        {!loading && weather && forecast && (
          <div className="right-column">

            {/* 24-Hour */}
            {hourly && hourly.length > 0 && (
              <section className="hourly-section" aria-label="24-hour forecast">
                <div className="section-title">24 · Hour · Forecast</div>
                <HourlyStrip items={hourly}/>
              </section>
            )}

            {/* 5-Day */}
            <section className="forecast-section" aria-label="5-day forecast">
              <div className="section-title">5 · Day · Forecast</div>
              <div className="forecast-list">
                {forecast.map((day, idx) => <ForecastCard key={day.key} day={day} idx={idx}/>)}
              </div>
            </section>

            {/* More Details */}
            <section className="hourly-section more-details-section" aria-label="Additional weather details">
              <div className="section-title">More Details</div>
              <div className="hourly-scroll">
                {extraDetails.map((item) => (
                  <div key={item.label} className="hourly-item">
                    <div className="hourly-icon" aria-hidden="true">{item.icon}</div>
                    <div className="hourly-temp">{item.value}</div>
                    <div className="hourly-time">{item.label}</div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}
      </main>

      <footer className="app-footer">
        Aether Pro · PM Accelerator Technical Assessment #1 · Powered by OpenWeatherMap
      </footer>
    </div>
  );
}