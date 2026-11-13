#!/usr/bin/env python3
"""Generate a minimal Android WebView project around a web folder.

Usage: generate_project.py <app_name> <package_id> <web_dir> <out_dir>
"""
import os
import re
import shutil
import sys

app_name, package_id, web_dir, out_dir = sys.argv[1:5]

if not re.fullmatch(r"[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+", package_id, re.I):
    sys.exit("invalid package id")

pkg_path = os.path.join(*package_id.split("."))
app_dir = os.path.join(out_dir, "app")
java_dir = os.path.join(app_dir, "src", "main", "java", pkg_path)
assets_dir = os.path.join(app_dir, "src", "main", "assets", "www")
res_dir = os.path.join(app_dir, "src", "main", "res")

for d in [java_dir, assets_dir, os.path.join(res_dir, "values")]:
    os.makedirs(d, exist_ok=True)

shutil.copytree(web_dir, assets_dir, dirs_exist_ok=True)

def write(path, text):
    with open(os.path.join(out_dir, path) if not os.path.isabs(path) else path, "w", encoding="utf-8") as f:
        f.write(text)

write("settings.gradle", """pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "webapp"
include ":app"
""")

write("build.gradle", """plugins {
    id 'com.android.application' version '8.2.2' apply false
}
""")

write("gradle.properties", "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2g\n")

write(os.path.join(app_dir, "build.gradle"), f"""plugins {{
    id 'com.android.application'
}}

android {{
    namespace '{package_id}'
    compileSdk 34

    defaultConfig {{
        applicationId "{package_id}"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }}

    buildTypes {{
        release {{ minifyEnabled false }}
    }}

    compileOptions {{
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }}
}}
""")

write(os.path.join(app_dir, "src", "main", "AndroidManifest.xml"), f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="{app_name}"
        android:allowBackup="true"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
""")

write(os.path.join(java_dir, "MainActivity.java"), f"""package {package_id};

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity {{
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);
        WebView webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        webView.loadUrl("file:///android_asset/www/index.html");
        setContentView(webView);
    }}
}}
""")

# Gradle wrapper: the runner must provide gradle via setup-gradle or the wrapper jar.
# The workflow installs Gradle, so the wrapper is not required.
print(f"Generated project for {package_id} at {out_dir}")
