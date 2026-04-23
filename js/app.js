// ── PWA 설치 ──
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn').style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('install-btn').style.display = 'none';
});

function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(result => {
    if (result.outcome === 'accepted') {
      document.getElementById('install-btn').style.display = 'none';
    }
    deferredInstallPrompt = null;
  });
}

// ── 상태 ──
let currentPage = 'collection';
let currentStatusFilter = 'all';
let currentTastingFilterWhisky = '';
let editingWhiskyId = null;
let editingTastingId = null;
let statsPeriod = 'all';
let statsDateFrom = '';
let statsDateTo = '';

// 이미지 관련 상태
let _pendingImageDataUrl = null;
let _deleteImageOnSave = false;
let _pendingTastingImageDataUrl = null;
let _deleteTastingImageOnSave = false;
let _cropCallback = null;

const STATUS_LABEL = { unopened: '미개봉', opened: '개봉중', finished: '완음' };
const STATUS_CLASS = { unopened: 'status-unopened', opened: 'status-opened', finished: 'status-finished' };

const FLAVORS = [
  { key: 'fruity', label: '과일',    emoji: '🍎' },
  { key: 'sweet',  label: '달콤',    emoji: '🍯' },
  { key: 'spicy',  label: '스파이시', emoji: '🌶️' },
  { key: 'oaky',   label: '오크',    emoji: '🌳' },
  { key: 'smoky',  label: '스모키',   emoji: '🔥' },
  { key: 'grainy', label: '곡물',    emoji: '🌾' },
];

// ── 레이더 차트 ──
function drawRadarChart(canvas, data, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const pad = opts.padding || 32;
  const r = Math.min(cx, cy) - pad;
  const n = FLAVORS.length;
  const maxVal = 5;
  const vals = FLAVORS.map(f => data?.[f.key] || 0);
  const ang = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt  = (i, radius) => ({ x: cx + radius * Math.cos(ang(i)), y: cy + radius * Math.sin(ang(i)) });

  ctx.clearRect(0, 0, W, H);
  if (opts.bgColor) { ctx.fillStyle = opts.bgColor; ctx.fillRect(0, 0, W, H); }

  // 배경 링
  for (let ring = 1; ring <= maxVal; ring++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pt(i, r * ring / maxVal);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === maxVal ? 'rgba(193,127,36,0.35)' : 'rgba(193,127,36,0.15)';
    ctx.lineWidth = ring === maxVal ? 1.5 : 0.8;
    ctx.stroke();
  }
  // 축선
  for (let i = 0; i < n; i++) {
    const p = pt(i, r);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(193,127,36,0.15)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // 데이터 폴리곤
  if (vals.some(v => v > 0)) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pt(i, r * vals[i] / maxVal);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle   = opts.fillColor  || 'rgba(193,127,36,0.2)';
    ctx.fill();
    ctx.strokeStyle = opts.lineColor  || 'rgba(193,127,36,0.85)';
    ctx.lineWidth   = opts.lineWidth  || 2;
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      if (vals[i] > 0) {
        const p = pt(i, r * vals[i] / maxVal);
        ctx.beginPath(); ctx.arc(p.x, p.y, opts.dotRadius || 3, 0, Math.PI * 2);
        ctx.fillStyle = opts.dotColor || '#c17f24'; ctx.fill();
      }
    }
  }
  // 레이블
  if (opts.showLabels !== false) {
    const lpad = opts.labelPad || 20;
    ctx.font = `${opts.fontSize || 11}px -apple-system,sans-serif`;
    ctx.fillStyle = opts.labelColor || '#7a6a5a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const p = pt(i, r + lpad);
      ctx.fillText(FLAVORS[i].label, p.x, p.y);
    }
  }
}

function getFlavorData() {
  const d = {};
  FLAVORS.forEach(f => { const el = document.getElementById('fl-' + f.key); d[f.key] = el ? +el.value : 0; });
  return d;
}
function setFlavorData(data) {
  FLAVORS.forEach(f => {
    const el = document.getElementById('fl-' + f.key);
    const ve = document.getElementById('fv-' + f.key);
    const v = data?.[f.key] || 0;
    if (el) el.value = v;
    if (ve) ve.textContent = v;
  });
  updateFlavorPreview();
}
function updateFlavorPreview() {
  FLAVORS.forEach(f => {
    const el = document.getElementById('fl-' + f.key);
    const ve = document.getElementById('fv-' + f.key);
    if (el && ve) ve.textContent = el.value;
  });
  const c = document.getElementById('flavor-preview-canvas');
  if (c) drawRadarChart(c, getFlavorData(), { padding: 30, fontSize: 11, labelPad: 18 });
}

// ── 공유 카드 생성 ──
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function _wrapText(ctx, text, maxW, maxLines = 2) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

