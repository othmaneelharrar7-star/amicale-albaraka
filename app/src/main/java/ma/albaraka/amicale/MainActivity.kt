package ma.albaraka.amicale

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * L'application est une page web (dossier assets) affichée dans un WebView.
 * Connexion, données et fichiers passent par Firebase (voir assets/firebase-config.js).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val filePicker =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            fileCallback?.onReceiveValue(uris)
            fileCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(Bridge(), "AndroidBridge")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                if (request.url.host == APP_HOST) return false
                // Fichiers joints et liens externes : ouverts dans le navigateur.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (e: Exception) {
                    // Aucun navigateur disponible : on ignore.
                }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/*"))
                }
                return try {
                    filePicker.launch(intent)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            web.loadUrl("https://$APP_HOST/assets/index.html")
        } else {
            web.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** Appelé par la page pour ouvrir un fichier joint (PDF ou image) dans une autre application. */
    private inner class Bridge {
        /** Appelé par la page pour enregistrer un export Excel dans Téléchargements. */
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            try {
                saveAndOpen(name, mime, Base64.decode(base64, Base64.DEFAULT))
            } catch (e: Exception) {
                runOnUiThread { toast("Impossible d'enregistrer le fichier.") }
            }
        }

        @JavascriptInterface
        fun openFile(name: String, mime: String, base64: String) {
            try {
                val dir = File(cacheDir, "fichiers")
                dir.mkdirs()
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(80).ifEmpty { "fichier" }
                val file = File(dir, safe)
                file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fichiers", file)
                val intent = Intent(Intent.ACTION_VIEW)
                intent.setDataAndType(uri, mime)
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                runOnUiThread {
                    try {
                        startActivity(intent)
                    } catch (e: Exception) {
                        toast("Aucune application pour ouvrir ce fichier.")
                    }
                }
            } catch (e: Exception) {
                runOnUiThread { toast("Impossible d'ouvrir le fichier.") }
            }
        }
    }

    /** Enregistre un fichier créé par la page (export Excel) puis l'ouvre. */
    private fun saveAndOpen(name: String, mime: String, bytes: ByteArray) {
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "-").trim().takeLast(120).ifEmpty { "export.xlsx" }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Amicale Albaraka")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("insert")
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException("stream")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
            runOnUiThread {
                toast("Fichier enregistré dans Téléchargements > Amicale Albaraka")
                openOrShare(uri, mime)
            }
        } else {
            val dir = File(cacheDir, "fichiers")
            dir.mkdirs()
            val file = File(dir, safe)
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(this, "$packageName.fichiers", file)
            runOnUiThread { openOrShare(uri, mime) }
        }
    }

    private fun openOrShare(uri: Uri, mime: String) {
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(view)
        } catch (e: ActivityNotFoundException) {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            try {
                startActivity(Intent.createChooser(send, "Enregistrer ou envoyer le fichier Excel"))
            } catch (e2: Exception) {
                toast("Installez Excel ou Google Sheets pour ouvrir ce fichier.")
            }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
    }
}
