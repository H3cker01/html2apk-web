#!/usr/bin/env python3
import os, subprocess, shutil, textwrap, zipfile
from pathlib import Path

APP_NAME     = os.environ.get("APP_NAME", "MyApp")
PACKAGE_NAME = os.environ.get("PACKAGE_NAME", "com.example.myapp")
BUILD_TOOLS  = Path(os.environ.get("BUILD_TOOLS", ""))
PLATFORM_JAR = Path(os.environ.get("PLATFORM_JAR", ""))
SIGNING      = os.environ.get("SIGNING", "debug")   # unsigned|debug|generate|upload
KS_ALIAS     = os.environ.get("KS_ALIAS", "mykey")
KS_PASS      = os.environ.get("KS_PASS", "")
KS_KEY_PASS  = os.environ.get("KS_KEY_PASS", "")

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
manifest = WORK_DIR / "AndroidManifest.xml"
manifest.write_text(textwrap.dedent(f"""\
    <?xml version="1.0" encoding="utf-8"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android"
        package="{PACKAGE_NAME}" android:versionCode="1" android:versionName="1.0">
        <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34"/>
        <uses-permission android:name="android.permission.INTERNET"/>
        <application android:label="{APP_NAME}" android:icon="@mipmap/ic_launcher"
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

# ── 3. MainActivity ───────────────────────────────────────────────────────────
pkg_path = WORK_DIR / "java" / Path(*PACKAGE_NAME.split("."))
pkg_path.mkdir(parents=True, exist_ok=True)

html_content = HTML_FILE.read_text(encoding="utf-8")
html_escaped = (html_content
    .replace("\\", "\\\\").replace('"', '\\"')
    .replace("\n", "\\n\" +\n            \"").replace("\r", ""))

(pkg_path / "MainActivity.java").write_text(textwrap.dedent(f"""\
    package {PACKAGE_NAME};
    import android.app.Activity;
    import android.os.Bundle;
    import android.webkit.WebSettings;
    import android.webkit.WebView;
    import android.webkit.WebViewClient;
    import android.view.WindowManager;
    public class MainActivity extends Activity {{
        @Override protected void onCreate(Bundle s) {{
            super.onCreate(s);
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
            WebView wv = new WebView(this); setContentView(wv);
            WebSettings ws = wv.getSettings();
            ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true);
            ws.setAllowFileAccessFromFileURLs(true); ws.setAllowUniversalAccessFromFileURLs(true);
            ws.setMediaPlaybackRequiresUserGesture(false);
            wv.setWebViewClient(new WebViewClient());
            String html = "{html_escaped}";
            wv.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
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

# ── 7. Merge DEX + zipalign ───────────────────────────────────────────────────
unaligned = WORK_DIR / "unaligned.apk"
shutil.copy(linked, unaligned)
with zipfile.ZipFile(unaligned, "a") as z:
    z.write(dex_dir / "classes.dex", "classes.dex")

aligned = WORK_DIR / "aligned.apk"
run([ZIPALIGN, "-f", "-p", "4", unaligned, aligned])

final_apk = OUT_DIR / f"{PACKAGE_NAME}.apk"

# ── 8. Signing ────────────────────────────────────────────────────────────────
if SIGNING == "unsigned":
    shutil.copy(aligned, final_apk)
    print("✅ APK built (unsigned)")

else:
    if SIGNING == "upload":
        keystore  = BASE / "upload.keystore"
        ks_pass   = KS_PASS
        key_pass  = KS_KEY_PASS
        key_alias = KS_ALIAS
        print(f"🔑 Using uploaded keystore, alias={key_alias}")

    elif SIGNING == "generate":
        keystore  = WORK_DIR / "generated.keystore"
        ks_pass   = KS_PASS
        key_pass  = KS_KEY_PASS
        key_alias = KS_ALIAS or "mykey"
        print(f"🔑 Generating keystore, alias={key_alias}")
        run(["keytool", "-genkeypair", "-v",
             "-keystore", keystore, "-alias", key_alias,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass", ks_pass, "-keypass", key_pass,
             "-dname", f"CN={APP_NAME},O=Android,C=US"])

    else:  # debug
        keystore  = WORK_DIR / "debug.keystore"
        ks_pass   = "android"
        key_pass  = "android"
        key_alias = "androiddebugkey"
        print("🔑 Using auto debug keystore")
        run(["keytool", "-genkeypair", "-v",
             "-keystore", keystore, "-alias", key_alias,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass", ks_pass, "-keypass", key_pass,
             "-dname", "CN=Debug,O=Android,C=US"])

    run([APKSIGNER, "sign",
         "--ks", keystore, "--ks-pass", f"pass:{ks_pass}",
         "--key-pass", f"pass:{key_pass}", "--ks-key-alias", key_alias,
         "--out", final_apk, aligned])

print(f"\n✅ Done: {final_apk}")
