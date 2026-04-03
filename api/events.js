// api/events.js — Vercel serverless function
// Scrapes ForeTees wellness/instruction events for Known (known.golf/interlachen)
//
// Required environment variables (set in Vercel dashboard):
//   FORETEES_USERNAME — e.g. proshop1
//   FORETEES_PASSWORD — e.g. ICC2026!
//
// GET /api/events          → returns scraped events as JSON
// GET /api/events?debug=1  → returns raw HTML/cookies at each step for debugging

const BASE = 'https://www1.foretees.com';
const WELLNESS_PATH = '/v5/assets/legacy/proshop_welns2.htm';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Extract Set-Cookie header values into a single cookie string
function getCookieString(headers) {
  let arr = [];
  try {
    // Node 18+ fetch: headers.getSetCookie() returns array
    if (typeof headers.getSetCookie === 'function') {
      arr = headers.getSetCookie();
    } else {
      const raw = headers.get('set-cookie') || '';
      arr = raw ? raw.split(/,(?=[^ ,]+=)/) : [];
    }
  } catch (_) {}
  return arr.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function mergeCookies(...parts) {
  const map = new Map();
  parts.filter(Boolean).join('; ').split('; ').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq > 0) map.set(pair.slice(0, eq), pair.slice(eq + 1));
  });
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse wellness page HTML to extract instruction-related events
function parseWellnessEvents(html) {
  const events = [];
  const instructionRx = /lesson|clinic|camp|junior|group|instruction|program|academy|short game|putting|swing|fitness|wellness|yoga|pilates|stretch|golf school|ladies|beginner/i;

  // Remove scripts and styles
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  let eventId = 0;

  // --- Strategy 1: parse <table> blocks ---
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRx.exec(clean)) !== null) {
    const tableHtml = tableMatch[1];
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    const rows = [];

    while ((rowMatch = rowRx.exec(tableHtml)) !== null) {
      const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      const cells = [];
      while ((cellMatch = cellRx.exec(rowMatch[1])) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.some(c => c.length > 1)) rows.push(cells);
    }

    if (rows.length < 1) continue;

    // Check if this table contains instruction-related content at all
    const tableText = rows.map(r => r.join(' ')).join(' ');
    if (!instructionRx.test(tableText)) continue;

    for (let i = 0; i < rows.length; i++) {
      const rowText = rows[i].join(' ');
      // Identify event header rows: contain instruction keywords, have reasonable name length
      if (instructionRx.test(rowText) && rows[i][0]?.length > 3 && rows[i][0]?.length < 120) {
        const event = {
          id: 'ft_' + (++eventId),
          name: rows[i][0],
          date: rows[i][1] || '',
          time: rows[i][2] || '',
          instructor: rows[i][3] || rows[i][2] || '',
          slots: rows[i][4] || rows[i][3] || '',
          members: []
        };

        // Scan subsequent rows for member names until next event-like row
        for (let j = i + 1; j < rows.length && j < i + 100; j++) {
          const r = rows[j];
          const rText = r.join(' ');
          // Stop at next event header
          if (j > i + 1 && instructionRx.test(rText) && r[0]?.length > 3 && r[0]?.length < 120) break;
          // Member rows: short text that looks like a name (has uppercase, reasonable length)
          const cell0 = r[0] || '';
          if (cell0.length >= 2 && cell0.length <= 60 && /[A-Za-z]/.test(cell0) && !/^\d+$/.test(cell0)) {
            // Normalize "Last, First" → "First Last"
            const parts = cell0.split(',');
            const memberName = parts.length === 2
              ? parts[1].trim() + ' ' + parts[0].trim()
              : cell0.trim();
            const memberNumber = r[1] || r[2] || '';
            event.members.push({ name: memberName, memberNumber: memberNumber.replace(/\D/g, '') });
          }
        }

        events.push(event);
      }
    }
  }

  // --- Strategy 2: look for bold/heading keywords (non-table pages) ---
  if (events.length === 0) {
    const boldRx = /<(?:b|strong|h[2-5])[^>]*>([\s\S]*?)<\/(?:b|strong|h[2-5])>/gi;
    let boldMatch;
    while ((boldMatch = boldRx.exec(clean)) !== null) {
      const text = stripHtml(boldMatch[1]);
      if (instructionRx.test(text) && text.length >= 5 && text.length <= 120) {
        events.push({
          id: 'ft_' + (++eventId),
          name: text,
          date: '',
          time: '',
          instructor: '',
          slots: '',
          members: []
        });
      }
    }
  }

  // Deduplicate by name
  const seen = new Set();
  return events.filter(ev => {
    const key = ev.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const debug = req.query?.debug === '1';
  const username = process.env.FORETEES_USERNAME;
  const password = process.env.FORETEES_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({
      error: 'FORETEES_USERNAME and FORETEES_PASSWORD environment variables are not set in Vercel dashboard'
    });
  }

  try {
    // ── Step 1: GET the login page ──────────────────────────────────────────
    const indexRes = await fetch(`${BASE}/v5/`, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }
    });
    const indexHtml = await indexRes.text();
    const c1 = getCookieString(indexRes.headers);

    if (debug) {
      return res.json({
        stage: 'login_page',
        finalUrl: indexRes.url,
        status: indexRes.status,
        cookies: c1,
        htmlPreview: indexHtml.substring(0, 3000)
      });
    }

    // ── Step 2: Discover login form action ──────────────────────────────────
    // Prefer forms that look like login forms
    const formMatch = indexHtml.match(/<form[^>]+action=["']([^"']+)["'][^>]*>[\s\S]*?(?:username|user|login)/i) ||
                      indexHtml.match(/<form[^>]+action=["']([^"']+)["']/i);
    let loginUrl = `${BASE}/v5/login`;
    if (formMatch) {
      const raw = formMatch[1];
      loginUrl = raw.startsWith('http') ? raw : new URL(raw, indexRes.url).href;
    }

    // Collect hidden fields (CSRF tokens, etc.)
    const body = new URLSearchParams({ username, password });
    const hiddenRx = /<input[^>]+type=["']hidden["'][^>]*>/gi;
    let hiddenMatch;
    while ((hiddenMatch = hiddenRx.exec(indexHtml)) !== null) {
      const nameM = hiddenMatch[0].match(/name=["']([^"']+)["']/i);
      const valM  = hiddenMatch[0].match(/value=["']([^"']*)["']/i);
      if (nameM && valM) body.set(nameM[1], valM[1]);
    }

    // ── Step 3: POST credentials ────────────────────────────────────────────
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Referer': indexRes.url,
        'Accept': 'text/html,application/xhtml+xml',
        'Cookie': c1
      },
      body: body.toString()
    });
    const loginHtml = await loginRes.text();
    const c2 = getCookieString(loginRes.headers);
    const allCookies = mergeCookies(c1, c2);

    // Detect login failure
    const loginFailed =
      /invalid.*(user|pass|cred)|incorrect.*(user|pass)|login.*failed|authentication.*failed/i.test(loginHtml.substring(0, 1000)) &&
      !/dashboard|proshop|welcome|tee.?sheet/i.test(loginHtml);

    if (loginFailed) {
      return res.status(401).json({
        error: 'ForeTees login failed — verify FORETEES_USERNAME and FORETEES_PASSWORD',
        loginUrlUsed: loginUrl,
        htmlPreview: loginHtml.substring(0, 400)
      });
    }

    // ── Step 4: Fetch wellness page ─────────────────────────────────────────
    const wellnessRes = await fetch(`${BASE}${WELLNESS_PATH}`, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Referer': loginRes.url,
        'Accept': 'text/html,application/xhtml+xml',
        'Cookie': allCookies
      }
    });

    if (!wellnessRes.ok) {
      return res.status(wellnessRes.status).json({
        error: `Wellness page returned HTTP ${wellnessRes.status}`,
        url: wellnessRes.url,
        hint: 'Session may not have the right permissions for this page'
      });
    }

    const wellnessHtml = await wellnessRes.text();

    if (debug) {
      return res.json({
        stage: 'wellness_page',
        url: wellnessRes.url,
        status: wellnessRes.status,
        htmlLength: wellnessHtml.length,
        htmlPreview: wellnessHtml.substring(0, 4000),
        cookies: allCookies.substring(0, 300)
      });
    }

    const events = parseWellnessEvents(wellnessHtml);

    return res.json({
      events,
      lastSync: new Date().toISOString(),
      meta: {
        eventCount: events.length,
        htmlLength: wellnessHtml.length,
        wellnessUrl: wellnessRes.url
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
