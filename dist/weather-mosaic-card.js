/**
 * weather-mosaic-card
 * Color-mosaic hourly weather grid for Home Assistant
 *
 * Installation:
 *   1. Copy to /config/www/weather-mosaic-card.js
 *   2. Add dashboard resource:
 *        url: /local/weather-mosaic-card.js
 *        type: module
 *   3. Add card:
 *        type: custom:weather-mosaic-card
 *        entity: weather.home        # must provide hourly forecast
 *
 * Requires an integration that provides hourly forecast data
 * (PirateWeather, Open-Meteo, Met.no, etc.)
 */


const HOURS = Array.from({ length: 24 }, (_, i) => i);

const COLOR_SCALES = {
  mosaic: [
    [10,  [200, 230, 255]],
    [30,  [160, 200, 255]],
    [40,  [ 91, 163, 255]],
    [55,  [ 61, 217, 160]],
    [65,  [163, 224,  58]],
    [75,  [255, 255,  85]],
    [85,  [255, 176,  58]],
    [95,  [255,  92,  58]],
    [105, [178,  40,  40]],
  ],
  blue_red: [
    [10,  [ 33, 102, 172]],
    [30,  [ 67, 147, 195]],
    [45,  [146, 197, 222]],
    [55,  [209, 229, 240]],
    [65,  [253, 219, 199]],
    [75,  [244, 165, 130]],
    [85,  [214,  96,  77]],
    [95,  [178,  24,  43]],
    [105, [103,   0,  31]],
  ],
  turbo: [
    [10,  [ 35,  23, 123]],
    [25,  [ 18, 118, 220]],
    [40,  [ 20, 200, 195]],
    [55,  [ 57, 231, 107]],
    [65,  [146, 241,  57]],
    [75,  [239, 211,  33]],
    [85,  [253, 132,  26]],
    [95,  [210,  50,  10]],
    [105, [122,   4,   3]],
  ],
  viridis: [
    [10,  [ 68,   1,  84]],
    [30,  [ 70,  50, 127]],
    [50,  [ 38, 113, 147]],
    [65,  [ 32, 152, 138]],
    [75,  [ 80, 185, 112]],
    [90,  [160, 218,  57]],
    [105, [253, 231,  37]],
  ],
  inferno: [
    [10,  [  0,   0,   4]],
    [30,  [ 50,   9,  99]],
    [50,  [133,  33, 107]],
    [65,  [188,  64,  81]],
    [75,  [220, 108,  38]],
    [90,  [249, 185,  20]],
    [105, [252, 255, 164]],
  ],
  white_hot: [
    [10,  [  0,   0,   0]],
    [40,  [ 35,  35,  35]],
    [55,  [ 85,  85,  85]],
    [70,  [150, 150, 150]],
    [85,  [210, 210, 210]],
    [105, [255, 255, 255]],
  ],
  black_hot: [
    [10,  [255, 255, 255]],
    [40,  [220, 220, 220]],
    [55,  [170, 170, 170]],
    [70,  [105, 105, 105]],
    [85,  [ 45,  45,  45]],
    [105, [  0,   0,   0]],
  ],
};

class WeatherMosaicCard extends HTMLElement {

  // -------------------------------------------------------------------------
  // HA lifecycle
  // -------------------------------------------------------------------------
  set hass(hass) {
    const firstLoad = !this._hass;
    this._hass = hass;

    if (!this.shadowRoot) { this._build(); this._updateTitle(); }
    this._updateCurrent();

    if (this._config) {
      // Subscribe on first load; also (re)subscribe once the weather entity
      // becomes available if we still have no forecast. This recovers from the
      // HA-restart race: the integration isn't loaded when the card first
      // subscribes, so the initial subscribe fails; without this, the card
      // stays stuck on a "no forecast" error until the kiosk is refreshed.
      const st    = hass?.states?.[this._config.entity];
      const ready = !!st && st.state !== 'unavailable' && st.state !== 'unknown';
      if (firstLoad ||
          (ready && !this._haveForecast && !this._unsubForecast && !this._subscribing)) {
        this._subscribeForecast();
      }
    }
  }

