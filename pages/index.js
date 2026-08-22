import { useState, useRef } from 'react';
import Head from 'next/head';

const POLL_INTERVAL = 4000;

export default function Home() {
  const [appName, setAppName]         = useState('');
  const [pkgName, setPkgName]         = useState('');
  const [htmlFile, setHtmlFile]       = useState(null);
  const [htmlText, setHtmlText]       = useState('');
  const [inputMode, setInputMode]     = useState('file');
  const [iconFile, setIconFile]       = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [buildType, setBuildType]     = useState('apk');
  const [signing, setSigning]         = useState('unsigned'); // unsigned | debug | generate | upload
  const [ksAlias, setKsAlias]         = useState('mykey');
  const [ksPass, setKsPass]           = useState('');
  const [ksKeyPass, setKsKeyPass]     = useState('');
  const [ksFile, setKsFile]           = useState(null);
  const [ksFilePass, setKsFilePass]   = useState('');
  const [ksFileAlias, setKsFileAlias] = useState('');
  const [ksFileKeyPass, setKsFileKeyPass] = useState('');
  const [stage, setStage]             = useState('idle');
  const [log, setLog]                 = useState('');
  const [dlUrl, setDlUrl]             = useState(null);
  const [dlName, setDlName]           = useState('app');
  const [progress, setProgress]       = useState(0);
  const [progLabel, setProgLabel]     = useState('');
  const fileRef  = useRef();
  const iconRef  = useRef();
  const ksRef    = useRef();

  function addLog(msg) { setLog(l => l + '\n' + msg); }

  function handleIconChange(file) {
    if (!file) return;
    setIconFile(file);
    const reader = new FileReader();
    reader.onload = e => setIconPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  async function handleBuild() {
    const html = inputMode === 'file' ? await htmlFile?.text() : htmlText;
    if (!html?.trim()) return alert('Paste or upload your HTML first.');
    if (!appName.trim()) return alert('Enter an app name.');
    if (!pkgName.trim()) return alert('Enter a package name.');
    if (signing === 'generate' && (!ksPass || !ksKeyPass)) return alert('Enter keystore and key passwords.');
    if (signing === 'upload' && (!ksFile || !ksFilePass || !ksFileAlias || !ksFileKeyPass)) return alert('Fill all keystore upload fields.');

    setStage('building');
    setProgress(5);
    setProgLabel('Preparing...');
    setLog('⏳ Sending to build server...');
    setDlUrl(null);

    try {
      // Convert icon to base64 if provided
      let iconBase64 = null;
      if (iconFile) {
        iconBase64 = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result.split(',')[1]);
          r.readAsDataURL(iconFile);
        });
      }

      // Convert uploaded keystore to base64 if provided
      let ksBase64 = null;
      if (signing === 'upload' && ksFile) {
        ksBase64 = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result.split(',')[1]);
          r.readAsDataURL(ksFile);
        });
      }

      const payload = {
        html,
        appName,
        packageName: pkgName,
        iconBase64,
        buildType,
        signing,
        // generate keystore fields
        ksAlias:    signing === 'generate' ? ksAlias    : undefined,
        ksPass:     signing === 'generate' ? ksPass     : undefined,
        ksKeyPass:  signing === 'generate' ? ksKeyPass  : undefined,
        // upload keystore fields
        ksBase64:   signing === 'upload'   ? ksBase64   : undefined,
        ksFilePass: signing === 'upload'   ? ksFilePass : undefined,
        ksFileAlias:signing === 'upload'   ? ksFileAlias: undefined,
        ksFileKeyPass: signing === 'upload'? ksFileKeyPass: undefined,
      };

      const buildRes = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const buildData = await buildRes.json();
      if (!buildRes.ok) throw new Error(buildData.error || 'Build trigger failed');

      const { runId, token } = buildData;
      setProgress(20);
      setProgLabel('Build queued on GitHub...');
      addLog(`✅ Build queued (run #${runId})\n⏳ Building APK — this takes ~3–5 min...`);
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
          if (data.status === 'queued')      { setProgress(p => Math.min(p+3,35)); setProgLabel('Waiting in queue...'); addLog('⏳ Queued...'); }
          if (data.status === 'in_progress') { setProgress(p => Math.min(p+8,85)); setProgLabel('Building APK...'); addLog('🔨 Building...'); }
          if (data.status === 'completed') {
            clearInterval(interval);
            setProgress(100); setProgLabel('Done!');
            addLog('✅ Build complete!');
            setDlUrl(`/api/download?artifactId=${data.artifactId}&name=${data.artifactName}`);
            setDlName(data.artifactName);
            setStage('done'); resolve();
          }
          if (data.status === 'failed') {
            clearInterval(interval);
            setProgress(0); setProgLabel('Build failed');
            addLog(`❌ Build failed (${data.conclusion || 'unknown'})`);
            setStage('error'); reject(new Error('Build failed'));
          }
        } catch(e) { clearInterval(interval); addLog(`❌ Polling error: ${e.message}`); setStage('error'); reject(e); }
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
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#0d0d0f;--surface:#161618;--border:#2a2a2e;--accent:#7c6af7;--accent2:#4ade80;--text:#e8e8ec;--muted:#6b6b78;--mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif}
        body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}
        .hero{text-align:center;padding:64px 24px 48px;border-bottom:1px solid var(--border)}
        .badge{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:3px 10px;margin-bottom:20px;text-transform:uppercase}
        h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-bottom:14px}
        h1 span{color:var(--accent)}
        .subtitle{color:var(--muted);font-size:1rem;max-width:440px;margin:0 auto;line-height:1.6}
        .container{max-width:680px;margin:0 auto;padding:48px 24px 80px}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:16px}
        .card-title{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
        .row{display:flex;gap:12px}
        .row .field{flex:1}
        .field{margin-bottom:14px}
        .field:last-child{margin-bottom:0}
        label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
        input[type=text],input[type=password]{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:13px;padding:10px 14px;outline:none;transition:border-color .15s}
        input[type=text]:focus,input[type=password]:focus{border-color:var(--accent)}
        .tab-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
        .tab{font-size:12px;font-family:var(--mono);padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .15s}
        .tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
        .drop-zone{border:2px dashed var(--border);border-radius:10px;padding:36px;text-align:center;cursor:pointer;transition:border-color .15s}
        .drop-zone:hover,.drop-zone.has-file{border-color:var(--accent)}
        .drop-zone p{color:var(--muted);font-size:13px}
        .drop-zone .filename{color:var(--accent2);font-family:var(--mono);font-size:12px;margin-top:6px}
        textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:12px;padding:12px 14px;resize:vertical;min-height:140px;outline:none;transition:border-color .15s}
        textarea:focus{border-color:var(--accent)}
        .icon-section{display:flex;align-items:center;gap:16px}
        .icon-preview{width:72px;height:72px;border-radius:16px;background:var(--bg);border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;transition:border-color .15s}
        .icon-preview:hover{border-color:var(--accent)}
        .icon-preview img{width:100%;height:100%;object-fit:cover}
        .icon-hint{color:var(--muted);font-size:12px;font-family:var(--mono);line-height:1.6}
        .signing-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        .sign-opt{border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;transition:all .15s;text-align:left}
        .sign-opt:hover{border-color:var(--accent)}
        .sign-opt.active{border-color:var(--accent);background:rgba(124,106,247,.08)}
        .sign-opt-title{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px}
        .sign-opt-desc{font-size:11px;color:var(--muted);line-height:1.4}
        .sign-fields{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:4px}
        .btn-build{width:100%;padding:14px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-family:var(--mono);font-size:14px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:opacity .15s;margin-top:8px}
        .btn-build:hover:not(:disabled){opacity:.85}
        .btn-build:disabled{opacity:.4;cursor:not-allowed}
        .progress-wrap{margin-top:16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px}
        .progress-label{font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:10px;display:flex;justify-content:space-between}
        .progress-track{background:var(--border);border-radius:99px;height:6px;overflow:hidden}
        .progress-bar{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .5s ease}
        .terminal{background:#0a0a0c;border:1px solid var(--border);border-radius:10px;padding:18px 20px;font-family:var(--mono);font-size:12px;color:#a8a8b8;white-space:pre-wrap;min-height:80px;line-height:1.7}
        .btn-download{width:100%;padding:14px;border-radius:10px;border:none;background:var(--accent2);color:#0d0d0f;font-family:var(--mono);font-size:14px;font-weight:700;letter-spacing:.04em;cursor:pointer;text-decoration:none;display:block;text-align:center;margin-top:12px;transition:opacity .15s}
        .btn-download:hover{opacity:.85}
        .footer{text-align:center;padding:24px;color:var(--muted);font-size:12px;font-family:var(--mono);border-top:1px solid var(--border)}
        .footer span{color:var(--accent)}
      `}</style>

      <div className="hero">
        <div className="badge">by Hecker01</div>
        <h1>html<span>2</span>apk</h1>
        <p className="subtitle">Drop your HTML file. Get a signed Android APK back. No setup, no Android Studio.</p>
      </div>

      <div className="container">

        {/* 01 App Details */}
        <div className="card">
          <div className="card-title">01 — App Details</div>
          <div className="row">
            <div className="field">
              <label>App Name</label>
              <input type="text" placeholder="My App" value={appName} onChange={e=>setAppName(e.target.value)} disabled={stage==='building'} />
            </div>
            <div className="field">
              <label>Package Name</label>
              <input type="text" placeholder="com.example.myapp" value={pkgName} onChange={e=>setPkgName(e.target.value)} disabled={stage==='building'} />
            </div>
          </div>

          {/* Icon upload */}
          <div className="field" style={{marginTop:8}}>
            <label>App Icon (optional — PNG, min 512×512)</label>
            <div className="icon-section">
              <div className="icon-preview" onClick={()=>iconRef.current.click()}>
                {iconPreview
                  ? <img src={iconPreview} alt="icon" />
                  : <span style={{color:'var(--muted)',fontSize:24}}>+</span>}
              </div>
              <div className="icon-hint">
                {iconFile ? iconFile.name : 'Click to upload your app icon.\nLeave blank for default Android icon.'}
              </div>
              <input ref={iconRef} type="file" accept="image/png,image/jpeg" style={{display:'none'}} onChange={e=>handleIconChange(e.target.files[0])} />
            </div>
          </div>
        </div>

        {/* 02 HTML */}
        <div className="card">
          <div className="card-title">02 — Your HTML</div>
          <div className="tab-row">
            <button className={`tab ${inputMode==='file'?'active':''}`} onClick={()=>setInputMode('file')}>Upload File</button>
            <button className={`tab ${inputMode==='paste'?'active':''}`} onClick={()=>setInputMode('paste')}>Paste Code</button>
          </div>
          {inputMode==='file' ? (
            <div className={`drop-zone ${htmlFile?'has-file':''}`}
              onClick={()=>fileRef.current.click()}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();setHtmlFile(e.dataTransfer.files[0])}}>
              <input ref={fileRef} type="file" accept=".html,.htm" style={{display:'none'}} onChange={e=>setHtmlFile(e.target.files[0])} />
              {htmlFile
                ? <><p>Ready to build</p><p className="filename">{htmlFile.name}</p></>
                : <p>Click or drag &amp; drop your <code>.html</code> file here</p>}
            </div>
          ) : (
            <textarea placeholder="<!DOCTYPE html>..." value={htmlText} onChange={e=>setHtmlText(e.target.value)} disabled={stage==='building'} />
          )}
        </div>

        {/* 03 Build Type */}
        <div className="card">
          <div className="card-title">03 — Output Format</div>
          <div className="tab-row">
            <button className={`tab ${buildType==='apk'?'active':''}`} onClick={()=>setBuildType('apk')}>APK</button>
            <button className={`tab ${buildType==='aab'?'active':''}`} onClick={()=>setBuildType('aab')}>AAB (Play Store)</button>
          </div>
          <p style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--mono)'}}>
            {buildType==='apk'
              ? 'APK — install directly on any Android device.'
              : 'AAB — required for Google Play Store uploads.'}
          </p>
        </div>

        {/* 04 Signing */}
        <div className="card">
          <div className="card-title">04 — Signing</div>
          <div className="signing-options">
            {[
              { id:'unsigned', title:'Unsigned',    desc:'No signature. Cannot be installed on most devices.' },
              { id:'debug',    title:'Debug Sign',  desc:'Auto debug keystore. Works for testing.' },
              { id:'generate', title:'Generate Key', desc:'Create a new keystore with your passwords.' },
              { id:'upload',   title:'Use My Key',  desc:'Upload your existing .keystore file.' },
            ].map(opt => (
              <div key={opt.id} className={`sign-opt ${signing===opt.id?'active':''}`} onClick={()=>setSigning(opt.id)}>
                <div className="sign-opt-title">{opt.title}</div>
                <div className="sign-opt-desc">{opt.desc}</div>
              </div>
            ))}
          </div>

          {signing==='generate' && (
            <div className="sign-fields">
              <div className="row">
                <div className="field">
                  <label>Key Alias</label>
                  <input type="text" placeholder="mykey" value={ksAlias} onChange={e=>setKsAlias(e.target.value)} />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Keystore Password</label>
                  <input type="password" placeholder="min 6 chars" value={ksPass} onChange={e=>setKsPass(e.target.value)} />
                </div>
                <div className="field">
                  <label>Key Password</label>
                  <input type="password" placeholder="min 6 chars" value={ksKeyPass} onChange={e=>setKsKeyPass(e.target.value)} />
                </div>
              </div>
              <p style={{fontSize:11,color:'var(--muted)',marginTop:8,fontFamily:'var(--mono)'}}>⚠ Save these passwords — you need them to update the app later.</p>
            </div>
          )}

          {signing==='upload' && (
            <div className="sign-fields">
              <div className="field">
                <label>Keystore File (.keystore / .jks)</label>
                <div className={`drop-zone ${ksFile?'has-file':''}`} style={{padding:16}} onClick={()=>ksRef.current.click()}>
                  <input ref={ksRef} type="file" accept=".keystore,.jks" style={{display:'none'}} onChange={e=>setKsFile(e.target.files[0])} />
                  <p className="filename">{ksFile ? ksFile.name : 'Click to upload .keystore file'}</p>
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Key Alias</label>
                  <input type="text" placeholder="alias" value={ksFileAlias} onChange={e=>setKsFileAlias(e.target.value)} />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Keystore Password</label>
                  <input type="password" value={ksFilePass} onChange={e=>setKsFilePass(e.target.value)} />
                </div>
                <div className="field">
                  <label>Key Password</label>
                  <input type="password" value={ksFileKeyPass} onChange={e=>setKsFileKeyPass(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Build Button */}
        <button className="btn-build" disabled={stage==='building'} onClick={handleBuild}>
          {stage==='building' ? '⚙ Building...' : '▶ Build APK'}
        </button>

        {/* Progress */}
        {stage==='building' && (
          <div className="progress-wrap">
            <div className="progress-label"><span>{progLabel}</span><span>{progress}%</span></div>
            <div className="progress-track"><div className="progress-bar" style={{width:`${progress}%`}} /></div>
          </div>
        )}

        {/* Log */}
        {log && (
          <div className="card" style={{marginTop:16}}>
            <div className="card-title">Build Log</div>
            <div className="terminal">{log.trim()}</div>
            {dlUrl && <a className="btn-download" href={dlUrl} download={dlName}>⬇ Download APK (.zip)</a>}
          </div>
        )}

      </div>
      <div className="footer"><span>html2apk</span> — built by Hecker01</div>
    </>
  );
}
