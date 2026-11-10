export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('请输入目标网址');

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch (error) {
    throw new Error('网址格式不正确');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http / https 网址');
  }

  return parsed.toString();
}

export function normalizeSameSite(value) {
  if (!value) return 'unspecified';
  const text = String(value).toLowerCase();
  if (text === 'none' || text === 'no_restriction') return 'no_restriction';
  if (text === 'lax') return 'lax';
  if (text === 'strict') return 'strict';
  return 'unspecified';
}

export function normalizeExpiration(value) {
  if (value === undefined || value === null || value === '') return null;

  let timestamp = null;
  if (typeof value === 'number') {
    timestamp = value;
  } else if (/^\d+(\.\d+)?$/.test(String(value))) {
    timestamp = Number(value);
  } else {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) timestamp = date.getTime();
  }

  if (timestamp === null || timestamp <= 0) return null;
  return timestamp > 1e12 ? timestamp / 1000 : timestamp;
}

function normalizeCookieList(data) {
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (!item || typeof item !== 'object' || !item.name) return null;
        return {
          name: String(item.name),
          value: item.value === undefined || item.value === null ? '' : String(item.value),
          domain: item.domain || undefined,
          path: item.path || undefined,
          secure: Boolean(item.secure),
          httpOnly: Boolean(item.httpOnly),
          sameSite: item.sameSite,
          expirationDate: item.expirationDate !== undefined ? item.expirationDate : item.expires
        };
      })
      .filter(Boolean);
  }

  if (data && typeof data === 'object') {
    return Object.keys(data)
      .filter((name) => name)
      .map((name) => ({
        name,
        value: data[name] === undefined || data[name] === null ? '' : String(data[name])
      }));
  }

  return [];
}

/** 支持三种写法：请求头字符串 a=1; b=2、每行一个 a=1、JSON（对象或数组） */
export function parseCookieText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[') || raw.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error('cookie 不是合法的 JSON，请检查格式');
    }
    const list = normalizeCookieList(data);
    if (!list.length) throw new Error('cookie JSON 中没有可用的键值');
    return list;
  }

  const pairs = raw
    .split(/[\n\r;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return null;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim().replace(/^"(.*)"$/, '$1');
      return name ? { name, value } : null;
    })
    .filter(Boolean);

  if (!pairs.length) throw new Error('cookie 格式无法识别，请使用 a=1; b=2 或 JSON');
  return pairs;
}

/** 支持 JSON 对象 / [{name,value}] / 每行 key=value */
export function parseStorageText(text, label) {
  const raw = String(text || '').trim();
  if (!raw) return {};

  let data = null;
  let parsed = false;
  try {
    data = JSON.parse(raw);
    parsed = true;
  } catch (error) {
    parsed = false;
  }

  if (parsed) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const result = {};
      Object.keys(data).forEach((key) => {
        const value = data[key];
        result[key] = typeof value === 'string' ? value : JSON.stringify(value);
      });
      return result;
    }

    if (Array.isArray(data)) {
      const result = {};
      data.forEach((item) => {
        if (item && typeof item === 'object' && item.name !== undefined) {
          result[item.name] = item.value === undefined || item.value === null ? '' : String(item.value);
        }
      });
      if (Object.keys(result).length) return result;
    }

    throw new Error(`${label} 需要是 JSON 对象，例如 {"token":"xxx"}`);
  }

  const result = {};
  raw.split(/[\n\r]+/).forEach((line) => {
    const index = line.indexOf('=');
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  });

  if (!Object.keys(result).length) {
    throw new Error(`${label} 需要是 JSON 对象，例如 {"token":"xxx"}`);
  }
  return result;
}
