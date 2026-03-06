package com.vortex.tv.ui.player

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
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
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import com.vortex.tv.data.AppViewModel
import kotlinx.coroutines.delay

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PartyPlayerScreen(
    videoUrl: String,
    roomCode: String,
    viewModel: AppViewModel,
    onBack: () -> Unit
) {
    val messages by viewModel.partyMessages.collectAsState()
    val partyState by viewModel.partyState.collectAsState()
    var isVideoPlaying by remember { mutableStateOf(false) }

    // Si eres el invitado, usa el videoUrl que manda el Host desde Firebase
    val urlToPlay = if (!viewModel.isHost && partyState?.videoUrl?.isNotEmpty() == true) {
        partyState!!.videoUrl
    } else {
        videoUrl
    }

    val rawUrl = urlToPlay.trim()
    val cleanUrl = when {
        rawUrl.startsWith("//") -> "https:$rawUrl"
        !rawUrl.startsWith("http") && rawUrl.isNotEmpty() -> "https://$rawUrl"
        else -> rawUrl
    }

    val isDirectStream = cleanUrl.contains(".m3u8", ignoreCase = true) || 
                         cleanUrl.contains(".mp4", ignoreCase = true) || 
                         cleanUrl.contains(".mpd", ignoreCase = true)

    DisposableEffect(Unit) {
        onDispose {
            viewModel.stopPartySession()
        }
    }

    BackHandler {
        onBack()
    }

    Row(modifier = Modifier.fillMaxSize().background(Color.Black)) {

        // ==========================================
        // LEFT SIDE: VIDEO PLAYER (75%)
        // ==========================================
        Box(modifier = Modifier.weight(0.75f).fillMaxHeight()) {
            
            // Wait for Host state if joining
            if (!viewModel.isHost && partyState == null) {
                Box(modifier = Modifier.fillMaxSize().background(Color(0xFF020106)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.material3.CircularProgressIndicator(color = Color(0xFFFF6600))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("ESPERANDO SEÑAL DEL ANFITRIÓN...", color = Color(0xFFFF6600), letterSpacing = 4.sp, fontWeight = FontWeight.Black)
                    }
                }
            } else {
                if (isDirectStream) {
                    val context = LocalContext.current
                    val exoPlayer = remember {
                        ExoPlayer.Builder(context).build().apply {
                            val mediaItem = MediaItem.fromUri(cleanUrl)
                            setMediaItem(mediaItem)
                            prepare()
                            playWhenReady = viewModel.isHost // El host empieza reproduciendo, el invitado espera el sync
                        }
                    }

                    // --- SINCRONIZACIÓN EXOPLAYER ---
                    // 1. HOST envia datos a Firebase
                    if (viewModel.isHost) {
                        DisposableEffect(exoPlayer) {
                            val listener = object : Player.Listener {
                                override fun onIsPlayingChanged(isPlaying: Boolean) {
                                    viewModel.updatePlaybackState(isPlaying, exoPlayer.currentPosition / 1000.0)
                                }
                                override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                                    viewModel.updatePlaybackState(exoPlayer.isPlaying, exoPlayer.currentPosition / 1000.0)
                                }
                            }
                            exoPlayer.addListener(listener)
                            onDispose { exoPlayer.removeListener(listener) }
                        }
                    } 
                    // 2. INVITADO recibe datos de Firebase y ajusta ExoPlayer
                    else {
                        LaunchedEffect(partyState) {
                            partyState?.let { state ->
                                if (state.isPlaying != exoPlayer.isPlaying) {
                                    if (state.isPlaying) exoPlayer.play() else exoPlayer.pause()
                                }
                                val diff = Math.abs((exoPlayer.currentPosition / 1000.0) - state.currentTime)
                                if (diff > 3.0) { // Si hay más de 3 segundos de desface, sincronizar
                                    exoPlayer.seekTo((state.currentTime * 1000).toLong())
                                }
                            }
                        }
                    }

                    DisposableEffect(Unit) { onDispose { exoPlayer.release() } }
                    
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = {
                            PlayerView(context).apply {
                                player = exoPlayer
                                // Solo el Host puede usar los controles. El invitado no puede.
                                useController = viewModel.isHost
                                keepScreenOn = true
                                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                            }
                        }
                    )
                    LaunchedEffect(exoPlayer) {
                        delay(1500)
                        isVideoPlaying = true
                    }
                } else if (cleanUrl.isNotEmpty()) {
                    // --- SINCRONIZACIÓN WEBVIEW ---
                    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
                    
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

                    // Script base
                    val afterLoadJS = """
                        (function () {
                            document.body.style.backgroundColor = '#000'; document.body.style.overflow = 'hidden';
                            var video = document.querySelector('video'); var iframe = document.querySelector('iframe');
                            if (iframe && !video) { iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;border:none;'; }
                            if (video) {
                                video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;object-fit:contain;background:#000;';
                                video.muted = false;
                                
                                // Si soy host, detecto pausas y plays y las mando a Android
                                if (${viewModel.isHost}) {
                                    video.addEventListener('play', function() { window.AndroidBridge.syncState(true, video.currentTime); });
                                    video.addEventListener('pause', function() { window.AndroidBridge.syncState(false, video.currentTime); });
                                    video.addEventListener('seeked', function() { window.AndroidBridge.syncState(video.paused ? false : true, video.currentTime); });
                                }
                            }
                            
                            // Botones mágicos auto-click
                            var playBtns = ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid'];
                            playBtns.forEach(function (sel) { var b = document.querySelector(sel); if (b) try { b.click(); } catch (e){} });
                            
                            window.AndroidBridge.videoLoaded();
                        })(); true;
                    """.trimIndent()

                    // Invitado recibe órdenes
                    LaunchedEffect(partyState) {
                        if (!viewModel.isHost && partyState != null && webViewInstance != null) {
                            val jsCmd = """
                                var v = document.querySelector('video');
                                if(v) {
                                    if(${partyState!!.isPlaying} && v.paused) v.play();
                                    else if(!${partyState!!.isPlaying} && !v.paused) v.pause();
                                    
                                    var diff = Math.abs(v.currentTime - ${partyState!!.currentTime});
                                    if(diff > 3.0) v.currentTime = ${partyState!!.currentTime};
                                }
                            """.trimIndent()
                            webViewInstance?.evaluateJavascript(jsCmd, null)
                        }
                    }

                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            WebView(context).apply {
                                settings.apply {
                                    javaScriptEnabled = true; domStorageEnabled = true; mediaPlaybackRequiresUserGesture = false; mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                                    userAgentString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                                }
                                addJavascriptInterface(object {
                                    @JavascriptInterface fun videoLoaded() { Handler(Looper.getMainLooper()).post { isVideoPlaying = true } }
                                    @JavascriptInterface fun syncState(playing: Boolean, time: Double) { 
                                        if(viewModel.isHost) viewModel.updatePlaybackState(playing, time) 
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
                                }
                                loadUrl(cleanUrl)
                                webViewInstance = this
                            }
                        }
                    )
                    LaunchedEffect(Unit) { delay(15000); isVideoPlaying = true }
                }

                // PANTALLA DE CARGA
                androidx.compose.animation.AnimatedVisibility(
                    visible = !isVideoPlaying,
                    enter = fadeIn(), exit = fadeOut(animationSpec = tween(1000))
                ) {
                    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF020106)), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            androidx.compose.material3.CircularProgressIndicator(color = Color(0xFF7431F9))
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("PREPARANDO SALA Y VIDEO...", color = Color(0xFF39FF14), letterSpacing = 4.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }

        // ==========================================
        // RIGHT SIDE: CHAT PANEL (25%)
        // ==========================================
        Box(
            modifier = Modifier
                .weight(0.25f)
                .fillMaxHeight()
                .background(Color(0xFF0A0512)) // Dark purple tint
                .border(1.dp, Color(0x337431F9))
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                
                // HEADER CHAT
                Box(
                    modifier = Modifier.fillMaxWidth().background(Color(0xFF110722)).border(1.dp, Color(0x667431F9)).padding(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = if (viewModel.isHost) "COMANDANTE DE SALA" else "SALA CONECTADA", 
                            color = if (viewModel.isHost) Color(0xFF39FF14) else Color(0xFF7431F9), 
                            fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp
                        )
                        Text(roomCode, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, letterSpacing = 6.sp, style = TextStyle(shadow = Shadow(color = Color(0xFF7431F9), blurRadius = 15f)))
                    }
                }

                // MESSAGES LIST
                LazyColumn(
                    modifier = Modifier.weight(1f).padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    reverseLayout = false
                ) {
                    if (messages.isEmpty()) {
                        item {
                            Text("SALA VACÍA.\nINVITA A OTROS PILOTOS.", color = Color.Gray, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), fontSize = 12.sp, letterSpacing = 2.sp)
                        }
                    } else {
                        items(messages) { msg ->
                            val isMe = msg.isMe
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = if (isMe) Alignment.End else Alignment.Start
                            ) {
                                if (!isMe) {
                                    Text(msg.user.uppercase(), color = Color(0xFF7431F9), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                                    Spacer(modifier = Modifier.height(4.dp))
                                }
                                Box(
                                    modifier = Modifier
                                        .background(if (isMe) Color(0xFF7431F9) else Color(0x33FFFFFF), CutCornerShape(topStart = 8.dp, bottomEnd = 8.dp))
                                        .padding(horizontal = 16.dp, vertical = 10.dp)
                                ) {
                                    Text(msg.text, color = Color.White, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }

                // FOOTER INSTRUCTION
                Box(
                    modifier = Modifier.fillMaxWidth().background(Color(0x33000000)).border(1.dp, Color(0x1AFFFFFF)).padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = if (viewModel.isHost) "TIENES EL CONTROL NATIVO" else "MODO LECTURA (TV)", 
                            color = Color.LightGray, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp, textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (viewModel.isHost) "Pausa el video para que se pause a todos." else "Usa tu teléfono para mandar mensajes.", 
                            color = Color.Gray, fontSize = 9.sp, textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}