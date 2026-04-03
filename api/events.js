// api/events.js — Vercel serverless function
// Scrapes ForeTees instruction events for Known (known.golf/interlachen)
//
// GET /api/events          → returns scraped events as JSON
// GET /api/events?debug=1  → returns step-by-step debug info

const BASE   = 'https://www1.foretees.com';
const CLUB   = 'interlachen';
const ZIP    = '55436';
const UA     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookieString(headers) {
  let arr = [];
  try {
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

// ── HTML helpers ──────────────────────────────────────────────────────────────

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

// ── Parse Proshop_events page ─────────────────────────────────────────────────
//
// The events page has a table with columns:
//   Event Name | Display Name | Tees | Date | Start Time | End Time | Gender | ID | Tools | Pin/Unpin
//
// Each event name cell contains a <form action="Proshop_events"> with hidden inputs
// for `name` and `event_id`.  We use those for reliable extraction.

function parseEventsPage(html) {
  const instructionRx = /lesson|clinic|camp|junior|group|instruction|program|academy|short game|putting|swing|fitness|wellness|yoga|pilates|stretch|golf school|ladies|beginner|future stars|seminar|build a|workshop|fundamentals|improvement/i;

  // Remove scripts/styles to avoid false matches
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const events = [];
  const seenIds = new Set();

  // Find every <tr> that contains a Proshop_events form (event data rows)
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRx.exec(clean)) !== null) {
    const rowHtml = rowMatch[1];

    // Only rows that contain the Proshop_events form
    if (!rowHtml.includes('action="Proshop_events"') && !rowHtml.includes("action='Proshop_events'")) continue;

    // Extract event name from hidden input
    const nameM = rowHtml.match(/name=["']name["']\s+value=["']([^"']+)["']/i)
                || rowHtml.match(/value=["']([^"']+)["']\s+name=["']name["']/i);
    if (!nameM) continue;
    const evName = nameM[1].trim();

    // Extract event_id from hidden input
    const idM = rowHtml.match(/name=["']event_id["']\s+value=["'](\d+)["']/i)
              || rowHtml.match(/value=["'](\d+)["']\s+name=["']event_id["']/i);
    if (!idM) continue;
    const evId = idM[1];

    // Skip duplicates (each row has multiple forms for Edit/Delete)
    if (seenIds.has(evId)) continue;
    seenIds.add(evId);

    // Filter: only instruction/wellness/clinic events
    if (!instructionRx.test(evName)) continue;

    // Extract cells from the row (for date, time, gender)
    const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRx.exec(rowHtml)) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }

    // Column mapping (0-indexed, preserving empty cells):
    //  0 = Event Name (form cell)
    //  1 = Display Name
    //  2 = Tees
    //  3 = Date  (or "Season Long")
    //  4 = Start Time
    //  5 = End Time
    //  6 = Gender
    //  7 = ID
    const date      = cells[3] || '';
    const startTime = cells[4] || '';
    const endTime   = cells[5] || '';
    const gender    = cells[6] || '';

    events.push({
      id:      'ft_' + evId,
      name:    evName,
      date:    date === 'N/A' ? '' : date,
      time:    startTime === 'N/A' ? '' : startTime,
      endTime: endTime  === 'N/A' ? '' : endTime,
      gender:  gender   === 'N/A' ? '' : gender,
      members: []
    });
  }

  return events;
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const debug    = req.query?.debug === '1';
  const username = 'proshop1';
  const password = 'ICC2026!';

  try {
    // ── Step 1: GET the Interlachen login page to capture initial cookies ─────
    //
    // /interlachen/ → 302 → /v5/servlet/LoginPrompt?cn=interlachen
    // The LoginPrompt page returns the login form HTML (5 KB).
    // We read the form to confirm field names; we also capture any cookies set.
    //
    const loginPageRes = await fetch(
      `${BASE}/v5/servlet/LoginPrompt?cn=${CLUB}`,
      {
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }
      }
    );
    const loginPageHtml = await loginPageRes.text();
    const c1 = getCookieString(loginPageRes.headers);

    if (debug) {
      return res.json({
        stage: 'login_page',
        finalUrl: loginPageRes.url,
        status:   loginPageRes.status,
        cookies:  c1 || '(none)',
        hasForm:  loginPageHtml.includes('action="/v5/servlet/Login"'),
        formFields: (loginPageHtml.match(/<input[^>]+>/gi) || [])
          .map(t => t.replace(/\s+/g,' ').substring(0, 120))
      });
    }

    // ── Step 2: POST credentials ──────────────────────────────────────────────
    //
    // Form fields discovered from LoginPrompt HTML:
    //   user_name          — username text field
    //   password           — password field
    //   clubname           — hidden, value = "interlachen"
    //   store_rwd_cookie   — hidden, value = "1"
    //   zipcode            — hidden, value = "55436"
    //   s_m                — hidden, value = "24"
    //
    const loginBody = new URLSearchParams({
      user_name:        username,
      password:         password,
      clubname:         CLUB,
      store_rwd_cookie: '1',
      zipcode:          ZIP,
      s_m:              '24'
    });

    const loginRes = await fetch(`${BASE}/v5/servlet/Login`, {
      method:   'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   UA,
        'Referer':      `${BASE}/v5/servlet/LoginPrompt?cn=${CLUB}`,
        'Origin':       BASE,
        'Accept':       'text/html,application/xhtml+xml',
        'Cookie':       c1
      },
      body: loginBody.toString()
    });

    const loginHtml = await loginRes.text();
    const c2        = getCookieString(loginRes.headers);
    const cookies   = mergeCookies(c1, c2);

    // Detect login failure
    const loginFailed =
      /username or password not provided|invalid.*login|login.*failed|authentication.*failed/i
        .test(loginHtml.substring(0, 1000));

    if (debug) {
      return res.json({
        stage:         'post_login',
        loginUrl:      loginRes.url,
        status:        loginRes.status,
        cookies:       cookies || '(none)',
        hasSession:    cookies.includes('JSESSIONID'),
        loginFailed,
        htmlPreview:   loginHtml.substring(0, 400)
      });
    }

    if (loginFailed || !cookies.includes('JSESSIONID')) {
      return res.status(401).json({
        error:       'ForeTees login failed — check credentials',
        hasSession:  cookies.includes('JSESSIONID'),
        htmlPreview: loginHtml.substring(0, 400)
      });
    }

    // ── Step 3: Fetch the events page ─────────────────────────────────────────
    const eventsRes = await fetch(`${BASE}/v5/servlet/Proshop_events`, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Referer':    `${BASE}/v5/servlet/Proshop_announce`,
        'Accept':     'text/html,application/xhtml+xml',
        'Cookie':     cookies
      }
    });

    if (!eventsRes.ok) {
      return res.status(eventsRes.status).json({
        error: `Events page returned HTTP ${eventsRes.status}`,
        url:   eventsRes.url
      });
    }

    const eventsHtml = await eventsRes.text();

    if (debug) {
      return res.json({
        stage:       'events_page',
        url:         eventsRes.url,
        status:      eventsRes.status,
        htmlLength:  eventsHtml.length,
        htmlPreview: eventsHtml.substring(0, 2000)
      });
    }

    const events = parseEventsPage(eventsHtml);

    return res.json({
      events,
      lastSync: new Date().toISOString(),
      meta: {
        eventCount: events.length,
        htmlLength: eventsHtml.length,
        eventsUrl:  eventsRes.url
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
