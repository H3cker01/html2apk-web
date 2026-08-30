// pages/api/scan.js
// Scans uploaded HTML for malicious/suspicious code
// Timeout: 1hr → 2hr → 4hr → 8hr... (doubles each offense)

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// ip -> { offenses: number, blockedUntil: timestamp }
const maliciousMap = new Map();

function getBlockStatus(ip) {
  const now = Date.now();
  const entry = maliciousMap.get(ip);
  if (!entry) return { blocked: false };
  if (entry.blockedUntil > now) {
    const remaining = Math.ceil((entry.blockedUntil - now) / 60000);
    return { blocked: true, remaining, offenses: entry.offenses };
  }
  return { blocked: false, offenses: entry.offenses };
}

function recordOffense(ip) {
  const now = Date.now();
  const entry = maliciousMap.get(ip) || { offenses: 0, blockedUntil: 0 };
  entry.offenses += 1;
  // 1hr * 2^(offenses-1): 1hr, 2hr, 4hr, 8hr...
  const hours = Math.pow(2, entry.offenses - 1);
  entry.blockedUntil = now + hours * 60 * 60 * 1000;
  maliciousMap.set(ip, entry);
  return { hours, offenses: entry.offenses, blockedUntil: entry.blockedUntil };
}

// ── Detection patterns ────────────────────────────────────────────────────────
const MALICIOUS_PATTERNS = [
  // Remote script injection
  { pattern: /<script[^>]+src\s*=\s*["']https?:\/\/(?!cdn\.|unpkg\.|cdnjs\.|ajax\.googleapis\.|code\.jquery\.|stackpath\.bootstrapcdn\.|maxcdn\.bootstrapcdn\.)/i,
    reason: 'Remote script from untrusted external domain' },

  // Obfuscation
  { pattern: /eval\s*\(\s*(atob|unescape|decodeURIComponent)\s*\(/i,
    reason: 'Obfuscated code execution (eval+decode)' },
  { pattern: /eval\s*\(\s*["'`][A-Za-z0-9+/=]{100,}/i,
    reason: 'Large base64 blob being eval\'d' },
  { pattern: /\beval\s*\(\s*(?:String\.fromCharCode|unescape)\s*\(/i,
    reason: 'Obfuscated eval via char codes' },

  // Crypto mining
  { pattern: /coinhive|cryptonight|minero|webminerpool|coin-hive|miner\.start|startMining/i,
    reason: 'Cryptocurrency miner detected' },
  { pattern: /new\s+Worker\s*\(\s*["']blob:/i,
    reason: 'Blob worker (possible crypto miner)' },

  // Phishing / credential harvesting
  { pattern: /document\.cookie\s*=.*(?:password|passwd|pwd|credential)/i,
    reason: 'Cookie manipulation with credential keywords' },
  { pattern: /new\s+Image\s*\(\s*\).*(?:password|passwd|credit.?card|ssn|cvv)/i,
    reason: 'Pixel tracking with sensitive data' },

  // Keylogger
  { pattern: /addEventListener\s*\(\s*["']keydown["'].*fetch|XMLHttpRequest/is,
    reason: 'Keylogger pattern (keydown + network request)' },

  // Iframe injection
  { pattern: /<iframe[^>]+src\s*=\s*["']https?:\/\//i,
    reason: 'External iframe injection' },

  // Data exfiltration
  { pattern: /fetch\s*\(\s*["']https?:\/\/[^'"]+["']\s*,\s*\{[^}]*(?:document\.cookie|localStorage|sessionStorage|password)/is,
    reason: 'Sending sensitive browser data to external server' },

  // Malicious redirects
  { pattern: /(?:top|window|parent)\.location\s*=\s*["']https?:\/\//i,
    reason: 'Forced redirect to external URL' },

  // XSS via data URI
  { pattern: /data:text\/html[^"']*base64/i,
    reason: 'Data URI with embedded HTML (XSS vector)' },

  // Suspicious event exfiltration
  { pattern: /document\.addEventListener\s*\(\s*["'](?:input|paste|copy)["'][^)]*\)\s*.*(?:fetch|XMLHttpRequest|sendBeacon)/is,
    reason: 'Input/paste event exfiltration' },

  // Formjacking
  { pattern: /document\.querySelector\s*\(\s*["']form["']\s*\).*addEventListener.*submit.*(?:fetch|XMLHttpRequest)/is,
    reason: 'Form submission interception (formjacking)' },

  // WebSocket to unknown host
  { pattern: /new\s+WebSocket\s*\(\s*["']wss?:\/\//i,
    reason: 'WebSocket connection to external server' },
];

function scanHtml(html) {
  const findings = [];
  for (const { pattern, reason } of MALICIOUS_PATTERNS) {
    if (pattern.test(html)) {
      findings.push(reason);
    }
  }
  return findings;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  const { html } = req.body;
  if (!html) return res.status(400).json({ error: 'No HTML provided' });

  // Check if currently blocked
  const blockStatus = getBlockStatus(ip);
  if (blockStatus.blocked) {
    return res.status(403).json({
      blocked: true,
      remaining: blockStatus.remaining,
      offenses: blockStatus.offenses,
      error: `YOUR UPLOADED CODE HAS BEEN FLAGGED AS MALICIOUS. You are blocked for ${blockStatus.remaining} more minute(s).`,
    });
  }

  // Scan
  const findings = scanHtml(html);

  if (findings.length > 0) {
    const { hours, offenses, blockedUntil } = recordOffense(ip);
    return res.status(403).json({
      malicious: true,
      findings,
      blocked: true,
      blockedUntil,
      hours,
      offenses,
      error: `YOUR UPLOADED CODE CONTAINS MALICIOUS CODE. Build blocked for ${hours} hour(s).`,
    });
  }

  return res.status(200).json({ safe: true });
}