async function generateShareCard(tastingId) {
  showToast('카드 생성 중...');
  const t = Storage.getTastings().find(t => t.id === tastingId);
  if (!t) return;
  const w = t.whiskeyId ? Storage.getWhisky(t.whiskeyId) : null;
  const name = w?.name || t.customWhiskeyName || '위스키';
  const sub  = [w?.distillery || '', w?.region || t.region || ''].filter(Boolean).join(' · ');

  const photo = await ImageDB.get('tasting_' + tastingId);

  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');

  // 배경
  const bg = ctx.createLinearGradient(0, S, S, 0);
  bg.addColorStop(0, '#0f0500'); bg.addColorStop(0.5, '#1e0c00'); bg.addColorStop(1, '#2a1400');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

  // 앰버 글로우
  ['rgba(193,127,36,0.07)','rgba(193,127,36,0.05)'].forEach((c, i) => {
    const g = ctx.createRadialGradient(S * 0.4, S * 0.4, 0, S * 0.4, S * 0.4, S * (0.5 + i * 0.2));
    g.addColorStop(0, c); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  });

  // 하단 90px 고정 예약 (푸터 영역)
  const FOOTER_TOP = S - 90;

  // 상단 구분선
  ctx.fillStyle = '#c17f24'; ctx.fillRect(60, 58, S - 120, 2);

  // 앱 이름
  ctx.font = 'bold 30px -apple-system,sans-serif';
  ctx.fillStyle = 'rgba(193,127,36,0.55)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('위스키 노트', 60, 74);

  // 날짜
  ctx.font = '28px -apple-system,sans-serif';
  ctx.fillStyle = 'rgba(193,127,36,0.45)';
  ctx.textAlign = 'right';
  ctx.fillText(t.date || '', S - 60, 74);

  let y = 130;

  // 사진 (있으면 오른쪽 상단, 280×280)
  const PH = 280;
  if (photo) {
    await new Promise(res => {
      const img = new Image(); img.onload = () => {
        ctx.save();
        _roundRect(ctx, S - 60 - PH, y, PH, PH, 18);
        ctx.clip(); ctx.drawImage(img, S - 60 - PH, y, PH, PH); ctx.restore();
        _roundRect(ctx, S - 60 - PH, y, PH, PH, 18);
        ctx.strokeStyle = 'rgba(193,127,36,0.4)'; ctx.lineWidth = 2; ctx.stroke();
        res();
      }; img.src = photo;
    });
  }

  // 위스키 이름
  const nameMaxW = photo ? S - 180 - PH : S - 120;
  ctx.font = 'bold 68px -apple-system,sans-serif';
  ctx.fillStyle = '#f5c842'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const nameLines = _wrapText(ctx, name, nameMaxW);
  nameLines.forEach((line, i) => ctx.fillText(line, 60, y + i * 82));
  y += nameLines.length * 82 + 12;

  // 증류소/지역
  if (sub) {
    ctx.font = '34px -apple-system,sans-serif';
    ctx.fillStyle = 'rgba(245,200,66,0.5)';
    ctx.fillText(sub, 60, y); y += 48;
  }

  // 점수
  if (t.score) {
    ctx.font = 'bold 38px -apple-system,sans-serif';
    ctx.fillStyle = '#c17f24';
    ctx.fillText(`★ ${t.score}점`, 60, y); y += 54;
  }

  y = Math.max(y, photo ? 130 + PH + 20 : y) + 20;

  // 구분선
  ctx.strokeStyle = 'rgba(193,127,36,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(S - 60, y); ctx.stroke();
  y += 28;

  // 향미 휠 (320×320)
  const hasFl = t.flavors && Object.values(t.flavors).some(v => v > 0);
  if (hasFl) {
    const WH = 320;
    const wc = document.createElement('canvas');
    wc.width = wc.height = WH;
    drawRadarChart(wc, t.flavors, {
      padding: 58, fontSize: 22, labelPad: 28,
      lineWidth: 3, dotRadius: 6,
      fillColor: 'rgba(193,127,36,0.22)',
      lineColor: 'rgba(193,127,36,0.9)',
      labelColor: 'rgba(245,210,100,0.85)',
    });
    ctx.drawImage(wc, (S - WH) / 2, y); y += WH + 18;
  }

  // 시음 노트
  const noteRows = [
    t.nose   ? ['향',    t.nose]   : null,
    t.palate ? ['맛',    t.palate] : null,
    t.finish ? ['피니시', t.finish] : null,
  ].filter(Boolean);

  if (noteRows.length > 0) {
    // 구분선
    ctx.strokeStyle = 'rgba(193,127,36,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(S - 60, y); ctx.stroke();
    y += 24;

    const FS = 26;  // 폰트 크기
    const ROW_H = 44; // 행 높이

    for (const [label, text] of noteRows) {
      if (y + FS > FOOTER_TOP - 16) break; // 푸터 영역 침범 방지

      ctx.textBaseline = 'top';

      // 레이블 (픽셀 폭 측정)
      ctx.font = `bold ${FS}px -apple-system,sans-serif`;
      ctx.fillStyle = '#c17f24';
      ctx.textAlign = 'left';
      ctx.fillText(label, 60, y);
      const labelW = ctx.measureText(label).width;

      // 구분자
      const sep = '  ·  ';
      ctx.font = `${FS}px -apple-system,sans-serif`;
      ctx.fillStyle = 'rgba(193,127,36,0.5)';
      ctx.fillText(sep, 60 + labelW, y);
      const sepW = ctx.measureText(sep).width;

      // 내용 (픽셀 기반 truncate — 한국어/영어 모두 정확하게 처리)
      const textX = 60 + labelW + sepW;
      const maxW = S - 60 - textX;
      ctx.fillStyle = 'rgba(255,225,170,0.85)';
      let displayText = text;
      while (displayText.length > 1 && ctx.measureText(displayText + '…').width > maxW) {
        displayText = displayText.slice(0, -1);
      }
      if (displayText.length < text.length) displayText += '…';
      ctx.fillText(displayText, textX, y);

      y += ROW_H;
    }
  }

  // 하단 고정 바 + 텍스트 (항상 FOOTER_TOP 기준)
  ctx.fillStyle = '#c17f24'; ctx.fillRect(60, FOOTER_TOP + 12, S - 120, 2);
  ctx.font = '24px -apple-system,sans-serif';
  ctx.fillStyle = 'rgba(193,127,36,0.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('위스키 노트 앱으로 기록했습니다', S / 2, FOOTER_TOP + 28);

  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-시음노트.png`;
    a.click();
  }, 'image/png');
  showToast('공유 카드가 저장되었습니다 📤');
}

const COLOR_HEX = {
  '페일 골든': '#f5e49a',
  '골든': '#e8b830',
  '딥 골든': '#d4950f',
  '앰버': '#c07a18',
  '딥 앰버': '#9a5c10',
  '구리': '#b06030',
  '딥 구리': '#7a3c18',
  '마호가니': '#5a2010',
  '다크 마호가니': '#3a1008',
};

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', () => {
  // 스플래시 화면 제거 (CSS 애니메이션 완료 후)
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.remove();
  }, 3800);
  setupNav();
  setupTabFilters();
  document.getElementById('tasting-filter-whisky').addEventListener('change', e => {
    currentTastingFilterWhisky = e.target.value;
    renderTastingList();
  });
  document.getElementById('tasting-whisky-id').addEventListener('change', e => {
    const val = e.target.value;
    const isCustom = val === '__custom__';
    document.getElementById('custom-whisky-group').style.display = isCustom ? 'block' : 'none';
    if (!isCustom) setVal('tasting-custom-whisky', '');
    // 컬렉션에서 선택 시 자동 입력
    if (val && !isCustom) {
      const w = Storage.getWhisky(val);
      if (w) {
        setVal('tasting-region', w.region || '');
        setVal('tasting-type', w.type || '');
        setVal('tasting-age', w.age || '');
        setVal('tasting-abv', w.abv || '');
        showAutoFillHint(true);
      }
    } else {
      showAutoFillHint(false);
    }
  });

  document.querySelectorAll('.stats-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsPeriod = btn.dataset.period;
      document.getElementById('stats-custom-date').style.display =
        statsPeriod === 'custom' ? 'flex' : 'none';
      if (statsPeriod !== 'custom') renderStats();
    });
  });
  renderPage('collection');

  if (!localStorage.getItem('cloudSyncConsent')) {
    setTimeout(() => {
      document.getElementById('consent-banner').classList.add('show');
    }, 1500);
  }

  // 자동완성: 외부 클릭 시 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('.ac-wrap') && !e.target.closest('.ac-list')) hideAc();
  });
});

function setupNav() {
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll(`[data-page="${page}"]`).forEach(i => i.classList.add('active'));
      renderPage(page);
    });
  });
}

function setupTabFilters() {
  document.querySelectorAll('#page-collection .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-collection .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatusFilter = tab.dataset.status;
      renderCollection();
    });
  });
}

function showAutoFillHint(show) {
  const hints = ['hint-region', 'hint-type'];
  hints.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = show ? '(자동 입력됨)' : '';
  });
}

// ── 페이지 렌더 ──
function renderPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  if (page === 'collection') renderCollection();
  else if (page === 'tasting') renderTastingPage();
  else if (page === 'stats') renderStats();
  else if (page === 'wishlist') renderWishlist();
}

// ══════════════════════════════
// ── 컬렉션 ──
// ══════════════════════════════
function renderCollection() {
  const all = Storage.getWhiskies();
  const counts = {
    all: all.length,
    unopened: all.filter(w => w.status === 'unopened').length,
    opened: all.filter(w => w.status === 'opened').length,
    finished: all.filter(w => w.status === 'finished').length,
  };
  document.getElementById('collection-subtitle').textContent =
    `전체 ${counts.all}병  ·  미개봉 ${counts.unopened}  ·  개봉중 ${counts.opened}  ·  완음 ${counts.finished}`;

  const filtered = currentStatusFilter === 'all' ? all : all.filter(w => w.status === currentStatusFilter);
  const grid = document.getElementById('whisky-grid');
  const empty = document.getElementById('collection-empty');
  grid.innerHTML = '';

  if (filtered.length === 0) {
    empty.style.display = 'block';
    grid.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  grid.style.display = 'grid';

  filtered.forEach(w => {
    const tastings = Storage.getTastingsForWhisky(w.id);
    const totalPoured = tastings.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const remaining = w.bottleSize ? Math.max(0, parseFloat(w.bottleSize) - totalPoured) : null;

    const card = document.createElement('div');
    card.className = 'whisky-card';
    card.innerHTML = `
      <div class="card-thumb" onclick="openDetailModal('${w.id}')">
        <img class="whisky-card-img" id="thumb-${w.id}" alt="" />
        <span class="card-thumb-ph">🥃</span>
      </div>
      <div class="card-content" onclick="openDetailModal('${w.id}')">
        <div class="card-row-top">
          <div class="whisky-name">${w.name}</div>
          <div class="whisky-card-actions" onclick="event.stopPropagation()">
            <button class="btn-icon-sm" title="수정" onclick="openEditWhiskyModal('${w.id}')">✏️</button>
            <button class="btn-icon-sm" title="삭제" onclick="deleteWhisky('${w.id}')">🗑️</button>
          </div>
        </div>
        <div class="whisky-meta">${[w.distillery, w.region].filter(Boolean).join(' · ')}</div>
        <div class="whisky-tags">
          ${w.type ? `<span class="tag">${w.type}</span>` : ''}
          ${w.age ? `<span class="tag">${w.age === 'NAS' ? 'NAS' : w.age + '년'}</span>` : ''}
          ${w.abv ? `<span class="tag">${w.abv}%</span>` : ''}
        </div>
        <div class="card-row-bottom">
          <span class="status-badge ${STATUS_CLASS[w.status]}">${STATUS_LABEL[w.status]}</span>
          <span class="footer-left">📝 ${tastings.length}회
            ${w.status === 'opened' && remaining !== null ? `<span class="remaining">· 잔여 ≈${remaining.toFixed(0)}ml</span>` : ''}
          </span>
          ${w.purchasePrice ? `<span class="whisky-price">₩${parseInt(w.purchasePrice).toLocaleString()}</span>` : ''}
        </div>
      </div>
    `;
    grid.appendChild(card);
    ImageDB.get(w.id).then(img => {
      if (img) {
        const thumb = document.getElementById(`thumb-${w.id}`);
        if (thumb) {
          thumb.src = img;
          thumb.style.display = 'block';
          const ph = thumb.nextElementSibling;
          if (ph) ph.style.display = 'none';
        }
      }
    });
  });
}

// ── 위스키 모달 ──
function openAddWhiskyModal() {
  editingWhiskyId = null;
  document.getElementById('modal-whisky-title').textContent = '위스키 추가';
  clearWhiskyForm();
  openModal('modal-whisky');
}

async function openEditWhiskyModal(id) {
  editingWhiskyId = id;
  document.getElementById('modal-whisky-title').textContent = '위스키 수정';
  const w = Storage.getWhisky(id);
  if (!w) return;
  setVal('whisky-name', w.name);
  setVal('whisky-distillery', w.distillery);
  setVal('whisky-region', w.region);
  setVal('whisky-type', w.type);
  setVal('whisky-age', w.age);
  setVal('whisky-abv', w.abv);
  setVal('whisky-bottle-size', w.bottleSize || '700');
  setVal('whisky-status', w.status || 'unopened');
  setVal('whisky-purchase-date', w.purchaseDate);
  setVal('whisky-purchase-price', w.purchasePrice);
  setVal('whisky-purchase-location', w.purchaseLocation);
  setVal('whisky-notes', w.notes);
  clearImageUI();
  const existingImg = await ImageDB.get(id);
  if (existingImg) _showImagePreview(existingImg);
  openModal('modal-whisky');
}

function clearWhiskyForm() {
  ['whisky-name','whisky-distillery','whisky-age','whisky-abv',
   'whisky-purchase-date','whisky-purchase-price','whisky-purchase-location','whisky-notes']
    .forEach(id => setVal(id, ''));
  setVal('whisky-region', '');
  setVal('whisky-type', '');
  setVal('whisky-bottle-size', '700');
  setVal('whisky-status', 'unopened');
  clearImageUI();
}

function clearImageUI() {
  _pendingImageDataUrl = null;
  _deleteImageOnSave = false;
  const preview = document.getElementById('whisky-img-preview');
  const ph = document.getElementById('whisky-img-ph');
  const removeBtn = document.getElementById('whisky-img-remove-btn');
  const fileInput = document.getElementById('whisky-img-file');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (ph) ph.style.display = 'flex';
  if (removeBtn) removeBtn.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function _showImagePreview(dataUrl) {
  const preview = document.getElementById('whisky-img-preview');
  const ph = document.getElementById('whisky-img-ph');
  const removeBtn = document.getElementById('whisky-img-remove-btn');
  if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
  if (ph) ph.style.display = 'none';
  if (removeBtn) removeBtn.style.display = 'inline-flex';
}

function handleImageSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('이미지 파일을 선택해주세요.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    _cropCallback = result => {
      _pendingImageDataUrl = result;
      _deleteImageOnSave = false;
      _showImagePreview(result);
    };
    Crop.open(e.target.result);
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  _pendingImageDataUrl = null;
  _deleteImageOnSave = true;
  clearImageUI();
}

// ── 시음 사진 ──
function clearTastingImageUI() {
  _pendingTastingImageDataUrl = null;
  _deleteTastingImageOnSave = false;
  const preview = document.getElementById('tasting-img-preview');
  const ph = document.getElementById('tasting-img-ph');
  const removeBtn = document.getElementById('tasting-img-remove-btn');
  const fileInput = document.getElementById('tasting-img-file');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (ph) ph.style.display = 'flex';
  if (removeBtn) removeBtn.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function _showTastingImagePreview(dataUrl) {
  const preview = document.getElementById('tasting-img-preview');
  const ph = document.getElementById('tasting-img-ph');
  const removeBtn = document.getElementById('tasting-img-remove-btn');
  if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
  if (ph) ph.style.display = 'none';
  if (removeBtn) removeBtn.style.display = 'inline-flex';
}

function handleTastingImageSelect(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('이미지 파일을 선택해주세요.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    _cropCallback = result => {
      _pendingTastingImageDataUrl = result;
      _deleteTastingImageOnSave = false;
      _showTastingImagePreview(result);
    };
    Crop.open(e.target.result);
  };
  reader.readAsDataURL(file);
}

function removeTastingImage() {
  _pendingTastingImageDataUrl = null;
  _deleteTastingImageOnSave = true;
  clearTastingImageUI();
}

async function saveWhisky() {
  const name = getVal('whisky-name').trim();
  if (!name) { alert('위스키 이름을 입력하세요.'); return; }
  const data = {
    name,
    distillery: getVal('whisky-distillery').trim(),
    region: getVal('whisky-region'),
    type: getVal('whisky-type'),
    age: getVal('whisky-age').trim(),
    abv: getVal('whisky-abv'),
    bottleSize: getVal('whisky-bottle-size'),
    status: getVal('whisky-status'),
    purchaseDate: getVal('whisky-purchase-date'),
    purchasePrice: getVal('whisky-purchase-price'),
    purchaseLocation: getVal('whisky-purchase-location').trim(),
    notes: getVal('whisky-notes').trim(),
  };
  let savedId;
  if (editingWhiskyId) {
    Storage.updateWhisky(editingWhiskyId, data);
    savedId = editingWhiskyId;
  } else {
    const w = Storage.addWhisky(data);
    savedId = w.id;
  }
  if (_pendingImageDataUrl) await ImageDB.save(savedId, _pendingImageDataUrl);
  else if (_deleteImageOnSave) await ImageDB.delete(savedId);
  _pendingImageDataUrl = null;
  _deleteImageOnSave = false;
  closeModal('modal-whisky');
  renderCollection();
}

async function deleteWhisky(id) {
  const w = Storage.getWhisky(id);
  if (!confirm(`"${w?.name}"을(를) 삭제할까요?\n관련 시음 노트도 함께 삭제됩니다.`)) return;
  Storage.deleteWhisky(id);
  await ImageDB.delete(id);
  renderCollection();
}

// ── 위스키 상세 모달 ──
async function openDetailModal(id) {
  const w = Storage.getWhisky(id);
  if (!w) return;
  const tastings = Storage.getTastingsForWhisky(id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalPoured = tastings.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const remaining = w.bottleSize ? Math.max(0, parseFloat(w.bottleSize) - totalPoured) : null;
  const avgScore = tastings.filter(t => t.score).length
    ? Math.round(tastings.filter(t => t.score).reduce((s, t) => s + parseInt(t.score), 0) / tastings.filter(t => t.score).length)
    : null;
  const imgDataUrl = await ImageDB.get(id);

  document.getElementById('detail-whisky-name').textContent = w.name;
  document.getElementById('detail-edit-btn').onclick = () => { closeModal('modal-detail'); openEditWhiskyModal(id); };

  const infoRows = [
    ['증류소', w.distillery], ['지역', w.region], ['종류', w.type],
    ['숙성', w.age ? (w.age === 'NAS' ? 'NAS' : w.age + '년') : ''],
    ['도수', w.abv ? w.abv + '%' : ''],
    ['용량', w.bottleSize ? w.bottleSize + 'ml' : ''],
    ['구매일', w.purchaseDate ? formatDate(w.purchaseDate) : ''],
    ['구매가격', w.purchasePrice ? '₩' + parseInt(w.purchasePrice).toLocaleString() : ''],
    ['구매처', w.purchaseLocation],
  ].filter(([, v]) => v);

  document.getElementById('detail-body').innerHTML = `
    ${imgDataUrl ? `<img class="detail-full-img" src="${imgDataUrl}" alt="${w.name}" />` : ''}
    <div class="detail-top-row">
      <span class="status-badge ${STATUS_CLASS[w.status]}">${STATUS_LABEL[w.status]}</span>
      <span class="detail-stats">
        시음 ${tastings.length}회 · 총 ${totalPoured}ml 소비
        ${remaining !== null && w.status === 'opened' ? ` · 잔여 ≈${remaining.toFixed(0)}ml` : ''}
        ${avgScore ? ` · 평균 ${avgScore}점` : ''}
      </span>
    </div>

    ${infoRows.length ? `
    <div class="detail-info-grid">
      ${infoRows.map(([label, value]) => `
        <div class="detail-info-row">
          <span class="detail-label">${label}</span>
          <span class="detail-value">${value}</span>
        </div>`).join('')}
    </div>` : ''}

    ${w.notes ? `<div class="detail-notes">📝 ${w.notes}</div>` : ''}

    <div class="detail-section-title">
      시음 기록 (${tastings.length})
      <button class="btn btn-sm btn-primary" onclick="closeModal('modal-detail'); openAddTastingModalForWhisky('${id}')">+ 추가</button>
    </div>

    ${tastings.length === 0
      ? '<p class="empty-hint">아직 시음 기록이 없습니다.</p>'
      : tastings.map(t => `
        <div class="detail-tasting-item">
          <div class="detail-tasting-header">
            <span class="detail-tasting-date">${formatDate(t.date)}</span>
            ${t.amount ? `<span class="detail-tasting-meta">${t.amount}ml</span>` : ''}
            ${t.color ? `<span class="detail-tasting-meta">${colorSwatch(t.color)}${t.color}</span>` : ''}
            ${t.score ? `<span class="score-badge">종합 ${t.score}점</span>` : ''}
            <div style="margin-left:auto;display:flex;gap:4px;">
              <button class="btn-share" title="공유 카드" onclick="generateShareCard('${t.id}')">📤</button>
              <button class="btn-icon-sm" onclick="openEditTastingModal('${t.id}')">✏️</button>
              <button class="btn-icon-sm" onclick="deleteTasting('${t.id}', true)">🗑️</button>
            </div>
          </div>
          ${(t.flavors && Object.values(t.flavors).some(v => v > 0)) ? `<div class="detail-radar-wrap"><canvas class="detail-radar" id="dr-${t.id}" width="200" height="200"></canvas></div>` : ''}
          ${t.nose ? `<div class="detail-tasting-row"><span class="tasting-label">향</span><span>${t.nose}</span></div>` : ''}
          ${t.palate ? `<div class="detail-tasting-row"><span class="tasting-label">맛</span><span>${t.palate}</span></div>` : ''}
          ${t.finish ? `<div class="detail-tasting-row"><span class="tasting-label">피니시</span><span>${t.finish}</span></div>` : ''}
          ${(t.noseScore || t.palateScore || t.finishScore) ? `<div class="detail-tasting-row"><span class="tasting-label">세부 점수</span><span class="score-badges">${t.noseScore ? `<span class="score-mini-item">향 ${t.noseScore}</span>` : ''}${t.palateScore ? `<span class="score-mini-item">맛 ${t.palateScore}</span>` : ''}${t.finishScore ? `<span class="score-mini-item">피니시 ${t.finishScore}</span>` : ''}</span></div>` : ''}
          ${t.notes ? `<div class="detail-tasting-row"><span class="tasting-label">메모</span><span>${t.notes}</span></div>` : ''}
        </div>`).join('')
    }
  `;
  openModal('modal-detail');

  // 레이더 차트 렌더링 (innerHTML 설정 후)
  tastings.forEach(t => {
    if (t.flavors && Object.values(t.flavors).some(v => v > 0)) {
      const c = document.getElementById(`dr-${t.id}`);
      if (c) drawRadarChart(c, t.flavors, { padding: 38, fontSize: 13, labelPad: 22, lineWidth: 2, dotRadius: 4 });
    }
  });
}

function colorSwatch(colorName) {
  const hex = COLOR_HEX[colorName];
  return hex ? `<span class="color-swatch" style="background:${hex}"></span>` : '';
}

// ══════════════════════════════
// ── 시음 노트 ──
// ══════════════════════════════
function renderTastingPage() {
  const whiskies = Storage.getWhiskies();
  const sel = document.getElementById('tasting-filter-whisky');
  const prev = sel.value;
  sel.innerHTML = '<option value="">전체 위스키</option>';
  whiskies.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    sel.appendChild(opt);
  });
  sel.value = prev;
  renderTastingList();
}

function renderTastingList() {
  let tastings = Storage.getTastings();
  if (currentTastingFilterWhisky) tastings = tastings.filter(t => t.whiskeyId === currentTastingFilterWhisky);
  tastings.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  document.getElementById('tasting-subtitle').textContent = `총 ${tastings.length}개의 시음 노트`;

  const list = document.getElementById('tasting-list');
  const empty = document.getElementById('tasting-empty');
  list.innerHTML = '';

  if (tastings.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tastings.forEach(t => {
    const isCustom = !t.whiskeyId;
    const whiskyName = isCustom
      ? (t.customWhiskeyName || '(이름 없음)')
      : (Storage.getWhisky(t.whiskeyId)?.name || '(삭제된 위스키)');
    const customBadge = isCustom ? '<span class="tag-custom">바/외부</span>' : '';

    const noteSummary = [
      t.nose   ? `향 · ${t.nose}`   : '',
      t.palate ? `맛 · ${t.palate}` : '',
      t.finish ? `피니시 · ${t.finish}` : '',
    ].filter(Boolean).join('  ');

    const hasFlavors = t.flavors && Object.values(t.flavors).some(v => v > 0);
    const hasDetail = t.nose || t.palate || t.finish || t.notes || hasFlavors
      || t.noseScore || t.palateScore || t.finishScore;

    const card = document.createElement('div');
    card.className = 'tasting-card';
    card.id = `tasting-card-${t.id}`;
    card.innerHTML = `
      <div class="tasting-card-main" onclick="toggleTastingCard('${t.id}')">
        <div class="card-thumb">
          <img class="tasting-card-img" id="tasting-thumb-${t.id}" alt="" />
          <span class="card-thumb-ph">📝</span>
        </div>
        <div class="tasting-card-content">
          <div class="tasting-whisky-name">${whiskyName}${customBadge}</div>
          <div class="tasting-card-meta-row">
            <span class="tasting-date">${formatDate(t.date)}${t.color ? ` · ${colorSwatch(t.color)}${t.color}` : ''}${t.amount ? ` · ${t.amount}ml` : ''}</span>
            <div class="tasting-card-actions" onclick="event.stopPropagation()">
              ${t.score ? `<span class="score-badge">★ ${t.score}</span>` : ''}
              <button class="btn-share" title="공유 카드 만들기" onclick="generateShareCard('${t.id}')">📤</button>
              <button class="btn-icon-sm" onclick="openEditTastingModal('${t.id}')">✏️</button>
              <button class="btn-icon-sm" onclick="deleteTasting('${t.id}', false)">🗑️</button>
            </div>
          </div>
          ${noteSummary ? `<div class="tasting-note-summary">${noteSummary}</div>` : ''}
        </div>
        ${hasDetail ? `<div class="tc-chevron">▾</div>` : ''}
      </div>
      ${hasDetail ? `
      <div class="tasting-card-detail" id="tasting-expand-${t.id}" style="display:none">
        ${hasFlavors ? `<div class="tc-radar-wrap"><canvas id="tc-radar-${t.id}" width="140" height="140"></canvas></div>` : ''}
        ${t.nose   ? `<div class="tc-note-row"><span class="tasting-label">향</span><span class="tc-note-text">${t.nose}</span></div>` : ''}
        ${t.palate ? `<div class="tc-note-row"><span class="tasting-label">맛</span><span class="tc-note-text">${t.palate}</span></div>` : ''}
        ${t.finish ? `<div class="tc-note-row"><span class="tasting-label">피니시</span><span class="tc-note-text">${t.finish}</span></div>` : ''}
        ${(t.noseScore || t.palateScore || t.finishScore) ? `
          <div class="tc-note-row">
            <span class="tasting-label">세부점수</span>
            <span class="score-badges">
              ${t.noseScore ? `<span class="score-mini-item">향 ${t.noseScore}</span>` : ''}
              ${t.palateScore ? `<span class="score-mini-item">맛 ${t.palateScore}</span>` : ''}
              ${t.finishScore ? `<span class="score-mini-item">피니시 ${t.finishScore}</span>` : ''}
            </span>
          </div>` : ''}
        ${t.notes ? `<div class="tc-note-row"><span class="tasting-label">메모</span><span class="tc-note-text">${t.notes}</span></div>` : ''}
      </div>` : ''}
    `;
    list.appendChild(card);

    ImageDB.get('tasting_' + t.id).then(img => {
      if (img) {
        const thumb = document.getElementById(`tasting-thumb-${t.id}`);
        if (thumb) {
          thumb.src = img;
          thumb.style.display = 'block';
          const ph = thumb.nextElementSibling;
          if (ph) ph.style.display = 'none';
        }
      }
    });
  });
}

// ── 시음 카드 펼침/접힘 ──
function toggleTastingCard(id) {
  const card = document.getElementById(`tasting-card-${id}`);
  const detail = document.getElementById(`tasting-expand-${id}`);
  if (!card || !detail) return;

  const opening = !card.classList.contains('expanded');
  card.classList.toggle('expanded', opening);
  detail.style.display = opening ? 'flex' : 'none';

  if (opening) {
    const t = Storage.getTastings().find(t => t.id === id);
    if (t?.flavors && Object.values(t.flavors).some(v => v > 0)) {
      const c = document.getElementById(`tc-radar-${id}`);
      if (c && !c.dataset.rendered) {
        drawRadarChart(c, t.flavors, { padding: 22, fontSize: 11, labelPad: 16, lineWidth: 1.5, dotRadius: 3 });
        c.dataset.rendered = 'true';
      }
    }
  }
}

// ── 시음 노트 모달 ──
function openAddTastingModal() {
  editingTastingId = null;
  document.getElementById('modal-tasting-title').textContent = '시음 기록';
  clearTastingForm();
  clearTastingImageUI();
  populateTastingWhiskySelect('');
  setVal('tasting-date', new Date().toISOString().split('T')[0]);
  openModal('modal-tasting');
}

function openAddTastingModalForWhisky(whiskeyId) {
  openAddTastingModal();
  populateTastingWhiskySelect(whiskeyId);
  setVal('tasting-whisky-id', whiskeyId);
}

function openEditTastingModal(id) {
  editingTastingId = id;
  document.getElementById('modal-tasting-title').textContent = '시음 기록 수정';
  const t = Storage.getTastings().find(t => t.id === id);
  if (!t) return;
  const isCustom = !t.whiskeyId;
  populateTastingWhiskySelect(isCustom ? '__custom__' : (t.whiskeyId || ''));
  setVal('tasting-whisky-id', isCustom ? '__custom__' : t.whiskeyId);
  document.getElementById('custom-whisky-group').style.display = isCustom ? 'block' : 'none';
  setVal('tasting-custom-whisky', isCustom ? (t.customWhiskeyName || '') : '');
  setVal('tasting-date', t.date);
  setVal('tasting-amount', t.amount);
  setVal('tasting-color', t.color);
  setVal('tasting-region', t.region || '');
  setVal('tasting-type', t.type || '');
  setVal('tasting-age', t.age || '');
  setVal('tasting-abv', t.abv || '');
  setVal('tasting-nose', t.nose);
  setVal('tasting-palate', t.palate);
  setVal('tasting-finish', t.finish);
  setSliderVal('tasting-nose-score', 'val-nose-score', t.noseScore);
  setSliderVal('tasting-palate-score', 'val-palate-score', t.palateScore);
  setSliderVal('tasting-finish-score', 'val-finish-score', t.finishScore);
  setSliderVal('tasting-score', 'val-total-score', t.score);
  setVal('tasting-notes', t.notes);
  setFlavorData(t.flavors || null);
  showAutoFillHint(false);
  clearTastingImageUI();
  ImageDB.get('tasting_' + id).then(img => { if (img) _showTastingImagePreview(img); });
  openModal('modal-tasting');
}

function populateTastingWhiskySelect(selectedId) {
  const sel = document.getElementById('tasting-whisky-id');
  sel.innerHTML = '<option value="">위스키 선택</option><option value="__custom__">✏️ 직접 입력 (바 / 레스토랑 등)</option>';
  Storage.getWhiskies().forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    if (w.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
  if (selectedId === '__custom__') sel.value = '__custom__';
}

function clearTastingForm() {
  ['tasting-whisky-id','tasting-date','tasting-amount','tasting-color',
   'tasting-region','tasting-type','tasting-age','tasting-abv',
   'tasting-nose','tasting-palate','tasting-finish','tasting-notes',
   'tasting-custom-whisky']
    .forEach(id => setVal(id, ''));
  document.getElementById('custom-whisky-group').style.display = 'none';
  showAutoFillHint(false);
  resetSlider('tasting-nose-score', 'val-nose-score');
  resetSlider('tasting-palate-score', 'val-palate-score');
  resetSlider('tasting-finish-score', 'val-finish-score');
  resetSlider('tasting-score', 'val-total-score');
  setFlavorData(null);
}

async function saveTasting() {
  const selected = getVal('tasting-whisky-id');
  const isCustom = selected === '__custom__';
  const customWhiskeyName = isCustom ? getVal('tasting-custom-whisky').trim() : '';
  const date = getVal('tasting-date');

  if (!selected) { alert('위스키를 선택하세요.'); return; }
  if (isCustom && !customWhiskeyName) { alert('위스키 이름을 입력하세요.'); return; }
  if (!date) { alert('날짜를 입력하세요.'); return; }

  const data = {
    whiskeyId: isCustom ? '' : selected,
    customWhiskeyName,
    date,
    amount: getVal('tasting-amount'),
    color: getVal('tasting-color'),
    region: getVal('tasting-region'),
    type: getVal('tasting-type'),
    age: getVal('tasting-age').trim(),
    abv: getVal('tasting-abv'),
    nose: getVal('tasting-nose').trim(),
    palate: getVal('tasting-palate').trim(),
    finish: getVal('tasting-finish').trim(),
    noseScore: getSliderVal('tasting-nose-score'),
    palateScore: getSliderVal('tasting-palate-score'),
    finishScore: getSliderVal('tasting-finish-score'),
    score: getSliderVal('tasting-score'),
    notes: getVal('tasting-notes').trim(),
    flavors: getFlavorData(),
  };

  let savedId;
  if (editingTastingId) {
    Storage.updateTasting(editingTastingId, data);
    savedId = editingTastingId;
  } else {
    const t = Storage.addTasting(data);
    savedId = t.id;
    syncTastingToCloud(data, Storage.getWhiskies());
  }
  if (_pendingTastingImageDataUrl) await ImageDB.save('tasting_' + savedId, _pendingTastingImageDataUrl);
  else if (_deleteTastingImageOnSave) await ImageDB.delete('tasting_' + savedId);
  _pendingTastingImageDataUrl = null;
  _deleteTastingImageOnSave = false;

  closeModal('modal-tasting');
  if (currentPage === 'tasting') renderTastingList();
  else if (currentPage === 'collection' && !isCustom) openDetailModal(selected);
  else if (currentPage === 'collection') renderCollection();
}

async function deleteTasting(id, fromDetail) {
  if (!confirm('시음 노트를 삭제할까요?')) return;
  const t = Storage.getTastings().find(t => t.id === id);
  Storage.deleteTasting(id);
  await ImageDB.delete('tasting_' + id);
  if (fromDetail && t && t.whiskeyId) openDetailModal(t.whiskeyId);
  else renderTastingList();
}

// ══════════════════════════════
// ── 통계 ──
// ══════════════════════════════
function getStatsPeriodRange() {
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  switch (statsPeriod) {
    case 'month':
      from.setDate(1);
      return { from, to: today };
    case '3month':
      from.setMonth(from.getMonth() - 3);
      return { from, to: today };
    case '6month':
      from.setMonth(from.getMonth() - 6);
      return { from, to: today };
    case 'year':
      from.setMonth(0); from.setDate(1);
      return { from, to: today };
    case 'custom':
      return {
        from: statsDateFrom ? new Date(statsDateFrom + 'T00:00:00') : null,
        to: statsDateTo ? new Date(statsDateTo + 'T23:59:59') : null,
      };
    default:
      return { from: null, to: null };
  }
}

function applyCustomPeriod() {
  statsDateFrom = getVal('stats-date-from');
  statsDateTo = getVal('stats-date-to');
  renderStats();
}

function getEffectiveProp(t, prop) {
  if (t[prop]) return t[prop];
  if (t.whiskeyId) {
    const w = Storage.getWhisky(t.whiskeyId);
    return w ? w[prop] : null;
  }
  return null;
}

function renderStats() {
  const { from, to } = getStatsPeriodRange();
  const all = Storage.getTastings().filter(t => {
    if (!t.date) return true;
    const d = new Date(t.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  document.getElementById('stats-subtitle').textContent = `${all.length}개의 시음 기록`;

  const totalAmount = all.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const uniqueWhiskies = new Set(
    all.map(t => t.whiskeyId || t.customWhiskeyName || '').filter(Boolean)
  ).size;
  const scores = all.filter(t => t.score).map(t => parseInt(t.score));
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  document.getElementById('stats-summary').innerHTML = `
    <div class="summary-card">
      <div class="summary-num">${all.length}</div>
      <div class="summary-label">총 시음 횟수</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${totalAmount.toFixed(0)}<small>ml</small></div>
      <div class="summary-label">총 시음량</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${uniqueWhiskies}</div>
      <div class="summary-label">위스키 종류</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${avgScore !== null ? avgScore : '—'}<small>${avgScore !== null ? '점' : ''}</small></div>
      <div class="summary-label">종합 평균 점수</div>
    </div>
  `;

  if (all.length === 0) {
    ['chart-region','chart-type','chart-age','chart-abv','chart-scores'].forEach(id => {
      document.getElementById(id).innerHTML = '<p class="empty-hint">데이터가 없습니다.</p>';
    });
    renderTasteReport([]);
    return;
  }

  // 지역별
  const regionCount = {};
  all.forEach(t => {
    const v = getEffectiveProp(t, 'region') || '미입력';
    regionCount[v] = (regionCount[v] || 0) + 1;
  });
  renderBarChart('chart-region', regionCount, null);

  // 종류별
  const typeCount = {};
  all.forEach(t => {
    const v = getEffectiveProp(t, 'type') || '미입력';
    typeCount[v] = (typeCount[v] || 0) + 1;
  });
  renderBarChart('chart-type', typeCount, null);

  // 숙성연수별 (그룹)
  const ageCount = {};
  const ageGroup = a => {
    if (!a) return '미입력';
    if (a === 'NAS' || isNaN(parseInt(a))) return 'NAS';
    const n = parseInt(a);
    if (n <= 10) return '10년 이하';
    if (n <= 15) return '11~15년';
    if (n <= 20) return '16~20년';
    return '21년 이상';
  };
  const ageOrder = ['NAS', '10년 이하', '11~15년', '16~20년', '21년 이상', '미입력'];
  all.forEach(t => {
    const v = ageGroup(getEffectiveProp(t, 'age'));
    ageCount[v] = (ageCount[v] || 0) + 1;
  });
  renderBarChart('chart-age', ageCount, ageOrder);

  // 도수별 (그룹)
  const abvCount = {};
  const abvGroup = a => {
    if (!a) return '미입력';
    const n = parseFloat(a);
    if (n < 40) return '40% 미만';
    if (n < 45) return '40~45%';
    if (n < 50) return '45~50%';
    if (n < 55) return '50~55%';
    return '55% 이상';
  };
  const abvOrder = ['40% 미만', '40~45%', '45~50%', '50~55%', '55% 이상', '미입력'];
  all.forEach(t => {
    const v = abvGroup(getEffectiveProp(t, 'abv'));
    abvCount[v] = (abvCount[v] || 0) + 1;
  });
  renderBarChart('chart-abv', abvCount, abvOrder);

  // 점수 분석
  const scoreCategories = [
    { label: '향 (Nose)', key: 'noseScore' },
    { label: '맛 (Palate)', key: 'palateScore' },
    { label: '피니시 (Finish)', key: 'finishScore' },
    { label: '종합', key: 'score' },
  ];
  const scoreMap = {};
  scoreCategories.forEach(({ label, key }) => {
    const vals = all.filter(t => t[key] !== null && t[key] !== undefined && t[key] !== '').map(t => parseInt(t[key]));
    if (vals.length) scoreMap[label] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  });
  renderBarChart('chart-scores', scoreMap, scoreCategories.map(c => c.label).filter(l => scoreMap[l]));
  renderTasteReport(all);
}

// ── 취향 분석 리포트 ──
function renderTasteReport(all) {
  const container = document.getElementById('taste-report-section');
  if (!container) return;

  const withFlavors = all.filter(t => t.flavors && Object.values(t.flavors).some(v => v > 0));

  if (withFlavors.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:10px 0">향미 휠 데이터가 있는 시음 기록이 없습니다.<br>시음 노트 작성 시 향미 슬라이더를 입력해보세요.</p>';
    return;
  }

  // 향미 축별 평균 계산
  const avgFlavors = {};
  FLAVORS.forEach(f => {
    const vals = withFlavors.map(t => t.flavors[f.key] || 0);
    avgFlavors[f.key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  // 높은 점수 순 정렬
  const sorted = FLAVORS.slice().sort((a, b) => avgFlavors[b.key] - avgFlavors[a.key]);
  const desc     = _tasteDesc(avgFlavors, sorted);
  const styleRec = _tasteStyleRec(sorted, avgFlavors);
  const medals   = ['🥇', '🥈', '🥉', '', '', ''];

  container.innerHTML = `
    <div class="taste-report-body">
      <div class="taste-report-radar-wrap">
        <canvas id="taste-report-canvas" width="180" height="180"></canvas>
        <div class="taste-report-count">${withFlavors.length}개 시음 기록 분석</div>
      </div>
      <div class="taste-report-info">
        <div class="taste-report-desc">${desc}</div>
        <div class="taste-flavor-bars">
          ${sorted.map((f, i) => `
            <div class="taste-flavor-row">
              <span class="taste-flavor-rank">${medals[i]}</span>
              <span class="taste-flavor-emoji">${f.emoji}</span>
              <span class="taste-flavor-name">${f.label}</span>
              <div class="taste-flavor-track">
                <div class="taste-flavor-fill" style="width:${(avgFlavors[f.key] / 5 * 100).toFixed(1)}%"></div>
              </div>
              <span class="taste-flavor-score">${avgFlavors[f.key].toFixed(1)}</span>
            </div>
          `).join('')}
        </div>
        ${styleRec ? `<div class="taste-style-box"><div class="taste-style-title">🎯 어울리는 위스키 스타일</div>${styleRec}</div>` : ''}
      </div>
    </div>
  `;

  // innerHTML 설정 후 캔버스 렌더
  const c = document.getElementById('taste-report-canvas');
  if (c) drawRadarChart(c, avgFlavors, { padding: 34, fontSize: 12, labelPad: 20, lineWidth: 2.5, dotRadius: 4,
    fillColor: 'rgba(193,127,36,0.18)', lineColor: 'rgba(193,127,36,0.9)', labelColor: '#7a6a5a' });
}

function _tasteDesc(avgFlavors, sorted) {
  const maxScore = Math.max(...Object.values(avgFlavors));
  const minScore = Math.min(...Object.values(avgFlavors));
  const top1 = sorted[0], top2 = sorted[1];
  const t1 = avgFlavors[top1.key], t2 = avgFlavors[top2.key];

  if (maxScore < 1.0)
    return '아직 향미 선호가 뚜렷하게 나타나지 않습니다. 더 많은 시음 기록을 쌓아보세요 🥃';
  if (maxScore - minScore < 0.8)
    return `다양한 향미를 고루 즐기는 <strong>균형 잡힌 취향</strong>입니다. 어떤 스타일의 위스키도 편안하게 즐기실 수 있는 유연한 미각을 가지셨습니다.`;
  if (t2 >= t1 * 0.85)
    return `<strong>${top1.emoji} ${top1.label}</strong>과 <strong>${top2.emoji} ${top2.label}</strong>이 모두 강한 복합적인 취향입니다. 두 향미가 조화를 이루는 위스키를 특히 좋아하십니다.`;

  const notes = {
    smoky:  '피트와 훈연의 강렬함에서 매력을 느끼시는군요.',
    sweet:  '달콤하고 부드러운 캐릭터에 끌리시는군요.',
    fruity: '화사하고 생동감 있는 과일향을 즐기시는군요.',
    oaky:   '오크의 깊은 풍미와 묵직한 숙성감을 선호하시는군요.',
    spicy:  '활기차고 자극적인 스파이스를 즐기시는군요.',
    grainy: '곡물의 소박하고 깔끔한 풍미를 선호하시는군요.',
  };
  return `<strong>${top1.emoji} ${top1.label}</strong> 향미를 가장 선호하는 뚜렷한 취향입니다. ${notes[top1.key] || ''}`;
}

function _tasteStyleRec(sorted, avgFlavors) {
  const topKey = sorted[0].key;
  if (avgFlavors[topKey] < 1.5) return null;

  const styles = {
    smoky:  { tag:'🔥 아일라 싱글몰트',     desc:'피트향과 훈연의 강렬한 개성이 살아있는 스타일입니다.',       ex:'Ardbeg · Laphroaig · Lagavulin · Bruichladdich Octomore' },
    oaky:   { tag:'🌳 셰리 캐스크 싱글몰트', desc:'오크의 깊은 풍미와 말린 과일, 스파이스가 조화로운 스타일입니다.', ex:'GlenAllachie · Glenfarclas · Macallan · Aberlour' },
    sweet:  { tag:'🍯 버번 캐스크 숙성 몰트', desc:'바닐라, 꿀, 트로피컬 과일의 달콤하고 부드러운 스타일입니다.', ex:'Balvenie · Glenmorangie · Woodford Reserve · Buffalo Trace' },
    fruity: { tag:'🍎 스페이사이드 싱글몰트', desc:'화사하고 우아한 과일향이 특징인 스코틀랜드의 클래식 스타일입니다.', ex:'Glenfarclas · Craigellachie · BenRiach · Benromach' },
    spicy:  { tag:'🌶️ 하이랜드 / 라이 위스키', desc:'풍부한 스파이스와 드라이한 개성이 두드러지는 스타일입니다.', ex:'Dalmore · Highland Park · Old Pulteney · Rittenhouse Rye' },
    grainy: { tag:'🌾 블렌디드 / 그레인 위스키', desc:'부드럽고 깔끔한 곡물 풍미가 매력적인 접근성 좋은 스타일입니다.', ex:'Johnnie Walker Blue · Chivas 18 · Compass Box · Nikka From The Barrel' },
  };

  const s = styles[topKey];
  if (!s) return null;
  return `<span class="taste-style-tag">${s.tag}</span>
    <div class="taste-style-desc">${s.desc}</div>
    <div class="taste-style-examples">추천 위스키: <strong>${s.ex}</strong></div>`;
}

function renderBarChart(containerId, countMap, order) {
  const container = document.getElementById(containerId);
  const entries = order
    ? order.filter(k => countMap[k]).map(k => [k, countMap[k]])
    : Object.entries(countMap).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...Object.values(countMap), 1);

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-hint">데이터가 없습니다.</p>';
    return;
  }
  container.innerHTML = entries.map(([label, count]) => `
    <div class="bar-row">
      <span class="bar-label" title="${label}">${label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div>
      </div>
      <span class="bar-count">${count}</span>
    </div>
  `).join('');
}

// ── 데이터 공유 동의 ──
function setConsent(agreed) {
  localStorage.setItem('cloudSyncConsent', agreed ? 'true' : 'false');
  document.getElementById('consent-banner').classList.remove('show');
  if (agreed) showToast('감사합니다! 시음 데이터가 익명으로 공유됩니다 🥃');
}

// ── 설정 ──
function openSettingsModal() {
  document.getElementById('vision-api-key-input').value = localStorage.getItem('visionApiKey') || '';
  openModal('modal-settings');
}
function saveSettings() {
  const key = document.getElementById('vision-api-key-input').value.trim();
  if (key) localStorage.setItem('visionApiKey', key);
  else localStorage.removeItem('visionApiKey');
  closeModal('modal-settings');
  showToast(key ? 'API 키가 저장되었습니다 ✓' : 'API 키가 삭제되었습니다');
}

// ── 라벨 스캔 (Google Vision OCR) ──
function openLabelScanner() {
  const apiKey = localStorage.getItem('visionApiKey');
  if (!apiKey) {
    if (confirm('Google Vision API 키가 필요합니다.\n설정 화면으로 이동할까요?')) openSettingsModal();
    return;
  }
  document.getElementById('label-scan-input').click();
}

function handleLabelScan(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  const apiKey = localStorage.getItem('visionApiKey');
  if (!apiKey) return;

  showToast('라벨 분석 중... ⏳');

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const base64 = await _resizeForVision(e.target.result);
      const result = await _callVisionAPI(base64, apiKey);
      const parsed = _parseVisionOCR(result);
      await _applyLabelResult(parsed);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('API key')) showToast('API 키가 올바르지 않습니다. 설정을 확인해주세요.');
      else if (msg.includes('quota')) showToast('API 사용량이 초과됐습니다.');
      else showToast('라벨 인식에 실패했습니다. 다시 시도해주세요.');
    }
  };
  reader.readAsDataURL(file);
}

function _resizeForVision(dataUrl, maxPx = 1200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
    };
    img.src = dataUrl;
  });
}

async function _callVisionAPI(base64, apiKey) {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        }]
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const r = data.responses?.[0];
  if (r?.error) throw new Error(r.error.message);
  return r;
}

function _parseVisionOCR(response) {
  const fullText = response?.fullTextAnnotation?.text
    || response?.textAnnotations?.[0]?.description
    || '';
  if (!fullText.trim()) return null;

  const abvMatch = fullText.match(/(\d{2,3}(?:\.\d)?)\s*%(?:\s*(?:abv|vol|alc))?/i);
  const ageMatch = fullText.match(/(\d+)\s*(?:year|yr|yo|y\.o\.)/i)
    || fullText.match(/(\d+)\s*년/);

  // 이름으로 쓸 수 없는 서술어 라인 패턴
  const noisePattern = /^(single\s*malt|blended|scotch|irish|japanese|bourbon|whisky|whiskey|highland|speyside|islay|lowland|campbeltown|distillery|distilled|bottled|aged|matured|years?\s*old|established|est\.|product\s*of|imported|limited\s*edition|reserve|original|cask\s*strength|oak|sherry|batch|bottle\s*no|net\s*contents?|содержимое)$/i;

  const cleanLines = fullText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3)
    .filter(l => /[a-zA-Z가-힣]/.test(l))          // 문자 포함
    .filter(l => !/^\d+(\.\d+)?(%|ml|cl|л)?$/.test(l)) // 순수 숫자/용량 라인 제거
    .filter(l => !noisePattern.test(l));

  // 첫 2줄 합침 (브랜드명이 라벨에서 두 줄에 걸쳐 있는 경우 대응)
  let nameQuery = cleanLines.slice(0, 2).join(' ').trim();

  // 최대 4단어로 제한
  const words = nameQuery.split(/\s+/);
  if (words.length > 4) nameQuery = words.slice(0, 4).join(' ');

  return {
    nameQuery: nameQuery.trim(),
    abv: abvMatch ? abvMatch[1] : null,
    age: ageMatch ? ageMatch[1] : null,
  };
}

async function _applyLabelResult(parsed) {
  if (!parsed || !parsed.nameQuery) {
    showToast('텍스트를 인식하지 못했습니다. 라벨이 선명한지 확인해주세요.');
    return;
  }

  // 인식된 값 자동입력
  if (parsed.abv && !getVal('whisky-abv'))   setVal('whisky-abv', parsed.abv);
  if (parsed.age && !getVal('whisky-age'))   setVal('whisky-age', parsed.age);

  const input = document.getElementById('whisky-name');
  if (input) input.value = parsed.nameQuery;

  showToast('라벨 인식 완료! 이름을 확인 후 필요시 수정해주세요.');
}

// ── 증류소 자동완성 (Wikidata) ──
let _acTimer = null;

function onDistilleryInput(val) {
  clearTimeout(_acTimer);
  hideAc();
  if (!val || val.trim().length < 2) return;
  _acTimer = setTimeout(() => fetchAcSuggestions(val.trim()), 380);
}

async function fetchAcSuggestions(query) {
  try {
    // "distillery" 접미어 추가로 증류소 결과 우선 검색
    const searchQuery = query + ' distillery';
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchQuery)}&language=en&type=item&format=json&origin=*&limit=15`;
    const res = await fetch(url);
    const data = await res.json();

    const kw = ['whisky', 'whiskey', 'scotch', 'bourbon', 'single malt', 'blended malt', 'blended', 'rye whiskey', 'grain whisky', 'distillery', 'distilleries'];
    const results = data.search
      .filter(item => kw.some(k => (item.description || '').toLowerCase().includes(k)))
      .slice(0, 7);

    showAc(results);
  } catch {
    hideAc();
  }
}

