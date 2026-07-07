<p align="center">
  <img src="https://raw.githubusercontent.com/whalleyms/weather-mosaic-card/main/assets/logo-banner.png" alt="Weather Mosaic" width="760">
</p>

<p align="center">
  <a href="https://github.com/hacs/default"><img src="https://img.shields.io/badge/HACS-Default-41BDF5.svg" alt="HACS Default"></a>
  <a href="https://github.com/whalleyms/weather-mosaic-card/releases"><img src="https://img.shields.io/github/v/release/whalleyms/weather-mosaic-card" alt="Latest release"></a>
  <a href="https://github.com/whalleyms/weather-mosaic-card/actions/workflows/validate.yml"><img src="https://github.com/whalleyms/weather-mosaic-card/actions/workflows/validate.yml/badge.svg" alt="Validate"></a>
  <a href="https://github.com/whalleyms/weather-mosaic-card/blob/main/LICENSE"><img src="https://img.shields.io/github/license/whalleyms/weather-mosaic-card" alt="License"></a>
</p>

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that displays a 7-day hourly weather forecast as a color-coded grid — one row per day, one cell per hour. Each cell's color encodes temperature, letting you spot daily patterns, hot afternoons, cool nights, and rainy periods at a glance.

**[Preview →](https://whalleyms.github.io/weather-mosaic-card/)**

![Weather Mosaic Card - light theme](assets/weather_mosaic_white.png)
![Weather Mosaic Card - dark theme](assets/weather_mosaic_black.png)

---

## Design

Most weather displays are cluttered — icons, numbers, labels, legends competing for attention. This card takes a different approach: encode everything into color and let the eye do the work.

The complete 7-day hourly forecast fits in a single glance. This is possible because daily temperatures follow a strongly predictable diurnal cycle — cool before dawn, warming through the morning, peaking mid-afternoon, falling through the evening — and that rhythm maps naturally onto the grid. But the display also captures multi-day patterns: heat waves appear as broad warm patches, cold fronts as abrupt color shifts, rainy stretches as clusters of precipitation markers spanning several rows. Your mind quickly adapts to these patterns, enabling you to read a week of weather in one eyespan.

The design is inspired by Edward Tufte's principle of maximizing the data-to-ink ratio: show as much information as possible with as little visual noise as possible. It has been refined over several years, first as a [MagicMirror](https://magicmirror.builders/) module and now as a Home Assistant card. It works especially well as a kiosk or always-on display where you want to glance at the forecast without having to physically interact.

## How It Works

Each cell represents one hour of one day. Cell color encodes temperature using your choice of color scale. Precipitation probability is shown as subtle markers within cells. Daily high and low temperatures are labeled directly on their peak cells. The card scales to fit any dashboard column width.

---

## Installation

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=whalleyms&repository=weather-mosaic-card&category=plugin">
  <img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.">
</a>

### HACS (Recommended)

Weather Mosaic Card is in the default HACS store — no need to add it as a custom repository.

1. Open **HACS** in Home Assistant
2. Search for **Weather Mosaic Card**
3. Open it and click **Download**
4. Restart Home Assistant

Or click the **Open in HACS** badge above to jump straight to it.

### Manual

1. Download `weather-mosaic-card.js` from the [latest release](../../releases/latest)
2. Copy it to `/config/www/weather-mosaic-card.js`
3. In Home Assistant go to **Settings → Dashboards → Resources**
4. Add a new resource:
   - URL: `/local/weather-mosaic-card.js`
   - Type: `JavaScript Module`
5. Restart Home Assistant

---

## Weather Integrations

This card requires a Home Assistant weather entity that provides **hourly** forecast data. If you don't have one set up yet, here are the easiest options:

| Integration | Cost | Coverage | Notes |
|-------------|------|----------|-------|
| [Open-Meteo](https://www.home-assistant.io/integrations/open_meteo/) | Free, no account | Global | Built into HA — just add the integration and pick your location. Easiest starting point. |
| [PirateWeather](https://pirateweather.net/) | Free tier available | Global | Requires a free API key. Closely mirrors the Dark Sky API. |
| [National Weather Service](https://www.home-assistant.io/integrations/nws/) | Free, no account | US only | Built into HA. Good choice if you're in the US and prefer an official government source. |

Once your integration is set up, HA will create a `weather.` entity you can point this card at.

---

## Configuration

The card supports a visual editor — click the card in the dashboard editor to configure it. All options are also available via YAML:

```yaml
type: custom:weather-mosaic-card
entity: weather.your_weather_entity
```

### Visual Editor Options

These options are available in the card's visual editor:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | `weather.pirateweather` | Weather entity ID (must provide hourly forecast) |
| `temperature_entity` | string | _(unset)_ | Optional sensor that overrides the header's current temperature (e.g. a local/personal weather station). Leave unset to read the temperature from the weather entity. |
| `title` | string | Derived from entity name | Card title. Set to empty string to hide. |
| `temperature_unit` | `F` \| `C` | `F` | Unit for displayed temperature labels |
| `days` | 1–7 | `7` | Number of days to display |
| `show_current` | boolean | `true` | Show current temperature and conditions in the header |
| `show_minmax` | boolean | `true` | Show daily high and low temperature labels |
| `show_precip` | boolean | `true` | Show precipitation symbols |
| `color_scale` | `mosaic` \| `blue_red` \| `turbo` \| `viridis` \| `inferno` \| `white_hot` \| `black_hot` | `mosaic` | Color scale used to encode temperature |

### Advanced YAML Options

These options are not shown in the visual editor but can be set in YAML:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hours` | `above` \| `below` | `above` | Show hour labels above or below the grid |
| `time_format` | `12` \| `24` | `12` | Format for hour labels (3a/6p vs 3/15) |
| `font_scale` | number | `1.0` | Multiplier for font size. `1.2` = 20% larger, `0.8` = 20% smaller. |
| `timezone` | string | Auto-detected | IANA timezone for the forecast location (e.g. `America/New_York`). Auto-detected from the entity's `timezone` attribute if present, otherwise uses local browser time. |
| `custom_color_scale` | list | _(unset)_ | Define your own temperature→color stops, overriding `color_scale`. See [Custom Color Scale](#custom-color-scale). |

### Full Example

```yaml
type: custom:weather-mosaic-card
entity: weather.pirateweather
title: My Weather
temperature_unit: F
days: 7
show_current: true
show_minmax: true
show_precip: true
color_scale: turbo
hours: above
time_format: 12
font_scale: 1.0
timezone: America/New_York
```

---

## Local Temperature Override

By default the header's current temperature comes from the weather entity. If you have a more accurate local source — a personal weather station, an outdoor sensor, or a hyperlocal helper — point `temperature_entity` at it:

```yaml
type: custom:weather-mosaic-card
entity: weather.home
temperature_entity: sensor.outdoor_temperature
```

The header then shows that sensor's reading, followed by the current condition from the weather entity. The sensor's own `unit_of_measurement` is respected, so a °C sensor is converted to match `temperature_unit`. The forecast grid is unaffected — it always uses the weather entity's hourly data. Leaving `temperature_entity` unset keeps the original behaviour.

---

## Color Scales

| Scale | Description |
|-------|-------------|
| `mosaic` | Multi-color scale: blue → teal → green → yellow → orange → red |
| `blue_red` | Clean diverging scale: blue (cold) → red (hot) |
| `turbo` | Perceptually uniform: blue → green → yellow → red |
| `viridis` | Colorblind-safe: dark purple → teal → green → yellow |
| `inferno` | High contrast, dark theme-friendly: black → purple → red → orange → yellow |
| `white_hot` | Thermal grayscale: coldest = black → hottest = white |
| `black_hot` | Inverted thermal grayscale: coldest = white → hottest = black |

All scales are calibrated for temperatures in °F. When `temperature_unit: C` is set, displayed labels are converted but the color mapping remains °F-based — set your HA weather integration to report in °F for best results.

---

## Custom Color Scale

Not happy with the built-in scales? Define your own with the advanced `custom_color_scale` option (YAML only — it isn't in the visual editor). It takes a list of `[temperature, color]` stops, and the card interpolates between them exactly like a built-in scale. Colors may be hex strings or `[r, g, b]` arrays:

```yaml
type: custom:weather-mosaic-card
entity: weather.home
custom_color_scale:
  - [30, "#2b83ba"]        # hex
  - [50, "#abdda4"]
  - [70, "#ffffbf"]
  - [90, [215, 25, 28]]    # or [r, g, b]
```

- You need at least **two** stops. Order doesn't matter — stops are sorted automatically.
- Temperatures below your lowest stop take its color; above your highest, its color (no extrapolation).
- When set, `custom_color_scale` **overrides** the named `color_scale`. If it's missing or malformed, the card silently falls back to `color_scale` (or `mosaic`).
- Stops are matched against the same temperature values the built-in scales use, so define them in the unit your weather entity reports (°F for most US integrations).

---

## Precipitation Indicators

| Symbol | Meaning |
|--------|---------|
| `-` | 10–49% chance of precipitation |
| `/` | 50%+ chance of rain |
| `*` | 50%+ chance of snow |

Set `show_precip: false` to hide these markers.

---

## Tested With

- [PirateWeather](https://pirateweather.net/)
- [Open-Meteo](https://www.home-assistant.io/integrations/open_meteo/)
- [National Weather Service](https://www.home-assistant.io/integrations/nws/)

*Using this card with another integration? Open an issue or PR to add it to this list.*

---

## Contributing

Issues and pull requests are welcome. If you find a bug or have a feature request, please [open an issue](../../issues).

---

## License

MIT

