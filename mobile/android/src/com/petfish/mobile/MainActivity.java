package com.petfish.mobile;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Hardened AURA Mobile Android WebView Container:
 * - Blocks arbitrary device file access & universal file:// cross-origin reads (OWASP Mobile M8/M1)
 * - Restricts top-level navigation strictly to the bundled local app asset
 * - Denies camera/microphone/geolocation WebView permissions & disables remote debugging
 */
public class MainActivity extends Activity {
    static final String ENTRY_ASSET_URL = "file:///android_asset/index.html";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0a0c14"));
        w.setNavigationBarColor(Color.parseColor("#0a0c14"));

        WebView.setWebContentsDebuggingEnabled(false);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0a0c14"));

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new AuraWebViewClient());
        webView.setWebChromeClient(new AuraWebChromeClient());

        setContentView(webView);
        webView.loadUrl(ENTRY_ASSET_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

class AuraWebViewClient extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request != null ? request.getUrl() : null;
        if (uri != null && MainActivity.ENTRY_ASSET_URL.equals(uri.toString())) {
            return false;
        }
        // Block untrusted external redirects inside the privileged app WebView
        return true;
    }
}

class AuraWebChromeClient extends WebChromeClient {
    @Override
    public void onPermissionRequest(PermissionRequest request) {
        if (request != null) {
            request.deny();
        }
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (callback != null) {
            callback.invoke(origin, false, false);
        }
    }
}
