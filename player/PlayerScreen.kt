package com.vortex.tv.ui.player

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.Text
import com.vortex.tv.data.model.ContentItem
import kotlinx.coroutines.delay

val PlayerDark = Color(0xFF020106)
val EvaGreen = Color(0xFF39FF14)
val EvaPurple = Color(0xFF7431F9)
val EvaOrange = Color(0xFFFF6600)

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PlayerScreen(
    item: ContentItem,
    onBack: () -> Unit
) {
    var isVideoPlaying by remember { mutableStateOf(false) }
    var showControls by remember { mutableStateOf(false) }
    var isPaused by remember { mutableStateOf(false) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    
    val focusRequester = remember { FocusRequester() }

    val rawUrl = item.videoUrl?.trim() ?: ""
    val cleanUrl = when {
        rawUrl.startsWith("//") -> "https:$rawUrl"
        !rawUrl.startsWith("http") && rawUrl.isNotEmpty() -> "https://$rawUrl"
        else -> rawUrl
    }

    BackHandler { onBack() }

    // Auto-ocultar controles
    LaunchedEffect(showControls, isPaused) {
        if (showControls && !isPaused) {
            delay(5000)
            showControls = false
        }
    }

    // JS Injections
    val adBlockerJS = """
        (function () {
            window.open = function () { return null }; window.alert = function () { }; window.confirm = function () { return true };
            var AH = ['doubleclick', 'googlesyndication', 'adnxs', 'popads', 'vimeus', 'adcash'];
            var oF = window.fetch;
            window.fetch = function (url) {
                if (AH.some(function (h) { return String(url || '').toLowerCase().includes(h) })) return Promise.reject('AD_BLOCKED');
                return oF.apply(this, arguments);
            };
        })(); true;
    """.trimIndent()

    val afterLoadJS = """
        (function () {
            document.body.style.backgroundColor = '#000'; document.body.style.overflow = 'hidden';
            var notified = false, attempts = 0, interval;

            var tryPlay = function () {
                attempts++; if (attempts > 50) { clearInterval(interval); return; }
                
                var video = document.querySelector('video'); 
                var iframe = document.querySelector('iframe');
                
                // Forzar fullscreen CSS
                if (iframe && !video) { iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;border:none;'; }
                if (video) {
                    video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;object-fit:contain;background:#000;';
                    if (!notified && !video.paused && video.currentTime > 0.1) {
                        notified = true; window.AndroidBridge.postMessage('video_playing');
                    }
                    if (video.paused && attempts > 2) video.play().catch(function(){});
                    video.muted = false; video.volume = 1;
                }

                // Auto-click Botón Play
                var playBtns = ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.play-btn', '.voe-play', '.play'];
                playBtns.forEach(function (sel) { var b = document.querySelector(sel); if (b) try { b.click(); } catch(e){} });

                // Intentar hacer click en el centro por si hay un iframe o reproductor que requiere interaccion
                if(attempts === 3 || attempts === 6 || attempts === 10) {
                    try {
                        var centerEl = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                        if(centerEl && centerEl.tagName !== 'VIDEO') {
                            var ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                            centerEl.dispatchEvent(ev);
                            centerEl.click();
                        }
                    } catch(e) {}
                }

                // Auto-click Botón Fullscreen (Nativo del reproductor web)
                if(attempts === 4 || attempts === 7) {
                    var fsBtn = document.querySelector('.vjs-fullscreen-control, .jw-icon-fullscreen, .plyr__control[data-plyr="fullscreen"], .vp-fullscreen, [title*="Full" i], [class*="fullscreen" i]');
                    if(fsBtn) { try { fsBtn.click(); } catch(e){} }
                }
            };
            interval = setInterval(tryPlay, 800);

            // Escuchar ordenes de Kotlin
            window.addEventListener('message', function(e) {
                var v = document.querySelector('video');
                if(e.data === 'CMD_PAUSE') { 
                    if(v) v.pause(); 
                    window.AndroidBridge.syncPause(true); 
                }
                if(e.data === 'CMD_PLAY') { 
                    if(v) v.play(); 
                    // Simulamos click en el centro en caso de iframes o play en web
                    var centerEl = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                    if(centerEl) {
                        var ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                        centerEl.dispatchEvent(ev);
                        centerEl.click();
                    }
                    window.AndroidBridge.syncPause(false); 
                }
                if(e.data === 'CMD_FF') { if(v) v.currentTime += 15; }
                if(e.data === 'CMD_RW') { if(v) v.currentTime -= 15; }
            });

        })(); true;
    """.trimIndent()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onKeyEvent { event ->
                if (event.nativeKeyEvent.action == KeyEvent.ACTION_DOWN) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            if (!showControls) {
                                showControls = true
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_CENTER -> {
                            if (!showControls) {
                                // Simular click en el centro del WebView para iniciar el video
                                webViewInstance?.evaluateJavascript("""
                                    (function() {
                                        var el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                                        if(el) {
                                            var ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                                            el.dispatchEvent(ev);
                                            el.click();
                                        }
                                    })();
                                """.trimIndent(), null)
                                showControls = true
                                true
                            } else {
                                // Permite que los controles overlay reciban el click
                                false
                            }
                        }
                        else -> false
                    }
                } else false
            }
    ) {
        if (cleanUrl.isNotEmpty()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            mediaPlaybackRequiresUserGesture = false
                            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                            userAgentString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }

                        addJavascriptInterface(object {
                            @JavascriptInterface
                            fun postMessage(message: String) {
                                if (message == "video_playing") Handler(Looper.getMainLooper()).post { isVideoPlaying = true }
                            }
                            @JavascriptInterface
                            fun syncPause(paused: Boolean) {
                                Handler(Looper.getMainLooper()).post { isPaused = paused }
                            }
                        }, "AndroidBridge")

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                view?.evaluateJavascript(adBlockerJS, null)
                            }
                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                view?.evaluateJavascript(afterLoadJS, null)
                            }
                            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                                val reqUrl = request?.url?.toString()?.lowercase() ?: return null
                                val adDomains = listOf("vimeus", "adcash", "popads", "doubleclick")
                                if (adDomains.any { reqUrl.contains(it) }) {
                                    return WebResourceResponse("text/plain", "UTF-8", null)
                                }
                                return super.shouldInterceptRequest(view, request)
                            }
                        }
                        
                        val headers = mutableMapOf<String, String>()
                        try {
                            val parts = cleanUrl.split("/")
                            if (parts.size >= 3) headers["Referer"] = parts.take(3).joinToString("/") + "/"
                        } catch (e: Exception) {}
                        
                        loadUrl(cleanUrl, headers)
                        webViewInstance = this
                    }
                }
            )
        }

        // Failsafe Timeout: Si en 12 seg no detecta el video, quita la pantalla de carga de todos modos.
        LaunchedEffect(Unit) {
            delay(12000)
            if (!isVideoPlaying) isVideoPlaying = true
        }
        
        LaunchedEffect(isVideoPlaying) {
            if (isVideoPlaying) focusRequester.requestFocus()
        }

        // ==========================================
        // CONTROLES OVERLAY (DPAD)
        // ==========================================
        AnimatedVisibility(
            visible = showControls && isVideoPlaying,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it }),
            exit = fadeOut() + slideOutVertically(targetOffsetY = { it }),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xEE020106))))
                    .padding(bottom = 40.dp, top = 60.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(item.title?.uppercase() ?: "REPRODUCIENDO", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Row(horizontalArrangement = Arrangement.spacedBy(32.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Rewind
                        PlayerButton("◄◄ 15s") { webViewInstance?.evaluateJavascript("window.postMessage('CMD_RW', '*');", null) }
                        
                        // Play/Pause
                        PlayerButton(if (isPaused) "▶ REANUDAR" else "║║ PAUSAR", isPrimary = true) {
                            val cmd = if (isPaused) "CMD_PLAY" else "CMD_PAUSE"
                            webViewInstance?.evaluateJavascript("window.postMessage('$cmd', '*');", null)
                        }
                        
                        // Forward
                        PlayerButton("15s ►►") { webViewInstance?.evaluateJavascript("window.postMessage('CMD_FF', '*');", null) }
                    }
                }
            }
        }

        // ==========================================
        // PANTALLA DE CARGA MECHA
        // ==========================================
        AnimatedVisibility(
            visible = !isVideoPlaying,
            enter = fadeIn(),
            exit = fadeOut(animationSpec = tween(800))
        ) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color(0xFF020106)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    androidx.compose.material3.CircularProgressIndicator(color = EvaGreen, modifier = Modifier.size(60.dp))
                    Spacer(modifier = Modifier.height(24.dp))
                    Text("EXTRAYENDO NÚCLEO MULTIMEDIA...", color = EvaGreen, fontSize = 16.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("EVADIENDO BLOQUEOS // MAXIMIZANDO PANTALLA", color = Color.Gray, fontSize = 10.sp, letterSpacing = 2.sp)
                }
            }
        }
    }
}

@Composable
fun PlayerButton(text: String, isPrimary: Boolean = false, onClick: () -> Unit) {
    var isFocused by remember { mutableStateOf(false) }
    val color = if (isPrimary) EvaGreen else Color.White
    
    Box(
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .clickable { onClick() }
            .background(if (isFocused) color else Color(0x33FFFFFF), CircleShape)
            .border(2.dp, if (isFocused) Color.White else Color.Transparent, CircleShape)
            .padding(horizontal = if(isPrimary) 32.dp else 20.dp, vertical = 16.dp)
    ) {
        Text(
            text = text,
            color = if (isFocused) Color.Black else Color.White,
            fontWeight = FontWeight.Black,
            fontSize = if (isPrimary) 18.sp else 14.sp
        )
    }
}