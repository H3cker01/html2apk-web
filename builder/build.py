#!/usr/bin/env python3
import os, subprocess, shutil, textwrap, zipfile, json, base64, re
from pathlib import Path

APP_NAME     = os.environ.get("APP_NAME", "MyApp")
PACKAGE_NAME = os.environ.get("PACKAGE_NAME", "com.example.myapp")
BUILD_TOOLS  = Path(os.environ.get("BUILD_TOOLS", ""))
PLATFORM_JAR = Path(os.environ.get("PLATFORM_JAR", ""))
SIGNING      = os.environ.get("SIGNING", "debug")
BUILD_TYPE   = os.environ.get("BUILD_TYPE", "apk")
KS_ALIAS     = os.environ.get("KS_ALIAS", "mykey")
KS_PASS      = os.environ.get("KS_PASS", "")
KS_KEY_PASS  = os.environ.get("KS_KEY_PASS", "")
PERMISSIONS  = os.environ.get("PERMISSIONS", "").split(",")  # comma-separated list
ADDITIONAL_FILES_JSON = os.environ.get("ADDITIONAL_FILES", "[]")  # JSON [{name,base64}]

AAPT2     = BUILD_TOOLS / "aapt2"
D8        = BUILD_TOOLS / "d8"
ZIPALIGN  = BUILD_TOOLS / "zipalign"
APKSIGNER = BUILD_TOOLS / "apksigner"

BASE      = Path(__file__).parent
HTML_FILE = BASE / "index.html"
ICON_FILE = BASE / "icon.png"
OUT_DIR   = BASE / "output"
WORK_DIR  = BASE / "work"
OUT_DIR.mkdir(exist_ok=True)
WORK_DIR.mkdir(exist_ok=True)

def run(cmd):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    r = subprocess.run(cmd, check=True, capture_output=True, text=True)
    if r.stdout: print(r.stdout)
    return r

# ── 1. Manifest ───────────────────────────────────────────────────────────────
PERMISSION_MAP = {
    "internet":             "android.permission.INTERNET",
    "camera":               "android.permission.CAMERA",
    "microphone":           "android.permission.RECORD_AUDIO",
    "storage_read":         "android.permission.READ_EXTERNAL_STORAGE",
    "storage_write":        "android.permission.WRITE_EXTERNAL_STORAGE",
    "location_fine":        "android.permission.ACCESS_FINE_LOCATION",
    "location_coarse":      "android.permission.ACCESS_COARSE_LOCATION",
    "contacts_read":        "android.permission.READ_CONTACTS",
    "contacts_write":       "android.permission.WRITE_CONTACTS",
    "phone_state":          "android.permission.READ_PHONE_STATE",
    "bluetooth":            "android.permission.BLUETOOTH",
    "bluetooth_connect":    "android.permission.BLUETOOTH_CONNECT",
    "notifications":        "android.permission.POST_NOTIFICATIONS",
    "vibrate":              "android.permission.VIBRATE",
    "nfc":                  "android.permission.NFC",
    "biometric":            "android.permission.USE_BIOMETRIC",
}

# Always include INTERNET
perms_to_add = {"internet"}
for p in PERMISSIONS:
    p = p.strip()
    if p in PERMISSION_MAP:
        perms_to_add.add(p)

perm_xml = "\n    ".join(
    f'<uses-permission android:name="{PERMISSION_MAP[p]}"/>'
    for p in perms_to_add
)

# Camera also needs features declared
feature_xml = ""
if "camera" in perms_to_add:
    feature_xml = '<uses-feature android:name="android.hardware.camera" android:required="false"/>'

manifest = WORK_DIR / "AndroidManifest.xml"
manifest.write_text(textwrap.dedent(f"""\
    <?xml version="1.0" encoding="utf-8"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android"
        package="{PACKAGE_NAME}" android:versionCode="1" android:versionName="1.0">
        <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34"/>
        {perm_xml}
        {feature_xml}
        <application android:label="{APP_NAME}" android:icon="@mipmap/ic_launcher"
            android:theme="@android:style/Theme.NoTitleBar.Fullscreen"
            android:allowBackup="true" android:supportsRtl="true">
            <activity android:name=".MainActivity" android:exported="true"
                android:configChanges="orientation|screenSize|keyboardHidden">
                <intent-filter>
                    <action android:name="android.intent.action.MAIN"/>
                    <category android:name="android.intent.category.LAUNCHER"/>
                </intent-filter>
            </activity>
        </application>
    </manifest>
"""), encoding="utf-8")

# ── 2. Icon (mipmap) ──────────────────────────────────────────────────────────
MIPMAP_SIZES = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
}

from PIL import Image, ImageDraw

