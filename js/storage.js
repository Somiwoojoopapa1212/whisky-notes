const Storage = {
  getWhiskies() {
    return JSON.parse(localStorage.getItem('whiskies') || '[]');
  },
  saveWhiskies(list) {
    localStorage.setItem('whiskies', JSON.stringify(list));
  },
  getWhisky(id) {
    return this.getWhiskies().find(w => w.id === id) || null;
  },
  addWhisky(data) {
    const list = this.getWhiskies();
    const w = { ...data, id: Date.now().toString(), addedAt: new Date().toISOString() };
    list.push(w);
    this.saveWhiskies(list);
    return w;
  },
  updateWhisky(id, data) {
    const list = this.getWhiskies();
    const idx = list.findIndex(w => w.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...data }; this.saveWhiskies(list); }
  },
  deleteWhisky(id) {
    this.saveWhiskies(this.getWhiskies().filter(w => w.id !== id));
    this.saveTastings(this.getTastings().filter(t => t.whiskeyId !== id));
  },

  getTastings() {
    return JSON.parse(localStorage.getItem('tastings') || '[]');
  },
  saveTastings(list) {
    localStorage.setItem('tastings', JSON.stringify(list));
  },
  getTastingsForWhisky(whiskeyId) {
    return this.getTastings().filter(t => t.whiskeyId === whiskeyId);
  },
  addTasting(data) {
    const list = this.getTastings();
    const t = { ...data, id: Date.now().toString() };
    list.push(t);
    this.saveTastings(list);
    return t;
  },
  updateTasting(id, data) {
    const list = this.getTastings();
    const idx = list.findIndex(t => t.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...data }; this.saveTastings(list); }
  },
  deleteTasting(id) {
    this.saveTastings(this.getTastings().filter(t => t.id !== id));
  },
};

const ImageDB = {
  _db: null,
  async _open() {
    if (this._db) return this._db;
    return new Promise((res, rej) => {
      const req = indexedDB.open('whiskyImagesDB', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('images', { keyPath: 'id' });
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },
  async save(id, dataUrl) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put({ id, dataUrl });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },
  async get(id) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction('images', 'readonly');
      const req = tx.objectStore('images').get(id);
      req.onsuccess = () => res(req.result?.dataUrl || null);
      req.onerror = () => rej(req.error);
    });
  },
  async delete(id) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').delete(id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },
};
