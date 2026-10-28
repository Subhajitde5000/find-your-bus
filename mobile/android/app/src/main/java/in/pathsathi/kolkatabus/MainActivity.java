package in.pathsathi.kolkatabus;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private int lastTopPx = 0;
    private int lastRightPx = 0;
    private int lastBottomPx = 0;
    private int lastLeftPx = 0;
    private Boolean userDarkOverride = null;

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        View decorView = window.getDecorView();
        decorView.setBackgroundColor(Color.TRANSPARENT);
        applyBarIconAppearance(isSystemDarkMode());

        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            Insets systemBars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // Keep top/left/right padding at 0 so the WebView draws edge-to-edge behind
            // the transparent status bar and navigation bar. Only pad for the software keyboard.
            v.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);

            float density = getResources().getDisplayMetrics().density;
            if (density <= 0f) density = 1f;
            lastTopPx = Math.round(systemBars.top / density);
            lastRightPx = Math.round(systemBars.right / density);
            lastBottomPx = keyboardVisible ? 0 : Math.round(systemBars.bottom / density);
            lastLeftPx = Math.round(systemBars.left / density);

            injectSafeAreaInsets();
            return insets;
        });

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.setBackgroundColor(Color.TRANSPARENT);
            webView.addJavascriptInterface(new NativeBarsBridge(), "PathsathiNativeBars");

            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    injectSafeAreaInsets();
                    syncThemeFromDom();
                }

                @Override
                public void onPageLoaded(WebView view) {
                    super.onPageLoaded(view);
                    injectSafeAreaInsets();
                    syncThemeFromDom();
                }
            });
        }
    }

    private boolean isSystemDarkMode() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applyBarIconAppearance(boolean isDarkTheme) {
        Window window = getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(!isDarkTheme);
            controller.setAppearanceLightNavigationBars(!isDarkTheme);
        }
    }

    private void injectSafeAreaInsets() {
        if (bridge == null || bridge.getWebView() == null) return;
        final String js = String.format(
            Locale.US,
            "try{var r=document.documentElement;if(r){r.dataset.native='true';r.style.setProperty('--safe-area-inset-top','%dpx');r.style.setProperty('--safe-area-inset-right','%dpx');r.style.setProperty('--safe-area-inset-bottom','%dpx');r.style.setProperty('--safe-area-inset-left','%dpx');}}catch(e){}",
            lastTopPx,
            lastRightPx,
            lastBottomPx,
            lastLeftPx
        );
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(js, null);
            }
        });
    }

    private void syncThemeFromDom() {
        if (bridge == null || bridge.getWebView() == null) return;
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "(document.documentElement&&document.documentElement.getAttribute('data-theme'))||''",
                    value -> {
                        if (value != null && value.contains("dark")) {
                            userDarkOverride = true;
                            applyBarIconAppearance(true);
                        } else if (value != null && value.contains("light")) {
                            userDarkOverride = false;
                            applyBarIconAppearance(false);
                        }
                    }
                );
            }
        });
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (userDarkOverride == null) {
            int nightMode = newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK;
            applyBarIconAppearance(nightMode == Configuration.UI_MODE_NIGHT_YES);
        }
    }

    private final class NativeBarsBridge {
        @JavascriptInterface
        public void setDarkTheme(final boolean isDark) {
            userDarkOverride = isDark;
            runOnUiThread(() -> applyBarIconAppearance(isDark));
        }
    }
}
