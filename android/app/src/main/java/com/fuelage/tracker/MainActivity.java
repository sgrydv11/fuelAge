package com.fuelage.tracker;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://fuelage.local";
    private static final int PICK_PHOTO = 100;
    private static final int TAKE_PHOTO = 101;

    private final TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    private WebView web;
    private ValueCallback<Uri[]> photoResult;
    private Uri cameraUri;
    private File cameraFile;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.addJavascriptInterface(new PhotoScanner(), "FuelAgeAndroid");
        web.setWebViewClient(new LocalContent());
        web.setWebChromeClient(new PhotoPicker());
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            }
            return insets;
        });
        setContentView(web);
        web.loadUrl(ORIGIN + "/index.html");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "fuelage.local".equals(uri.getHost())
                && uri.getPort() == -1;
    }

    private final class LocalContent extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isLocal(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!isLocal(uri)) return unavailable();
            String asset = uri.getPath() == null ? "" : uri.getPath();
            if (asset.equals("/")) asset = "/index.html";
            String mime;
            switch (asset) {
                case "/index.html": mime = "text/html"; break;
                case "/app.js":
                case "/mileage.js":
                case "/ocr.js":
                case "/segments.js": mime = "text/javascript"; break;
                case "/style.css": mime = "text/css"; break;
                default: return unavailable();
            }
            try {
                InputStream input = getAssets().open(asset.substring(1));
                Map<String, String> headers = java.util.Collections.singletonMap("Content-Security-Policy",
                        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                        + "img-src 'self' data: blob:; connect-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'");
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, input);
            } catch (IOException ignored) {
                return unavailable();
            }
        }
    }

    private static WebResourceResponse unavailable() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Unavailable",
                null, new ByteArrayInputStream(new byte[0]));
    }

    private final class PhotoPicker extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (photoResult != null) photoResult.onReceiveValue(null);
            photoResult = callback;
            if (params.isCaptureEnabled() && openCamera()) return true;

            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
            try {
                startActivityForResult(picker, PICK_PHOTO);
            } catch (ActivityNotFoundException ignored) {
                finishPhoto(null);
            }
            return true;
        }
    }

    private boolean openCamera() {
        try {
            File directory = new File(getCacheDir(), "camera");
            if (!directory.isDirectory() && !directory.mkdirs()) return false;
            File[] previous = directory.listFiles();
            if (previous != null) {
                long threshold = System.currentTimeMillis() - 86_400_000L;
                for (File file : previous) {
                    if (file.lastModified() < threshold) file.delete();
                }
            }
            cameraFile = File.createTempFile("photo-", ".jpg", directory);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".photos", cameraFile);
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            camera.setClipData(ClipData.newRawUri("FuelAge photo", cameraUri));
            startActivityForResult(camera, TAKE_PHOTO);
            return true;
        } catch (IOException | ActivityNotFoundException ignored) {
            discardCamera();
            return false;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == TAKE_PHOTO) {
            Uri photo = result == RESULT_OK && cameraFile != null && cameraFile.length() > 0
                    ? cameraUri : null;
            if (photo == null) discardCamera();
            else {
                cameraUri = null;
                cameraFile = null;
            }
            finishPhoto(photo);
        } else if (request == PICK_PHOTO) {
            finishPhoto(result == RESULT_OK && data != null ? data.getData() : null);
        }
    }

    private void discardCamera() {
        if (cameraFile != null) cameraFile.delete();
        cameraFile = null;
        cameraUri = null;
    }

    private void finishPhoto(Uri photo) {
        if (photoResult == null) return;
        photoResult.onReceiveValue(photo == null ? null : new Uri[]{photo});
        photoResult = null;
    }

    private final class PhotoScanner {
        @JavascriptInterface
        public void recognize(String id, String jpeg, int x, int y, int width, int height) {
            Bitmap bitmap;
            try {
                if (jpeg.length() > 4_000_000) throw new IllegalArgumentException("Photo too large");
                byte[] bytes = Base64.decode(jpeg, Base64.DEFAULT);
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth < 1 || bounds.outHeight < 1
                        || (long) bounds.outWidth * bounds.outHeight > 2_000_000L) {
                    throw new IllegalArgumentException("Invalid photo dimensions");
                }
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("Invalid photo");
                if (width > 0 && height > 0 && x >= 0 && y >= 0 && x < bitmap.getWidth() && y < bitmap.getHeight()) {
                    Bitmap cropped = Bitmap.createBitmap(bitmap, x, y,
                            Math.min(width, bitmap.getWidth() - x), Math.min(height, bitmap.getHeight() - y));
                    if (cropped != bitmap) bitmap.recycle();
                    bitmap = cropped;
                }
            } catch (RuntimeException ignored) {
                completeScan(id, null);
                return;
            }
            Bitmap input = bitmap;
            recognizer.process(InputImage.fromBitmap(input, 0))
                    .addOnSuccessListener(result -> completeScan(id, result.getText()))
                    .addOnFailureListener(error -> completeScan(id, null))
                    .addOnCompleteListener(task -> input.recycle());
        }
    }

    private void completeScan(String id, String text) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(
                    "window.fuelAgeScanResult?.(" + JSONObject.quote(id) + ","
                    + (text == null ? "null" : JSONObject.quote(text)) + ")", null);
        });
    }

    @Override
    protected void onDestroy() {
        finishPhoto(null);
        discardCamera();
        recognizer.close();
        if (web != null) {
            web.removeJavascriptInterface("FuelAgeAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
