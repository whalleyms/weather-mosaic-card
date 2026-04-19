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

class WeatherMosaicCard extends HTMLElement {

  // -------------------------------------------------------------------------
  // HA lifecycle
  // -------------------------------------------------------------------------
  set hass(hass) {
    const firstLoad = !this._hass;
    this._hass = hass;

    if (!this.shadowRoot) this._build();

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

    // If we already have hass (config set after hass), subscribe now
    if (this._hass && !this._unsubForecast) {
      this._subscribeForecast();
    }
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

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'weather' } } },
        {
          name: 'temperature_unit',
          selector: {
            select: {
              options: [
                { label: 'Fahrenheit (°F)', value: 'F' },
                { label: 'Celsius (°C)', value: 'C' },
              ],
            },
          },
        },
      ],
    };
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
        table { border-collapse: collapse; border-spacing: 0; width: 100%; }
        .day-label {
          font-size: var(--label-fs, 17px);
          font-weight: 500;
          color: var(--primary-text-color, #ffffff);
          padding-right: 6px;
          white-space: nowrap;
          vertical-align: middle;
        }
        .cell {
          width: var(--cell-w, 17px);
          min-width: var(--cell-w, 17px);
          max-width: var(--cell-w, 17px);
          height: var(--cell-h, 22px);
          text-align: center;
          vertical-align: middle;
          font-size: var(--cell-fs, 20px);
          font-weight: 550;
          color: rgba(0,0,0,0.72);
          padding: 0;
          margin: 0;
          position: relative;
        }
      </style>
      <ha-card>
        <div class="grid-wrap"><table id="grid"></table></div>
      </ha-card>`;

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
  }

  _onResize() {
    const w = this.offsetWidth;
    if (!w) return;
    const cellW  = Math.max(8,  Math.floor((w - 28 - 38) / 24));
    const cellH  = Math.max(12, Math.floor(cellW * 1.2));
    const cellFs = Math.max(9,  Math.floor(cellW * 1.02));
    const labelFs = Math.max(10, Math.min(17, cellH));
    const host = this.shadowRoot.host;
    host.style.setProperty('--cell-w',  `${cellW}px`);
    host.style.setProperty('--cell-h',  `${cellH}px`);
    host.style.setProperty('--cell-fs', `${cellFs}px`);
    host.style.setProperty('--label-fs', `${labelFs}px`);
  }

  _showError(msg) {
    const table = this.shadowRoot?.getElementById('grid');
    if (table) table.innerHTML = `<tr><td class="error">${msg}</td></tr>`;
  }

  // -------------------------------------------------------------------------
  // Color scale: temperature (°F) → RGB
  // -------------------------------------------------------------------------
  _tempToColor(f) {
    const stops = [
      [10,  [200, 230, 255]],
      [30,  [160, 200, 255]],
      [40,  [ 91, 163, 255]],
      [55,  [ 61, 217, 160]],
      [65,  [163, 224,  58]],
      [75,  [255, 255,  85]],
      [85,  [255, 176,  58]],
      [95,  [255,  92,  58]],
      [105, [178,  40,  40]],
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i][0] && f <= stops[i + 1][0]) {
        lo = stops[i]; hi = stops[i + 1]; break;
      }
    }
    const t = Math.max(0, Math.min(1, (f - lo[0]) / (hi[0] - lo[0])));
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${lerp(lo[1][0],hi[1][0])},${lerp(lo[1][1],hi[1][1])},${lerp(lo[1][2],hi[1][2])})`;
  }

  // -------------------------------------------------------------------------
  // Render grid
  // -------------------------------------------------------------------------
  _render(forecast) {
    if (!this.shadowRoot) this._build();

    const DAYS = 7;
    const HOURS = Array.from({ length: 24 }, (_, i) => i);
    const dayMap = {}, dayLabels = [];
    const grid = [];

    forecast.forEach(item => {
      const dt = new Date(item.datetime);
      const key = dt.toDateString();
      if (!dayMap.hasOwnProperty(key) && Object.keys(dayMap).length < DAYS) {
        dayMap[key] = Object.keys(dayMap).length;
        dayLabels.push(dt.toLocaleDateString('en-US', { weekday: 'short' }));
      }
      const di = dayMap[key];
      if (di === undefined) return;
      if (!grid[di]) grid[di] = {};
      grid[di][dt.getHours()] = {
        temp: item.temperature,
        precip: item.precipitation_probability || 0,
      };
    });

    const nowHour = new Date().getHours();

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

      // Don't label past hours on today
      if (d === 0) {
        if (highMarked && highMarked.hour < nowHour) highMarked.entry.isHigh = false;
        if (lowMarked && lowMarked.hour < nowHour) lowMarked.entry.isLow = false;
      }
    }

    // Build table
    const table = this.shadowRoot.getElementById('grid');
    table.innerHTML = '';

    for (let d = 0; d < DAYS; d++) {
      const tr = document.createElement('tr');

      const dl = document.createElement('td');
      dl.className = 'day-label';
      dl.textContent = dayLabels[d] || '';
      tr.appendChild(dl);

      HOURS.forEach(h => {
        const td = document.createElement('td');
        td.className = 'cell';
        const e = grid[d]?.[h];

        if (e) {
          td.style.background = this._tempToColor(e.temp);
          let label = '';
          if (e.isHigh || e.isLow) {
            const displayTemp = this._config.temperature_unit === 'C'
              ? Math.round((e.temp - 32) * 5 / 9)
              : Math.round(e.temp);
            label = displayTemp;
          } else if (e.precip >= 50) {
            label = '/';
          } else if (e.precip >= 10) {
            label = '-';
          }
          if (label) {
            const span = document.createElement('span');
            span.textContent = label;
            span.style.cssText = `
              position: absolute;
              left: 50%; top: 50%;
              transform: translate(-50%, -50%);
              white-space: nowrap;
              pointer-events: none;
              z-index: 1;
            `;
            td.appendChild(span);
          }
        } else {
          td.style.background = 'transparent';
        }

        tr.appendChild(td);
      });

      table.appendChild(tr);
    }
  }
}

customElements.define('weather-mosaic-card', WeatherMosaicCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'custom:weather-mosaic-card',
  name: 'WX Chart Card',
  description: 'Hourly temperature color-mosaic grid for 7 days.',
  preview: false,
  documentationURL: 'https://github.com/whalleyms/weather-mosaic-card',
});