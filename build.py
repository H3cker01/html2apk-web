#!/usr/bin/env python3
"""
html2apk builder - runs inside GitHub Actions
Converts index.html → signed APK using aapt2, d8, zipalign, apksigner
"""

import os
import sys
import subprocess
import shutil
import textwrap
import zipfile
from pathlib import Path

# ── Env ───────────────────────────────────────────────────────────────────────
APP_NAME       = os.environ.get("APP_NAME", "MyApp")
PACKAGE_NAME   = os.environ.get("PACKAGE_NAME", "com.example.myapp")
BUILD_TOOLS    = Path(os.environ.get("BUILD_TOOLS", ""))
PLATFORM_JAR   = Path(os.environ.get("PLATFORM_JAR", ""))
KEYSTORE_PATH  = os.environ.get("KEYSTORE_PATH", "")   # relative to BASE
KEYSTORE_PASS  = os.environ.get("KEYSTORE_PASS", "")
KEY_ALIAS      = os.environ.get("KEY_ALIAS", "")
KEY_PASS       = os.environ.get("KEY_PASS", "")

AAPT2      = BUILD_TOOLS / "aapt2"
D8         = BUILD_TOOLS / "d8"
ZIPALIGN   = BUILD_TOOLS / "zipalign"
APKSIGNER  = BUILD_TOOLS / "apksigner"

BASE      = Path(__file__).parent
HTML_FILE = BASE / "index.html"
OUT_DIR   = BASE / "output"
WORK_DIR  = BASE / "work"

OUT_DIR.mkdir(exist_ok=True)
WORK_DIR.mkdir(exist_ok=True)

def run(cmd, **kwargs):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, check=True, capture_output=True, text=True, **kwargs)
    if result.stdout: print(result.stdout)
    return result

# ── 1. Generate AndroidManifest.xml ──────────────────────────────────────────
manifest_path = WORK_DIR / "AndroidManifest.xml"
manifest_path.write_text(textwrap.dedent(f"""\
    <?xml version="1.0" encoding="utf-8"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android"
        package="{PACKAGE_NAME}"
        android:versionCode="1"
        android:versionName="1.0">
        <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34"/>
        <uses-permission android:name="android.permission.INTERNET"/>
        <application
            android:label="{APP_NAME}"
            android:allowBackup="true"
            android:supportsRtl="true">
            <activity
                android:name=".MainActivity"
                android:exported="true"
                android:configChanges="orientation|screenSize|keyboardHidden">
                <intent-filter>
                    <action android:name="android.intent.action.MAIN"/>
                    <category android:name="android.intent.category.LAUNCHER"/>
                </intent-filter>
            </activity>
        </application>
    </manifest>
"""), encoding="utf-8")

# ── 2. Generate MainActivity.java ─────────────────────────────────────────────
pkg_path = WORK_DIR / "java" / Path(*PACKAGE_NAME.split("."))
pkg_path.mkdir(parents=True, exist_ok=True)

html_content = HTML_FILE.read_text(encoding="utf-8")
# Escape for Java string
html_escaped = (html_content
    .replace("\\", "\\\\")
    .replace('"', '\\"')
    .replace("\n", "\\n\" +\n            \"")
    .replace("\r", ""))

(pkg_path / "MainActivity.java").write_text(textwrap.dedent(f"""\
    package {PACKAGE_NAME};

    import android.app.Activity;
    import android.os.Bundle;
    import android.webkit.WebSettings;
    import android.webkit.WebView;
    import android.webkit.WebViewClient;
    import android.view.WindowManager;

    public class MainActivity extends Activity {{
        @Override
        protected void onCreate(Bundle savedInstanceState) {{
            super.onCreate(savedInstanceState);
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            );
            WebView wv = new WebView(this);
            setContentView(wv);
            WebSettings s = wv.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            wv.setWebViewClient(new WebViewClient());
            String html = "{html_escaped}";
            wv.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
        }}
    }}
"""), encoding="utf-8")

# ── 3. Compile resources with aapt2 ──────────────────────────────────────────
res_dir  = WORK_DIR / "res" / "values"
res_dir.mkdir(parents=True, exist_ok=True)
(res_dir / "strings.xml").write_text(textwrap.dedent(f"""\
    <?xml version="1.0" encoding="utf-8"?>
    <resources>
        <string name="app_name">{APP_NAME}</string>
    </resources>
"""))

flat_dir = WORK_DIR / "flat"
flat_dir.mkdir(exist_ok=True)
run([AAPT2, "compile", "--dir", WORK_DIR / "res", "-o", flat_dir])

linked_apk = WORK_DIR / "linked.apk"
java_src_dir = WORK_DIR / "java"
java_src_dir.mkdir(parents=True, exist_ok=True)
run([
    AAPT2, "link",
    "-o", linked_apk,
    "--manifest", manifest_path,
    "-I", PLATFORM_JAR,
    "--java", java_src_dir,
    *flat_dir.glob("*.flat"),
])

# ── 4. Compile Java → .class → .dex ─────────────────────────────────────────
classes_dir = WORK_DIR / "classes"
classes_dir.mkdir(exist_ok=True)

java_files = list((WORK_DIR / "java").rglob("*.java"))
# javac is on PATH in the runner
run(["javac", "--release", "8",
     "-cp", str(PLATFORM_JAR),
     "-d", classes_dir,
     *[str(f) for f in java_files]])

dex_dir = WORK_DIR / "dex"
dex_dir.mkdir(exist_ok=True)
run([D8,
     "--release",
     "--min-api", "21",
     "--lib", PLATFORM_JAR,
     "--output", dex_dir,
     *[str(f) for f in classes_dir.rglob("*.class")]])

# ── 5. Merge DEX into APK ─────────────────────────────────────────────────────
unaligned_apk = WORK_DIR / "unaligned.apk"
shutil.copy(linked_apk, unaligned_apk)

with zipfile.ZipFile(unaligned_apk, "a") as z:
    z.write(dex_dir / "classes.dex", "classes.dex")

# ── 6. zipalign ───────────────────────────────────────────────────────────────
aligned_apk = WORK_DIR / "aligned.apk"
run([ZIPALIGN, "-f", "-p", "4", unaligned_apk, aligned_apk])

# ── 7. Sign APK (custom keystore if provided, else auto-generate debug) ──────
use_custom = KEYSTORE_PATH and KEYSTORE_PASS and KEY_ALIAS and KEY_PASS

if use_custom:
    keystore      = BASE / KEYSTORE_PATH
    ks_pass       = KEYSTORE_PASS
    key_pass      = KEY_PASS
    key_alias     = KEY_ALIAS
    print(f"🔑 Using custom keystore: {keystore}")
else:
    print("⚠️  No custom keystore provided — generating debug keystore")
    keystore  = WORK_DIR / "debug.keystore"
    ks_pass   = "android"
    key_pass  = "android"
    key_alias = "androiddebugkey"
    run(["keytool",
         "-genkeypair", "-v",
         "-keystore", keystore,
         "-alias", key_alias,
         "-keyalg", "RSA", "-keysize", "2048",
         "-validity", "10000",
         "-storepass", ks_pass,
         "-keypass", key_pass,
         "-dname", "CN=Debug,O=Android,C=US"])

final_apk = OUT_DIR / f"{PACKAGE_NAME}.apk"
run([APKSIGNER, "sign",
     "--ks", keystore,
     "--ks-pass", f"pass:{ks_pass}",
     "--key-pass", f"pass:{key_pass}",
     "--ks-key-alias", key_alias,
     "--out", final_apk,
     aligned_apk])

print(f"\n✅ APK built: {final_apk}")