function showAc(results) {
  const input = document.getElementById('whisky-distillery');
  const list  = document.getElementById('whisky-autocomplete');
  if (!input || !list || results.length === 0) { hideAc(); return; }

  const rect = input.getBoundingClientRect();
  list.style.top   = (rect.bottom + 2) + 'px';
  list.style.left  = rect.left + 'px';
  list.style.width = rect.width + 'px';

  list.innerHTML = results.map((item, i) => {
    const tags = _acTags(item.description || '');
    return `<li class="ac-item" onmousedown="selectAc(${i})">
      <div class="ac-name">${item.label}${tags}</div>
      ${item.description ? `<div class="ac-desc">${item.description}</div>` : ''}
    </li>`;
  }).join('');

  list._r = results;
  list.classList.add('open');
}

function _acTags(desc) {
  const d = desc.toLowerCase();
  const tags = [];
  if (d.includes('single malt'))    tags.push('싱글몰트');
  else if (d.includes('blended malt')) tags.push('블렌디드몰트');
  else if (d.includes('blended'))   tags.push('블렌디드');
  else if (d.includes('bourbon'))   tags.push('버번');
  else if (d.includes('rye'))       tags.push('라이');
  const regionMap = [
    ['speyside','스페이사이드'],['highland','하이랜드'],['islay','아일라'],
    ['lowland','로랜드'],['campbeltown','캠벨타운'],['ireland','아일랜드'],
    ['japan','일본'],['kentucky','미국'],['tennessee','미국'],['canada','캐나다'],['taiwan','대만'],
  ];
  for (const [en, ko] of regionMap) {
    if (d.includes(en)) { tags.push(ko); break; }
  }
  return tags.map(t => `<span class="ac-tag">${t}</span>`).join('');
}

