import { useState, useRef } from 'react';
import Head from 'next/head';

const POLL_INTERVAL = 4000;

export default function Home() {
  const [appName, setAppName]       = useState('');
  const [pkgName, setPkgName]       = useState('');
  const [htmlFile, setHtmlFile]     = useState(null);
  const [htmlText, setHtmlText]     = useState('');
  const [inputMode, setInputMode]   = useState('file'); // 'file' | 'paste'
  const [stage, setStage]           = useState('idle'); // idle|building|done|error
  const [log, setLog]               = useState('');
  const [dlUrl, setDlUrl]           = useState(null);
  const [dlName, setDlName]         = useState('app');
  const [progress, setProgress]     = useState(0);   // 0–100
  const [progLabel, setProgLabel]   = useState('');
  const fileRef = useRef();

  function addLog(msg) {
    setLog(l => l + '\n' + msg);
  }

  async function handleBuild() {
    const html = inputMode === 'file'
      ? await htmlFile.text()
      : htmlText;

    if (!html.trim()) return alert('Paste or upload your HTML first.');
    if (!appName.trim()) return alert('Enter an app name.');
    if (!pkgName.trim()) return alert('Enter a package name.');

    setStage('building');
    setProgress(5);
    setProgLabel('Sending to server...');
    setLog('⏳ Sending to build server...');
    setDlUrl(null);

    try {
      const buildRes = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, appName, packageName: pkgName }),
      });
      const buildData = await buildRes.json();
      if (!buildRes.ok) throw new Error(buildData.error || 'Build trigger failed');

      const { runId, token } = buildData;
      setProgress(20);
      setProgLabel('Build queued on GitHub...');
      addLog(`✅ Build queued (run #${runId})\n⏳ Building APK — this takes ~3–5 min...`);

      // Poll status
      await pollStatus(runId, token);

    } catch (e) {
      setStage('error');
      addLog(`\n❌ Error: ${e.message}`);
    }
  }

  async function pollStatus(runId, token) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res  = await fetch(`/api/status?runId=${runId}&token=${token}`);
          const data = await res.json();

          if (data.status === 'queued') {
            setProgress(p => Math.min(p + 3, 35));
            setProgLabel('Waiting in queue...');
            addLog('⏳ Queued...');
          }
          if (data.status === 'in_progress') {
            setProgress(p => Math.min(p + 8, 85));
            setProgLabel('Building APK...');
            addLog('🔨 Building...');
          }

          if (data.status === 'completed') {
            clearInterval(interval);
            setProgress(100);
            setProgLabel('Done!');
            addLog('✅ Build complete! Preparing download...');
            const url = `/api/download?artifactId=${data.artifactId}&name=${data.artifactName}`;
            setDlUrl(url);
            setDlName(data.artifactName);
            setStage('done');
            resolve();
          }

          if (data.status === 'failed') {
            clearInterval(interval);
            setProgress(0);
            setProgLabel('Build failed');
            addLog(`❌ Build failed (${data.conclusion || 'unknown'})`);
            setStage('error');
            reject(new Error('Build failed'));
          }
        } catch (e) {
          clearInterval(interval);
          addLog(`❌ Polling error: ${e.message}`);
          setStage('error');
          reject(e);
        }
      }, POLL_INTERVAL);
    });
  }

  return (
    <>
      <Head>
        <title>html2apk — Convert HTML to Android APK</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #0d0d0f;
          --surface:  #161618;
          --border:   #2a2a2e;
          --accent:   #7c6af7;
          --accent2:  #4ade80;
          --text:     #e8e8ec;
          --muted:    #6b6b78;
          --mono:     'JetBrains Mono', monospace;
          --sans:     'Inter', sans-serif;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--sans);
          min-height: 100vh;
        }

        .hero {
          text-align: center;
          padding: 64px 24px 48px;
          border-bottom: 1px solid var(--border);
        }

        .badge {
          display: inline-block;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: .12em;
          color: var(--accent);
          border: 1px solid var(--accent);
          border-radius: 4px;
          padding: 3px 10px;
          margin-bottom: 20px;
          text-transform: uppercase;
        }

        h1 {
          font-size: clamp(2rem, 5vw, 3.2rem);
          font-weight: 600;
          letter-spacing: -.02em;
          line-height: 1.1;
          margin-bottom: 14px;
        }

        h1 span { color: var(--accent); }

        .subtitle {
          color: var(--muted);
          font-size: 1rem;
          max-width: 440px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .container {
          max-width: 680px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 28px;
          margin-bottom: 16px;
        }

        .card-title {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 18px;
        }

        .row { display: flex; gap: 12px; }
        .row .field { flex: 1; }

        .field { margin-bottom: 14px; }
        .field:last-child { margin-bottom: 0; }

        label {
          display: block;
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 6px;
        }

        input[type=text] {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 13px;
          padding: 10px 14px;
          outline: none;
          transition: border-color .15s;
        }
        input[type=text]:focus { border-color: var(--accent); }

        .tab-row {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .tab {
          font-size: 12px;
          font-family: var(--mono);
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all .15s;
        }
        .tab.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }

        .drop-zone {
          border: 2px dashed var(--border);
          border-radius: 10px;
          padding: 36px;
          text-align: center;
          cursor: pointer;
          transition: border-color .15s;
        }
        .drop-zone:hover, .drop-zone.has-file { border-color: var(--accent); }
        .drop-zone p { color: var(--muted); font-size: 13px; }
        .drop-zone .filename { color: var(--accent2); font-family: var(--mono); font-size: 12px; margin-top: 6px; }

        textarea {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 12px;
          padding: 12px 14px;
          resize: vertical;
          min-height: 140px;
          outline: none;
          transition: border-color .15s;
        }
        textarea:focus { border-color: var(--accent); }

        .btn-build {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: none;
          background: var(--accent);
          color: #fff;
          font-family: var(--mono);
          font-size: 14px;
          font-weight: 700;
          letter-spacing: .04em;
          cursor: pointer;
          transition: opacity .15s;
          margin-top: 8px;
        }
        .btn-build:hover:not(:disabled) { opacity: .85; }
        .btn-build:disabled { opacity: .4; cursor: not-allowed; }

        .terminal {
          background: #0a0a0c;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 18px 20px;
          font-family: var(--mono);
          font-size: 12px;
          color: #a8a8b8;
          white-space: pre-wrap;
          min-height: 80px;
          line-height: 1.7;
        }

        .btn-download {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: none;
          background: var(--accent2);
          color: #0d0d0f;
          font-family: var(--mono);
          font-size: 14px;
          font-weight: 700;
          letter-spacing: .04em;
          cursor: pointer;
          text-decoration: none;
          display: block;
          text-align: center;
          margin-top: 12px;
          transition: opacity .15s;
        }
        .btn-download:hover { opacity: .85; }

        .progress-wrap {
          margin-top: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px 20px;
        }
        .progress-label {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
        }
        .progress-track {
          background: var(--border);
          border-radius: 99px;
          height: 6px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          transition: width .5s ease;
        }

        .footer {
          text-align: center;
          padding: 24px;
          color: var(--muted);
          font-size: 12px;
          font-family: var(--mono);
          border-top: 1px solid var(--border);
        }
        .footer span { color: var(--accent); }
      `}</style>

      <div className="hero">
        <div className="badge">by Hecker01</div>
        <h1>html<span>2</span>apk</h1>
        <p className="subtitle">
          Drop your HTML file. Get a signed Android APK back. No setup, no Android Studio.
        </p>
      </div>

      <div className="container">

        {/* App Info */}
        <div className="card">
          <div className="card-title">01 — App Details</div>
          <div className="row">
            <div className="field">
              <label>App Name</label>
              <input type="text" placeholder="My App" value={appName}
                onChange={e => setAppName(e.target.value)} disabled={stage === 'building'} />
            </div>
            <div className="field">
              <label>Package Name</label>
              <input type="text" placeholder="com.example.myapp" value={pkgName}
                onChange={e => setPkgName(e.target.value)} disabled={stage === 'building'} />
            </div>
          </div>
        </div>

        {/* HTML Input */}
        <div className="card">
          <div className="card-title">02 — Your HTML</div>

          <div className="tab-row">
            <button className={`tab ${inputMode === 'file' ? 'active' : ''}`}
              onClick={() => setInputMode('file')}>Upload File</button>
            <button className={`tab ${inputMode === 'paste' ? 'active' : ''}`}
              onClick={() => setInputMode('paste')}>Paste Code</button>
          </div>

          {inputMode === 'file' ? (
            <div className={`drop-zone ${htmlFile ? 'has-file' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); setHtmlFile(e.dataTransfer.files[0]); }}>
              <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                onChange={e => setHtmlFile(e.target.files[0])} />
              {htmlFile
                ? <><p>Ready to build</p><p className="filename">{htmlFile.name}</p></>
                : <p>Click or drag &amp; drop your <code>.html</code> file here</p>
              }
            </div>
          ) : (
            <textarea placeholder="<!DOCTYPE html>..." value={htmlText}
              onChange={e => setHtmlText(e.target.value)} disabled={stage === 'building'} />
          )}
        </div>

        {/* Build Button */}
        <button className="btn-build"
          disabled={stage === 'building'}
          onClick={handleBuild}>
          {stage === 'building' ? '⚙ Building...' : '▶ Build APK'}
        </button>

        {/* Progress Bar */}
        {stage === 'building' && (
          <div className="progress-wrap">
            <div className="progress-label">
              <span>{progLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Log */}
        {log && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Build Log</div>
            <div className="terminal">{log.trim()}</div>
            {dlUrl && (
              <a className="btn-download" href={dlUrl} download={dlName}>
                ⬇ Download APK (.zip)
              </a>
            )}
          </div>
        )}

      </div>

      <div className="footer">
        <span>html2apk</span> — built by Hecker01
      </div>
    </>
  );
}
