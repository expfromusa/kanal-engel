// Kanal Engel: TizenTube için kanal engelleme eklentisi.
// TizenTube'dan sonra yüklenir. YouTube yanıtlarından engelli kanalların videolarını siler,
// basılı tutma menüsüne "Kanalı engelle" ekler, engeli kaldırmayı PIN ile korur.
(function () {
  'use strict';
  if (window.__kanalEngel) return;
  window.__kanalEngel = true;

  var STORE_KEY = 'kanalEngel.v1';
  var TAG = '[KanalEngel]';

  // ---------- Kayıt ----------

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { }
    if (!s || !Array.isArray(s.channels)) s = { channels: [], pinHash: null };
    if (!Array.isArray(s.words)) s.words = [];
    s.searchOff = !!s.searchOff;
    return s;
  }

  var state = load();
  var ids = {};
  var names = {};

  function norm(name) {
    return String(name || '').trim().toLowerCase();
  }

  function reindex() {
    ids = {};
    names = {};
    state.channels.forEach(function (c) {
      if (c.id) ids[c.id] = true;
      if (c.name) names[norm(c.name)] = true;
    });
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.error(TAG, 'kaydedilemedi', e); }
    reindex();
  }

  reindex();

  function isBlocked(id, name) {
    return (id && ids[id]) || (name && names[norm(name)]) || false;
  }

  // Başlık eşleştirmesi: büyük/küçük harf ve Türkçe karakter farkı gözetmez ("Korkunç" = "korkunc").
  var FOLD = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };

  function fold(s) {
    return String(s || '').toLocaleLowerCase('tr-TR').replace(/[çğıİöşüâîû]/g, function (ch) { return FOLD[ch] || ch; }).replace(/\s+/g, ' ').trim();
  }

  // Oynatıcı yanıtında başlık gelmiyor; listelerde görülen başlıkları video kimliğiyle hatırlıyoruz.
  var seenTitles = {};
  var seenCount = 0;

  function rememberTitle(videoId, title) {
    if (!videoId || !title || seenTitles[videoId]) return;
    if (++seenCount > 3000) { seenTitles = {}; seenCount = 1; }
    seenTitles[videoId] = title;
  }

  function titleBlocked(title) {
    if (!title || !state.words.length) return false;
    var t = fold(title);
    return state.words.some(function (w) { return w && t.indexOf(fold(w)) !== -1; });
  }

  // ---------- YouTube TV yardımcıları ----------

  function ytInstance() {
    for (var key in window._yttv) {
      var v = window._yttv[key];
      if (v && v.instance && v.instance.resolveCommand) return v.instance;
    }
    return null;
  }

  function resolve(cmd) {
    var inst = ytInstance();
    if (inst) return inst.resolveCommand(cmd);
  }

  function toast(title, subtitle) {
    resolve({
      openPopupAction: {
        popupType: 'TOAST',
        popup: { overlayToastRenderer: { title: { simpleText: title }, subtitle: { simpleText: subtitle || '' } } }
      }
    });
  }

  function popupBack() {
    resolve({ signalAction: { signal: 'POPUP_BACK' } });
  }

  // Arayüz tanımadığı uç noktaları gösterilmeyen öğe sayar; TizenTube gibi bilinen bir
  // uç noktanın (playlistEditEndpoint) içine koyuyoruz, resolveCommand'da biz yakalıyoruz.
  function endpoint(action, parameters) {
    return { clickTrackingParams: null, playlistEditEndpoint: { customAction: { action: action, parameters: parameters } } };
  }

  function button(title, subtitle, action, parameters) {
    var b = {
      compactLinkRenderer: {
        title: { simpleText: title },
        serviceEndpoint: endpoint(action, parameters)
      }
    };
    if (subtitle) b.compactLinkRenderer.subtitle = { simpleText: subtitle };
    return b;
  }

  function showModal(id, title, subtitle, items, selectedIndex, update) {
    var header = { title: { simpleText: title } };
    if (subtitle) header.subtitle = { simpleText: subtitle };
    var cmd = {
      openPopupAction: {
        popupType: 'MODAL',
        popup: {
          overlaySectionRenderer: {
            overlay: {
              overlayTwoPanelRenderer: {
                actionPanel: {
                  overlayPanelRenderer: {
                    header: { overlayPanelHeaderRenderer: header },
                    content: { overlayPanelItemListRenderer: { items: items, selectedIndex: selectedIndex || 0 } }
                  }
                },
                backButton: { buttonRenderer: { command: { signalAction: { signal: 'POPUP_BACK' } } } }
              }
            },
            dismissalCommand: { signalAction: { signal: 'POPUP_BACK' } }
          }
        },
        uniqueId: id
      }
    };
    if (update) {
      cmd.openPopupAction.shouldMatchUniqueId = true;
      cmd.openPopupAction.updateAction = true;
    }
    resolve(cmd);
  }

  function text(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.simpleText) return t.simpleText;
    if (t.content) return t.content;
    if (Array.isArray(t.runs)) return t.runs.map(function (r) { return r.text || ''; }).join('');
    return '';
  }

  // Videonun yükleyen kanalını öğe JSON'undan çıkarır. Kanal kimliği her öğede bulunmayabilir,
  // o yüzden kanal adı da tutulur (kutucuğun ilk satırı).
  function findChannelId(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 14) return null;
    var be = obj.browseEndpoint;
    if (be && typeof be.browseId === 'string' && be.browseId.indexOf('UC') === 0) return be.browseId;
    for (var k in obj) {
      var v = obj[k];
      if (v && typeof v === 'object') {
        var r = findChannelId(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  function channelName(item) {
    if (item.tileRenderer) {
      var tile = item.tileRenderer;
      // Kanal kutucuğu: başlık kanalın adıdır.
      if (tile.onSelectCommand && tile.onSelectCommand.browseEndpoint &&
        String(tile.onSelectCommand.browseEndpoint.browseId || '').indexOf('UC') === 0) {
        return text(tile.metadata && tile.metadata.tileMetadataRenderer && tile.metadata.tileMetadataRenderer.title);
      }
      try { return text(tile.metadata.tileMetadataRenderer.lines[0].lineRenderer.items[0].lineItemRenderer.text); } catch (e) { }
      return '';
    }
    if (item.lockupViewModel) {
      try { return text(item.lockupViewModel.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0].text); } catch (e) { }
      return '';
    }
    var inner = item[Object.keys(item)[0]];
    if (inner) return text(inner.shortBylineText || inner.longBylineText || inner.ownerText);
    return '';
  }

  var ITEM_KEYS = {
    tileRenderer: 1, lockupViewModel: 1, videoRenderer: 1, compactVideoRenderer: 1, gridVideoRenderer: 1,
    reelItemRenderer: 1, shortsLockupViewModel: 1, channelRenderer: 1, gridChannelRenderer: 1
  };

  function itemKey(el) {
    for (var k in el) if (ITEM_KEYS[k]) return k;
    return null;
  }

  function itemVideoId(item) {
    if (item.tileRenderer) {
      var c = item.tileRenderer.onSelectCommand;
      return item.tileRenderer.contentId || (c && c.watchEndpoint && c.watchEndpoint.videoId) || null;
    }
    if (item.lockupViewModel) return item.lockupViewModel.contentId || null;
    return null;
  }

  function itemTitle(item) {
    if (item.tileRenderer) return text(item.tileRenderer.metadata && item.tileRenderer.metadata.tileMetadataRenderer && item.tileRenderer.metadata.tileMetadataRenderer.title);
    if (item.lockupViewModel) {
      var m = item.lockupViewModel.metadata && item.lockupViewModel.metadata.lockupMetadataViewModel;
      return text(m && m.title);
    }
    return '';
  }

  // ---------- Yanıt süzme ----------

  function blockedPageId(r) {
    // Kanal sayfası: browse_id engelliyse sayfadaki tüm videolar silinir.
    var stp = r && r.responseContext && r.responseContext.serviceTrackingParams;
    if (!Array.isArray(stp)) return null;
    for (var i = 0; i < stp.length; i++) {
      var params = stp[i].params || [];
      for (var j = 0; j < params.length; j++) {
        if (params[j].key === 'browse_id' && ids[params[j].value]) return params[j].value;
      }
    }
    return null;
  }

  // Tek geçişte süzer. Dönüş: [önce öğe var mıydı, sonra öğe kaldı mı].
  // İçindeki tüm videolar silinen satır boş kalırsa arayüz sonsuz "yükleniyor" gösteriyor; o satır da silinir.
  function filterTree(node, depth, all) {
    var had = false;
    var has = false;
    if (depth > 60) return [true, true];
    if (Array.isArray(node)) {
      for (var i = node.length - 1; i >= 0; i--) {
        var el = node[i];
        if (!el || typeof el !== 'object') continue;
        if (itemKey(el)) {
          had = true;
          var title = itemTitle(el);
          rememberTitle(itemVideoId(el), title);
          if (all || isBlocked(findChannelId(el, 0), channelName(el)) || titleBlocked(title)) node.splice(i, 1);
          else has = true;
          continue;
        }
        var r = filterTree(el, depth + 1, all);
        if (r[0]) had = true;
        if (r[1]) has = true;
        else if (r[0]) node.splice(i, 1);
      }
      return [had, has];
    }
    for (var k in node) {
      var v = node[k];
      if (v && typeof v === 'object') {
        var s = filterTree(v, depth + 1, all);
        if (s[0]) had = true;
        if (s[1]) has = true;
      }
    }
    return [had, has];
  }

  function gatePlayer(r) {
    var vd = r.videoDetails;
    if (!vd) return;
    var reason = isBlocked(vd.channelId, vd.author) ? 'Bu kanal engellendi.'
      : titleBlocked(vd.title || seenTitles[vd.videoId]) ? 'Bu video engellendi.' : null;
    if (!reason) return;
    r.playabilityStatus = {
      status: 'UNPLAYABLE',
      reason: reason,
      playableInEmbed: false
    };
    delete r.streamingData;
    delete r.playerAds;
    delete r.adPlacements;
  }

  // İzleme sayfası yanıtında videonun başlığı var. Oynatıcı yanıtı başlığı bilmeden geldiyse
  // (ör. doğrudan bağlantıyla açıldı) burada yakalanır: video durdurulur, ana sayfaya dönülür.
  function gateWatchPage(watch) {
    try {
      var contents = watch.results.results.contents;
      for (var i = 0; i < contents.length; i++) {
        var sec = contents[i].itemSectionRenderer;
        if (!sec) continue;
        for (var j = 0; j < sec.contents.length; j++) {
          var meta = sec.contents[j].videoMetadataRenderer;
          if (!meta) continue;
          var title = text(meta.title);
          rememberTitle(meta.videoId, title);
          if (titleBlocked(title)) {
            setTimeout(function () {
              var v = document.querySelector('video');
              if (v) v.pause();
              toast('Bu video engellendi', '');
              goHome();
            }, 300);
          }
          return;
        }
      }
    } catch (e) { }
  }

  function menuItemsOf(item) {
    try {
      if (item.tileRenderer) return item.tileRenderer.onLongPressCommand.showMenuCommand.menu.menuRenderer.items;
      if (item.lockupViewModel) return item.lockupViewModel.rendererContext.commandContext.onLongPress.innertubeCommand.showMenuCommand.menu.menuRenderer.items;
    } catch (e) { }
    return null;
  }

  function menuEntry(label, action, parameters) {
    return {
      menuServiceItemRenderer: {
        text: { runs: [{ text: label }] },
        serviceEndpoint: endpoint(action, parameters),
        trackingParams: null
      }
    };
  }

  function isOurEntry(m) {
    var ca = customActionOf(m && m.menuServiceItemRenderer && m.menuServiceItemRenderer.serviceEndpoint);
    return !!(ca && ca.action === 'KE_BLOCK');
  }

  function addMenus(node, depth) {
    if (depth > 60) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var el = node[i];
        if (!el || typeof el !== 'object') continue;
        if (el.tileRenderer || el.lockupViewModel) {
          var items = menuItemsOf(el);
          if (items && !items.some(isOurEntry)) {
            items.push(menuEntry('Kanalı engelle', 'KE_BLOCK', {
              videoId: itemVideoId(el),
              id: findChannelId(el, 0),
              name: channelName(el),
              title: itemTitle(el)
            }));
            items.push(menuEntry('Ebeveyn ayarları', 'KE_MANAGE', null));
          }
          continue;
        }
        addMenus(el, depth + 1);
      }
      return;
    }
    for (var k in node) {
      var v = node[k];
      if (v && typeof v === 'object') addMenus(v, depth + 1);
    }
  }

  var stats = { parsed: 0, processed: 0 };

  // ---------- Arama ----------

  // "Kelime ekle": ebeveyn arama kutusuna kelimeyi yazıp ARA'ya basar; arama yapılmaz, kelime listeye eklenir.
  var capture = { active: false, timer: null };

  function isSearchResponse(r) {
    return r.estimatedResults !== undefined || r.originalQuery !== undefined || r.refinements !== undefined;
  }

  // Arama ekranı sorguyu ne adreste ne de yanıtta taşıyor; en güvenilir kaynak arama kutusunun metni.
  function searchQueryOf(r) {
    if (typeof r.originalQuery === 'string') return r.originalQuery;
    var m = /[?&]q=([^&]+)/.exec(location.hash || '');
    if (m) return decodeURIComponent(m[1].replace(/\+/g, ' '));
    var box = document.querySelector('ytlr-search-text-box') || document.querySelector('ytlr-search-bar');
    var t = box ? String(box.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return t === 'Arama' || t === 'Search' ? '' : t;
  }

  function clearResults(r) {
    if (r.contents) {
      // Sayfa iskeleti kalsın ama içindeki satırlar boşalsın.
      filterTree(r.contents, 0, true);
    }
    delete r.refinements;
  }

  function isSearchCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    if (cmd.searchEndpoint) return true;
    var list = cmd.commandExecutorCommand && cmd.commandExecutorCommand.commands;
    return Array.isArray(list) && list.some(isSearchCommand);
  }

  function searchCommandQuery(cmd) {
    if (!cmd || typeof cmd !== 'object') return '';
    if (cmd.searchEndpoint) return cmd.searchEndpoint.query || '';
    var list = (cmd.commandExecutorCommand && cmd.commandExecutorCommand.commands) || [];
    for (var i = 0; i < list.length; i++) {
      var q = searchCommandQuery(list[i]);
      if (q) return q;
    }
    return '';
  }

  // Ana sayfanın üstündeki "Arama" kutusu arama kapalıyken gizlenir (kelime ekleme sırasında görünür).
  var searchStyle = null;

  function applySearchStyle() {
    var hide = state.searchOff && !capture.active;
    if (!searchStyle) {
      searchStyle = document.createElement('style');
      (document.head || document.documentElement).appendChild(searchStyle);
    }
    searchStyle.textContent = hide ? 'ytlr-search-bar{display:none!important}' : '';
  }

  function goHome() {
    resolve({ browseEndpoint: { browseId: 'default' } });
  }

  function startCapture() {
    capture.active = true;
    clearTimeout(capture.timer);
    // Ebeveyn vazgeçerse arama kendiliğinden yeniden kapanır.
    capture.timer = setTimeout(function () { capture.active = false; applySearchStyle(); }, 3 * 60 * 1000);
    applySearchStyle();
    popupBack();
    setTimeout(function () {
      toast('Kelime ekle', 'Engellenecek kelimeyi yazıp ARA\'ya basın.');
      resolve({ searchEndpoint: { query: '' } });
    }, 300);
  }

  function finishCapture(query) {
    var w = String(query || '').replace(/\s+/g, ' ').trim();
    if (!w) return false;
    capture.active = false;
    clearTimeout(capture.timer);
    applySearchStyle();
    if (!state.words.some(function (x) { return fold(x) === fold(w); })) {
      state.words.push(w);
      save();
    }
    toast('Kelime engellendi', '"' + w + '" geçen videolar artık görünmeyecek.');
    setTimeout(goHome, 400);
    return true;
  }

  // Arama sayfasına başka bir yoldan (ör. sesli arama) gelinirse: kayıt modunda kelimeyi al,
  // arama kapalıysa ana sayfaya dön.
  function onHashChange() {
    var hash = location.hash || '';
    if (hash.indexOf('#/search') !== 0) return;
    var m = /[?&]q=([^&]*)/.exec(hash);
    var q = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    if (capture.active) {
      if (q) finishCapture(q);
      return;
    }
    if (state.searchOff) {
      toast('Arama kapalı', 'Arama ebeveyn tarafından kapatıldı.');
      goHome();
    }
  }

  window.addEventListener('hashchange', onHashChange);
  applySearchStyle();

  function stripGuideSearch(r) {
    var items = r.items;
    if (!state.searchOff || !Array.isArray(items)) return;
    items.forEach(function (it) {
      var section = it && it.guideSectionRenderer;
      if (!section || !Array.isArray(section.items)) return;
      section.items = section.items.filter(function (e) {
        var ep = e && e.guideEntryRenderer && e.guideEntryRenderer.navigationEndpoint;
        return !(ep && ep.searchEndpoint);
      });
    });
  }

  function processResponse(r) {
    stats.parsed++;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return;
    try { stripGuideSearch(r); } catch (e) { console.error(TAG, e); }
    // Sadece InnerTube yanıtları (oynatıcı, sayfa, devam, arama).
    if (!r.responseContext && !r.videoDetails && !r.contents && !r.continuationContents && !r.onResponseReceivedActions) return;
    stats.processed++;
    try {
      gatePlayer(r);
      if (isSearchResponse(r)) {
        var q = searchQueryOf(r);
        if (capture.active) {
          // Kelime ekleme modunda arama yapılmaz; yazılan kelime listeye girer.
          if (q && finishCapture(q)) clearResults(r);
        } else if (state.searchOff || titleBlocked(q)) {
          // Arama kapalıysa ya da aranan şey engelli bir kelime içeriyorsa sonuç gösterilmez.
          clearResults(r);
        }
      }
      var watch = r.contents && r.contents.singleColumnWatchNextResults;
      if (watch) gateWatchPage(watch);
      if (state.channels.length || state.words.length) filterTree(r, 0, !!blockedPageId(r));
      // İlgili videolar tamamen boşalırsa izleme sayfası açılmıyor; TizenTube'un yaptığı gibi boş bir öğe bırak.
      var pivot = watch && watch.pivot && watch.pivot.sectionListRenderer;
      if (pivot && Array.isArray(pivot.contents) && !pivot.contents.length) pivot.contents = [{}];
      addMenus(r, 0);
    } catch (e) {
      console.error(TAG, 'yanıt işlenemedi', e);
    }
  }

  // ---------- Kanal kimliğini /next ile bulma ----------

  function innerTube() {
    var holder = null;
    for (var k in window._yttv) {
      if (window._yttv[k] && window._yttv[k].mappings) { holder = window._yttv[k]; break; }
    }
    if (!holder) return null;
    // Yeni sürümlerde servisler { type, value } içinde duruyor.
    function svc(name) {
      var m = holder.mappings.get(name);
      return m && m.value ? m.value : m;
    }
    var identity = svc('CurrentIdentityService');
    var client = svc('KabukiInnerTubeClient');
    if (!identity || typeof identity.get !== 'function' || !client || typeof client.fetch !== 'function') return null;
    return { identity: identity, client: client };
  }

  function lookupOwner(videoId) {
    return new Promise(function (resolveP) {
      var it = null;
      try { it = innerTube(); } catch (e) { }
      if (!it || !videoId) return resolveP(null);
      var done = false;
      setTimeout(function () { if (!done) { done = true; resolveP(null); } }, 8000);
      Promise.resolve(it.identity.get()).then(function (identity) {
        it.client.fetch({
          identity: identity,
          isPrefetch: false,
          path: '/youtubei/v1/next',
          payload: { videoId: videoId, racyCheckOk: true, contentCheckOk: true },
          clickTracking: { clickTrackingParams: null }
        }).subscribe(function (res) {
          if (done) return;
          done = true;
          try {
            var contents = res.contents.singleColumnWatchNextResults.results.results.contents;
            var section = contents.filter(function (c) { return c.itemSectionRenderer; })[0];
            var meta = section.itemSectionRenderer.contents.filter(function (c) { return c.videoMetadataRenderer; })[0];
            var owner = meta.videoMetadataRenderer.owner.videoOwnerRenderer;
            resolveP({ id: owner.navigationEndpoint.browseEndpoint.browseId, name: text(owner.title) });
          } catch (e) {
            resolveP(null);
          }
        }, function () { if (!done) { done = true; resolveP(null); } });
      }, function () { if (!done) { done = true; resolveP(null); } });
    });
  }

  // ---------- Eylemler ----------

  function blockChannel(p) {
    p = p || {};
    // Kutucukta kanal kimliği varsa ek sorguya gerek yok.
    var lookup = p.id && p.name ? Promise.resolve(null) : lookupOwner(p.videoId).catch(function () { return null; });
    lookup.then(function (owner) {
      var id = (owner && owner.id) || p.id || null;
      var name = (owner && owner.name) || p.name || '';
      if (!id && !name) {
        toast('Kanal bulunamadı', 'Bu video için kanal bilgisi alınamadı.');
        return;
      }
      if (!isBlocked(id, name)) {
        state.channels.push({ id: id, name: name, at: Date.now() });
        save();
      }
      toast('Kanal engellendi', (name || id) + ' artık görünmeyecek.');
    });
  }

  // PIN: SHA-256 özeti tutulur, düz PIN saklanmaz.
  function hashPin(pin) {
    var data = new TextEncoder().encode('kanalEngel:' + pin);
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', data).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h = 0;
    for (var i = 0; i < data.length; i++) h = (h * 31 + data[i]) | 0;
    return Promise.resolve('x' + h);
  }

  var pin = { entered: '', mode: 'check', first: '', next: null };
  var MAX_PIN_FAILS = 5;
  var PIN_LOCK_MS = 5 * 60 * 1000;

  function pinModal(update, selectedIndex) {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += i < pin.entered.length ? '● ' : '○ ';
    var title = pin.mode === 'set' ? 'Yeni PIN belirleyin' : pin.mode === 'confirm' ? 'PIN\'i tekrar girin' : 'Ebeveyn PIN\'i';
    var items = [];
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(function (d) {
      items.push(button(d, null, 'KE_PIN_DIGIT', d));
    });
    items.push(button('Sil', null, 'KE_PIN_DEL', null));
    showModal('ke-pin', title, dots.trim(), items, selectedIndex, update);
  }

  function askPin(next) {
    var wait = (state.pinLockedUntil || 0) - Date.now();
    if (state.pinHash && wait > 0) {
      toast('PIN kilitli', Math.ceil(wait / 60000) + ' dakika sonra tekrar deneyin.');
      return;
    }
    pin.entered = '';
    pin.first = '';
    pin.next = next;
    pin.mode = state.pinHash ? 'check' : 'set';
    pinModal(false, 0);
  }

  function pinDigit(d) {
    if (pin.entered.length >= 4) return;
    pin.entered += d;
    var idx = d === '0' ? 9 : Number(d) - 1;
    if (pin.entered.length < 4) return pinModal(true, idx);

    var value = pin.entered;
    pin.entered = '';
    if (pin.mode === 'set') {
      pin.first = value;
      pin.mode = 'confirm';
      return pinModal(true, 0);
    }
    if (pin.mode === 'confirm') {
      if (value !== pin.first) {
        pin.mode = 'set';
        pin.first = '';
        toast('PIN\'ler eşleşmedi', 'Tekrar deneyin.');
        return pinModal(true, 0);
      }
      return hashPin(value).then(function (h) {
        state.pinHash = h;
        save();
        toast('PIN kaydedildi', '');
        popupBack();
        if (pin.next) setTimeout(pin.next, 300);
      });
    }
    hashPin(value).then(function (h) {
      if (h !== state.pinHash) {
        // Kumandayla tüm PIN'leri denemeyi zorlaştırmak için 5 yanlıştan sonra 5 dakika kilit.
        state.pinFails = (state.pinFails || 0) + 1;
        if (state.pinFails >= MAX_PIN_FAILS) {
          state.pinFails = 0;
          state.pinLockedUntil = Date.now() + PIN_LOCK_MS;
          save();
          popupBack();
          toast('Çok fazla yanlış deneme', '5 dakika sonra tekrar deneyin.');
          return;
        }
        save();
        toast('Yanlış PIN', (MAX_PIN_FAILS - state.pinFails) + ' deneme hakkı kaldı.');
        return pinModal(true, 0);
      }
      state.pinFails = 0;
      save();
      popupBack();
      if (pin.next) setTimeout(pin.next, 300);
    });
  }

  function pinDel() {
    pin.entered = pin.entered.slice(0, -1);
    pinModal(true, 10);
  }

  function manageModal(update, selectedIndex) {
    var items = [
      button(state.searchOff ? 'Arama: KAPALI' : 'Arama: AÇIK', state.searchOff ? 'Açmak için seçin' : 'Kapatmak için seçin', 'KE_SEARCH_TOGGLE', null),
      button('Kelime ekle', 'Başlığında bu kelime geçen videoları engeller', 'KE_WORD_ADD', null)
    ];
    state.words.forEach(function (w, i) {
      items.push(button('Kelime: ' + w, 'Kaldırmak için seçin', 'KE_WORD_DEL', i));
    });
    state.channels.forEach(function (c, i) {
      items.push(button('Kanal: ' + (c.name || c.id), 'Engeli kaldırmak için seçin', 'KE_UNBLOCK', i));
    });
    items.push(button('PIN\'i değiştir', null, 'KE_PIN_CHANGE', null));
    var summary = state.channels.length + ' kanal, ' + state.words.length + ' kelime engelli';
    showModal('ke-manage', 'Ebeveyn ayarları', summary, items, selectedIndex || 0, update);
  }

  function toggleSearch() {
    state.searchOff = !state.searchOff;
    save();
    applySearchStyle();
    toast(state.searchOff ? 'Arama kapatıldı' : 'Arama açıldı', state.searchOff ? 'Kenar çubuğundaki arama, uygulama yeniden açılınca kaybolur.' : '');
    manageModal(true, 0);
  }

  function removeWord(i) {
    var w = state.words[i];
    if (w === undefined) return;
    state.words.splice(i, 1);
    save();
    toast('Kelime kaldırıldı', w);
    manageModal(true, 1);
  }

  function unblock(i) {
    var c = state.channels[i];
    if (!c) return;
    state.channels.splice(i, 1);
    save();
    toast('Engel kaldırıldı', c.name || c.id);
    manageModal(true);
  }

  function handle(action, parameters) {
    switch (action) {
      case 'KE_BLOCK': blockChannel(parameters); break;
      case 'KE_MANAGE': askPin(function () { manageModal(false); }); break;
      case 'KE_PIN_DIGIT': pinDigit(parameters); break;
      case 'KE_PIN_DEL': pinDel(); break;
      case 'KE_UNBLOCK': unblock(parameters); break;
      case 'KE_SEARCH_TOGGLE': toggleSearch(); break;
      case 'KE_WORD_ADD': startCapture(); break;
      case 'KE_WORD_DEL': removeWord(parameters); break;
      case 'KE_PIN_CHANGE':
        popupBack();
        setTimeout(function () {
          pin.entered = '';
          pin.first = '';
          pin.mode = 'set';
          pin.next = function () { manageModal(false); };
          pinModal(false, 0);
        }, 300);
        break;
      case 'KE_NOOP': break;
      default: return false;
    }
    return true;
  }

  function customActionOf(cmd) {
    if (!cmd) return null;
    var ca = cmd.customAction || (cmd.signalAction && cmd.signalAction.customAction) ||
      (cmd.playlistEditEndpoint && cmd.playlistEditEndpoint.customAction);
    if (ca && typeof ca.action === 'string' && ca.action.indexOf('KE_') === 0) return ca;
    return null;
  }

  // ---------- Kancalar ----------

  // TizenTube kendi JSON.parse ve resolveCommand sarmalayıcılarını kurar; bizimkiler onların
  // dışında olmalı. Biri sonradan değiştirirse yeniden sarılır.
  function wrapParse(owner) {
    var current = owner.parse;
    if (!current || current.__ke) return;
    var wrapped = function () {
      var r = current.apply(this, arguments);
      processResponse(r);
      return r;
    };
    wrapped.__ke = true;
    owner.parse = wrapped;
  }

  function wrapResolve(inst) {
    var current = inst.resolveCommand;
    if (!current || current.__ke) return;
    var wrapped = function (cmd, extra) {
      if (isSearchCommand(cmd)) {
        var q = searchCommandQuery(cmd);
        if (capture.active && q && finishCapture(q)) return true;
        if (state.searchOff && !capture.active) {
          toast('Arama kapalı', 'Arama ebeveyn tarafından kapatıldı.');
          return true;
        }
      }
      var ca = customActionOf(cmd);
      if (ca) {
        try { if (handle(ca.action, ca.parameters)) return true; } catch (e) { console.error(TAG, e); return true; }
      }
      // Menü tıklamaları commandExecutorCommand içinde gelir; bizimkileri ayıklayıp gerisini ilet.
      var list = cmd && cmd.commandExecutorCommand && cmd.commandExecutorCommand.commands;
      if (Array.isArray(list) && list.some(customActionOf)) {
        var rest = [];
        var ours = [];
        list.forEach(function (c) {
          var inner = customActionOf(c);
          if (inner) ours.push(inner);
          else rest.push(c);
        });
        // Önce menüyü kapatan komutlar çalışsın, yoksa açtığımız pencereyi de kapatırlar.
        var result = rest.length ? current.call(this, { commandExecutorCommand: { commands: rest } }, extra) : true;
        setTimeout(function () {
          ours.forEach(function (inner) {
            try { handle(inner.action, inner.parameters); } catch (e) { console.error(TAG, e); }
          });
        }, 200);
        return result;
      }
      return current.call(this, cmd, extra);
    };
    wrapped.__ke = true;
    inst.resolveCommand = wrapped;
  }

  function installHooks() {
    wrapParse(window.JSON);
    for (var key in window._yttv) {
      var v = window._yttv[key];
      if (!v) continue;
      if (v.JSON && v.JSON.parse && v.JSON !== window.JSON) wrapParse(v.JSON);
      if (v.instance && v.instance.resolveCommand) wrapResolve(v.instance);
    }
  }

  installHooks();
  var ticks = 0;
  var timer = setInterval(function () {
    installHooks();
    if (++ticks === 120) {
      clearInterval(timer);
      setInterval(installHooks, 5000);
    }
  }, 500);

  window.kanalEngel = {
    stats: stats,
    list: function () { return state.channels.slice(); },
    block: function (id, name) { state.channels.push({ id: id || null, name: name || '', at: Date.now() }); save(); },
    clear: function () { state.channels = []; save(); }
  };

  console.log(TAG, 'yüklendi,', state.channels.length, 'engelli kanal');
})();
