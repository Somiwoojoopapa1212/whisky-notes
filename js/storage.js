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
