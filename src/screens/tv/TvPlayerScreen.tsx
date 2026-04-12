import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, ActivityIndicator, BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video from 'react-native-video';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const RESUME_NS = '@VortexTV:resume:';

// ─────────────────────────────────────────────────────────────────────────────
// AD BLOCKER — inyectado ANTES del contenido (injectedJavaScriptBeforeContentLoaded)
// Bloquea por nombre de archivo (vast, ima, pop, xd) sin importar el dominio
// ─────────────────────────────────────────────────────────────────────────────
const AD_BLOCKER_JS = `
(function(){'use strict';
var EMPTY_VAST='<?xml version="1.0" encoding="UTF-8"?><VAST version="2.0"></VAST>';
var AD_DOMAINS=['doubleclick','googlesyndication','googleadservices','google-analytics','googletagmanager','adnxs','popads','popcash','adcash','exoclick','juicyads','trafficjunky','propellerads','adsterra','hilltopads','monetag','revcontent','taboola','outbrain','mgid','richads','eroadvertising','adskeeper','adspyglass','popunder','clickadu','vidads','prebid','adsystem','openx.net','rubiconproject','pubmatic','appnexus','criteo','adsafeprotected','amazon-adsystem','media.net','sharethrough','spotxchange','springserve','teads','undertone','yieldmo','smaato.net','smartadserver','admob','adtech','adform','contextweb','conversantmedia','dataxu','flashtalking','indexexchange','kargo','liveintent','lotame','mediamath','quantcast','sizmek','sovrn','tribalfusion','triplelift','unrulymedia','yieldbot','yieldlab','popunderjs','clickunder','pushcrew','onesignal.com/sdks','notix.co','a-ads.com','coinzilla','bitmedia','cointraffic','adangle.online','adangle.','cvt-s1.adangle','imasdk.googleapis.com','reedbrick','freewheel','tudemand'];
var SAFE_DOMAINS=['jwplayer','jwpcdn','jwpsrv','shaka','dashjs','hls.js','videojs','cvattv','castercdn','nebunexa','akamai','cloudfront','cdn.','edge-live','goodstream','hlswish','voe.sx','cuevana','player.cuevana','videasy','googleapis.com/media','.m3u8','.mpd','.mp4','.ts','.webm','blob:','data:','cdnjs.cloudflare'];
// Scripts de ads hosteados en el dominio del player — bloquear por nombre de archivo
var AD_SCRIPTS=['vast.js','ima3.js','ima-ad-player','pop.js','xd/xd.js','/ads/','vpaid','preroll'];

function isSafe(u){u=String(u||'').toLowerCase();return SAFE_DOMAINS.some(function(d){return u.includes(d);});}
function isAd(u){u=String(u||'').toLowerCase();if(!u||u==='about:blank')return false;if(isSafe(u))return false;return AD_DOMAINS.some(function(d){return u.includes(d);});}
function isVast(u){u=String(u||'').toLowerCase();return u.includes('/vast')||u.includes('vast.php')||u.includes('preroll')||u.includes('vpaid')||u.includes('ad.php')||u.includes('adsystem')||u.includes('adserver')||u.includes('adangle')||u.includes('springserve')||u.includes('freewheel');}
function isAdScript(u){u=String(u||'').toLowerCase();return AD_SCRIPTS.some(function(s){return u.includes(s);});}

// CSS: ocultar elementos visuales de ads y modal de resume de Vimeos
var css=document.createElement('style');
css.textContent='.lm-modal-overlay{display:none!important}#over_player_msg{display:none!important}#resume-modal{display:none!important}[id*="google_ads"]{display:none!important}[class*="ad-overlay"]{display:none!important}[class*="preroll"]{display:none!important}ins.adsbygoogle{display:none!important}.vjs-ima-ads-container{display:none!important}[class*="ima-"]{display:none!important}.jw-ad-label{display:none!important}.jw-countdown{display:none!important}';
(document.head||document.documentElement).appendChild(css);

// Fetch: devolver VAST vacio para peticiones de anuncios
var _fetch=window.fetch;
window.fetch=function(url,opts){
  var u=String(url||'').toLowerCase();
  if(isVast(u)||isAdScript(u))return Promise.resolve(new Response(EMPTY_VAST,{status:200,headers:{'Content-Type':'text/xml'}}));
  if(isAd(u))return Promise.reject(new Error('BLOCKED'));
  return _fetch.apply(this,arguments);
};

// XHR: interceptar peticiones de ads
var _open=XMLHttpRequest.prototype.open,_send=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(m,url){
  this._u=String(url||'').toLowerCase();
  this._isAd=isAd(this._u)||isAdScript(this._u);
  this._isVast=isVast(this._u);
  return _open.apply(this,arguments);
};
XMLHttpRequest.prototype.send=function(){
  if(this._isVast){
    Object.defineProperties(this,{
      readyState:{get:function(){return 4;}},
      status:{get:function(){return 200;}},
      responseText:{get:function(){return EMPTY_VAST;}},
      response:{get:function(){return EMPTY_VAST;}}
    });
    try{this.onload&&this.onload();}catch(e){}
    try{this.onreadystatechange&&this.onreadystatechange();}catch(e){}
    return;
  }
  if(this._isAd)return;
  return _send.apply(this,arguments);
};

// DOM: bloquear scripts de ads por nombre de archivo (incluso del mismo dominio)
var _ac=Node.prototype.appendChild,_ib=Node.prototype.insertBefore;
function blockEl(el){
  if(!el||!el.tagName)return false;
  if(el.tagName.toUpperCase()==='SCRIPT'){
    var src=(el.src||'').toLowerCase();
    if(isAdScript(src)||isAd(src)){el.src='';el.type='text/blocked';return true;}
  }
  return false;
}
Node.prototype.appendChild=function(el){if(blockEl(el))return el;return _ac.apply(this,arguments);};
Node.prototype.insertBefore=function(el,r){if(blockEl(el))return el;return _ib.apply(this,arguments);};

window.open=function(){return null;};
window.alert=function(){return true;};
window.confirm=function(){return true;};
window.prompt=function(){return '';};
if(navigator.sendBeacon)navigator.sendBeacon=function(){return true;};

// Google IMA stub congelado — ima3.js no puede sobrescribirlo
(function(){
  var noop=function(){};
  var imaStub={
    VERSION:'3.0.0',
    AdDisplayContainer:function(){this.initialize=noop;this.destroy=noop;},
    AdsLoader:function(){
      this.settings={setVpaidMode:noop,setLocale:noop};
      this.addEventListener=noop;this.removeEventListener=noop;
      this.requestAds=noop;this.destroy=noop;
      this.getSettings=function(){return this.settings;};
      this.contentComplete=noop;
    },
    AdsManager:function(){
      this.init=noop;this.start=noop;this.stop=noop;this.destroy=noop;
      this.addEventListener=noop;this.removeEventListener=noop;
      this.getRemainingTime=function(){return 0;};
      this.resume=noop;this.pause=noop;
      this.getVolume=function(){return 1;};this.setVolume=noop;
      this.currentAd=null;this.isCustomPlaybackUsed=function(){return false;};
    },
    AdsManagerLoadedEvent:{Type:{ADS_MANAGER_LOADED:'adsManagerLoaded'}},
    AdsRequest:function(){},AdsRenderingSettings:function(){},AdError:function(){},
    AdErrorEvent:{Type:{AD_ERROR:'adError'}},
    AdEvent:{Type:{CONTENT_PAUSE_REQUESTED:'contentPauseRequested',CONTENT_RESUME_REQUESTED:'contentResumeRequested',LOADED:'loaded',STARTED:'started',COMPLETE:'complete',ALL_ADS_COMPLETED:'allAdsCompleted',SKIPPED:'skipped'}},
    ImaSdkSettings:function(){this.setVpaidMode=noop;this.setLocale=noop;this.setAutoPlayAdBreaks=noop;this.getVersion=function(){return '3.0.0';};},
    ViewMode:{NORMAL:'normal',FULLSCREEN:'fullscreen'},UiElements:{}
  };
  try{Object.freeze(imaStub);}catch(e){}
  var g=window.google||{};
  try{Object.defineProperty(g,'ima',{value:imaStub,writable:false,configurable:false});}catch(e){g.ima=imaStub;}
  try{Object.defineProperty(window,'google',{value:g,writable:false,configurable:false});}catch(e){window.google=g;}
})();

// JW Player: interceptar setup() para eliminar config de ads
function stripAds(cfg){
  if(!cfg||typeof cfg!=='object')return cfg;
  delete cfg.advertising;delete cfg.ad;delete cfg.ads;delete cfg.adschedule;
  delete cfg.vast;delete cfg.vpaid;delete cfg.ima;delete cfg.googima;
  if(cfg.plugins){Object.keys(cfg.plugins).forEach(function(k){var kl=k.toLowerCase();if(kl.includes('ad')||kl.includes('vast')||kl.includes('ima'))delete cfg.plugins[k];});}
  return cfg;
}
Object.defineProperty(window,'jwplayer',{configurable:true,
  set:function(v){
    this._jwp=(typeof v==='function')?function(){
      var inst=v.apply(this,arguments);
      if(inst&&inst.setup&&!inst.__vp){
        inst.__vp=true;
        var os=inst.setup;
        inst.setup=function(cfg){
          cfg=stripAds(cfg);
          var result=os.call(this,cfg);
          try{if(inst.playAd)inst.playAd=function(){};if(inst.pauseAd)inst.pauseAd=function(){};}catch(e){}
          return result;
        };
      }
      return inst;
    }:v;
  },
  get:function(){return this._jwp;}
});
})();true;
`;

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER JS — inyectado después del contenido (injectedJavaScript)
// ─────────────────────────────────────────────────────────────────────────────
const PLAYER_JS = `
(function(){'use strict';
var rn=window.ReactNativeWebView;
function post(msg){try{rn.postMessage(msg);}catch(e){}}
document.body&&(document.body.style.background='#000');

// Limpiar localStorage de Vimeos (el resume lo gestionamos en RN con AsyncStorage)
try{
  Object.keys(localStorage).forEach(function(k){
    if(k.startsWith('tt')||k.startsWith('jw_')||k.startsWith('vimeos'))localStorage.removeItem(k);
  });
}catch(e){}

var attachedVideos=new WeakSet();
var mainVideoReady=false;
var lastTimeupdatePost=0;

// ── SKIP DE ANUNCIOS (pre-roll Y mid-roll) ──────────────────────────────────
// skipAd: salta videos cortos (anuncios) al final, y puede ser llamado N veces
function skipAdVideo(v){
  if(!v||isNaN(v.duration)||v.duration<=0||v.duration>=180)return;
  // Seek al final del anuncio: siempre funciona sin importar si ya se hizo antes
  try{v.currentTime=v.duration-0.05;}catch(e){}
}

// Hook permanente en JW Player: captura adPlay/adStarted para CADA anuncio
// (pre-roll, mid-roll, post-roll)
var jwHooked=false;
function hookJwPlayerAds(){
  if(jwHooked)return;
  try{
    var jw=(typeof jwplayer==='function')?jwplayer():null;
    if(!jw||typeof jw.on!=='function')return;
    jwHooked=true;
    function onAdEvent(){
      // Cuando JW Player arranca un ad: buscar el video del ad y saltearlo
      setTimeout(function(){
        var v=document.querySelector('video');
        if(v&&v.duration>0&&v.duration<180){
          skipAdVideo(v);
        }
      },600);
    }
    jw.on('adPlay',onAdEvent);
    jw.on('adStarted',onAdEvent);
    jw.on('adImpression',onAdEvent);
  }catch(e){}
}

// Poll: intentar hookear JW Player cada 500ms hasta lograrlo (máx 60s)
var jwPollCount=0;
var jwPoll=setInterval(function(){
  jwPollCount++;
  if(jwPollCount>120||jwHooked){clearInterval(jwPoll);return;}
  hookJwPlayerAds();
},500);

// Fallback DOM: detectar cuando aparece un indicador visual de anuncio y saltarlo
var lastAdSkipTime=0;
setInterval(function(){
  var now=Date.now();
  if(now-lastAdSkipTime<3000)return; // cooldown 3s para no spammear
  var adLabel=document.querySelector('.jw-ad-label,.jw-countdown,[class*="jw-ad"]:not([style*="display: none"])');
  if(adLabel){
    var v=document.querySelector('video');
    if(v&&v.duration>0&&v.duration<180){
      lastAdSkipTime=now;
      skipAdVideo(v);
    }
  }
},1500);

function handleVideoAdded(v){
  if(attachedVideos.has(v))return;
  attachedVideos.add(v);
  v.muted=false;v.volume=1;

  // Skip de ad en eventos tempranos (pre-roll)
  function trySkip(){skipAdVideo(v);}
  v.addEventListener('loadedmetadata',trySkip);
  v.addEventListener('loadeddata',trySkip);
  v.addEventListener('canplay',trySkip);

  v.addEventListener('play',function(){
    trySkip();
    if(!mainVideoReady&&!isNaN(v.duration)&&v.duration>=180){
      mainVideoReady=true;
      post('video_ready');
    } else if(mainVideoReady&&!isNaN(v.duration)&&v.duration>=180){
      post('video_resumed');
    }
  });

  v.addEventListener('playing',function(){
    trySkip();
    if(!mainVideoReady&&!isNaN(v.duration)&&v.duration>=180){
      mainVideoReady=true;
      post('video_ready');
    }
  });

  // timeupdate: SOLO para progreso del video principal, NUNCA para ads
  // Throttle a 2s para no saturar el bridge RN
  v.addEventListener('timeupdate',function(){
    if(isNaN(v.duration)||v.duration<180)return; // ignorar ads
    if(!mainVideoReady&&v.currentTime>0.3){mainVideoReady=true;post('video_ready');}
    var now=Date.now();
    if(mainVideoReady&&(now-lastTimeupdatePost)>=2000){
      lastTimeupdatePost=now;
      post('timeupdate:'+v.currentTime.toFixed(0)+','+v.duration.toFixed(0));
    }
  });

  v.addEventListener('pause',function(){
    if(mainVideoReady&&!isNaN(v.duration)&&v.duration>=180)post('video_paused');
  });

  if(v.paused&&v.readyState>=2)v.play().catch(function(){});
  else if(v.paused)v.addEventListener('canplay',function once(){v.removeEventListener('canplay',once);v.play().catch(function(){});});
}

function scanVideos(){document.querySelectorAll('video').forEach(handleVideoAdded);}
scanVideos();
var obs=window.MutationObserver?new MutationObserver(scanVideos):null;
if(obs){
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},30000);
}

// Click play si no arranca solo
setTimeout(function(){
  ['.jw-icon-display','.jw-icon-playback','.vjs-big-play-button','.play-btn'].forEach(function(sel){
    var b=document.querySelector(sel);if(b)try{b.click();}catch(e){}
  });
  scanVideos();
},2000);

// Comandos desde React Native
window.addEventListener('message',function(e){
  var d=e.data;
  var v=document.querySelector('video');if(!v)return;
  if(d==='CMD_PLAY')v.play().catch(function(){});
  else if(d==='CMD_PAUSE')v.pause();
  else if(d&&d.startsWith('CMD_SEEK:')){v.currentTime=Math.max(0,v.currentTime+parseFloat(d.split(':')[1]));}
  else if(d&&d.startsWith('CMD_SEEK_ABS:')){var t=parseFloat(d.split(':')[1]);if(isFinite(t))v.currentTime=Math.max(0,t);}
});

// Teclas del control remoto → RN
document.addEventListener('keydown',function(e){
  var map={37:'left',39:'right',38:'up',40:'down',13:'select',8:'back',27:'back',
           179:'playPause',227:'rewind',228:'fastForward',23:'select',4:'back',66:'back'};
  var ev=map[e.keyCode];if(ev)post('key:'+ev);
},false);
})();true;
`;