function hideAc() {
  const list = document.getElementById('whisky-autocomplete');
  if (list) { list.classList.remove('open'); list.innerHTML = ''; list._r = null; }
}

function selectAc(idx) {
  const list = document.getElementById('whisky-autocomplete');
  const item = list._r?.[idx];
  if (!item) return;

  // 증류소명 입력 (Distillery 접미어 제거)
  const distName = item.label.replace(/\s*distiller(y|ies)\s*/gi, '').trim();
  setVal('whisky-distillery', distName || item.label);

  const desc = (item.description || '').toLowerCase();
  const autoFilled = [];

  // 지역 자동입력
  if (!getVal('whisky-region')) {
    const regionMap = [
      ['speyside','스페이사이드'],['highland','하이랜드'],['islay','아일라'],
      ['lowland','로랜드'],['campbeltown','캠벨타운'],['ireland','아일랜드'],
      ['japan','일본'],['kentucky','미국'],['tennessee','미국'],
      ['american','미국'],['canada','캐나다'],['taiwan','대만'],['scotland','스코틀랜드'],
    ];
    for (const [en, ko] of regionMap) {
      if (desc.includes(en)) { setVal('whisky-region', ko); autoFilled.push('지역'); break; }
    }
  }

  // 종류 자동입력
  if (!getVal('whisky-type')) {
    if (desc.includes('single malt'))        { setVal('whisky-type', '싱글몰트');    autoFilled.push('종류'); }
    else if (desc.includes('blended malt'))  { setVal('whisky-type', '블렌디드몰트'); autoFilled.push('종류'); }
    else if (desc.includes('blended'))       { setVal('whisky-type', '블렌디드');    autoFilled.push('종류'); }
    else if (desc.includes('bourbon'))       { setVal('whisky-type', '버번');        autoFilled.push('종류'); }
    else if (desc.includes('rye'))           { setVal('whisky-type', '라이');        autoFilled.push('종류'); }
    else if (desc.includes('grain'))         { setVal('whisky-type', '그레인');      autoFilled.push('종류'); }
  }

  hideAc();
  if (autoFilled.length > 0) showToast(`증류소 · ${autoFilled.join(' · ')} 자동 입력됨 ✓`);
  else showToast('증류소 자동 입력됨 ✓');
}

