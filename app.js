// Hoso Studio — ДЕЛИТСЯ YouTube ИЗ ПОЛЯ "ССЫЛКА..." — НАВСЕГДА
// КНОПКА "ПОДЕЛИТЬСЯ" — ОТПРАВЛЯЕТ ВСЁ: YouTube, ГАЛЕРЕЯ, ПОРЯДОК

(function(){
  const $ = s => document.querySelector(s);
  const list = $('#playersList');
  const template = $('#playerTemplate');
  const addBtn = $('#addPlayerBtn');
  const shareBtn = $('#shareBtn');

  // === УНИКАЛЬНЫЙ ID ===
  let userId = localStorage.getItem('hoso_user_id');
  if (!userId) {
    userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('hoso_user_id', userId);
  }

  const urlParams = new URLSearchParams(location.search);
  const shareId = urlParams.get('share');
  const isShared = !!shareId && shareId !== userId;
  const storageKey = isShared ? `hoso_shared_${shareId}` : `hoso_data_${userId}`;
  const originalKey = `hoso_data_${shareId}`;

  // === INDEXEDDB ===
  const DB = (function(){
    let db;
    const open = () => new Promise((resolve, reject) => {
      const req = indexedDB.open('hoso_storage_v1', 1);
      req.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', {keyPath: 'id'});
        }
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
    const put = item => new Promise(res => {
      if (!db) open().then(() => put(item).then(res));
      else db.transaction('files', 'readwrite').objectStore('files').put(item).onsuccess = res;
    });
    const get = id => new Promise(res => {
      if (!db) open().then(() => get(id).then(res));
      else db.transaction('files', 'readonly').objectStore('files').get(id).onsuccess = e => res(e.target.result);
    });
    const del = id => new Promise(res => {
      if (!db) open().then(() => del(id).then(res));
      else db.transaction('files', 'readwrite').objectStore('files').delete(id).onsuccess = res;
    });
    return {open, put, get, del};
  })();

  const blobCache = new Map();

  // === КНОПКА ПОДЕЛИТЬСЯ — ДЕЛИТСЯ YouTube ИЗ "ССЫЛКА..." ===
  shareBtn.onclick = () => {
    const url = `${location.origin}${location.pathname}?share=${userId}`;
    if (navigator.share) {
      navigator.share({url}).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Ссылка скопирована!\nДруг увидит твой плейлист с YouTube из поля "Ссылка..." — НАВСЕГДА.');
      }).catch(() => prompt('Скопируй:', url));
    }
  };

  // === ПЛЕЕР ===
  class Player {
    constructor(id) {
      this.id = id;
      this.el = template.content.cloneNode(true).firstElementChild;
      list.appendChild(this.el);
      this.init();
    }
    init() {
      this.video = this.el.querySelector('.video-element');
      this.iframe = this.el.querySelector('.iframe-wrapper');
      this.poster = this.el.querySelector('.poster-overlay');
      this.playBtn = this.el.querySelector('.btn-playpause');
      this.prevBtn = this.el.querySelector('.btn-prev');
      this.nextBtn = this.el.querySelector('.btn-next');
      this.loopBtn = this.el.querySelector('.btn-loop');
      this.removeBtn = this.el.querySelector('.btn-remove-player');
      this.progress = this.el.querySelector('.progress');
      this.time = this.el.querySelector('.time');
      this.form = this.el.querySelector('.addVideoForm');
      this.urlInput = this.el.querySelector('.url-input'); // ← ПОЛЕ "ССЫЛКА..."
      this.titleInput = this.el.querySelector('.title-input');
      this.fileInput = this.el.querySelector('.mobileFileInput');
      this.galleryBtn = this.el.querySelector('.gallery-btn');
      this.listEl = this.el.querySelector('.playlist-list');
      this.sortBtn = this.el.querySelector('.btn-sort');
      this.clearBtn = this.el.querySelector('.btn-clear-list');
      this.playlist = []; this.idx = -1; this.yt = false; this.loop = false;
      this.bind();
    }
    bind() {
      this.video.addEventListener('timeupdate', () => this.updateTime());
      this.video.addEventListener('ended', () => this.next());

      this.playBtn.onclick = () => this.toggle();
      this.prevBtn.onclick = () => this.prev();
      this.nextBtn.onclick = () => this.next();
      this.loopBtn.onclick = () => { this.loop = !this.loop; this.loopBtn.classList.toggle('active', this.loop); save(); };

      this.removeBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.playlist.forEach(it => {
          if (it.fileId && blobCache.has(it.fileId)) {
            URL.revokeObjectURL(blobCache.get(it.fileId));
            blobCache.delete(it.fileId);
            DB.del(it.fileId);
          }
        });
        this.el.remove(); players.delete(this.id); save();
      };

      this.progress.oninput = e => { if (this.video.duration) this.video.currentTime = (e.target.value / 100) * this.video.duration; };

      // ГАЛЕРЕЯ
      this.galleryBtn.addEventListener('click', (e) => { e.preventDefault(); setTimeout(() => this.fileInput.click(), 0); });
      this.galleryBtn.addEventListener('touchend', (e) => { e.preventDefault(); setTimeout(() => this.fileInput.click(), 0); });

      this.fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        for (const file of files) {
          if (!file.type.startsWith('video/')) continue;
          const fileId = `${userId}_p${this.id}_f${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
          await DB.put({id: fileId, blob: file});
          const url = URL.createObjectURL(file);
          blobCache.set(fileId, url);
          this.add({title: file.name.split('.').slice(0,-1).join('.'), source: 'local', fileId, url});
        }
        e.target.value = '';
        save();
      };

      // === ДОБАВЛЕНИЕ ИЗ ПОЛЯ "ССЫЛКА..." (YouTube и др.) ===
      this.form.onsubmit = e => {
        e.preventDefault();
        const url = this.urlInput.value.trim();
        const title = this.titleInput.value.trim() || null;
        if (!url) return;
        this.add({url, title, source: 'remote'}); // ← YouTube из "Ссылка..."
        this.form.reset();
        save();
      };

      this.sortBtn.onclick = () => { this.playlist.reverse(); this.render(); save(); };
      this.clearBtn.onclick = () => {
        this.playlist.forEach(it => {
          if (it.fileId && blobCache.has(it.fileId)) {
            URL.revokeObjectURL(blobCache.get(it.fileId));
            blobCache.delete(it.fileId);
            DB.del(it.fileId);
          }
        });
        this.playlist = []; this.listEl.innerHTML = ''; this.idx = -1; this.showPoster(); save();
      };
    }

    add(item) { this.playlist.push(item); this.render(); if (this.playlist.length === 1) this.play(0); save(); }
    render() {
      this.listEl.innerHTML = '';
      this.playlist.forEach((it, i) => {
        const li = document.createElement('li');
        li.className = 'playlist-item' + (this.idx === i ? ' active' : '');
        li.innerHTML = `<div class="pi-title">${it.title || 'Видео ' + (i+1)}</div>`;
        li.onclick = () => this.play(i);
        this.listEl.appendChild(li);
      });
    }

    async play(i) {
      if (i < 0 || i >= this.playlist.length) return;
      this.idx = i; const it = this.playlist[i]; this.video.muted = true; this.yt = false;
      this.iframe.innerHTML = ''; this.iframe.style.display = 'none'; this.video.style.display = 'block'; this.poster.style.display = 'none';

      if (it.source === 'local' && it.fileId) {
        let url = blobCache.get(it.fileId);
        if (!url) {
          const rec = await DB.get(it.fileId);
          if (rec?.blob) {
            url = URL.createObjectURL(rec.blob);
            blobCache.set(it.fileId, url);
          } else {
            this.playlist.splice(i, 1); this.render(); return;
          }
        }
        this.video.src = url;

      } else if (it.url && (it.url.includes('youtube') || it.url.includes('youtu.be'))) {
        const match = it.url.match(/v=([0-9A-Za-z_-]{11})|youtu\.be\/([0-9A-Za-z_-]{11})/);
        if (!match) { this.video.src = it.url; }
        else {
          const id = match[1] || match[2];
          this.yt = true;
          this.iframe.style.display = 'block';
          this.video.style.display = 'none';
          this.iframe.innerHTML = `
            <iframe 
              src="https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&playsinline=1" 
              allow="autoplay; encrypted-media" 
              frameborder="0" 
              style="width:100%;height:100%;border-radius:1rem;"
              allowfullscreen>
            </iframe>`;
          setTimeout(() => {
            this.iframe.innerHTML = `
              <iframe 
                src="https://www.youtube.com/embed/${id}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1" 
                allow="autoplay; encrypted-media" 
                frameborder="0" 
                style="width:100%;height:100%;border-radius:1rem;"
                allowfullscreen>
              </iframe>`;
          }, 1200);
          this.render();
          return;
        }
      } else {
        this.video.src = it.url;
      }

      try { await this.video.play(); } catch(e) {}
      setTimeout(() => this.video.muted = false, 800);
      this.render();
    }

    updateTime() { if (this.yt) return; const d = this.video.duration, c = this.video.currentTime; if (d) { this.progress.value = (c/d)*100; this.time.textContent = `${fmt(c)} / ${fmt(d)}`; } }
    toggle() { this.video.paused ? this.video.play() : this.video.pause(); this.playBtn.classList.toggle('paused', this.video.paused); }
    prev() { if (this.idx > 0) this.play(this.idx - 1); }
    next() { if (this.loop) { this.video.currentTime = 0; this.video.play(); return; } if (this.idx < this.playlist.length - 1) this.play(this.idx + 1); }
    showPoster() { this.video.src = ''; this.iframe.innerHTML = ''; this.poster.style.display = 'flex'; }
  }

  const fmt = s => isFinite(s) ? `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}` : '00:00';

  const players = new Map(); let nextId = 1;
  const addPlayer = () => { const id = nextId++; const p = new Player(id); players.set(id, p); save(); return p; };

  const save = () => {
    const data = {};
    players.forEach((p, id) => {
      data[id] = {
        playlist: p.playlist.map(i => ({
          url: i.url, title: i.title, source: i.source, fileId: i.fileId
        })),
        idx: p.idx, loop: p.loop
      };
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  const restore = async () => {
    await DB.open();

    if (isShared && !localStorage.getItem(storageKey)) {
      const originalRaw = localStorage.getItem(originalKey);
      if (originalRaw) {
        localStorage.setItem(storageKey, originalRaw);
      }
    }

    const raw = localStorage.getItem(storageKey);
    let hasData = false;

    if (raw) {
      try {
        const obj = JSON.parse(raw);
        Object.keys(obj).forEach(idStr => {
          const id = parseInt(idStr); const d = obj[idStr];
          const p = addPlayer(); p.id = id; p.playlist = d.playlist || []; p.idx = d.idx ?? -1; p.loop = d.loop || false;
          p.render();
          if (p.playlist.length) { p.video.muted = true; p.play(0); setTimeout(() => p.video.muted = false, 1000); }
        });
        nextId = Math.max(...Object.keys(obj).map(k => parseInt(k)), 0) + 1;
        hasData = true;
      } catch(e) { console.error(e); }
    }

    if (!hasData) {
      const p = addPlayer();
      p.add({url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Пример YouTube', source: 'remote'});
    }
  };

  addBtn.onclick = () => addPlayer();
  restore();
})();