# Always create mipmap dirs first
for folder in MIPMAP_SIZES:
    (WORK_DIR / "res" / folder).mkdir(parents=True, exist_ok=True)

if ICON_FILE.exists():
    try:
        img = Image.open(ICON_FILE).convert("RGBA")
        for folder, size in MIPMAP_SIZES.items():
            img.resize((size, size), Image.LANCZOS).save(WORK_DIR / "res" / folder / "ic_launcher.png")
        print("✅ Custom icon processed")
    except Exception as e:
        print(f"⚠️  Icon error: {e} — generating default")
        ICON_FILE = None

if not ICON_FILE or not ICON_FILE.exists():
    print("ℹ️  Generating default icon")
    for folder, size in MIPMAP_SIZES.items():
        img = Image.new("RGBA", (size, size), (124, 106, 247, 255))
        draw = ImageDraw.Draw(img)
        draw.ellipse([size//4, size//4, 3*size//4, 3*size//4], fill=(255, 255, 255, 200))
        img.save(WORK_DIR / "res" / folder / "ic_launcher.png")

# ── 3. Additional files → assets + rewrite HTML src/href ─────────────────────
ASSETS_DIR = WORK_DIR / "assets"
ASSETS_DIR.mkdir(exist_ok=True)

# Decode additional files and place them in assets/
additional_files = []
try:
    additional_files = json.loads(ADDITIONAL_FILES_JSON) or []
except Exception as e:
    print(f"⚠️  Could not parse ADDITIONAL_FILES: {e}")

additional_names = set()
for af in additional_files:
    fname = Path(af["name"]).name  # strip any directory component
    dest  = ASSETS_DIR / fname
    dest.write_bytes(base64.b64decode(af["base64"]))
    additional_names.add(fname)
    print(f"📎 Additional file: {fname} → assets/{fname}")

# Rewrite HTML src/href only for filenames that were actually uploaded
html_content = HTML_FILE.read_text(encoding="utf-8")

if additional_names:
    def rewrite_attr(m):
        attr  = m.group(1)   # src= or href=
        quote = m.group(2)   # " or '
        val   = m.group(3)   # the path value
        fname = Path(val).name
        if fname in additional_names:
            new_val = f"file:///android_asset/{fname}"
            print(f"  ↳ Rewrote {attr}{quote}{val}{quote} → {new_val}")
            return f'{attr}{quote}{new_val}{quote}'
        return m.group(0)    # no match — leave untouched

    html_content = re.sub(
        r'(src=|href=)(["\'])([^"\'#?]+)\2',
        rewrite_attr,
        html_content
    )
    print("✅ HTML src/href rewriting done")
else:
    print("ℹ️  No additional files — HTML unchanged")

# ── 4. MainActivity ───────────────────────────────────────────────────────────
pkg_path = WORK_DIR / "java" / Path(*PACKAGE_NAME.split("."))
pkg_path.mkdir(parents=True, exist_ok=True)

html_escaped = (html_content
    .replace("\\", "\\\\").replace('"', '\\"')
    .replace("\n", "\\n\" +\n            \"").replace("\r", ""))

(pkg_path / "MainActivity.java").write_text(textwrap.dedent(f"""\
    package {PACKAGE_NAME};
    import android.app.Activity;
    import android.os.Build;
    import android.os.Bundle;
    import android.webkit.WebSettings;
    import android.webkit.WebView;
    import android.webkit.WebViewClient;
    import android.webkit.GeolocationPermissions;
    import android.webkit.PermissionRequest;
    import android.view.WindowManager;
    import android.content.pm.PackageManager;
    import java.util.ArrayList;
    public class MainActivity extends Activity {{
        private WebView wv;
        private android.webkit.ValueCallback<android.net.Uri[]> fileChooserCallback;
        private static final int PERM_REQ = 1001;
        @Override protected void onCreate(Bundle s) {{
            super.onCreate(s);
            if (getActionBar() != null) getActionBar().hide();
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
            wv = new WebView(this); setContentView(wv);
            WebSettings ws = wv.getSettings();
            ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true);
            ws.setAllowFileAccessFromFileURLs(true); ws.setAllowUniversalAccessFromFileURLs(true);
            ws.setMediaPlaybackRequiresUserGesture(false);
            ws.setAllowFileAccess(true);
            ws.setAllowContentAccess(true);
            ws.setDatabaseEnabled(true);
            ws.setGeolocationEnabled(true);
            ws.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
            wv.setWebViewClient(new WebViewClient());
            // Grant WebView permission requests (camera, mic, etc)
            wv.setWebChromeClient(new android.webkit.WebChromeClient() {{
                private android.webkit.ValueCallback<android.net.Uri[]> fileCallback;
                @Override public void onPermissionRequest(PermissionRequest req) {{ req.grant(req.getResources()); }}
                @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {{ cb.invoke(origin, true, false); }}
                @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<android.net.Uri[]> cb, android.webkit.WebChromeClient.FileChooserParams p) {{
                    fileChooserCallback = cb;
                    android.content.Intent intent = p.createIntent();
                    try {{ startActivityForResult(intent, 2001); }} catch (Exception e) {{ fileChooserCallback = null; return false; }}
                    return true;
                }}
            }});
            // Blob download listener
            wv.setDownloadListener(new android.webkit.DownloadListener() {{
                public void onDownloadStart(String url, String ua, String cd, String mime, long len) {{
                    if (url.startsWith("blob:")) {{
                        String js = "javascript:(function(){{var x=new XMLHttpRequest();x.open('GET','" + "'+url+'" + "',true);x.responseType='blob';x.onload=function(){{var r=new FileReader();r.onloadend=function(){{var a=document.createElement('a');a.href=r.result;var m='" + "'+cd+'" + "'.match(/filename=\\\"?([^\\\"]+)\\\"?/);a.download=m?m[1]:'download';document.body.appendChild(a);a.click();document.body.removeChild(a);}};r.readAsDataURL(x.response);}};x.send();}})();";
                        wv.loadUrl(js);
                        return;
                    }}
                    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                    i.setData(android.net.Uri.parse(url));
                    startActivity(i);
                }}
            }});
            // Request runtime permissions on launch
            requestRuntimePerms();
            String html = "{html_escaped}";
            wv.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
        }}
        private void requestRuntimePerms() {{
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            String[] allPerms = {{
                "android.permission.CAMERA",
                "android.permission.RECORD_AUDIO",
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.READ_CONTACTS",
                "android.permission.WRITE_CONTACTS",
                "android.permission.POST_NOTIFICATIONS",
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.USE_BIOMETRIC",
                "android.permission.NFC"
            }};
            ArrayList<String> needed = new ArrayList<>();
            for (String p : allPerms) {{
                try {{
                    if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) needed.add(p);
                }} catch (Exception ignored) {{}}
            }}
            if (!needed.isEmpty()) requestPermissions(needed.toArray(new String[0]), PERM_REQ);
        }}
        @Override public void onBackPressed() {{
            if (wv != null && wv.canGoBack()) wv.goBack(); else super.onBackPressed();
        }}
        @Override protected void onActivityResult(int req, int res, android.content.Intent data) {{
            if (req == 2001) {{
                android.webkit.ValueCallback<android.net.Uri[]> cb = fileChooserCallback;
                fileChooserCallback = null;
                if (cb != null) {{
                    android.net.Uri[] results = null;
                    if (res == RESULT_OK && data != null) {{
                        String dataStr = data.getDataString();
                        if (dataStr != null) results = new android.net.Uri[]{{android.net.Uri.parse(dataStr)}};
                        else if (data.getClipData() != null) {{
                            int count = data.getClipData().getItemCount();
                            results = new android.net.Uri[count];
                            for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                        }}
                    }}
                    cb.onReceiveValue(results);
                }}
            }}
        }}
    }}
"""), encoding="utf-8")

# ── 4. Strings (must exist before aapt2 compile) ─────────────────────────────
strings_dir = WORK_DIR / "res" / "values"
strings_dir.mkdir(parents=True, exist_ok=True)
(strings_dir / "strings.xml").write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">{APP_NAME}</string></resources>\n')

# ── 5. aapt2 compile + link ───────────────────────────────────────────────────
flat_dir = WORK_DIR / "flat"; flat_dir.mkdir(exist_ok=True)
run([AAPT2, "compile", "--dir", WORK_DIR / "res", "-o", flat_dir])

java_src = WORK_DIR / "java"; java_src.mkdir(exist_ok=True)
linked = WORK_DIR / "linked.apk"
run([AAPT2, "link", "-o", linked, "--manifest", manifest, "-I", PLATFORM_JAR,
     "--java", java_src, *flat_dir.glob("*.flat")])

# ── 6. javac + d8 ────────────────────────────────────────────────────────────
classes = WORK_DIR / "classes"; classes.mkdir(exist_ok=True)
java_files = list((WORK_DIR / "java").rglob("*.java"))
run(["javac", "--release", "8", "-cp", str(PLATFORM_JAR), "-d", classes, *[str(f) for f in java_files]])

dex_dir = WORK_DIR / "dex"; dex_dir.mkdir(exist_ok=True)
run([D8, "--release", "--min-api", "21", "--lib", PLATFORM_JAR, "--output", dex_dir,
     *[str(f) for f in classes.rglob("*.class")]])

# ── 7. Prepare keystore ───────────────────────────────────────────────────────
def prepare_keystore():
    if SIGNING == "unsigned":
        return None, None, None, None

    if SIGNING == "upload":
        ks = BASE / "upload.keystore"
        print(f"🔑 Using uploaded keystore, alias={KS_ALIAS}")
        return ks, KS_PASS, KS_KEY_PASS, KS_ALIAS

    elif SIGNING == "generate":
        ks = WORK_DIR / "generated.keystore"
        alias = KS_ALIAS or "mykey"
        print(f"🔑 Generating keystore, alias={alias}")
        run(["keytool", "-genkeypair", "-v",
             "-keystore", ks, "-alias", alias,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass", KS_PASS, "-keypass", KS_KEY_PASS,
             "-dname", f"CN={APP_NAME},O=Android,C=US"])
        return ks, KS_PASS, KS_KEY_PASS, alias

    else:  # debug
        ks = WORK_DIR / "debug.keystore"
        print("🔑 Using auto debug keystore")
        run(["keytool", "-genkeypair", "-v",
             "-keystore", ks, "-alias", "androiddebugkey",
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass", "android", "-keypass", "android",
             "-dname", "CN=Debug,O=Android,C=US"])
        return ks, "android", "android", "androiddebugkey"

keystore, ks_pass, key_pass, key_alias = prepare_keystore()

# ── 8. APK or AAB ─────────────────────────────────────────────────────────────
if BUILD_TYPE == "aab":
    print("📦 Building AAB...")

    # Build proto-format resources for AAB
    proto_apk = WORK_DIR / "proto.apk"
    run([AAPT2, "link", "-o", proto_apk,
         "--manifest", manifest, "-I", PLATFORM_JAR,
         "--proto-format",
         *flat_dir.glob("*.flat")])

    # Extract proto apk contents into aab base module dir
    base_dir = WORK_DIR / "aab_base"
    base_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(proto_apk, 'r') as z:
        z.extractall(base_dir)

    # Add dex
    dex_dest = base_dir / "dex"
    dex_dest.mkdir(exist_ok=True)
    shutil.copy(dex_dir / "classes.dex", dex_dest / "classes.dex")

    # Add additional assets
    if any(ASSETS_DIR.iterdir()):
        aab_assets = base_dir / "assets"
        aab_assets.mkdir(exist_ok=True)
        for af in ASSETS_DIR.iterdir():
            if af.is_file():
                shutil.copy(af, aab_assets / af.name)
                print(f"📦 Packed asset (AAB): assets/{af.name}")

    # Create base.zip (module zip)
    base_zip = WORK_DIR / "base.zip"
    with zipfile.ZipFile(base_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in base_dir.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(base_dir))

    unsigned_aab = WORK_DIR / "unsigned.aab"
    run(["bundletool", "build-bundle",
         f"--modules={base_zip}",
         f"--output={unsigned_aab}"])

    final_out = OUT_DIR / f"{PACKAGE_NAME}.aab"

    if SIGNING == "unsigned":
        shutil.copy(unsigned_aab, final_out)
        print("✅ AAB built (unsigned)")
    else:
        run(["jarsigner",
             "-keystore", keystore,
             "-storepass", ks_pass,
             "-keypass", key_pass,
             "-signedjar", str(final_out),
             str(unsigned_aab),
             key_alias])
        print(f"✅ AAB signed: {final_out}")

else:
    print("📦 Building APK...")
    unaligned = WORK_DIR / "unaligned.apk"
    shutil.copy(linked, unaligned)
    with zipfile.ZipFile(unaligned, "a") as z:
        z.write(dex_dir / "classes.dex", "classes.dex")
        # Add additional assets alongside index.html
        for af in ASSETS_DIR.iterdir():
            if af.is_file():
                z.write(af, f"assets/{af.name}")
                print(f"📦 Packed asset: assets/{af.name}")

    aligned = WORK_DIR / "aligned.apk"
    run([ZIPALIGN, "-f", "-p", "4", unaligned, aligned])

    final_out = OUT_DIR / f"{PACKAGE_NAME}.apk"

    if SIGNING == "unsigned":
        shutil.copy(aligned, final_out)
        print("✅ APK built (unsigned)")
    else:
        run([APKSIGNER, "sign",
             "--ks", keystore, "--ks-pass", f"pass:{ks_pass}",
             "--key-pass", f"pass:{key_pass}", "--ks-key-alias", key_alias,
             "--out", final_out, aligned])
        print(f"✅ APK signed: {final_out}")

print(f"\n✅ Done: {final_out}")