// ── 사진 자르기 ──
const Crop = {
  SIZE: 280,
  OUT: 700,
  src: null,
  nw: 0, nh: 0,
  zoom: 1, minZoom: 1,
  ox: 0, oy: 0,
  dragging: false,
  lx: 0, ly: 0,

  open(src) {
    this.src = src;
    const img = new Image();
    img.onload = () => {
      this.nw = img.naturalWidth;
      this.nh = img.naturalHeight;
      this.minZoom = Math.max(this.SIZE / this.nw, this.SIZE / this.nh);
      this.zoom = this.minZoom;
      this.ox = (this.SIZE - this.nw * this.zoom) / 2;
      this.oy = (this.SIZE - this.nh * this.zoom) / 2;
      document.getElementById('crop-img').src = src;
      document.getElementById('crop-zoom-slider').value = 100;
      this._render();
      openModal('modal-crop');
      this._bind();
    };
    img.src = src;
  },

  _clamp() {
    const dw = this.nw * this.zoom, dh = this.nh * this.zoom;
    this.ox = Math.min(0, Math.max(this.ox, this.SIZE - dw));
    this.oy = Math.min(0, Math.max(this.oy, this.SIZE - dh));
  },

  _render() {
    const el = document.getElementById('crop-img');
    if (!el) return;
    el.style.width  = (this.nw * this.zoom) + 'px';
    el.style.height = (this.nh * this.zoom) + 'px';
    el.style.left   = this.ox + 'px';
    el.style.top    = this.oy + 'px';
  },

  setZoom(pct) {
    const nz = Math.max(this.minZoom, this.minZoom * (pct / 100));
    const cx = this.SIZE / 2, cy = this.SIZE / 2;
    const ix = (cx - this.ox) / this.zoom, iy = (cy - this.oy) / this.zoom;
    this.zoom = nz;
    this.ox = cx - ix * nz;
    this.oy = cy - iy * nz;
    this._clamp();
    this._render();
  },

  _pt(e) { return e.touches ? e.touches[0] : e; },

  _down(e) { this.dragging = true; this.lx = this._pt(e).clientX; this.ly = this._pt(e).clientY; },
  _move(e) {
    if (!this.dragging) return;
    if (e.cancelable) e.preventDefault();
    const p = this._pt(e);
    this.ox += p.clientX - this.lx; this.oy += p.clientY - this.ly;
    this.lx = p.clientX; this.ly = p.clientY;
    this._clamp(); this._render();
  },
  _up() { this.dragging = false; },

  _bind() {
    const el = document.getElementById('crop-container');
    if (el._bound) return;
    el._bound = true;
    el.addEventListener('mousedown',  e => this._down(e));
    el.addEventListener('mousemove',  e => this._move(e));
    el.addEventListener('mouseup',    () => this._up());
    el.addEventListener('mouseleave', () => this._up());
    el.addEventListener('touchstart', e => this._down(e), { passive: true });
    el.addEventListener('touchmove',  e => this._move(e), { passive: false });
    el.addEventListener('touchend',   () => this._up());
  },

  confirm() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.OUT;
    const ctx = canvas.getContext('2d');
    const srcX = -this.ox / this.zoom, srcY = -this.oy / this.zoom;
    const srcSz = this.SIZE / this.zoom;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, srcX, srcY, srcSz, srcSz, 0, 0, this.OUT, this.OUT);
      const result = canvas.toDataURL('image/jpeg', 0.85);
      if (_cropCallback) { _cropCallback(result); _cropCallback = null; }
      closeModal('modal-crop');
    };
    img.src = this.src;
  },
};

