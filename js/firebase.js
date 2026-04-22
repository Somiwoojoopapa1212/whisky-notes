const firebaseConfig = {
  apiKey: "AIzaSyD738ADvhVTT-_vQmLoHm4aRx9z4DaR8kc",
  authDomain: "whisky-notes-4e781.firebaseapp.com",
  projectId: "whisky-notes-4e781",
  storageBucket: "whisky-notes-4e781.firebasestorage.app",
  messagingSenderId: "914139253550",
  appId: "1:914139253550:web:00370608ad2f57cc7d88bf"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
let _cloudUserId = null;

const _authReady = firebase.auth().signInAnonymously()
  .then(cred => { _cloudUserId = cred.user.uid; })
  .catch(() => {});

async function syncTastingToCloud(tasting, whiskies) {
  if (localStorage.getItem('cloudSyncConsent') !== 'true') return;
  await _authReady;
  if (!_cloudUserId) return;

  const whisky = tasting.whiskeyId
    ? whiskies.find(w => w.id === tasting.whiskeyId)
    : null;

  const doc = {
    userId: _cloudUserId,
    date: tasting.date || '',
    whiskyName: whisky ? whisky.name : (tasting.customWhiskeyName || ''),
    region: tasting.region || whisky?.region || '',
    type: tasting.type || whisky?.type || '',
    age: tasting.age || whisky?.age || '',
    abv: tasting.abv || whisky?.abv || '',
    color: tasting.color || '',
    nose: tasting.nose || '',
    palate: tasting.palate || '',
    finish: tasting.finish || '',
    noseScore: tasting.noseScore ?? null,
    palateScore: tasting.palateScore ?? null,
    finishScore: tasting.finishScore ?? null,
    score: tasting.score ?? null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('tastings').add(doc).catch(() => {});
}