// ─────────────────────────────────────────────────────────────────────────────
const fmt = (sec: number) => {
  if (!sec || isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

type CtrlId = 'back' | 'rew' | 'toggle' | 'fwd';
const CTRL_ORDER: CtrlId[] = ['back', 'rew', 'toggle', 'fwd'];

// ─────────────────────────────────────────────────────────────────────────────
export default function TvPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webRef = useRef<WebView>(null);

  const {
    videoUrl,
    title: routeTitle,
  } = route.params ?? {};

  // ── URL processing ────────────────────────────────────────────────────────
  let cleanUrl: string = (videoUrl ?? '').trim();
  if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  else if (cleanUrl && !cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;

  let drmKeyId = '', drmKey = '', finalUrl = cleanUrl;
  try {
    const qi = cleanUrl.indexOf('?');
    if (qi > -1) {
      const p = new URLSearchParams(cleanUrl.slice(qi + 1));
      drmKeyId = p.get('drmKeyId') ?? '';
      drmKey = p.get('drmKey') ?? '';
      p.delete('drmKeyId'); p.delete('drmKey'); p.delete('drmReferer');
      finalUrl = cleanUrl.slice(0, qi) + (p.toString() ? '?' + p.toString() : '');
    }
  } catch { finalUrl = cleanUrl.split('?')[0]; }

  const hasDrm = !!(drmKeyId && drmKey);
  const isVimeos = cleanUrl.includes('vimeos');
  const isDirectVideo = !hasDrm &&
    (cleanUrl.toLowerCase().includes('.mp4') || cleanUrl.toLowerCase().includes('.m3u8')) &&
    !cleanUrl.includes('tvlibree.com');

  // ── Resume key (por URL sin query params para que funcione entre sesiones) ──
  const resumeKey = RESUME_NS + finalUrl.split('?')[0].slice(0, 120);

  // ── State ─────────────────────────────────────────────────────────────────
  const [videoReady, setVideoReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ct, setCt] = useState(0);
  const [dur, setDur] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [focused, setFocused] = useState<CtrlId>('toggle');

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const overlayRef = useRef(false);
  const focusedRef = useRef<CtrlId>('toggle');
  // Guardamos ct en ref para poder acceder al valor actual en el cleanup
  const ctRef = useRef(0);
  // Si la posición fue restaurada (para no restaurar dos veces)
  const resumedRef = useRef(false);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { overlayRef.current = showOverlay; }, [showOverlay]);
  useEffect(() => { focusedRef.current = focused; }, [focused]);
  useEffect(() => { ctRef.current = ct; }, [ct]);

  // ── DRM redirect ──────────────────────────────────────────────────────────
  useEffect(() => { if (hasDrm) navigation.replace('DrmPlayerTV', { videoUrl }); }, []);

  // ── Back handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack(); return true;
    });
    return () => sub.remove();
  }, [navigation]);

  // ── Guardar posición al salir ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const pos = ctRef.current;
      // Solo guardar si llevamos más de 30 segundos reproducidos y no es un video muy corto
      if (pos > 30) {
        AsyncStorage.setItem(resumeKey, String(Math.floor(pos))).catch(() => {});
      }
    };
  }, [resumeKey]);

  // ── Fallback timeout si video_ready nunca llega ───────────────────────────
  useEffect(() => {
    const delay = isVimeos ? 9000 : 12000;
    const t = setTimeout(() => setVideoReady(true), delay);
    return () => clearTimeout(t);
  }, [isVimeos]);

  useEffect(() => () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); }, []);

  // ── WebView helper ────────────────────────────────────────────────────────
  const inj = useCallback((js: string) => {
    webRef.current?.injectJavaScript(js + ';true;');
  }, []);

  // ── Overlay ───────────────────────────────────────────────────────────────
  const showOv = useCallback(() => {
    setShowOverlay(true); overlayRef.current = true;
    Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      if (!pausedRef.current) {
        Animated.timing(overlayOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
          setShowOverlay(false); overlayRef.current = false;
        });
      }
    }, 5000);
  }, []);

  const hideOv = useCallback(() => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    Animated.timing(overlayOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
      setShowOverlay(false); overlayRef.current = false;
    });
  }, []);

  // ── Video commands ────────────────────────────────────────────────────────
  const cmdPlay = useCallback(() => {
    inj(`(function(){var v=document.querySelector('video');if(v)v.play().catch(function(){});})() `);
    setIsPaused(false); pausedRef.current = false;
  }, [inj]);

  const cmdPause = useCallback(() => {
    inj(`(function(){var v=document.querySelector('video');if(v)v.pause();})() `);
    setIsPaused(true); pausedRef.current = true;
  }, [inj]);

  const cmdToggle = useCallback(() => {
    if (pausedRef.current) cmdPlay(); else cmdPause();
    showOv();
  }, [cmdPlay, cmdPause, showOv]);

  const cmdSeek = useCallback((delta: number) => {
    inj(`(function(){var v=document.querySelector('video');if(v)v.currentTime=Math.max(0,v.currentTime+${delta});})() `);
    showOv();
  }, [inj, showOv]);

  const moveFocus = useCallback((dir: 'left' | 'right') => {
    setFocused(cur => {
      const i = CTRL_ORDER.indexOf(cur);
      return dir === 'left' ? CTRL_ORDER[Math.max(0, i - 1)] : CTRL_ORDER[Math.min(CTRL_ORDER.length - 1, i + 1)];
    });
  }, []);

  const activateFocused = useCallback(() => {
    const f = focusedRef.current;
    if (f === 'back') navigation.goBack();
    else if (f === 'rew') cmdSeek(-15);
    else if (f === 'toggle') cmdToggle();
    else if (f === 'fwd') cmdSeek(15);
  }, [cmdSeek, cmdToggle, navigation]);

  // ── Message handler ───────────────────────────────────────────────────────
  const handleMessage = useCallback((event: any) => {
    const msg: string = event.nativeEvent.data;

    if (msg === 'video_ready') {
      setVideoReady(true);
      setIsPaused(false);
      pausedRef.current = false;
      // Restaurar posición (una sola vez) desde AsyncStorage
      if (!resumedRef.current) {
        resumedRef.current = true;
        AsyncStorage.getItem(resumeKey).then(val => {
          const pos = val ? parseInt(val, 10) : 0;
          if (pos > 30) {
            // Pequeño delay para que el video esté estable
            setTimeout(() => {
              inj(`(function(){var v=document.querySelector('video');if(v&&v.duration>=180)v.currentTime=${pos};})() `);
            }, 800);
          }
        }).catch(() => {});
      }
      return;
    }

    if (msg.startsWith('timeupdate:')) {
      const [a, b] = msg.slice(11).split(',');
      const newCt = parseInt(a, 10) || 0;
      const newDur = parseInt(b, 10) || 0;
      setCt(newCt);
      if (newDur > 0) setDur(newDur);
      return;
    }

    if (msg === 'video_paused') { setIsPaused(true); pausedRef.current = true; return; }
    if (msg === 'video_resumed') { setIsPaused(false); pausedRef.current = false; return; }

    if (msg.startsWith('key:')) {
      const key = msg.slice(4);
      const ov = overlayRef.current;
      switch (key) {
        case 'select': if (!ov) showOv(); else activateFocused(); break;
        case 'playPause': cmdToggle(); break;
        case 'left': if (ov) moveFocus('left'); else { showOv(); moveFocus('left'); } break;
        case 'right': if (ov) moveFocus('right'); else { showOv(); moveFocus('right'); } break;
        case 'up': case 'down': showOv(); break;
        case 'rewind': cmdSeek(-15); break;
        case 'fastForward': cmdSeek(15); break;
        case 'back': if (ov) hideOv(); else navigation.goBack(); break;
      }
    }
  }, [showOv, hideOv, activateFocused, cmdToggle, cmdSeek, moveFocus, navigation, resumeKey, inj]);

  // ── Navigation guard ──────────────────────────────────────────────────────
  const handleShouldStart = useCallback((req: any) => {
    const url = req.url.toLowerCase();
    if (url.startsWith('intent://') || url.startsWith('market://') || url.includes('play.google.com')) return false;
    const BLOCK = ['adcash','popads','popcash','doubleclick','googlesyndication','exoclick',
      'propellerads','adsterra','monetag','popunder','adangle','imasdk.googleapis.com',
      'springserve','reedbrick','freewheel'];
    if (BLOCK.some(d => url.includes(d))) return false;
    const ALLOW = ['vimeos','goodstream','hlswish','cuevana','videasy','streamwish',
      'jwpcdn','jwpsrv','akamai','cloudfront','.m3u8','.mp4','.mpd','.ts',
      'cdnjs','voe.sx','streamtape','doodstream'];
    if (ALLOW.some(d => url.includes(d))) return true;
    if (req.isTopFrame && url !== 'about:blank') {
      const base = cleanUrl.split('?')[0].toLowerCase();
      const req2 = url.split('?')[0];
      if (!req2.includes(base) && !base.includes(req2)) return false;
    }
    return true;
  }, [cleanUrl]);

  if (!cleanUrl) return (
    <View style={st.root}><Text style={{ color: '#fff', fontSize: 16 }}>URL no válida</Text></View>
  );

  const progress = dur > 0 ? Math.min(1, ct / dur) : 0;
  const title = routeTitle ?? route.params?.title ?? '';

  return (
    <View style={st.root}>
      {/* ── WebView ──────────────────────────────────────────────────────── */}
      {!isDirectVideo && (
        <WebView
          ref={webRef}
          source={{ uri: finalUrl }}
          style={StyleSheet.absoluteFillObject}
          userAgent={CHROME_UA}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          domStorageEnabled
          javaScriptEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          androidLayerType="hardware"
          mixedContentMode="always"
          injectedJavaScriptBeforeContentLoaded={AD_BLOCKER_JS}
          injectedJavaScript={PLAYER_JS}
          injectedJavaScriptForMainFrameOnly={false}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStart}
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          // Optimizacion de renderizado
          renderToHardwareTextureAndroid
          overScrollMode="never"
          bounces={false}
        />
      )}

      {/* ── Direct video ─────────────────────────────────────────────────── */}
      {isDirectVideo && (
        <Video
          source={{ uri: cleanUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="contain"
          controls
          onLoad={() => setVideoReady(true)}
        />
      )}

      {/* ── Loading overlay ───────────────────────────────────────────────── */}
      {!videoReady && (
        <View style={st.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#B026FF" />
          <Text style={st.loadTxt}>Cargando...</Text>
        </View>
      )}

      {/* ── Controls overlay (puramente visual — pointerEvents none) ─────── */}
      {videoReady && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, st.overlay, { opacity: overlayOpacity }]}
        >
          {/* Top bar */}
          <View style={st.topBar}>
            <View style={[st.backBtn, focused === 'back' && st.btnFocused]}>
              <Text style={st.backTxt}>← Atrás</Text>
            </View>
            {!!title && <Text style={st.titleTxt} numberOfLines={1}>{title}</Text>}
          </View>

          {/* Center controls */}
          <View style={st.center}>
            <View style={[st.ctrl, focused === 'rew' && st.ctrlFocused]}>
              <Text style={st.ctrlIcon}>⏪</Text>
              <Text style={st.ctrlLbl}>15s</Text>
            </View>
            <View style={[st.ctrlMain, focused === 'toggle' && st.ctrlMainFocused]}>
              <Text style={st.ctrlMainIcon}>{isPaused ? '▶' : '⏸'}</Text>
            </View>
            <View style={[st.ctrl, focused === 'fwd' && st.ctrlFocused]}>
              <Text style={st.ctrlIcon}>⏩</Text>
              <Text style={st.ctrlLbl}>15s</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={st.bottom}>
            <Text style={st.timeTxt}>{fmt(ct)}</Text>
            <View style={st.track}>
              <View style={[st.fill, { width: `${(progress * 100).toFixed(1)}%` as any }]} />
              <View style={[st.thumb, { left: `${(progress * 100).toFixed(1)}%` as any }]} />
            </View>
            <Text style={st.timeTxt}>{fmt(dur)}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  loadTxt: { color: '#fff', fontWeight: '800', fontSize: 16, marginTop: 16, letterSpacing: 1 },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.52)',
    zIndex: 100, justifyContent: 'space-between',
    paddingHorizontal: 44, paddingVertical: 32,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  backBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
  btnFocused: { backgroundColor: '#B026FF' },
  backTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  titleTxt: { color: '#fff', fontSize: 20, fontWeight: '900', flex: 1 },
  center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  ctrl: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 18, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  ctrlFocused: { backgroundColor: 'rgba(176,38,255,0.6)', borderWidth: 2, borderColor: '#B026FF' },
  ctrlIcon: { fontSize: 30, color: '#fff' },
  ctrlLbl: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4, fontWeight: '600' },
  ctrlMain: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(176,38,255,0.25)', borderWidth: 2, borderColor: '#B026FF' },
  ctrlMainFocused: { backgroundColor: '#B026FF' },
  ctrlMainIcon: { fontSize: 38, color: '#fff' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  timeTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', minWidth: 48 },
  track: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'visible', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#B026FF', borderRadius: 3 },
  thumb: { position: 'absolute', top: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', marginLeft: -9, shadowColor: '#B026FF', shadowOpacity: 0.8, shadowRadius: 6 },
});