function cropSetZoom(val) { Crop.setZoom(parseFloat(val)); }
function confirmCrop() { Crop.confirm(); }
function cancelCrop() { closeModal('modal-crop'); }

// ── 더보기 메뉴 ──
function openMoreMenu() {
  document.getElementById('more-menu-overlay').classList.add('open');
}
function closeMoreMenu() {
  document.getElementById('more-menu-overlay').classList.remove('open');
}

// ── 피드백 ──
function openFeedbackModal() {
  document.getElementById('feedback-text').value = '';
  openModal('modal-feedback');
}

function closeFeedbackModal() {
  closeModal('modal-feedback');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('[data-page="collection"]').forEach(i => i.classList.add('active'));
  renderPage('collection');
}

function sendEmailFeedback() {
  const text = document.getElementById('feedback-text').value.trim();
  if (!text) { alert('피드백 내용을 입력해주세요.'); return; }
  const subject = encodeURIComponent('위스키 노트 앱 피드백');
  const body = encodeURIComponent(text);
  window.location.href = `mailto:shuttle1207@gmail.com?subject=${subject}&body=${body}`;
  closeFeedbackModal();
}

function sendInstagramFeedback() {
  const text = document.getElementById('feedback-text').value.trim();
  if (!text) { alert('피드백 내용을 입력해주세요.'); return; }
  const open = () => {
    window.open('https://www.instagram.com/liquorholic_korea', '_blank');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => { showToast('내용이 복사되었습니다! DM에 붙여넣기 해주세요 😊'); open(); })
      .catch(open);
  } else {
    open();
  }
  closeFeedbackModal();
}

