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

// Sunrise/sunset (UTC Date objects) for a date and coordinates, via the
// standard sunrise equation. Returns {} at the poles when the sun never
// rises/sets that day. Longitude is degrees east; latitude degrees north.
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180, dayMs = 86400000;
  const jdate = date.getTime() / dayMs + 2440587.5;      // Julian date
  const n = Math.round(jdate - 2451545.0 + 0.0009);
  const Jstar = n - lon / 360;                             // mean solar noon
  const M = (357.5291 + 0.98560028 * Jstar) % 360;         // solar mean anomaly
  const Mr = M * rad;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = (M + C + 282.9372) % 360;                 // ecliptic longitude
  const lr = lambda * rad;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lr);
  const delta = Math.asin(Math.sin(lr) * Math.sin(23.44 * rad)); // declination
  const latR = lat * rad;
  const cosw = (Math.sin(-0.833 * rad) - Math.sin(latR) * Math.sin(delta)) /
               (Math.cos(latR) * Math.cos(delta));
  if (cosw >= 1 || cosw <= -1) return {};                  // polar day / night
  const w0 = Math.acos(cosw) / 360 * (180 / Math.PI);      // hour angle -> fraction of day
  const toDate = (J) => new Date((J - 2440587.5) * dayMs);
  return { sunrise: toDate(Jtransit - w0), sunset: toDate(Jtransit + w0) };
}

