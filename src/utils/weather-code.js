const WEATHER_CODES = {
  0: { label: 'Ciel dégagé', kind: 'clear' },
  1: { label: 'Globalement dégagé', kind: 'clear' },
  2: { label: 'Partiellement nuageux', kind: 'cloudy' },
  3: { label: 'Couvert', kind: 'cloudy' },
  45: { label: 'Brouillard', kind: 'fog' },
  48: { label: 'Brouillard givrant', kind: 'fog' },
  51: { label: 'Bruine légère', kind: 'rain' },
  53: { label: 'Bruine modérée', kind: 'rain' },
  55: { label: 'Bruine dense', kind: 'rain' },
  56: { label: 'Bruine verglaçante', kind: 'rain' },
  57: { label: 'Forte bruine verglaçante', kind: 'rain' },
  61: { label: 'Pluie faible', kind: 'rain' },
  63: { label: 'Pluie modérée', kind: 'rain' },
  65: { label: 'Forte pluie', kind: 'rain' },
  66: { label: 'Pluie verglaçante', kind: 'rain' },
  67: { label: 'Forte pluie verglaçante', kind: 'rain' },
  71: { label: 'Faibles chutes de neige', kind: 'snow' },
  73: { label: 'Chutes de neige', kind: 'snow' },
  75: { label: 'Fortes chutes de neige', kind: 'snow' },
  77: { label: 'Grains de neige', kind: 'snow' },
  80: { label: 'Averses légères', kind: 'rain' },
  81: { label: 'Averses modérées', kind: 'rain' },
  82: { label: 'Fortes averses', kind: 'rain' },
  85: { label: 'Averses de neige faibles', kind: 'snow' },
  86: { label: 'Fortes averses de neige', kind: 'snow' },
  95: { label: 'Orage', kind: 'storm' },
  96: { label: 'Orage avec grêle légère', kind: 'storm' },
  99: { label: 'Orage avec forte grêle', kind: 'storm' },
};

export function describeWeather(code, isDay) {
  const weather = WEATHER_CODES[code] || { label: 'Conditions variables', kind: 'cloudy' };

  return {
    ...weather,
    isNight: !isDay,
    icon: iconFor(weather.kind, isDay),
  };
}

function iconFor(kind, isDay) {
  if (!isDay && ['clear', 'cloudy', 'fog'].includes(kind)) return '☾';

  return {
    clear: '☀',
    cloudy: '☁',
    fog: '≋',
    rain: '☔',
    storm: 'ϟ',
    snow: '❄',
  }[kind] || '◌';
}
