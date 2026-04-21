/**
 * weather-mosaic-card
 * Color-mosaic hourly weather grid for Home Assistant
 *
 * Installation:
 *   1. Copy to /config/www/weather-mosaic-card.js
 *   2. Add Lovelace resource:
 *        url: /local/weather-mosaic-card.js
 *        type: module
 *   3. Add card:
 *        type: custom:weather-mosaic-card
 *        entity: weather.home        # must provide hourly forecast
 *
 * Requires an integration that provides hourly forecast data
 * (PirateWeather, Open-Meteo, Met.no, etc.)
 */

const _WMC_LOADED = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

class WeatherMosaicCard extends HTMLElement {

  // -------------------------------------------------------------------------
  // HA lifecycle
  // -------------------------------------------------------------------------
  set hass(hass) {
    const firstLoad = !this._hass;
    this._hass = hass;

    if (!this.shadowRoot) { this._build(); this._updateTitle(); }
    this._updateCurrent();

    // Subscribe to forecast on first hass assignment
    if (firstLoad && this._config) {
      this._subscribeForecast();
    }
  }

  setConfig(config) {
    this._config = {
      entity: 'weather.pirateweather',
      temperature_unit: 'F',
      ...config,
    };

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
    if (this._config?.show_current === false) {
      el.textContent = '';
      this._updateHeaderVisibility();
      return;
    }
    const state = this._hass?.states[this._config?.entity];
    if (!state) { el.textContent = ''; this._updateHeaderVisibility(); return; }
    const temp = state.attributes.temperature;
    if (temp == null) { el.textContent = ''; this._updateHeaderVisibility(); return; }
    const nativeUnit = state.attributes.temperature_unit || '°F';
    const displayUnit = this._config?.temperature_unit || 'F';
    const isNativeF = nativeUnit.includes('F');
    const wantF = displayUnit === 'F';
    let t = Math.round(temp);
    if (isNativeF && !wantF) t = Math.round((temp - 32) * 5 / 9);
    else if (!isNativeF && wantF) t = Math.round(temp * 9 / 5 + 32);
    const conditionMap = { partlycloudy: 'Partly Cloudy', 'clear-night': 'Clear' };
    const condition = conditionMap[state.state]
      || (state.state || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    el.textContent = `${t}°${displayUnit}  ${condition}`;
    this._updateHeaderVisibility();
  }

  _updateHeaderVisibility() {
    const header = this.shadowRoot?.querySelector('.card-header');
    if (!header) return;
    const titleEl   = this.shadowRoot.getElementById('card-title');
    const currentEl = this.shadowRoot.getElementById('card-current');
    const hasContent = (titleEl?.textContent || '') || (currentEl?.textContent || '');
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

  static getStubConfig() {
    return { entity: 'weather.home', temperature_unit: 'F' };
  }

  static getConfigElement() {
    return document.createElement('weather-mosaic-card-editor');
  }

  // -------------------------------------------------------------------------
  // Forecast subscription (HA 2023.9+) with legacy attribute fallback
  // -------------------------------------------------------------------------
  async _subscribeForecast() {
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
    }
  }

  _unsubscribeForecast() {
    if (this._unsubForecast) {
      this._unsubForecast();
      this._unsubForecast = null;
    }
  }

  _fallbackToAttribute() {
    const state = this._hass?.states[this._config.entity];
    const forecast = state?.attributes?.forecast;
    if (forecast && forecast.length > 0) {
      this._render(forecast);
    } else {
      this._showError(
        `No forecast data for "${this._config.entity}". ` +
        `Check the entity exists and provides hourly forecasts.`
      );
    }
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
        .loaded-at {
          font-size: 9px;
          opacity: 0.6;
          text-align: right;
          padding: 2px 0 0 0;
          color: var(--primary-text-color, #fff);
        }
      </style>
      <ha-card>
        <div class="card-header">
          <span id="card-title" class="card-title"></span>
          <span id="card-current" class="card-current"></span>
        </div>
        <div class="grid-wrap"><div id="grid" class="mosaic-grid"></div></div>
        <div class="loaded-at">js loaded ${_WMC_LOADED}</div>
      </ha-card>`;

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
  }

  _onResize() {
    const w = this.offsetWidth;
    if (!w) return;
    this._narrow  = w < 320;
    const scale   = parseFloat(this._config.font_scale) || 1.0;
    const cellW   = Math.max(8,  Math.floor((w - 28) / 26));
    const cellH   = Math.max(12, Math.floor(cellW * 1.2 * scale));
    const cellFs  = Math.max(6,  Math.floor(cellW * 0.94 * scale));
    const labelFs = Math.max(5,  Math.floor(cellFs * 0.8));
    const host    = this.shadowRoot.host;
    host.style.setProperty('--cell-h',  `${cellH}px`);
    host.style.setProperty('--cell-fs', `${cellFs}px`);
    host.style.setProperty('--label-fs', `${labelFs}px`);
  }

  _showError(msg) {
    const el = this.shadowRoot?.getElementById('grid');
    if (el) el.innerHTML = `<div class="error" style="grid-column:1/-1">${msg}</div>`;
  }

  // -------------------------------------------------------------------------
  // Color scale: temperature (°F) → RGB
  // -------------------------------------------------------------------------
  _tempToColor(f) {
    const scales = {
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
    };
    const stops = scales[this._config.color_scale] ?? scales.mosaic;
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i][0] && f <= stops[i + 1][0]) {
        lo = stops[i]; hi = stops[i + 1]; break;
      }
    }
    const t = Math.max(0, Math.min(1, (f - lo[0]) / (hi[0] - lo[0])));
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const r = lerp(lo[1][0], hi[1][0]);
    const g = lerp(lo[1][1], hi[1][1]);
    const b = lerp(lo[1][2], hi[1][2]);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return {
      bg: `rgb(${r},${g},${b})`,
      fg: luminance > 0.5 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
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
    this._lastForecast = forecast;
    if (!this.shadowRoot) this._build();

    const DAYS = Math.min(7, Math.max(1, parseInt(this._config.days) || 7));
    const HOURS = Array.from({ length: 24 }, (_, i) => i);
    const dayMap = {}, dayLabels = [];
    const grid = [];

    const tz = this._config.timezone
      || this._hass?.states[this._config.entity]?.attributes?.timezone
      || null;
    const tzHour = (d) => {
      if (!tz) return d.getHours();
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).find(p => p.type === 'hour').value);
    };
    const tzKey = (d) => {
      if (!tz) return d.toDateString();
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    };
    const tzWday = (d) => d.toLocaleDateString('en-US', { weekday: this._narrow ? 'narrow' : 'short', ...(tz ? { timeZone: tz } : {}) });

    forecast.forEach(item => {
      const dt = new Date(item.datetime);
      const key = tzKey(dt);
      if (!dayMap.hasOwnProperty(key) && Object.keys(dayMap).length < DAYS) {
        dayMap[key] = Object.keys(dayMap).length;
        dayLabels.push(tzWday(dt));
      }
      const di = dayMap[key];
      if (di === undefined) return;
      if (!grid[di]) grid[di] = {};
      grid[di][tzHour(dt)] = {
        temp: item.temperature,
        precip: item.precipitation_probability || 0,
        condition: item.condition || '',
      };
    });

    const nowHour = tzHour(new Date());

    // Mark daily high/low per cell
    for (let d = 0; d < DAYS; d++) {
      const day = grid[d];
      if (!day) continue;
      const valid = Object.values(day);
      if (!valid.length) continue;
      const mx = Math.max(...valid.map(e => e.temp));
      const mn = Math.min(...valid.map(e => e.temp));
      let highMarked = false, lowMarked = false;

      HOURS.forEach(h => {
        const e = day[h];
        if (!e) return;
        if (e.temp === mx) {
          if (highMarked) highMarked.entry.isHigh = false;
          e.isHigh = true;
          highMarked = { entry: e, hour: h };
        }
        if (d !== 0 && e.temp === mn) {
          if (lowMarked) lowMarked.entry.isLow = false;
          e.isLow = true;
          lowMarked = { entry: e, hour: h };
        }
      });

      // Don't label past hours on today, or the very first forecast cell
      if (d === 0) {
        const firstForecastHour = HOURS.find(h => day[h]) ?? -1;
        if (highMarked && (highMarked.hour < nowHour || highMarked.hour === firstForecastHour)) highMarked.entry.isHigh = false;
        if (lowMarked && (lowMarked.hour < nowHour || lowMarked.hour === firstForecastHour)) lowMarked.entry.isLow = false;
      }
    }

    const mosaic = this.shadowRoot.getElementById('grid');
    mosaic.innerHTML = '';

    const _appendHoursRow = () => {
      mosaic.appendChild(document.createElement('div')); // empty label cell
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

    if (this._config.hours === 'above') _appendHoursRow();


    for (let d = 0; d < DAYS; d++) {
      const dl = document.createElement('div');
      dl.className = 'day-label';
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
          } else if (this._config.show_precip !== false && e.precip >= 50) {
            label = e.condition.includes('snow') ? '*' : '/';
          } else if (this._config.show_precip !== false && e.precip >= 10) {
            label = '-';
          }
          if (label) {
            const span = document.createElement('span');
            span.textContent = label;
            span.style.cssText = `position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); white-space:nowrap; pointer-events:none; z-index:1; color:${fg};`;
            cell.appendChild(span);
          }
        } else {
          cell.style.background = 'rgba(128,128,128,0.08)';
        }

        mosaic.appendChild(cell);
      });
    }

    if (this._config.hours === 'below') _appendHoursRow();
  }
}

customElements.define('weather-mosaic-card', WeatherMosaicCard);

class WeatherMosaicCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._populateEntitySelect();
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
        ha-entity-picker, select {
          width: 100%;
          display: block;
        }
        select {
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #000);
          font-size: 1rem;
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
          <label>Temperature Unit</label>
          <select id="temperature_unit">
            <option value="F">Fahrenheit (°F)</option>
            <option value="C">Celsius (°C)</option>
          </select>
        </div>
        <div>
          <label>Current Temperature &amp; Conditions</label>
          <select id="show_current">
            <option value="true">Show</option>
            <option value="false">Hide</option>
          </select>
        </div>
        <div>
          <label>Min/Max Temperatures</label>
          <select id="show_minmax">
            <option value="true">Show</option>
            <option value="false">Hide</option>
          </select>
        </div>
        <div>
          <label>Precipitation Symbols</label>
          <select id="show_precip">
            <option value="true">Show</option>
            <option value="false">Hide</option>
          </select>
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

    ['entity', 'temperature_unit', 'show_current', 'show_minmax', 'show_precip', 'days'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', e => {
        this._changed(id, e.target.value);
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
    sel('entity', this._config.entity || '');
    sel('temperature_unit', this._config.temperature_unit || 'F');
    sel('show_current', this._config.show_current === false ? 'false' : 'true');
    sel('show_minmax', this._config.show_minmax === false ? 'false' : 'true');
    sel('show_precip', this._config.show_precip === false ? 'false' : 'true');
    sel('days', this._config.days || '7');
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
  type: 'custom:weather-mosaic-card',
  name: 'WX Chart Card',
  description: 'Hourly temperature color-mosaic grid for 7 days.',
  preview: false,
  documentationURL: 'https://github.com/whalleyms/weather-mosaic-card',
});