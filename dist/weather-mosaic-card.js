// weather-mosaic-card v0.1.0

class WxChartCard extends HTMLElement {
  set hass(hass) {
    if (!this.content) this._build();
    const entity = this._config.entity || 'weather.pirateweather';
    const state = hass.states[entity];
    if (!state) return;
    const forecast = state.attributes.forecast || [];
    this._render(forecast);
  }

  setConfig(config) {
    this._config = config;
  }

  _build() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          padding: 0px 14px 14px 14px;
          background: #000000;
          color: #ffffff;
        }
        .title { font-size: 14px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 10px; }
        .grid-wrap { overflow: hidden; }
        table { border-collapse: collapse; border-spacing: 0; width: 100%; }
        .hour-label {
          font-size: 17px;
          color: rgba(255,255,255,1.0);
          text-align: center;
          padding: 0 0 4px 0;
          white-space: nowrap;
          font-weight: 400;
        }
        .day-label {
          font-size: 17px;
          font-weight: 500;
          color: rgba(255,255,255,1.0);
          padding-right: 6px;
          white-space: nowrap;
          vertical-align: middle;
        }
        .cell {
          width: 17px;
          min-width: 17px;
          max-width: 17px;
          height: 22px;
          text-align: center;
          vertical-align: middle;
          font-size: 20px;
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
    this.content = true;
  }

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
      [105, [178,  40,  40]]
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i][0] && f <= stops[i + 1][0]) {
        lo = stops[i]; hi = stops[i + 1]; break;
      }
    }
    const t = Math.max(0, Math.min(1, (f - lo[0]) / (hi[0] - lo[0])));
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${lerp(lo[1][0], hi[1][0])},${lerp(lo[1][1], hi[1][1])},${lerp(lo[1][2], hi[1][2])})`;
  }

  _render(forecast) {
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
      const hour = dt.getHours();
      grid[di][hour] = {
        temp: item.temperature,
        precip: item.precipitation_probability || 0
      };
    });

    const nowHour = new Date().getHours();

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
      if (d === 0 && highMarked && highMarked.hour < nowHour) highMarked.entry.isHigh = false;
      if (d === 0 && lowMarked && lowMarked.hour < nowHour) lowMarked.entry.isLow = false;
    }

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
        const e = grid[d] && grid[d][h];
        if (e) {
          td.style.background = this._tempToColor(e.temp);
          let label = '';
          if (e.isHigh || e.isLow) {
            label = Math.round(e.temp);
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
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              white-space: nowrap;
              pointer-events: none;
              z-index: 1;
            `;
            td.appendChild(span);
          }
        } else {
          td.style.background = '#000000';
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    }
  }

  getCardSize() { return 4; }
}

customElements.define('weather-mosaic-card', WxChartCard);