  setConfig(config) {
    // Validate an explicitly-provided entity so a mistake (wrong domain, typo,
    // empty value) surfaces as a proper HA config-error card. Omitting `entity`
    // still falls back to a default, which keeps the card-picker preview working.
    if (config && typeof config === 'object' && 'entity' in config) {
      const e = config.entity;
      if (typeof e !== 'string' || !e.startsWith('weather.')) {
        throw new Error('weather-mosaic-card: "entity" must be a weather entity, e.g. weather.home');
      }
    }

    this._config = {
      entity: 'weather.pirateweather',
      temperature_unit: 'F',
      hours: 'above',
      time_format: '12',
      ...config,
    };

    // Parse the optional custom color scale (advanced YAML). Invalid or missing
    // input yields null, so _tempToColor falls back to the named color_scale.
    this._customStops = this._parseCustomScale(this._config.custom_color_scale);

    // Parse the optional custom precipitation-symbol rules (advanced YAML).
    // Null → _precipSymbol uses the built-in default (- / *).
    this._precipRules = this._parsePrecipRules(this._config.precipitation_symbols);

    // Build the DOM immediately so the card renders even before `hass` is set
    // (e.g. in the card picker / editor preview), instead of showing a spinner.
    if (!this.shadowRoot) this._build();

    this._updateTitle();
    this._updateCurrent();

    if (this._hass && !this._unsubForecast) {
      this._subscribeForecast();
    } else if (this._lastForecast) {
      this._render(this._lastForecast);
    }
  }