// Representative coordinates for each IANA timezone, from the tz database
// (zone.tab). Used as a best-effort fallback for sunrise/sunset on a remote
// card that sets a `timezone` but no explicit latitude/longitude: a zone
// spanning many cities resolves to its reference city, so pin lat/lon for the
// exact location. [lat, lon], degrees; longitude east-positive.
const TZ_COORDS = {"Africa/Abidjan":[5.32,-4.03],"Africa/Accra":[5.55,-0.22],"Africa/Addis_Ababa":[9.03,38.7],"Africa/Algiers":[36.78,3.05],"Africa/Asmara":[15.33,38.88],"Africa/Bamako":[12.65,-8.0],"Africa/Bangui":[4.37,18.58],"Africa/Banjul":[13.47,-16.65],"Africa/Bissau":[11.85,-15.58],"Africa/Blantyre":[-15.78,35.0],"Africa/Brazzaville":[-4.27,15.28],"Africa/Bujumbura":[-3.38,29.37],"Africa/Cairo":[30.05,31.25],"Africa/Casablanca":[33.65,-7.58],"Africa/Ceuta":[35.88,-5.32],"Africa/Conakry":[9.52,-13.72],"Africa/Dakar":[14.67,-17.43],"Africa/Dar_es_Salaam":[-6.8,39.28],"Africa/Djibouti":[11.6,43.15],"Africa/Douala":[4.05,9.7],"Africa/El_Aaiun":[27.15,-13.2],"Africa/Freetown":[8.5,-13.25],"Africa/Gaborone":[-24.65,25.92],"Africa/Harare":[-17.83,31.05],"Africa/Johannesburg":[-26.25,28.0],"Africa/Juba":[4.85,31.62],"Africa/Kampala":[0.32,32.42],"Africa/Khartoum":[15.6,32.53],"Africa/Kigali":[-1.95,30.07],"Africa/Kinshasa":[-4.3,15.3],"Africa/Lagos":[6.45,3.4],"Africa/Libreville":[0.38,9.45],"Africa/Lome":[6.13,1.22],"Africa/Luanda":[-8.8,13.23],"Africa/Lubumbashi":[-11.67,27.47],"Africa/Lusaka":[-15.42,28.28],"Africa/Malabo":[3.75,8.78],"Africa/Maputo":[-25.97,32.58],"Africa/Maseru":[-29.47,27.5],"Africa/Mbabane":[-26.3,31.1],"Africa/Mogadishu":[2.07,45.37],"Africa/Monrovia":[6.3,-10.78],"Africa/Nairobi":[-1.28,36.82],"Africa/Ndjamena":[12.12,15.05],"Africa/Niamey":[13.52,2.12],"Africa/Nouakchott":[18.1,-15.95],"Africa/Ouagadougou":[12.37,-1.52],"Africa/Porto-Novo":[6.48,2.62],"Africa/Sao_Tome":[0.33,6.73],"Africa/Tripoli":[32.9,13.18],"Africa/Tunis":[36.8,10.18],"Africa/Windhoek":[-22.57,17.1],"America/Adak":[51.88,-176.66],"America/Anchorage":[61.22,-149.9],"America/Anguilla":[18.2,-63.07],"America/Antigua":[17.05,-61.8],"America/Araguaina":[-7.2,-48.2],"America/Argentina/Buenos_Aires":[-34.6,-58.45],"America/Argentina/Catamarca":[-28.47,-65.78],"America/Argentina/Cordoba":[-31.4,-64.18],"America/Argentina/Jujuy":[-24.18,-65.3],"America/Argentina/La_Rioja":[-29.43,-66.85],"America/Argentina/Mendoza":[-32.88,-68.82],"America/Argentina/Rio_Gallegos":[-51.63,-69.22],"America/Argentina/Salta":[-24.78,-65.42],"America/Argentina/San_Juan":[-31.53,-68.52],"America/Argentina/San_Luis":[-33.32,-66.35],"America/Argentina/Tucuman":[-26.82,-65.22],"America/Argentina/Ushuaia":[-54.8,-68.3],"America/Aruba":[12.5,-69.97],"America/Asuncion":[-25.27,-57.67],"America/Atikokan":[48.76,-91.62],"America/Bahia":[-12.98,-38.52],"America/Bahia_Banderas":[20.8,-105.25],"America/Barbados":[13.1,-59.62],"America/Belem":[-1.45,-48.48],"America/Belize":[17.5,-88.2],"America/Blanc-Sablon":[51.42,-57.12],"America/Boa_Vista":[2.82,-60.67],"America/Bogota":[4.6,-74.08],"America/Boise":[43.61,-116.2],"America/Cambridge_Bay":[69.11,-105.05],"America/Campo_Grande":[-20.45,-54.62],"America/Cancun":[21.08,-86.77],"America/Caracas":[10.5,-66.93],"America/Cayenne":[4.93,-52.33],"America/Cayman":[19.3,-81.38],"America/Chicago":[41.85,-87.65],"America/Chihuahua":[28.63,-106.08],"America/Ciudad_Juarez":[31.73,-106.48],"America/Costa_Rica":[9.93,-84.08],"America/Coyhaique":[-45.57,-72.07],"America/Creston":[49.1,-116.52],"America/Cuiaba":[-15.58,-56.08],"America/Curacao":[12.18,-69.0],"America/Danmarkshavn":[76.77,-18.67],"America/Dawson":[64.07,-139.42],"America/Dawson_Creek":[55.77,-120.23],"America/Denver":[39.74,-104.98],"America/Detroit":[42.33,-83.05],"America/Dominica":[15.3,-61.4],"America/Edmonton":[53.55,-113.47],"America/Eirunepe":[-6.67,-69.87],"America/El_Salvador":[13.7,-89.2],"America/Fort_Nelson":[58.8,-122.7],"America/Fortaleza":[-3.72,-38.5],"America/Glace_Bay":[46.2,-59.95],"America/Goose_Bay":[53.33,-60.42],"America/Grand_Turk":[21.47,-71.13],"America/Grenada":[12.05,-61.75],"America/Guadeloupe":[16.23,-61.53],"America/Guatemala":[14.63,-90.52],"America/Guayaquil":[-2.17,-79.83],"America/Guyana":[6.8,-58.17],"America/Halifax":[44.65,-63.6],"America/Havana":[23.13,-82.37],"America/Hermosillo":[29.07,-110.97],"America/Indiana/Indianapolis":[39.77,-86.16],"America/Indiana/Knox":[41.3,-86.62],"America/Indiana/Marengo":[38.38,-86.34],"America/Indiana/Petersburg":[38.49,-87.28],"America/Indiana/Tell_City":[37.95,-86.76],"America/Indiana/Vevay":[38.75,-85.07],"America/Indiana/Vincennes":[38.68,-87.53],"America/Indiana/Winamac":[41.05,-86.6],"America/Inuvik":[68.35,-133.72],"America/Iqaluit":[63.73,-68.47],"America/Jamaica":[17.97,-76.79],"America/Juneau":[58.3,-134.42],"America/Kentucky/Louisville":[38.25,-85.76],"America/Kentucky/Monticello":[36.83,-84.85],"America/Kralendijk":[12.15,-68.28],"America/La_Paz":[-16.5,-68.15],"America/Lima":[-12.05,-77.05],"America/Los_Angeles":[34.05,-118.24],"America/Lower_Princes":[18.05,-63.05],"America/Maceio":[-9.67,-35.72],"America/Managua":[12.15,-86.28],"America/Manaus":[-3.13,-60.02],"America/Marigot":[18.07,-63.08],"America/Martinique":[14.6,-61.08],"America/Matamoros":[25.83,-97.5],"America/Mazatlan":[23.22,-106.42],"America/Menominee":[45.11,-87.61],"America/Merida":[20.97,-89.62],"America/Metlakatla":[55.13,-131.58],"America/Mexico_City":[19.4,-99.15],"America/Miquelon":[47.05,-56.33],"America/Moncton":[46.1,-64.78],"America/Monterrey":[25.67,-100.32],"America/Montevideo":[-34.91,-56.21],"America/Montserrat":[16.72,-62.22],"America/Nassau":[25.08,-77.35],"America/New_York":[40.71,-74.01],"America/Nome":[64.5,-165.41],"America/Noronha":[-3.85,-32.42],"America/North_Dakota/Beulah":[47.26,-101.78],"America/North_Dakota/Center":[47.12,-101.3],"America/North_Dakota/New_Salem":[46.84,-101.41],"America/Nuuk":[64.18,-51.73],"America/Ojinaga":[29.57,-104.42],"America/Panama":[8.97,-79.53],"America/Paramaribo":[5.83,-55.17],"America/Phoenix":[33.45,-112.07],"America/Port-au-Prince":[18.53,-72.33],"America/Port_of_Spain":[10.65,-61.52],"America/Porto_Velho":[-8.77,-63.9],"America/Puerto_Rico":[18.47,-66.11],"America/Punta_Arenas":[-53.15,-70.92],"America/Rankin_Inlet":[62.82,-92.08],"America/Recife":[-8.05,-34.9],"America/Regina":[50.4,-104.65],"America/Resolute":[74.7,-94.83],"America/Rio_Branco":[-9.97,-67.8],"America/Santarem":[-2.43,-54.87],"America/Santiago":[-33.45,-70.67],"America/Santo_Domingo":[18.47,-69.9],"America/Sao_Paulo":[-23.53,-46.62],"America/Scoresbysund":[70.48,-21.97],"America/Sitka":[57.18,-135.3],"America/St_Barthelemy":[17.88,-62.85],"America/St_Johns":[47.57,-52.72],"America/St_Kitts":[17.3,-62.72],"America/St_Lucia":[14.02,-61.0],"America/St_Thomas":[18.35,-64.93],"America/St_Vincent":[13.15,-61.23],"America/Swift_Current":[50.28,-107.83],"America/Tegucigalpa":[14.1,-87.22],"America/Thule":[76.57,-68.78],"America/Tijuana":[32.53,-117.02],"America/Toronto":[43.65,-79.38],"America/Tortola":[18.45,-64.62],"America/Vancouver":[49.27,-123.12],"America/Whitehorse":[60.72,-135.05],"America/Winnipeg":[49.88,-97.15],"America/Yakutat":[59.55,-139.73],"Antarctica/Casey":[-66.28,110.52],"Antarctica/Davis":[-68.58,77.97],"Antarctica/DumontDUrville":[-66.67,140.02],"Antarctica/Macquarie":[-54.5,158.95],"Antarctica/Mawson":[-67.6,62.88],"Antarctica/McMurdo":[-77.83,166.6],"Antarctica/Palmer":[-64.8,-64.1],"Antarctica/Rothera":[-67.57,-68.13],"Antarctica/Syowa":[-69.01,39.59],"Antarctica/Troll":[-72.01,2.53],"Antarctica/Vostok":[-78.4,106.9],"Arctic/Longyearbyen":[78.0,16.0],"Asia/Aden":[12.75,45.2],"Asia/Almaty":[43.25,76.95],"Asia/Amman":[31.95,35.93],"Asia/Anadyr":[64.75,177.48],"Asia/Aqtau":[44.52,50.27],"Asia/Aqtobe":[50.28,57.17],"Asia/Ashgabat":[37.95,58.38],"Asia/Atyrau":[47.12,51.93],"Asia/Baghdad":[33.35,44.42],"Asia/Bahrain":[26.38,50.58],"Asia/Baku":[40.38,49.85],"Asia/Bangkok":[13.75,100.52],"Asia/Barnaul":[53.37,83.75],"Asia/Beirut":[33.88,35.5],"Asia/Bishkek":[42.9,74.6],"Asia/Brunei":[4.93,114.92],"Asia/Chita":[52.05,113.47],"Asia/Colombo":[6.93,79.85],"Asia/Damascus":[33.5,36.3],"Asia/Dhaka":[23.72,90.42],"Asia/Dili":[-8.55,125.58],"Asia/Dubai":[25.3,55.3],"Asia/Dushanbe":[38.58,68.8],"Asia/Famagusta":[35.12,33.95],"Asia/Gaza":[31.5,34.47],"Asia/Hebron":[31.53,35.09],"Asia/Ho_Chi_Minh":[10.75,106.67],"Asia/Hong_Kong":[22.28,114.15],"Asia/Hovd":[48.02,91.65],"Asia/Irkutsk":[52.27,104.33],"Asia/Jakarta":[-6.17,106.8],"Asia/Jayapura":[-2.53,140.7],"Asia/Jerusalem":[31.78,35.22],"Asia/Kabul":[34.52,69.2],"Asia/Kamchatka":[53.02,158.65],"Asia/Karachi":[24.87,67.05],"Asia/Kathmandu":[27.72,85.32],"Asia/Khandyga":[62.66,135.55],"Asia/Kolkata":[22.53,88.37],"Asia/Krasnoyarsk":[56.02,92.83],"Asia/Kuala_Lumpur":[3.17,101.7],"Asia/Kuching":[1.55,110.33],"Asia/Kuwait":[29.33,47.98],"Asia/Macau":[22.2,113.54],"Asia/Magadan":[59.57,150.8],"Asia/Makassar":[-5.12,119.4],"Asia/Manila":[14.59,120.97],"Asia/Muscat":[23.6,58.58],"Asia/Nicosia":[35.17,33.37],"Asia/Novokuznetsk":[53.75,87.12],"Asia/Novosibirsk":[55.03,82.92],"Asia/Omsk":[55.0,73.4],"Asia/Oral":[51.22,51.35],"Asia/Phnom_Penh":[11.55,104.92],"Asia/Pontianak":[-0.03,109.33],"Asia/Pyongyang":[39.02,125.75],"Asia/Qatar":[25.28,51.53],"Asia/Qostanay":[53.2,63.62],"Asia/Qyzylorda":[44.8,65.47],"Asia/Riyadh":[24.63,46.72],"Asia/Sakhalin":[46.97,142.7],"Asia/Samarkand":[39.67,66.8],"Asia/Seoul":[37.55,126.97],"Asia/Shanghai":[31.23,121.47],"Asia/Singapore":[1.28,103.85],"Asia/Srednekolymsk":[67.47,153.72],"Asia/Taipei":[25.05,121.5],"Asia/Tashkent":[41.33,69.3],"Asia/Tbilisi":[41.72,44.82],"Asia/Tehran":[35.67,51.43],"Asia/Thimphu":[27.47,89.65],"Asia/Tokyo":[35.65,139.74],"Asia/Tomsk":[56.5,84.97],"Asia/Ulaanbaatar":[47.92,106.88],"Asia/Urumqi":[43.8,87.58],"Asia/Ust-Nera":[64.56,143.23],"Asia/Vientiane":[17.97,102.6],"Asia/Vladivostok":[43.17,131.93],"Asia/Yakutsk":[62.0,129.67],"Asia/Yangon":[16.78,96.17],"Asia/Yekaterinburg":[56.85,60.6],"Asia/Yerevan":[40.18,44.5],"Atlantic/Azores":[37.73,-25.67],"Atlantic/Bermuda":[32.28,-64.77],"Atlantic/Canary":[28.1,-15.4],"Atlantic/Cape_Verde":[14.92,-23.52],"Atlantic/Faroe":[62.02,-6.77],"Atlantic/Madeira":[32.63,-16.9],"Atlantic/Reykjavik":[64.15,-21.85],"Atlantic/South_Georgia":[-54.27,-36.53],"Atlantic/St_Helena":[-15.92,-5.7],"Atlantic/Stanley":[-51.7,-57.85],"Australia/Adelaide":[-34.92,138.58],"Australia/Brisbane":[-27.47,153.03],"Australia/Broken_Hill":[-31.95,141.45],"Australia/Darwin":[-12.47,130.83],"Australia/Eucla":[-31.72,128.87],"Australia/Hobart":[-42.88,147.32],"Australia/Lindeman":[-20.27,149.0],"Australia/Lord_Howe":[-31.55,159.08],"Australia/Melbourne":[-37.82,144.97],"Australia/Perth":[-31.95,115.85],"Australia/Sydney":[-33.87,151.22],"Europe/Amsterdam":[52.37,4.9],"Europe/Andorra":[42.5,1.52],"Europe/Astrakhan":[46.35,48.05],"Europe/Athens":[37.97,23.72],"Europe/Belgrade":[44.83,20.5],"Europe/Berlin":[52.5,13.37],"Europe/Bratislava":[48.15,17.12],"Europe/Brussels":[50.83,4.33],"Europe/Bucharest":[44.43,26.1],"Europe/Budapest":[47.5,19.08],"Europe/Busingen":[47.7,8.68],"Europe/Chisinau":[47.0,28.83],"Europe/Copenhagen":[55.67,12.58],"Europe/Dublin":[53.33,-6.25],"Europe/Gibraltar":[36.13,-5.35],"Europe/Guernsey":[49.45,-2.54],"Europe/Helsinki":[60.17,24.97],"Europe/Isle_of_Man":[54.15,-4.47],"Europe/Istanbul":[41.02,28.97],"Europe/Jersey":[49.18,-2.11],"Europe/Kaliningrad":[54.72,20.5],"Europe/Kirov":[58.6,49.65],"Europe/Kyiv":[50.43,30.52],"Europe/Lisbon":[38.72,-9.13],"Europe/Ljubljana":[46.05,14.52],"Europe/London":[51.51,-0.13],"Europe/Luxembourg":[49.6,6.15],"Europe/Madrid":[40.4,-3.68],"Europe/Malta":[35.9,14.52],"Europe/Mariehamn":[60.1,19.95],"Europe/Minsk":[53.9,27.57],"Europe/Monaco":[43.7,7.38],"Europe/Moscow":[55.76,37.62],"Europe/Oslo":[59.92,10.75],"Europe/Paris":[48.87,2.33],"Europe/Podgorica":[42.43,19.27],"Europe/Prague":[50.08,14.43],"Europe/Riga":[56.95,24.1],"Europe/Rome":[41.9,12.48],"Europe/Samara":[53.2,50.15],"Europe/San_Marino":[43.92,12.47],"Europe/Sarajevo":[43.87,18.42],"Europe/Saratov":[51.57,46.03],"Europe/Simferopol":[44.95,34.1],"Europe/Skopje":[41.98,21.43],"Europe/Sofia":[42.68,23.32],"Europe/Stockholm":[59.33,18.05],"Europe/Tallinn":[59.42,24.75],"Europe/Tirane":[41.33,19.83],"Europe/Ulyanovsk":[54.33,48.4],"Europe/Vaduz":[47.15,9.52],"Europe/Vatican":[41.9,12.45],"Europe/Vienna":[48.22,16.33],"Europe/Vilnius":[54.68,25.32],"Europe/Volgograd":[48.73,44.42],"Europe/Warsaw":[52.25,21.0],"Europe/Zagreb":[45.8,15.97],"Europe/Zurich":[47.38,8.53],"Indian/Antananarivo":[-18.92,47.52],"Indian/Chagos":[-7.33,72.42],"Indian/Christmas":[-10.42,105.72],"Indian/Cocos":[-12.17,96.92],"Indian/Comoro":[-11.68,43.27],"Indian/Kerguelen":[-49.35,70.22],"Indian/Mahe":[-4.67,55.47],"Indian/Maldives":[4.17,73.5],"Indian/Mauritius":[-20.17,57.5],"Indian/Mayotte":[-12.78,45.23],"Indian/Reunion":[-20.87,55.47],"Pacific/Apia":[-13.83,-171.73],"Pacific/Auckland":[-36.87,174.77],"Pacific/Bougainville":[-6.22,155.57],"Pacific/Chatham":[-43.95,-176.55],"Pacific/Chuuk":[7.42,151.78],"Pacific/Easter":[-27.15,-109.43],"Pacific/Efate":[-17.67,168.42],"Pacific/Fakaofo":[-9.37,-171.23],"Pacific/Fiji":[-18.13,178.42],"Pacific/Funafuti":[-8.52,179.22],"Pacific/Galapagos":[-0.9,-89.6],"Pacific/Gambier":[-23.13,-134.95],"Pacific/Guadalcanal":[-9.53,160.2],"Pacific/Guam":[13.47,144.75],"Pacific/Honolulu":[21.31,-157.86],"Pacific/Kanton":[-2.78,-171.72],"Pacific/Kiritimati":[1.87,-157.33],"Pacific/Kosrae":[5.32,162.98],"Pacific/Kwajalein":[9.08,167.33],"Pacific/Majuro":[7.15,171.2],"Pacific/Marquesas":[-9.0,-139.5],"Pacific/Midway":[28.22,-177.37],"Pacific/Nauru":[-0.52,166.92],"Pacific/Niue":[-19.02,-169.92],"Pacific/Norfolk":[-29.05,167.97],"Pacific/Noumea":[-22.27,166.45],"Pacific/Pago_Pago":[-14.27,-170.7],"Pacific/Palau":[7.33,134.48],"Pacific/Pitcairn":[-25.07,-130.08],"Pacific/Pohnpei":[6.97,158.22],"Pacific/Port_Moresby":[-9.5,147.17],"Pacific/Rarotonga":[-21.23,-159.77],"Pacific/Saipan":[15.2,145.75],"Pacific/Tahiti":[-17.53,-149.57],"Pacific/Tarawa":[1.42,173.0],"Pacific/Tongatapu":[-21.13,-175.2],"Pacific/Wake":[19.28,166.62],"Pacific/Wallis":[-13.3,-176.17]};

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
      // (Re)subscribe on first load, or whenever the weather entity transitions
      // from unavailable/absent to available. That single condition covers two
      // failure modes: the HA-restart race (the integration isn't loaded when
      // the card first subscribes, so the initial subscribe fails) AND a stale
      // subscription left behind after a socket reconnect (the server's
      // auto-resubscribe can drop while the integration reloads, stranding the
      // card on old data). Either way the card would otherwise sit on a stale
      // grid / "no forecast" error until the kiosk is refreshed.
      // `_subscribeForecast` drops any existing subscription first, so a genuine
      // recovery can't stack duplicate subscriptions.
      const st    = hass?.states?.[this._config.entity];
      const ready = !!st && st.state !== 'unavailable' && st.state !== 'unknown';
      if ((firstLoad || (ready && !this._prevReady)) && !this._subscribing) {
        this._subscribeForecast();
      }
      this._prevReady = ready;
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
      layout: 'grid',
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

    // If the editor changed the entity in place, drop the old subscription and
    // stale data so we resubscribe to the NEW entity instead of re-rendering the
    // previous entity's forecast.
    if (this._subscribedEntity && this._subscribedEntity !== this._config.entity) {
      this._unsubscribeForecast();
      this._haveForecast = false;
      this._lastForecast = null;
      if (this._errorTimer) { clearTimeout(this._errorTimer); this._errorTimer = null; }
    }

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

  // Current temperature for the header and the spiral centre. Prefers the
  // optional local `temperature_entity`, else the weather entity's own reading.
  // Returns the value rounded in the display unit, the unit letter, and the raw
  // °F value (for colour mapping) — or null when no temperature is available.
  _currentTemp() {
    const weatherState = this._hass?.states[this._config?.entity];
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
    if (temp == null) return null;
    const displayUnit = this._config?.temperature_unit || 'F';
    const tempF = nativeUnit.includes('F') ? temp : temp * 9 / 5 + 32;
    const value = displayUnit === 'F' ? Math.round(tempF) : Math.round((tempF - 32) * 5 / 9);
    return { value, unit: displayUnit, f: tempF };
  }

  _updateCurrent() {
    const el = this.shadowRoot?.getElementById('card-current');
    if (!el) return;

    let text = '';
    // The spiral shows the current temperature in its centre, so suppress the
    // header's current reading (temp and conditions) entirely in that layout.
    if (this._config?.show_current !== false && this._config?.layout !== 'spiral') {
      const ct = this._currentTemp();
      if (ct) {
        const weatherState = this._hass?.states[this._config?.entity];
        const conditionMap = { partlycloudy: 'Partly Cloudy', 'clear-night': 'Clear' };
        const rawCondition = (weatherState?.state || '').toLowerCase();
        const condition = (!weatherState || rawCondition === 'unknown' || rawCondition === 'unavailable') ? ''
          : conditionMap[weatherState.state] || rawCondition.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        text = condition ? `${ct.value}°${ct.unit}  ${condition}` : `${ct.value}°${ct.unit}`;
      }
    }

    // `set hass` fires this on every state update (many per minute on a busy
    // instance). Skip the DOM write when the header text is unchanged so an
    // e-ink/kiosk display isn't repainted needlessly.
    if (el.textContent === text) return;
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
    // disconnectedCallback tears the ResizeObserver down; recreate it if the
    // card is moved/re-attached in the DOM (e.g. dashboard layout edits).
    if (!this._ro && this.shadowRoot) {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this);
    }
    if (this._hass && this._config && !this._unsubForecast) {
      this._subscribeForecast();
    }
  }

  disconnectedCallback() {
    this._unsubscribeForecast();
    if (this._errorTimer) { clearTimeout(this._errorTimer); this._errorTimer = null; }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  // The spiral is square, so it needs far more vertical room than the wide grid.
  getCardSize() { return this._config?.layout === 'spiral' ? 9 : 4; }

  getGridOptions() {
    return this._config?.layout === 'spiral'
      ? { columns: 12, rows: 9, min_columns: 6, min_rows: 4 }
      : { columns: 12, rows: 4, min_columns: 6, min_rows: 2 };
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
    this._subscribedEntity = this._config.entity;

    try {
      const unsub = await this._hass.connection.subscribeMessage(
        (event) => this._render(event.forecast ?? []),
        {
          type: 'weather/subscribe_forecast',
          forecast_type: 'hourly',
          entity_id: this._config.entity,
        }
      );
      // The card may have been detached (view switch, layout edit) while the
      // subscribe was in flight. If so, cancel immediately instead of leaking a
      // live subscription onto a dead element.
      if (!this.isConnected) {
        unsub();
      } else {
        this._unsubForecast = unsub;
      }
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
      // The socket may already be closing (HA restart / reconnect); don't let a
      // throw from the unsub callback bubble out of a lifecycle handler.
      try { this._unsubForecast(); } catch (e) { /* already gone */ }
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
        .spiral-wrap { width: 100%; padding-top: 4px; }
        .spiral-wrap svg { width: 100%; height: auto; display: block; }
        .spiral-label {
          fill: var(--primary-text-color, #ffffff);
          font-weight: 500;
        }
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
    if (!el) return;
    // Build via textContent, not innerHTML: `msg` interpolates the configured
    // entity id, so an entity string containing markup would otherwise inject
    // into the shadow DOM.
    el.textContent = '';
    const div = document.createElement('div');
    div.className = 'error';
    div.style.gridColumn = '1/-1';
    div.textContent = msg;
    el.appendChild(div);
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
    // Guard against two custom_color_scale stops at the same temperature, which
    // would make the span zero and yield NaN (→ a transparent, unstyled cell).
    const span = hi[0] - lo[0];
    const t    = span === 0 ? 0 : Math.max(0, Math.min(1, (f - lo[0]) / span));
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
  // Densify a sparse forecast to one point per hour by linear interpolation
  // between the known points. Opt-in via `interpolate: true`. Temperature and
  // precipitation probability are interpolated linearly (in the entity's native
  // unit — normalization happens later); the condition, which drives the precip
  // symbol, is carried from the nearer known hour. Never extrapolates before the
  // first or after the last known point, so trailing gaps stay empty rather than
  // fabricated.
  // -------------------------------------------------------------------------
  _interpolateForecast(forecast) {
    const HOUR = 3600000;
    const pts = forecast
      .map(f => ({ f, t: new Date(f.datetime).getTime() }))
      .filter(p => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
    if (pts.length < 2) return forecast;

    const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      out.push(pts[i].f);
      const a = pts[i], b = pts[i + 1];
      if (!b) break;
      const gap = Math.round((b.t - a.t) / HOUR);
      if (gap <= 1) continue;                          // already hourly (or denser)
      const ta = num(a.f.temperature), tb = num(b.f.temperature);
      const pa = num(a.f.precipitation_probability), pb = num(b.f.precipitation_probability);
      for (let h = 1; h < gap; h++) {
        const frac = h / gap;
        const lerp = (x, y) => (x == null || y == null) ? (x ?? y) : x + (y - x) * frac;
        const temp = lerp(ta, tb);
        if (temp == null) continue;                    // nothing to show; leave the gap
        out.push({
          datetime: new Date(a.t + h * HOUR).toISOString(),
          temperature: temp,
          precipitation_probability: (pa == null && pb == null) ? undefined
            : Math.round(lerp(pa ?? 0, pb ?? 0)),
          condition: frac < 0.5 ? a.f.condition : b.f.condition,
        });
      }
    }
    return out;
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

    // Optionally fill sparse forecasts (e.g. Meteo-France, which drops to
    // 3-hourly then 6-hourly after ~36 h) so the grid isn't full of holes.
    if (this._config.interpolate) forecast = this._interpolateForecast(forecast);

    // Most integrations hand over only the current hour onward, so today's
    // elapsed hours simply arrive missing and their cells render empty. A few
    // publish the whole day from midnight instead, which would fill those cells
    // in and make the same card look different depending on the provider. Drop
    // what has already elapsed so today reads identically everywhere. The
    // comparison is in absolute time, so it holds whatever the card's
    // `timezone` is; the in-progress hour is kept.
    //
    // This runs AFTER interpolation on purpose. A sparse feed's nearest known
    // point is often the bucket already in progress (a 3-hourly source at 13:00
    // still has 12:00 as its latest point); densifying first lets that point
    // anchor the current hour, and only then do the genuinely elapsed hours go.
    // Dropping first would strip the anchor and leave the holes issue #5 fixed.
    const elapsedBefore = Date.now() - 3_600_000;
    const upcoming = forecast.filter(f => new Date(f.datetime).getTime() > elapsedBefore);
    // If nothing survives — a stale feed, or a clock well ahead of the data —
    // keep what we were given rather than blanking the card, in the same spirit
    // as ignoring empty pushes above.
    if (upcoming.length) forecast = upcoming;

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
        if (e.temp === mn) {
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

    // Sunrise/sunset, shared by grid gaps and spiral markers. Each mark carries
    // the rounded hour column (for the gap) and the exact HH:MM time for
    // labeling. Computed from coordinates (or the `sunrise`/`sunset` overrides),
    // for the current day, in the card's timezone.
    let sunMarks = [];
    if (this._config.sun_gaps) {
      const tzHM = (d) => {
        if (tz) {
          const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
          return { h: parseInt(p.find(x => x.type === 'hour').value), m: parseInt(p.find(x => x.type === 'minute').value) };
        }
        return { h: d.getHours(), m: d.getMinutes() };
      };
      const oride = (v) => (v == null || Number.isNaN(parseInt(v))) ? null : { h: (((parseInt(v)) % 24) + 24) % 24, m: 0 };
      let srHM = oride(this._config.sunrise), ssHM = oride(this._config.sunset);
      if (srHM == null || ssHM == null) {
        // Coordinates — the card's own if given, else the Home Assistant
        // location. Only fall back to the HA location for a home-timezone card;
        // a card with a different `timezone` is a remote location where home
        // coordinates would give the wrong sun times, so leave lat/lon unset.
        // Coordinate precedence: explicit config → the Home Assistant location
        // (home-timezone cards only) → the card timezone's reference location
        // (TZ_COORDS). The last is a best-effort fallback so a remote card shows
        // gaps from just its `timezone`; for a zone spanning many cities (e.g.
        // America/New_York) it resolves to the zone's reference city — set
        // latitude/longitude to pin the exact spot.
        const homeLike = !tz || tz === this._hass?.config?.time_zone;
        const fb = (!homeLike && tz) ? TZ_COORDS[tz] : null;
        const lat = parseFloat(this._config.latitude ?? (homeLike ? this._hass?.config?.latitude : fb?.[0]));
        const lon = parseFloat(this._config.longitude ?? (homeLike ? this._hass?.config?.longitude : fb?.[1]));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const t = sunTimes(new Date(), lat, lon);
          if (srHM == null && t.sunrise) srHM = tzHM(t.sunrise);
          if (ssHM == null && t.sunset)  ssHM = tzHM(t.sunset);
        } else if (!this._warnedSunCoords) {
          this._warnedSunCoords = true;
          console.warn(
            `weather-mosaic-card: "Mark Sunrise & Sunset" is enabled but no ` +
            `coordinates could be resolved for "${this._config.entity}". ` +
            `Set latitude and longitude in the card configuration` +
            (tz ? ` (timezone "${tz}" is not in the built-in location table).` : '.')
          );
        }
      }
      // Label the exact time in the same 12/24 style as the hour labels.
      const fmtTime = (h, m) => this._config.time_format === '12'
        ? `${(h % 12) || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`
        : `${h}:${String(m).padStart(2, '0')}`;
      const toMark = (hm) => hm == null ? null : { col: Math.round(hm.h + hm.m / 60) % 24, time: fmtTime(hm.h, hm.m), h: hm.h, m: hm.m };
      // Dedupe by column: if sunrise and sunset round to the same hour (extreme
      // latitude near the polar-day boundary, or a same-hour override), keep one
      // mark so painters don't emit a zero-width column / doubled label.
      [toMark(srHM), toMark(ssHM)].forEach(mk => { if (mk && !sunMarks.some(x => x.col === mk.col)) sunMarks.push(mk); });
    }
    const gw = parseFloat(this._config.sun_gap_width);
    const gapPx = Number.isFinite(gw) ? Math.max(0, gw) : 2;

    if (this._config.layout === 'spiral') {
      this._paintSpiral(grid, dayLabels, DAYS, nowHour, sunMarks, gapPx);
      return;
    }
    this._paintGrid(grid, dayLabels, DAYS, sunMarks, gapPx);
  }

  // -------------------------------------------------------------------------
  // Paint: rectangular grid (default) — one row per day, one column per hour
  // -------------------------------------------------------------------------
  _paintGrid(grid, dayLabels, DAYS, sunMarks = [], gapPx = 2) {
    const mosaic = this.shadowRoot.getElementById('grid');
    mosaic.className = 'mosaic-grid';
    mosaic.innerHTML = '';

    // Hour labels and sunrise/sunset time labels are controlled independently.
    // `hours` (above/below/none) governs the 6a/12p/6p ticks; `sun_labels`
    // governs the exact sunrise/sunset times and defaults to matching the hour
    // labels (so existing configs are unchanged) but can be forced on or off.
    const showHourLabels = this._config.hours !== 'none' && this._config.hours !== false;
    const showSunLabels = !!this._config.sun_gaps &&
      (this._config.sun_labels != null ? !!this._config.sun_labels : showHourLabels);

    // Thin vertical gaps before the sunrise/sunset columns (0–23, deduped).
    const marks = (sunMarks || []).filter(m => m && m.col >= 0 && m.col <= 23);
    const gaps = marks.map(m => m.col).sort((a, b) => a - b);
    if (gaps.length) {
      const parts = ['max-content']; let prev = 0;
      for (const gc of gaps) {
        if (gc - prev > 0) parts.push(`repeat(${gc - prev}, minmax(0, 1fr))`); // no repeat(0)
        parts.push(`${gapPx}px`);
        prev = gc;
      }
      if (24 - prev > 0) parts.push(`repeat(${24 - prev}, minmax(0, 1fr))`);
      mosaic.style.gridTemplateColumns = parts.join(' ');
    } else {
      mosaic.style.gridTemplateColumns = '';
    }
    const appendGap = () => { const s = document.createElement('div'); s.className = 'sun-gap'; mosaic.appendChild(s); };

    const appendHoursRow = () => {
      mosaic.appendChild(document.createElement('div')); // spacer for day-label column
      for (let h = 0; h < 24; h++) {
        if (gaps.includes(h)) appendGap();
        const div = document.createElement('div');
        div.className = 'hour-label';
        // At a sunrise/sunset column show its exact time (when sun labels are on);
        // otherwise the usual 6a/12p/6p label (when hour labels are on) — but not
        // right beside a shown sun label, which would overlap.
        const mark = showSunLabels ? marks.find(m => m.col === h) : null;
        let text = null;
        if (mark) text = mark.time;
        else if (showHourLabels && [6, 12, 18].includes(h) &&
                 !(showSunLabels && marks.some(m => Math.abs(m.col - h) <= 1))) text = this._formatHour(h);
        if (text != null) {
          const span = document.createElement('span');
          span.textContent = text;
          div.appendChild(span);
        }
        mosaic.appendChild(div);
      }
    };

    // Reserve the label row when either kind of label is shown. It sits below
    // only when hour labels are explicitly placed below; otherwise (including a
    // sun-labels-only row with `hours: none`) it sits above.
    const rowWanted = showHourLabels || showSunLabels;
    const rowBelow = this._config.hours === 'below';
    if (rowWanted && !rowBelow) appendHoursRow();

    for (let d = 0; d < DAYS; d++) {
      const dl = document.createElement('div');
      dl.className   = 'day-label';
      dl.textContent = dayLabels[d] || '';
      mosaic.appendChild(dl);

      for (let h = 0; h < 24; h++) {
        if (gaps.includes(h)) appendGap();
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
      }
    }

    if (rowWanted && rowBelow) appendHoursRow();
  }

  // -------------------------------------------------------------------------
  // Paint: spiral — one 360° wrap per day, winding inward into the future
  // -------------------------------------------------------------------------
  // Because one turn is exactly 24 hours, a given hour always lands at the same
  // angle on every day (midnight at 12 o'clock), so the same hour on successive
  // days lines up radially — the polar equivalent of the grid's columns.
  //
  // The spiral starts at *now*: the outer edge is anchored to the current hour,
  // and today's already-elapsed hours are not drawn, so no radius is wasted on
  // an empty outer ring. It then winds inward over the remaining forecast at a
  // constant radial thickness per turn (a true Archimedean spiral); the natural
  // loss of circumference still makes turns further ahead cover less area.
  _paintSpiral(grid, dayLabels, DAYS, nowHour, sunMarks = [], gapPx = 2) {
    const SIZE  = 1000;                 // viewBox units; the SVG scales to fit
    const cx    = SIZE / 2, cy = SIZE / 2;
    // `above`/`below` have no meaning on a circle — the labels always ring the
    // outside — but `none` hides them, as it does in the grid. With no labels to
    // make room for, the spiral grows to fill the space they would have used.
    // Hour labels (`hours`) and sunrise/sunset time labels (`sun_labels`) are
    // independent; `sun_labels` defaults to matching the hour labels. The rim is
    // reserved (and the spiral shrinks) whenever either kind of label is shown.
    const showHourLabels = this._config.hours !== 'none' && this._config.hours !== false;
    const showSunLabels = !!this._config.sun_gaps &&
      (this._config.sun_labels != null ? !!this._config.sun_labels : showHourLabels);
    const R_OUT = SIZE * ((showHourLabels || showSunLabels) ? 0.44 : 0.485);
    const R_IN  = R_OUT * 0.18;         // centre hole where the spiral ends
    const STEPS = 6;                    // polyline segments per hour cell
    // Radial gap between turns, as a multiple of the default: `spiral_gap: 0`
    // removes it (turns abut into a solid disk), 2 doubles it. Invalid or
    // absent falls back to the default.
    const gapMult  = parseFloat(this._config.spiral_gap);
    const WRAP_GAP = SIZE * 0.0025 * (Number.isFinite(gapMult) ? Math.max(0, gapMult) : 1);
    const scale = parseFloat(this._config.font_scale) || 1.0;

    // `p` is day-position (0 = today's midnight). Its distance from now is
    // p - nowTurn; radius shrinks linearly from R_OUT at now over the remaining
    // forecast span (so every turn is the same radial thickness), plus one turn
    // of headroom so the innermost ring clears the centre.
    const nowTurn  = nowHour / 24;
    const SPAN     = (DAYS - nowTurn) + 1;
    const radius   = (p) => R_IN + (R_OUT - R_IN) * (1 - (p - nowTurn) / SPAN);
    // Day-position of the outermost (nearest-now) ring present at angle hf — the
    // smallest whole-day offset from hf that isn't already in the past.
    const outerPos = (hf) => Math.max(0, Math.ceil(nowTurn - hf)) + hf;

    // One shared font size for day names and min/max numbers. Thickness is now
    // constant per turn, so a single value covers every ring (floor for small
    // cards). Precip markers and the centre temperature scale off this.
    const BAND     = (R_OUT - R_IN) / SPAN;
    const LABEL_FS = Math.max(BAND * 0.46, SIZE * 0.02) * scale;
    // hf = fraction through the day; 0 is midnight at 12 o'clock, clockwise.
    const xy = (r, hf) => {
      const a = hf * 2 * Math.PI;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    };
    const ps  = (r, hf) => xy(r, hf).map(n => n.toFixed(1)).join(',');
    const esc = (s) => String(s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const cells = [], labels = [];

    for (let d = 0; d < DAYS; d++) {
      for (let h = 0; h < 24; h++) {
        // The spiral begins at now — drop hours that have entirely elapsed so
        // today's past hours don't consume an empty outer ring.
        if (d * 24 + h + 1 <= nowHour) continue;
        const h0 = h / 24, h1 = (h + 1) / 24;

        const outer = [], inner = [];
        for (let i = 0; i <= STEPS; i++) {
          const hf = h0 + (h1 - h0) * (i / STEPS);
          outer.push(ps(radius(d + hf), hf));
          // Lift the inner edge by WRAP_GAP so a sliver of background shows
          // between this turn and the next, making the spiral read as a spiral
          // rather than a solid disk.
          inner.push(ps(radius(d + 1 + hf) + WRAP_GAP, hf));
        }

        const e = grid[d]?.[h];
        const { bg, fg } = e
          ? this._tempToColor(e.temp)
          : { bg: 'rgba(128,128,128,0.08)', fg: '' };

        // Stroking each cell in its own fill colour hides the hairline seams
        // antialiasing would otherwise leave between neighbouring paths.
        cells.push(
          `<path d="M${outer.join('L')}L${inner.reverse().join('L')}Z" ` +
          `fill="${bg}" stroke="${bg}" stroke-width="1"/>`
        );

        if (!e) continue;

        const hfMid  = (h0 + h1) / 2;
        const rOut   = radius(d + hfMid);
        const rIn    = radius(d + 1 + hfMid);
        const thick  = rOut - rIn;
        const [tx, ty] = xy((rOut + rIn) / 2, hfMid);

        // The day name occupies the midnight cell of its own ring, so skip that
        // cell's own marker rather than stacking text on text.
        const isDaySlot = h === 0 && !!dayLabels[d];
        if (isDaySlot) {
          // Type is sized off band thickness, but with a floor: the inner rings
          // are thin enough that pure proportional scaling goes unreadable. The
          // text may spill sideways into neighbouring hours, which is harmless —
          // only the band's thickness actually constrains it.
          // Centre every day name on the vertical axis, so the column lines up
          // under the "24" hour label at the top rather than drifting inward
          // with the shrinking radius.
          labels.push(
            `<text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${fg}" ` +
            `font-size="${LABEL_FS.toFixed(1)}" font-weight="700" text-anchor="middle" ` +
            `dominant-baseline="central">${esc((dayLabels[d] || '').slice(0, 2))}</text>`
          );
          continue;
        }

        let label = '';
        let isPrecip = false;
        if (this._config.show_minmax !== false && (e.isHigh || e.isLow)) {
          label = this._config.temperature_unit === 'C'
            ? Math.round((e.temp - 32) * 5 / 9)
            : Math.round(e.temp);
        } else if (this._config.show_precip !== false) {
          label = this._precipSymbol(e);
          isPrecip = true;
        }
        if (label === '' || label === null || label === undefined) continue;

        // Min/max numbers share the day-name size; precip markers are a single
        // glyph, so they run larger without overflowing the cell.
        const cellFs = isPrecip
          ? Math.max(thick * 0.64, SIZE * 0.027) * scale
          : LABEL_FS;
        labels.push(
          `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${fg}" ` +
          `font-size="${cellFs.toFixed(1)}" font-weight="700" text-anchor="middle" ` +
          `dominant-baseline="central">${esc(label)}</text>`
        );
      }
    }

    // Current temperature in the centre hole — coloured by the active scale,
    // bare number. Sized to fit the hole (radius R_IN, constant regardless of
    // the day count) so it stays comfortable whether 2 or 7 days are shown: the
    // font is the largest whose bounding box fits inside a circle of radius
    // R_IN·0.86, adapting to the number of digits (e.g. "5" vs "-12" vs "100").
    const ct = this._currentTemp();
    if (ct && this._config.show_current !== false) {
      const txt = `${ct.value}`;
      const nChars = Math.max(2, txt.length);          // don't oversize single digits
      const centerFs = R_IN * 0.52 /
        Math.hypot(nChars * 0.6 / 2, 0.72 / 2);        // 0.6 = char width, 0.72 = cap height (per em)
      labels.push(
        `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" ` +
        `fill="${this._tempToColor(ct.f).bg}" font-size="${centerFs.toFixed(1)}" ` +
        `font-weight="700" text-anchor="middle" dominant-baseline="central">` +
        `${esc(txt)}</text>`
      );
    }

    // The spiral marks the even hours around its rim as a clock face, midnight
    // at the top, running clockwise. This ring is spiral-only (the grid keeps
    // its sparse above/below hour labels) and follows `time_format`.
    // Each label follows the spiral's own outer edge at its hour angle — the
    // outermost ring present there — not a fixed circle, so it hugs the rim the
    // whole way around and steps at the "now" seam with the spiral itself.
    const hourFsN = SIZE * 0.023 * scale;
    const hourFs = hourFsN.toFixed(1);
    const sunCols = (this._config.sun_gaps ? sunMarks : []).map(m => m.col);
    const cdist = (a, b) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };
    const ringLabel = (h, txt, extraOff = 0) => {
      const [hx, hy] = xy(radius(outerPos(h / 24)) + SIZE * 0.032 + extraOff, h / 24);
      return `<text x="${hx.toFixed(1)}" y="${hy.toFixed(1)}" class="spiral-label" ` +
             `font-size="${hourFs}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text>`;
    };
    // Even-hour clock labels, minus any within an hour of a sun mark (overlap).
    // Respects `time_format`: 24h shows 24/2/4… (24 at the top for midnight);
    // 12h shows 12a/2a…12p/2p… via the shared hour formatter.
    const ringHour = (h) => this._config.time_format === '12' ? this._formatHour(h) : (h === 0 ? 24 : h);
    const hours = !showHourLabels ? [] : [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
      .filter(h => !(showSunLabels && sunCols.some(c => cdist(c, h) <= 1)))
      .map(h => ringLabel(h, ringHour(h)));
    // Exact sunrise/sunset times on the ring, in the same 12/24 style. Push them
    // out by the radial part of their (longer) width so the inner edge clears
    // the rim like the short hour labels do; strongest at the 3/9-o'clock sides.
    const sunLabels = !showSunLabels ? []
      : sunMarks.map(m => {
          const extra = String(m.time).length * hourFsN * 0.13 * Math.abs(Math.sin(m.col / 24 * 2 * Math.PI));
          return ringLabel(m.col, m.time, extra);
        });

    // Sunrise/sunset markers: radial gaps cutting across the spiral at the
    // sunrise and sunset angles (the polar analog of the grid's column gaps).
    // Drawn in the card background colour; non-scaling-stroke keeps the width in
    // screen pixels regardless of how the SVG scales.
    const sunGaps = (this._config.sun_gaps && gapPx > 0)
      ? sunMarks.map(m => {
          const [x1, y1] = xy(R_IN, m.col / 24);
          const [x2, y2] = xy(R_OUT + SIZE * 0.008, m.col / 24);
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
            `stroke="var(--ha-card-background, var(--card-background-color, #1c1c1c))" ` +
            `stroke-width="${gapPx}" vector-effect="non-scaling-stroke" stroke-linecap="butt"/>`;
        }).join('')
      : '';

    const mosaic = this.shadowRoot.getElementById('grid');
    mosaic.className = 'spiral-wrap';
    mosaic.innerHTML =
      `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" ` +
      `shape-rendering="geometricPrecision">${cells.join('')}${sunGaps}${labels.join('')}` +
      `${hours.join('')}${sunLabels.join('')}</svg>`;
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
        .docs {
          border-top: 1px solid var(--divider-color, #ccc);
          padding-top: 12px;
          font-size: 0.8rem;
          line-height: 1.5;
          color: var(--secondary-text-color, #888);
        }
        .docs a {
          color: var(--primary-color, #03a9f4);
          text-decoration: none;
        }
        .docs a:hover { text-decoration: underline; }
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
          <label>Layout</label>
          <select id="layout">
            <option value="grid">Grid (one row per day)</option>
            <option value="spiral">Spiral (one turn per day)</option>
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
        <div class="switch-row">
          <span>Fill Gaps in Sparse Forecasts</span>
          <ha-switch id="interpolate"></ha-switch>
        </div>
        <div class="switch-row">
          <span>Mark Sunrise &amp; Sunset (gaps)</span>
          <ha-switch id="sun_gaps"></ha-switch>
        </div>
        <div id="sun-fields" style="display:none; flex-direction:column; gap:12px; padding:12px; border:1px solid var(--divider-color,#ccc); border-radius:6px;">
          <div style="font-size:0.8rem; line-height:1.5; color:var(--secondary-text-color,#888);">
            Sunrise &amp; sunset are computed from a location. A card for <strong>your own home
            needs nothing here</strong>. For a <strong>different</strong> location, set its
            Timezone — coordinates are then estimated from that timezone. Set Latitude &amp;
            Longitude to pin the exact spot (recommended for large timezones such as
            <em>America/New&nbsp;York</em>).
          </div>
          <div>
            <label>Timezone (IANA, e.g. Europe/Paris)</label>
            <input id="timezone" type="text" placeholder="Same as Home Assistant" style="width:100%;padding:8px;border:1px solid var(--divider-color,#ccc);border-radius:4px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#000);font-size:1rem;box-sizing:border-box;" />
          </div>
          <div style="display:flex; gap:12px;">
            <div style="flex:1;">
              <label>Latitude</label>
              <input id="latitude" type="text" inputmode="decimal" placeholder="auto" style="width:100%;padding:8px;border:1px solid var(--divider-color,#ccc);border-radius:4px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#000);font-size:1rem;box-sizing:border-box;" />
            </div>
            <div style="flex:1;">
              <label>Longitude</label>
              <input id="longitude" type="text" inputmode="decimal" placeholder="auto" style="width:100%;padding:8px;border:1px solid var(--divider-color,#ccc);border-radius:4px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#000);font-size:1rem;box-sizing:border-box;" />
            </div>
          </div>
        </div>
        <div>
          <label>Days to show</label>
          <select id="days">
            ${[1,2,3,4,5,6,7].map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="docs">
          Further options — your own precipitation symbols, hour-label
          placement, sunrise/sunset gap width and font size — are available in YAML.
          <a href="https://github.com/whalleyms/weather-mosaic-card#advanced-yaml-options"
             target="_blank" rel="noopener noreferrer">Advanced options &amp; documentation ↗</a>
        </div>
      </div>`;

    this.shadowRoot.getElementById('title').addEventListener('input', e => {
      this._changed('title', e.target.value);
    });
    this._populateEntitySelect();
    this._populateTempEntitySelect();

    ['entity', 'temperature_entity', 'temperature_unit', 'layout', 'color_scale', 'days'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', e => {
        this._changed(id, e.target.value);
      });
    });

    ['show_current', 'show_minmax', 'show_precip', 'interpolate', 'sun_gaps'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', e => {
        this._changed(id, e.target.checked);
      });
    });

    ['timezone', 'latitude', 'longitude'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('input', e => {
        this._changed(id, e.target.value.trim());
      });
    });

    // Reveal the location fields only when sunrise/sunset marking is on.
    this.shadowRoot.getElementById('sun_gaps').addEventListener('change', () => {
      this._toggleSunFields();
    });
  }

  _toggleSunFields() {
    if (!this.shadowRoot) return;
    const box = this.shadowRoot.getElementById('sun_gaps');
    const el = this.shadowRoot.getElementById('sun-fields');
    if (el && box) el.style.display = box.checked ? 'flex' : 'none';
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
    sel('layout',           this._config.layout || 'grid');
    sel('color_scale',      this._config.color_scale || 'mosaic');
    sel('days',             this._config.days || '7');
    sel('timezone',         this._config.timezone || '');
    sel('latitude',         this._config.latitude != null ? String(this._config.latitude) : '');
    sel('longitude',        this._config.longitude != null ? String(this._config.longitude) : '');

    const chk = (id, val) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.checked = val;
    };
    chk('show_current', this._config.show_current !== false);
    chk('show_minmax',  this._config.show_minmax  !== false);
    chk('show_precip',  this._config.show_precip  !== false);
    chk('interpolate', !!this._config.interpolate);
    chk('sun_gaps', !!this._config.sun_gaps);
    this._toggleSunFields();
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