// ── 커뮤니티 통계 (다른사람 후기) ──
async function openCommunityStats() {
  openModal('modal-community');
  const content = document.getElementById('community-content');
  content.innerHTML = '<p class="loading-hint">⏳ 데이터를 불러오는 중...</p>';
  try {
    await _authReady;
    const snapshot = await db.collection('tastings').limit(1000).get();
    const tastings = snapshot.docs.map(doc => doc.data());
    renderCommunityStats(tastings);
  } catch (err) {
    content.innerHTML = '<p class="loading-hint">데이터를 불러올 수 없습니다.<br>인터넷 연결을 확인해주세요.</p>';
  }
}

function renderCommunityStats(tastings) {
  const content = document.getElementById('community-content');
  if (tastings.length === 0) {
    content.innerHTML = '<p class="loading-hint">아직 공유된 시음 기록이 없습니다.<br>데이터 공유에 동의하면 통계에 기여됩니다 🥃</p>';
    return;
  }

  const total = tastings.length;
  const scores = tastings.filter(t => t.score !== null && t.score !== undefined && t.score !== '').map(t => parseFloat(t.score));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const uniqueWhiskies = new Set(tastings.map(t => t.whiskyName).filter(Boolean)).size;

  const regionCount = {};
  const typeCount = {};
  const whiskyCount = {};
  tastings.forEach(t => {
    const r = t.region || '미입력';
    regionCount[r] = (regionCount[r] || 0) + 1;
    const tp = t.type || '미입력';
    typeCount[tp] = (typeCount[tp] || 0) + 1;
    if (t.whiskyName) whiskyCount[t.whiskyName] = (whiskyCount[t.whiskyName] || 0) + 1;
  });

  const topWhiskyKeys = Object.entries(whiskyCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);

  const noseScores = tastings.filter(t => t.noseScore !== null && t.noseScore !== undefined && t.noseScore !== '').map(t => parseFloat(t.noseScore));
  const palateScores = tastings.filter(t => t.palateScore !== null && t.palateScore !== undefined && t.palateScore !== '').map(t => parseFloat(t.palateScore));
  const finishScores = tastings.filter(t => t.finishScore !== null && t.finishScore !== undefined && t.finishScore !== '').map(t => parseFloat(t.finishScore));
  const avgNose = noseScores.length ? Math.round(noseScores.reduce((a,b)=>a+b,0)/noseScores.length) : null;
  const avgPalate = palateScores.length ? Math.round(palateScores.reduce((a,b)=>a+b,0)/palateScores.length) : null;
  const avgFinish = finishScores.length ? Math.round(finishScores.reduce((a,b)=>a+b,0)/finishScores.length) : null;

  const makeBarChart = (countMap, order) => {
    const entries = order
      ? order.filter(k => countMap[k]).map(k => [k, countMap[k]])
      : Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = Math.max(...entries.map(([, v]) => v), 1);
    if (entries.length === 0) return '<p class="empty-hint">데이터 없음</p>';
    return '<div class="bar-chart">' + entries.map(([label, count]) => `
      <div class="bar-row">
        <span class="bar-label" title="${label}">${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div></div>
        <span class="bar-count">${count}</span>
      </div>`).join('') + '</div>';
  };

  const scoreMap = {};
  if (avgNose) scoreMap['향 (Nose)'] = avgNose;
  if (avgPalate) scoreMap['맛 (Palate)'] = avgPalate;
  if (avgFinish) scoreMap['피니시 (Finish)'] = avgFinish;
  if (avgScore) scoreMap['종합'] = avgScore;
  const scoreOrder = ['향 (Nose)', '맛 (Palate)', '피니시 (Finish)', '종합'].filter(k => scoreMap[k]);

  content.innerHTML = `
    <div class="community-header">
      <div class="community-stat-card">
        <div class="community-stat-num">${total}</div>
        <div class="community-stat-label">총 시음 기록</div>
      </div>
      <div class="community-stat-card">
        <div class="community-stat-num">${uniqueWhiskies}</div>
        <div class="community-stat-label">위스키 종류</div>
      </div>
      <div class="community-stat-card">
        <div class="community-stat-num">${avgScore !== null ? avgScore + '점' : '—'}</div>
        <div class="community-stat-label">평균 점수</div>
      </div>
    </div>

    ${topWhiskyKeys.length ? `<div class="community-section-title">🏆 인기 위스키 TOP ${topWhiskyKeys.length}</div>${makeBarChart(whiskyCount, topWhiskyKeys)}` : ''}

    <div class="community-section-title">📍 지역별 분포</div>
    ${makeBarChart(regionCount, null)}

    <div class="community-section-title">🥃 종류별 분포</div>
    ${makeBarChart(typeCount, null)}

    ${scoreOrder.length ? `<div class="community-section-title">⭐ 평균 점수 분석</div>${makeBarChart(scoreMap, scoreOrder)}` : ''}

    <p style="font-size:11px;color:var(--text-muted);margin-top:24px;text-align:center;line-height:1.6;">
      💡 데이터 공유에 동의한 사용자들의 익명 시음 기록입니다
    </p>
  `;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── 슬라이더 ──
function activateSlider(input, valId) {
  input.dataset.set = 'true';
  input.classList.remove('score-unset');
  document.getElementById(valId).textContent = input.value;
}

function resetSlider(sliderId, valId) {
  const el = document.getElementById(sliderId);
  if (!el) return;
  el.value = 75;
  el.dataset.set = 'false';
  el.classList.add('score-unset');
  document.getElementById(valId).textContent = '—';
}

function getSliderVal(id) {
  const el = document.getElementById(id);
  return (el && el.dataset.set === 'true') ? el.value : null;
}

function setSliderVal(sliderId, valId, val) {
  const el = document.getElementById(sliderId);
  if (!el) return;
  if (val !== null && val !== undefined && val !== '') {
    el.value = val;
    el.dataset.set = 'true';
    el.classList.remove('score-unset');
    document.getElementById(valId).textContent = val;
  } else {
    el.value = 75;
    el.dataset.set = 'false';
    el.classList.add('score-unset');
    document.getElementById(valId).textContent = '—';
  }
}

// ══════════════════════════════
// ── 위시리스트 ──
// ══════════════════════════════
let editingWishlistId = null;

const PRIORITY_LABEL = { high: '꼭 마셔봐야 함', medium: '원함', low: '보통' };
const PRIORITY_CLASS = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };

function renderWishlist() {
  const list = Storage.getWishlist().sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || (b.addedAt || '').localeCompare(a.addedAt || '');
  });

  const pending = list.filter(w => !w.purchased);
  const bought  = list.filter(w => w.purchased);

  document.getElementById('wishlist-subtitle').textContent =
    `총 ${list.length}개  ·  미구매 ${pending.length}  ·  구매완료 ${bought.length}`;

  const grid  = document.getElementById('wishlist-grid');
  const empty = document.getElementById('wishlist-empty');
  grid.innerHTML = '';

  if (list.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const renderItem = item => {
    const div = document.createElement('div');
    div.className = `wishlist-card${item.purchased ? ' wl-purchased' : ''}`;
    div.innerHTML = `
      <div class="wl-priority-bar ${PRIORITY_CLASS[item.priority || 'low']}"></div>
      <div class="wl-body">
        <div class="wl-name">${item.name}${item.purchased ? ' <span class="wl-done-badge">구매완료</span>' : ''}</div>
        ${item.distillery || item.region ? `<div class="wl-meta">${[item.distillery, item.region].filter(Boolean).join(' · ')}</div>` : ''}
        <div class="wl-tags">
          <span class="tag ${PRIORITY_CLASS[item.priority || 'low']}-tag">${PRIORITY_LABEL[item.priority || 'low']}</span>
          ${item.type ? `<span class="tag">${item.type}</span>` : ''}
          ${item.targetPrice ? `<span class="wl-price">₩${parseInt(item.targetPrice).toLocaleString()}</span>` : ''}
        </div>
        ${item.notes ? `<div class="wl-notes">${item.notes}</div>` : ''}
        <div class="wl-actions">
          ${!item.purchased ? `<button class="btn btn-sm btn-primary" onclick="markWishlistAsPurchased('${item.id}')">✓ 구매완료</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="openEditWishlistModal('${item.id}')">수정</button>
          <button class="btn btn-sm btn-outline btn-danger-outline" onclick="deleteWishlistItem('${item.id}')">삭제</button>
        </div>
      </div>
    `;
    grid.appendChild(div);
  };

  pending.forEach(renderItem);
  if (bought.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'wl-section-label';
    sep.textContent = '구매 완료';
    grid.appendChild(sep);
    bought.forEach(renderItem);
  }
}

function openAddWishlistModal() {
  editingWishlistId = null;
  document.getElementById('modal-wishlist-title').textContent = '위시리스트 추가';
  clearWishlistForm();
  openModal('modal-wishlist');
}

function openEditWishlistModal(id) {
  editingWishlistId = id;
  document.getElementById('modal-wishlist-title').textContent = '위시리스트 수정';
  const item = Storage.getWishlist().find(w => w.id === id);
  if (!item) return;
  setVal('wl-name', item.name);
  setVal('wl-distillery', item.distillery);
  setVal('wl-region', item.region);
  setVal('wl-type', item.type);
  setVal('wl-priority', item.priority || 'medium');
  setVal('wl-target-price', item.targetPrice);
  setVal('wl-notes', item.notes);
  openModal('modal-wishlist');
}

function clearWishlistForm() {
  ['wl-name','wl-distillery','wl-region','wl-type','wl-target-price','wl-notes'].forEach(id => setVal(id, ''));
  setVal('wl-priority', 'medium');
}

function saveWishlistItem() {
  const name = getVal('wl-name').trim();
  if (!name) { alert('위스키 이름을 입력하세요.'); return; }
  const data = {
    name,
    distillery: getVal('wl-distillery').trim(),
    region: getVal('wl-region'),
    type: getVal('wl-type'),
    priority: getVal('wl-priority') || 'medium',
    targetPrice: getVal('wl-target-price'),
    notes: getVal('wl-notes').trim(),
  };
  if (editingWishlistId) {
    Storage.updateWishlistItem(editingWishlistId, data);
  } else {
    Storage.addWishlistItem(data);
  }
  closeModal('modal-wishlist');
  renderWishlist();
  showToast(editingWishlistId ? '위시리스트가 수정됐습니다 ✓' : '위시리스트에 추가됐습니다 🔖');
}

function deleteWishlistItem(id) {
  const item = Storage.getWishlist().find(w => w.id === id);
  if (!confirm(`"${item?.name}"을(를) 위시리스트에서 삭제할까요?`)) return;
  Storage.deleteWishlistItem(id);
  renderWishlist();
}

function markWishlistAsPurchased(id) {
  const item = Storage.getWishlist().find(w => w.id === id);
  if (!confirm(`"${item?.name}" 구매를 완료 처리할까요?`)) return;
  Storage.updateWishlistItem(id, { purchased: true, purchasedAt: new Date().toISOString() });
  renderWishlist();
  showToast('구매 완료로 처리됐습니다 🎉');
}

// ── 데이터 초기화 ──
function resetAllData() {
  if (!confirm('모든 위스키 컬렉션과 시음 노트가 삭제됩니다.\n정말 초기화하시겠습니까?')) return;
  if (!confirm('⚠️ 이 작업은 되돌릴 수 없습니다.\n계속하시겠습니까?')) return;
  localStorage.removeItem('whiskies');
  localStorage.removeItem('tastings');
  const req = indexedDB.deleteDatabase('whiskyImagesDB');
  req.onsuccess = () => { ImageDB._db = null; renderPage(currentPage); };
  req.onerror = () => renderPage(currentPage);
}

// ── 공통 유틸 ──
function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}
function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val ?? ''; }

function openModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.add('open');
  const body = overlay.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'modal-whisky') hideAc();
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    if (e.target.id === 'modal-feedback') {
      closeFeedbackModal();
    } else {
      e.target.classList.remove('open');
    }
  }
});