  _updateTitle() {
    const el = this.shadowRoot?.getElementById('card-title');
    if (!el) return;
    const title = this._config?.title
      ?? (this._config?.entity || '').replace(/^weather\./, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    el.textContent = title || '';
    this._updateHeaderVisibility();
  }

  _updateCurrent() {
    const el = this.shadowRoot?.getElementById('card-current');
    if (!el) return;

    let text = '';
    if (this._config?.show_current !== false) {
      const weatherState = this._hass?.states[this._config?.entity];

      // Temperature source: an optional local sensor (`temperature_entity`)
      // overrides the header reading; otherwise use the weather entity's own
      // temperature. Unset behaves exactly as before. The condition text always
      // comes from the weather entity.
      let temp = null;
      let nativeUnit = '°F';
      const overrideId = this._config?.temperature_entity;
      if (overrideId) {
        const ovState = this._hass?.states[overrideId];
        const ovTemp  = ovState ? parseFloat(ovState.state) : NaN;
        if (ovState && !Number.isNaN(ovTemp)) {
          temp       = ovTemp;
          nativeUnit = ovState.attributes?.unit_of_measurement || '°F';
        }
      }
      if (temp == null && weatherState?.attributes?.temperature != null) {
        temp       = weatherState.attributes.temperature;
        nativeUnit = weatherState.attributes.temperature_unit || '°F';
      }

      if (temp != null) {
        const displayUnit = this._config?.temperature_unit || 'F';
        const isNativeF   = nativeUnit.includes('F');
        const wantF       = displayUnit === 'F';
        let t = Math.round(temp);
        if (isNativeF && !wantF) t = Math.round((temp - 32) * 5 / 9);
        else if (!isNativeF && wantF) t = Math.round(temp * 9 / 5 + 32);
        const conditionMap = { partlycloudy: 'Partly Cloudy', 'clear-night': 'Clear' };
        const rawCondition = (weatherState?.state || '').toLowerCase();
        const condition = (!weatherState || rawCondition === 'unknown' || rawCondition === 'unavailable') ? ''
          : conditionMap[weatherState.state] || rawCondition.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        text = condition ? `${t}°${displayUnit}  ${condition}` : `${t}°${displayUnit}`;
      }
    }

    el.textContent = text;
    this._updateHeaderVisibility();
  }

  _updateHeaderVisibility() {
    const header = this.shadowRoot?.querySelector('.card-header');
    if (!header) return;
    const hasContent = !!(
      this.shadowRoot.getElementById('card-title')?.textContent ||
      this.shadowRoot.getElementById('card-current')?.textContent
    );
    header.style.display = hasContent ? '' : 'none';
  }

  connectedCallback() {
    if (this._hass && this._config && !this._unsubForecast) {
      this._subscribeForecast();
    }
  }

  disconnectedCallback() {
    this._unsubscribeForecast();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  getCardSize() { return 4; }

  getGridOptions() {
    return { columns: 12, rows: 4, min_columns: 6, min_rows: 2 };
  }

  static getStubConfig(hass) {
    const weatherEntity = hass
      ? Object.keys(hass.states).find(id => id.startsWith('weather.'))
      : undefined;
    return { entity: weatherEntity || 'weather.home', temperature_unit: 'F' };
  }

  static getConfigElement() {
    return document.createElement('weather-mosaic-card-editor');
  }

  // -------------------------------------------------------------------------
  // Forecast subscription (HA 2023.9+) with legacy attribute fallback
  // -------------------------------------------------------------------------
  async _subscribeForecast() {
    if (this._subscribing) return;
    this._subscribing = true;
    this._unsubscribeForecast();

    try {
      this._unsubForecast = await this._hass.connection.subscribeMessage(
        (event) => this._render(event.forecast ?? []),
        {
          type: 'weather/subscribe_forecast',
          forecast_type: 'hourly',
          entity_id: this._config.entity,
        }
      );
    } catch (err) {
      console.warn(
        'weather-mosaic-card: WebSocket forecast subscription failed, ' +
        'falling back to legacy attribute.', err
      );
      this._fallbackToAttribute();
    } finally {
      this._subscribing = false;
    }
  }

  _unsubscribeForecast() {
    if (this._unsubForecast) {
      this._unsubForecast();
      this._unsubForecast = null;
    }
  }

  _fallbackToAttribute() {
    const state    = this._hass?.states[this._config.entity];
    const forecast = state?.attributes?.forecast;
    if (forecast?.length > 0) {
      this._render(forecast);
    } else {
      // No forecast yet — usually transient (the weather integration is still
      // loading right after an HA restart). Don't show a terminal error now;
      // `set hass` re-subscribes once the entity is ready. Only surface the
      // error if data never arrives within the grace period.
      this._scheduleDeferredError();
    }
  }

  _scheduleDeferredError() {
    if (this._errorTimer || this._haveForecast) return;
    this._errorTimer = setTimeout(() => {
      this._errorTimer = null;
      if (!this._haveForecast) {
        this._showError(
          `No forecast data for "${this._config.entity}". ` +
          `Check the entity exists and provides hourly forecasts.`
        );
      }
    }, 15000);
  }

  // -------------------------------------------------------------------------
  // Build shadow DOM (called once)
  // -------------------------------------------------------------------------
  _build() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          padding: 0px 14px 14px 14px;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          color: var(--primary-text-color, #ffffff);
        }
        .error {
          color: var(--error-color, #db4437);
          font-size: 0.85em;
          padding: 12px 0;
        }
        .grid-wrap { overflow: hidden; }
        .mosaic-grid {
          display: grid;
          grid-template-columns: max-content repeat(24, minmax(0, 1fr));
          width: 100%;
        }
        .card-header, .day-label, .hour-label, .cell {
          font-size: var(--cell-fs, 17px);
          font-weight: 500;
        }
        .day-label {
          font-size: var(--label-fs, 14px);
          color: var(--primary-text-color, #ffffff);
          padding-right: 8px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          height: var(--cell-h, 22px);
        }
        .hour-label {
          font-size: var(--label-fs, 14px);
          color: var(--primary-text-color, #ffffff);
          position: relative;
          height: var(--cell-h, 22px);
          overflow: visible;
        }
        .hour-label span {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translate(-50%, -50%);
          white-space: nowrap;
        }
        .cell {
          height: var(--cell-h, 22px);
          position: relative;
          overflow: visible;
        }
        .card-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 12px 0 8px 0;
          gap: 8px;
        }
        .card-title {
          color: var(--ha-card-header-color, var(--primary-text-color, #fff));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .card-current {
          color: var(--primary-text-color, #fff);
          white-space: nowrap;
          flex-shrink: 0;
          text-align: right;
        }

      </style>
      <ha-card>
        <div class="card-header">
          <span id="card-title" class="card-title"></span>
          <span id="card-current" class="card-current"></span>
        </div>
        <div class="grid-wrap"><div id="grid" class="mosaic-grid"></div></div>

      </ha-card>`;

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
  }

  _onResize() {
    const w = this.offsetWidth;
    if (!w || !this._config) return;
    this._narrow  = w < 320;
    const scale   = parseFloat(this._config.font_scale) || 1.0;
    const cellW   = Math.max(8,  Math.floor((w - 28) / 26));
    const cellH   = Math.max(12, Math.floor(cellW * 1.2 * scale));
    const cellFs  = Math.max(6,  Math.floor(cellW * 0.94 * scale));
    const labelFs = Math.max(5,  Math.floor(cellFs * 0.8));
    const host    = this.shadowRoot.host;
    host.style.setProperty('--cell-h',   `${cellH}px`);
    host.style.setProperty('--cell-fs',  `${cellFs}px`);
    host.style.setProperty('--label-fs', `${labelFs}px`);
  }

  _showError(msg) {
    const el = this.shadowRoot?.getElementById('grid');
    if (el) el.innerHTML = `<div class="error" style="grid-column:1/-1">${msg}</div>`;
  }

  // -------------------------------------------------------------------------
  // Color scale: temperature (°F) → { bg, fg }
  // -------------------------------------------------------------------------
  // Parse one color spec — [r,g,b] or "#rgb"/"#rrggbb" hex — to [r,g,b], or null.
  _parseColor(c) {
    if (Array.isArray(c) && c.length === 3 && c.every(Number.isFinite))
      return c.map(n => Math.max(0, Math.min(255, Math.round(n))));
    if (typeof c === 'string') {
      let h = c.trim().replace(/^#/, '');
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      if (/^[0-9a-fA-F]{6}$/.test(h))
        return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    }
    return null;
  }

  // Parse the optional `custom_color_scale` (advanced YAML) into ascending
  // [temp, [r,g,b]] stops. Returns null unless at least two stops are valid,
  // so callers can fall back to a built-in scale.
  _parseCustomScale(raw) {
    if (!Array.isArray(raw)) return null;
    const stops = [];
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const temp = parseFloat(item[0]);
      const rgb  = this._parseColor(item[1]);
      if (Number.isFinite(temp) && rgb) stops.push([temp, rgb]);
    }
    if (stops.length < 2) return null;
    stops.sort((a, b) => a[0] - b[0]);   // interpolation loop needs ascending temps
    return stops;
  }

  // Parse the optional `precipitation_symbols` (advanced YAML) into an ordered
  // list of rules. Each rule needs a `symbol` and may gate on precipitation
  // probability (`min_probability`, %) and/or `condition` (a substring of the
  // weather state, e.g. "snow"). Returns null if nothing valid, so the built-in
  // default is used.
  _parsePrecipRules(raw) {
    if (!Array.isArray(raw)) return null;
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const rules = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || typeof item.symbol !== 'string' || item.symbol === '') continue;
      rules.push({
        symbol:    item.symbol,
        minProb:   num(item.min_probability),
        condition: typeof item.condition === 'string' ? item.condition.toLowerCase() : null,
      });
    }
    return rules.length ? rules : null;
  }

  // Pick the precipitation symbol for a cell. Uses custom rules (first match
  // wins) when configured, otherwise the built-in default.
  _precipSymbol(e) {
    if (this._precipRules) {
      const cond = (e.condition || '').toLowerCase();
      for (const r of this._precipRules) {
        if (r.minProb !== null && e.precip < r.minProb) continue;
        if (r.condition && !cond.includes(r.condition)) continue;
        return r.symbol;
      }
      return '';
    }
    // Built-in default
    if (e.precip >= 50) return (e.condition || '').includes('snow') ? '*' : '/';
    if (e.precip >= 10) return '-';
    return '';
  }

  _tempToColor(f) {
    const stops = this._customStops
      || COLOR_SCALES[this._config.color_scale]
      || COLOR_SCALES.mosaic;
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i][0] && f <= stops[i + 1][0]) {
        lo = stops[i]; hi = stops[i + 1]; break;
      }
    }
    const t    = Math.max(0, Math.min(1, (f - lo[0]) / (hi[0] - lo[0])));
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const r    = lerp(lo[1][0], hi[1][0]);
    const g    = lerp(lo[1][1], hi[1][1]);
    const b    = lerp(lo[1][2], hi[1][2]);
    const lum  = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return {
      bg: `rgb(${r},${g},${b})`,
      fg: lum > 0.5 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
    };
  }

  _formatHour(h) {
    if (this._config.time_format !== '12') return h;
    if (h === 0)  return '12a';
    if (h < 12)  return `${h}a`;
    if (h === 12) return '12p';
    return `${h - 12}p`;
  }

  // -------------------------------------------------------------------------
  // Render grid
  // -------------------------------------------------------------------------
  _render(forecast) {
    // Ignore empty pushes (e.g. the integration still loading after a restart).
    // Keeping the last good grid beats blanking it or showing an error.
    if (!Array.isArray(forecast) || forecast.length === 0) return;
    this._haveForecast = true;
    if (this._errorTimer) { clearTimeout(this._errorTimer); this._errorTimer = null; }
    this._lastForecast = forecast;

    const DAYS = Math.min(7, Math.max(1, parseInt(this._config.days) || 7));
    const dayMap = {}, dayLabels = [];
    const grid = [];
    let dayCount = 0;

    const tz = this._config.timezone
      || this._hass?.states[this._config.entity]?.attributes?.timezone
      || null;

    // Forecast temps are in the weather entity's native unit. The scales and the
    // label/color logic downstream all expect °F, so normalize to °F here based on
    // the entity's own `temperature_unit`. (Fixes issue #3: a °C-native integration
    // like Meteo.LT was being treated as °F → negative numbers + all-cold colors.)
    const nativeIsF = (this._hass?.states[this._config.entity]
      ?.attributes?.temperature_unit || '°F').includes('F');

    // Cache formatters — Intl.DateTimeFormat is expensive to construct
    const fmtHour = tz
      ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
      : null;
    const fmtKey = tz
      ? new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      : null;

    const tzHour = (d) => tz
      ? parseInt(fmtHour.formatToParts(d).find(p => p.type === 'hour').value)
      : d.getHours();
    const tzKey  = (d) => tz ? fmtKey.format(d) : d.toDateString();
    const tzWday = (d) => d.toLocaleDateString('en-US', {
      weekday: this._narrow ? 'narrow' : 'short',
      ...(tz ? { timeZone: tz } : {}),
    });

    forecast.forEach(item => {
      const dt  = new Date(item.datetime);
      const key = tzKey(dt);
      if (!dayMap.hasOwnProperty(key) && dayCount < DAYS) {
        dayMap[key] = dayCount++;
        dayLabels.push(tzWday(dt));
      }
      const di = dayMap[key];
      if (di === undefined) return;
      if (!grid[di]) grid[di] = {};
      grid[di][tzHour(dt)] = {
        temp:      (item.temperature == null || nativeIsF)
                     ? item.temperature
                     : item.temperature * 9 / 5 + 32,
        precip:    item.precipitation_probability || 0,
        condition: item.condition || '',
      };
    });

    const nowHour = tzHour(new Date());

    // Mark daily high/low
    for (let d = 0; d < DAYS; d++) {
      const day = grid[d];
      if (!day) continue;
      const vals = Object.values(day);
      if (!vals.length) continue;
      const mx = Math.max(...vals.map(e => e.temp));
      const mn = Math.min(...vals.map(e => e.temp));
      let highMarked = null, lowMarked = null;

      HOURS.forEach(h => {
        const e = day[h];
        if (!e) return;
        if (e.temp === mx) {
          if (highMarked) highMarked.entry.isHigh = false;
          e.isHigh   = true;
          highMarked = { entry: e, hour: h };
        }
        if (d !== 0 && e.temp === mn) {
          if (lowMarked) lowMarked.entry.isLow = false;
          e.isLow   = true;
          lowMarked = { entry: e, hour: h };
        }
      });

      // Suppress labels on past hours or the very first forecast cell of today
      if (d === 0) {
        const firstHour = HOURS.find(h => day[h]) ?? -1;
        if (highMarked && (highMarked.hour < nowHour || highMarked.hour === firstHour)) highMarked.entry.isHigh = false;
        if (lowMarked  && (lowMarked.hour  < nowHour || lowMarked.hour  === firstHour)) lowMarked.entry.isLow  = false;
      }
    }

    const mosaic = this.shadowRoot.getElementById('grid');
    mosaic.innerHTML = '';

    const appendHoursRow = () => {
      mosaic.appendChild(document.createElement('div')); // spacer for day-label column
      for (let h = 0; h < 24; h++) {
        const div = document.createElement('div');
        div.className = 'hour-label';
        if ([6, 12, 18].includes(h)) {
          const span = document.createElement('span');
          span.textContent = this._formatHour(h);
          div.appendChild(span);
        }
        mosaic.appendChild(div);
      }
    };

    if (this._config.hours === 'above') appendHoursRow();

    for (let d = 0; d < DAYS; d++) {
      const dl = document.createElement('div');
      dl.className   = 'day-label';
      dl.textContent = dayLabels[d] || '';
      mosaic.appendChild(dl);

      HOURS.forEach(h => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const e = grid[d]?.[h];

        if (e) {
          const { bg, fg } = this._tempToColor(e.temp);
          cell.style.background = bg;

          let label = '';
          if (this._config.show_minmax !== false && (e.isHigh || e.isLow)) {
            label = this._config.temperature_unit === 'C'
              ? Math.round((e.temp - 32) * 5 / 9)
              : Math.round(e.temp);
          } else if (this._config.show_precip !== false) {
            label = this._precipSymbol(e);
          }

          if (label) {
            const span = document.createElement('span');
            span.textContent = label;
            span.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;z-index:1;color:${fg};`;
            cell.appendChild(span);
          }
        } else {
          cell.style.background = 'rgba(128,128,128,0.08)';
        }

        mosaic.appendChild(cell);
      });
    }

    if (this._config.hours === 'below') appendHoursRow();
  }
}

customElements.define('weather-mosaic-card', WeatherMosaicCard);

class WeatherMosaicCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._populateEntitySelect();
    this._populateTempEntitySelect();
  }

  _populateEntitySelect() {
    const sel = this.shadowRoot?.getElementById('entity');
    if (!sel || !this._hass) return;
    const entities = Object.keys(this._hass.states)
      .filter(id => id.startsWith('weather.'))
      .sort();
    sel.innerHTML = entities
      .map(id => `<option value="${id}">${id}</option>`)
      .join('');
    sel.value = this._config?.entity || entities[0] || '';
  }

  _populateTempEntitySelect() {
    const sel = this.shadowRoot?.getElementById('temperature_entity');
    if (!sel || !this._hass) return;
    const entities = Object.keys(this._hass.states)
      .filter(id => id.startsWith('sensor.'))
      .filter(id => {
        const a = this._hass.states[id].attributes || {};
        return a.device_class === 'temperature'
          || (a.unit_of_measurement || '').includes('°');
      })
      .sort();
    sel.innerHTML = `<option value="">None (use weather entity)</option>` +
      entities.map(id => `<option value="${id}">${id}</option>`).join('');
    sel.value = this._config?.temperature_entity || '';
  }

  setConfig(config) {
    this._config = config;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this._buildForm();
    }
    this._updateValues();
  }

  _buildForm() {
    this.shadowRoot.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
        label { display: block; margin-bottom: 4px; font-size: 0.85rem; color: var(--secondary-text-color, #888); }
        select {
          width: 100%;
          display: block;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #000);
          font-size: 1rem;
        }
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .switch-row span {
          font-size: 1rem;
          color: var(--primary-text-color, #000);
        }
      </style>
      <div class="form">
        <div>
          <label>Title (optional)</label>
          <input id="title" type="text" placeholder="Leave blank for no title" style="width:100%;padding:8px;border:1px solid var(--divider-color,#ccc);border-radius:4px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#000);font-size:1rem;box-sizing:border-box;" />
        </div>
        <div>
          <label>Weather Entity</label>
          <select id="entity"></select>
        </div>
        <div>
          <label>Current Temp Override (optional)</label>
          <select id="temperature_entity"></select>
        </div>
        <div>
          <label>Temperature Unit</label>
          <select id="temperature_unit">
            <option value="F">Fahrenheit (°F)</option>
            <option value="C">Celsius (°C)</option>
          </select>
        </div>
        <div>
          <label>Color Scale</label>
          <select id="color_scale">
            <option value="mosaic">Mosaic</option>
            <option value="blue_red">Blue → Red</option>
            <option value="turbo">Turbo</option>
            <option value="viridis">Viridis</option>
            <option value="inferno">Inferno</option>
            <option value="white_hot">White-Hot</option>
            <option value="black_hot">Black-Hot</option>
          </select>
        </div>
        <div class="switch-row">
          <span>Current Temperature &amp; Conditions</span>
          <ha-switch id="show_current"></ha-switch>
        </div>
        <div class="switch-row">
          <span>Min/Max Temperatures</span>
          <ha-switch id="show_minmax"></ha-switch>
        </div>
        <div class="switch-row">
          <span>Precipitation Symbols</span>
          <ha-switch id="show_precip"></ha-switch>
        </div>
        <div>
          <label>Days to show</label>
          <select id="days">
            ${[1,2,3,4,5,6,7].map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
      </div>`;

    this.shadowRoot.getElementById('title').addEventListener('input', e => {
      this._changed('title', e.target.value);
    });
    this._populateEntitySelect();
    this._populateTempEntitySelect();

    ['entity', 'temperature_entity', 'temperature_unit', 'color_scale', 'days'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', e => {
        this._changed(id, e.target.value);
      });
    });

    ['show_current', 'show_minmax', 'show_precip'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', e => {
        this._changed(id, e.target.checked);
      });
    });
  }

  _updateValues() {
    if (!this.shadowRoot) return;
    const titleEl = this.shadowRoot.getElementById('title');
    if (titleEl) {
      const derived = (this._config.entity || '').replace(/^weather\./, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      titleEl.value = this._config.title !== undefined ? this._config.title : derived;
    }
    const sel = (id, val) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.value = val || '';
    };
    sel('entity',           this._config.entity || '');
    sel('temperature_entity', this._config.temperature_entity || '');
    sel('temperature_unit', this._config.temperature_unit || 'F');
    sel('color_scale',      this._config.color_scale || 'mosaic');
    sel('days',             this._config.days || '7');

    const chk = (id, val) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.checked = val;
    };
    chk('show_current', this._config.show_current !== false);
    chk('show_minmax',  this._config.show_minmax  !== false);
    chk('show_precip',  this._config.show_precip  !== false);
  }

  _changed(key, value) {
    let coerced = value;
    if (value === 'true')  coerced = true;
    if (value === 'false') coerced = false;
    const config = { ...this._config, [key]: coerced };
    if (key !== 'title' && (coerced === '' || coerced === undefined)) delete config[key];
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('weather-mosaic-card-editor', WeatherMosaicCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'weather-mosaic-card',
  name: 'Weather Mosaic Card',
  description: 'Hourly temperature color-mosaic grid.',
  preview: true,
  documentationURL: 'https://github.com/whalleyms/weather-mosaic-card',
});
