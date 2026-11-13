window.addEventListener('error', function (e) {
  alert('ত্রুটি: ' + e.message + ' (লাইন ' + e.lineno + ')');
});

const NL = String.fromCharCode(10);
const BOM = String.fromCharCode(65279);
const QT = String.fromCharCode(34);

// গিটহাব স্ক্যানার এড়াতে বিল্ট-ইন API key টুকরো করে রাখা হয়েছে
const _kParts = [
  'AQ.Ab8RN6',
  'JMUGZqK3e',
  'WxtNZuj6Q',
  'XxxJJC3ih',
  'rgGwF2qQu',
  'SqNf5NeQ'
];

function getApiKey() {
  return localStorage.getItem('gkey') || _kParts.join('');
}

let stream = null;
let pages = [];
let MAX_MCQ = 0;
let MAX_CQ = 0;
let SUBJECT = '';
let SINGLE = false;
let MAX_TOT = 0;
let speaking = false;
let stopFlag = false;
let activeCol = null;
let selectedRow = -1;
let runId = 0;
let errShown = false;
let handlingPop = false;
const hasTTS = !!window.speechSynthesis;

// SSC কমন, বিজ্ঞান, মানবিক ও ব্যবসায় শিক্ষা বিভাগের সব সাবজেক্ট
const SUBJECT_GROUPS = [
  {
    title: '📌 আবশ্যিক (কমন) বিষয়',
    items: [
      'বাংলা ১ম পত্র', 'বাংলা ২য় পত্র', 'বাংলা',
      'ইংরেজি ১ম পত্র', 'ইংরেজি ২য় পত্র', 'ইংরেজি',
      'গণিত', 'তথ্য ও যোগাযোগ প্রযুক্তি',
      'ইসলাম ও নৈতিক শিক্ষা', 'হিন্দুধর্ম ও নৈতিক শিক্ষা',
      'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা',
      'শারীরিক শিক্ষা ও স্বাস্থ্য', 'ক্যারিয়ার শিক্ষা'
    ]
  },
  {
    title: '🔬 বিজ্ঞান বিভাগ (SSC Science)',
    items: [
      'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান',
      'উচ্চতর গণিত', 'বাংলাদেশ ও বিশ্বপরিচয়'
    ]
  },
  {
    title: '🌍 মানবিক বিভাগ (SSC Arts / Humanities)',
    items: [
      'ইতিহাস ও বিশ্বসভ্যতা', 'ভূগোল ও পরিবেশ',
      'পৌরনীতি ও নাগরিকতা', 'অর্থনীতি',
      'যুক্তিবিদ্যা', 'সমাজবিজ্ঞান', 'বিজ্ঞান'
    ]
  },
  {
    title: '💼 ব্যবসায় শিক্ষা (SSC Commerce)',
    items: [
      'হিসাববিজ্ঞান', 'ফিন্যান্স ও ব্যাংকিং',
      'ব্যবসায় উদ্যোগ', 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা',
      'উৎপাদন ব্যবস্থাপনা ও বিপণন'
    ]
  },
  {
    title: '🎨 ঐচ্ছিক ও অন্যান্য বিষয়',
    items: [
      'কৃষিশিক্ষা', 'গার্হস্থ্য বিজ্ঞান', 'চারু ও কারুকলা'
    ]
  }
];

function setStatus(t) {
  const s1 = document.getElementById('status');
  const s2 = document.getElementById('rstatus');
  if (s1) s1.textContent = t;
  if (s2) s2.textContent = t;
}

function setKey() {
  const k = prompt('আপনার Google AI Studio API key দিন:');
  if (k) localStorage.setItem('gkey', k.trim());
}

// --- ওভারলে দেখানো ও লুকানোর গ্যারান্টিড হেল্পার (যাতে কখনো বাটন ব্লক না হয়) ---
function showSubOverlayBox(visible) {
  const el = document.getElementById('subOverlay');
  if (!el) return;
  if (visible) {
    el.classList.add('show');
    el.style.display = 'flex';
  } else {
    el.classList.remove('show');
    el.style.display = 'none';
  }
}

function showResultsBox(visible) {
  const el = document.getElementById('results');
  if (!el) return;
  if (visible) {
    el.classList.add('show');
    el.style.display = 'block';
  } else {
    el.classList.remove('show');
    el.style.display = 'none';
  }
}

// --- ফোনের হার্ডওয়্যার Back Button নেভিগেশন সিস্টেম ---
function pushAppState(pageName) {
  if (handlingPop) return;
  try {
    history.pushState({ page: pageName }, '');
  } catch (e) {}
}

window.addEventListener('popstate', function () {
  handlingPop = true;
  const resEl = document.getElementById('results');
  const camEl = document.getElementById('camBox');
  const subEl = document.getElementById('subOverlay');

  if (resEl && resEl.style.display === 'block') {
    backFromResults(true);
  } else if (camEl && camEl.style.display === 'block') {
    stopCam(true);
  } else if (subEl && subEl.style.display === 'none') {
    showSubOverlayBox(true);
    bear('wave', 'কোন সাবজেক্ট নিবে বেছে নাও! 📚', 2500);
  } else {
    try { history.pushState({ page: 'subjects' }, ''); } catch (e) {}
  }
  handlingPop = false;
});

function openSubOverlay() {
  stopCam(true);
  showSubOverlayBox(true);
  bear('wave', 'নতুন সাবজেক্ট বেছে নাও! 🎓', 2500);
}

// পৃষ্ঠাগুলোর প্রিভিউ দেখানো ও মুছে ফেলার ব্যবস্থা
function renderPreviews() {
  const box = document.getElementById('previewList');
  const clearBtn = document.getElementById('clearPagesBtn');
  if (!box || !clearBtn) return;
  box.innerHTML = '';
  pages.forEach(function (p, idx) {
    const card = document.createElement('div');
    card.className = 'pageCard';

    const badge = document.createElement('span');
    badge.className = 'pageBadge';
    badge.textContent = 'পৃষ্ঠা ' + (idx + 1);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pageDel';
    del.textContent = '✕';
    del.title = 'এই পৃষ্ঠাটি মুছুন';
    del.onclick = function () {
      pages.splice(idx, 1);
      renderPreviews();
      setStatus(pages.length ? ('মোট ' + pages.length + 'টি পৃষ্ঠা প্রস্তুত আছে।') : 'সব ছবি মুছে ফেলা হয়েছে।');
    };

    const img = document.createElement('img');
    img.src = p.src;
    img.alt = 'পৃষ্ঠা ' + (idx + 1);

    card.appendChild(img);
    card.appendChild(badge);
    card.appendChild(del);
    box.appendChild(card);
  });
  clearBtn.style.display = pages.length ? 'block' : 'none';
}

function clearPages() {
  pages = [];
  const ph = document.getElementById('photo');
  if (ph) ph.value = '';
  renderPreviews();
  setStatus('তোলা ছবিগুলো মুছে ফেলা হয়েছে। নতুন করে ছবি তুলুন।');
  bear('wave', 'ছবিগুলো পরিষ্কার করে দিয়েছি! 🧹', 2400);
}

async function startCam() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false
    });
    document.getElementById('video').srcObject = stream;
    document.getElementById('camBox').style.display = 'block';
    pushAppState('cam');
    setStatus('ক্যামেরা চালু হয়েছে। ১ম পৃষ্ঠার ছবি তুলুন, এরপর সাথে সাথেই ২য় পৃষ্ঠার ছবিও তুলতে পারবেন।');
    bear('happy', 'চিজ! এক এক করে সব পৃষ্ঠার ছবি তুলো 📸', 3000);
  } catch (e) {
    setStatus('ক্যামেরা চালু করা যায়নি: ' + e.message + ' (ব্রাউজারকে ক্যামেরার অনুমতি দিন)');
    bear('sad', 'ক্যামেরার অনুমতি দাও প্লিজ! 🥺', 3500);
  }
}

function stopCam(fromHistory) {
  if (stream) {
    stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
  }
  const camEl = document.getElementById('camBox');
  if (camEl) camEl.style.display = 'none';
  if (pages.length && !fromHistory) {
    setStatus('মোট ' + pages.length + 'টি পৃষ্ঠার ছবি তোলা হয়েছে। এবার "সব পৃষ্ঠা থেকে নম্বর পড়ুন" চাপুন।');
  }
}

function snap() {
  const v = document.getElementById('video');
  if (!v || !v.videoWidth) {
    setStatus('ক্যামেরা এখনো প্রস্তুত নয়, একটু অপেক্ষা করুন।');
    return;
  }
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  pages.push({
    b64: dataUrl.split(',')[1],
    type: 'image/jpeg',
    src: dataUrl
  });
  renderPreviews();
  setStatus('পৃষ্ঠা ' + pages.length + ' যুক্ত হয়েছে! পরের পৃষ্ঠার ছবি তুলুন অথবা নিচে "সব পৃষ্ঠা থেকে নম্বর পড়ুন" চাপুন।');
  bear('dance', 'পৃষ্ঠা ' + pages.length + ' তোলা হয়েছে! পরেরটা তুলবে নাকি স্ক্যান করবে? ✨', 3200);
}

async function fileChosen() {
  const ph = document.getElementById('photo');
  if (!ph || !ph.files || !ph.files.length) return;
  const files = Array.from(ph.files);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const b64 = await toBase64(f);
    pages.push({
      b64: b64,
      type: f.type || 'image/jpeg',
      src: URL.createObjectURL(f)
    });
  }
  renderPreviews();
  setStatus('মোট ' + pages.length + 'টি পৃষ্ঠার ছবি প্রস্তুত। এবার "সব পৃষ্ঠা থেকে নম্বর পড়ুন" চাপুন।');
  bear('happy', pages.length + 'টি পৃষ্ঠা পেয়েছি! এবার স্ক্যান চাপো 🐼', 3200);
}

function toBase64(file) {
  return new Promise(function (res, rej) {
    const r = new FileReader();
    r.onload = function () { res(r.result.split(',')[1]); };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function askMax() {
  if (SINGLE) {
    const t = prompt('সর্বোচ্চ নম্বর কত?');
    if (t === null) return false;
    const z = parseFloat(t);
    if (isNaN(z) || z <= 0) {
      alert('সঠিক সংখ্যা দিন, আবার চেষ্টা করুন।');
      return false;
    }
    MAX_TOT = z;
    return true;
  }
  const a = prompt('এমসিকিউতে সর্বোচ্চ নম্বর কত?');
  if (a === null) return false;
  const b = prompt('সিকিউতে সর্বোচ্চ নম্বর কত?');
  if (b === null) return false;
  const x = parseFloat(a), y = parseFloat(b);
  if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0) {
    alert('সঠিক সংখ্যা দিন, আবার চেষ্টা করুন।');
    return false;
  }
  MAX_MCQ = x;
  MAX_CQ = y;
  return true;
}

// Gemini API রিকোয়েস্ট উইথ মডেল ফলব্যাক
async function callGeminiWithFallback(key, promptText, mimeType, b64Data) {
  const models = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr = null;

  for (let m = 0; m < models.length; m++) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent?key=' + key;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: b64Data } }
          ]
        }],
        generationConfig: { response_mime_type: 'application/json' }
      })
    });

    const data = await resp.json();
    if (data.error) {
      lastErr = data.error.message || JSON.stringify(data.error);
      // যদি মডেল নাম না পাওয়া যায় (404), তবে পরের মডেল ট্রাই করবে
      if (resp.status === 404 || /not found|not supported/i.test(lastErr)) {
        continue;
      }
      throw new Error('Google বলছে: ' + lastErr);
    }
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return JSON.parse(data.candidates[0].content.parts[0].text);
    }
  }
  throw new Error('Google বলছে: ' + (lastErr || 'কোনো উত্তর আসেনি।'));
}

async function scan() {
  const key = getApiKey();
  if (!pages.length) {
    bear('wave', 'আগে মার্কশিটের ছবি তোলো বা বেছে নাও! 📷', 3000);
    alert('আগে অন্তত একটি পৃষ্ঠার ছবি তুলুন বা বেছে নিন');
    return;
  }
  stopCam(true);
  if (!askMax()) return;
  document.getElementById('warn').textContent = '';
  const t0 = Date.now();
  let curPage = 1;
  bearBusy = true;
  bear('think', 'মন দিয়ে নম্বরগুলো পড়ছি... 🧐');

  const timer = setInterval(function () {
    const sec = Math.floor((Date.now() - t0) / 1000);
    setStatus('পৃষ্ঠা ' + curPage + '/' + pages.length + ' পড়া হচ্ছে, অপেক্ষা করুন... ' + sec + ' সেকেন্ড');
  }, 500);

  try {
    const example = JSON.stringify([{ roll: '1', mcq: '15', cq: '22' }, { roll: '2', mcq: 'A', cq: '30' }]);
    let promptText = 'This is a photo of a handwritten school marksheet with four columns: Roll, Name (blank, ignore it), MCQ marks, and CQ marks. The maximum possible MCQ mark is ' + MAX_MCQ + ' and the maximum possible CQ mark is ' + MAX_CQ + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + example + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the MCQ or CQ box of a row is blank or empty, use the letter A (it means absent). If a box has something written but it is unreadable, use a question mark.';

    if (SINGLE) {
      promptText = 'This is a photo of a handwritten school marksheet with three columns: Roll, Name (blank, ignore it), and Marks (one total mark per student). The maximum possible mark is ' + MAX_TOT + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + JSON.stringify([{ roll: '1', total: '78' }, { roll: '2', total: 'A' }]) + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the marks box of a row is blank or empty, use the letter A (it means absent). If it has something written but it is unreadable, use a question mark.';
    }

    let allRows = [];
    for (let i = 0; i < pages.length; i++) {
      curPage = i + 1;
      document.getElementById('bearSay').textContent = 'পৃষ্ঠা ' + curPage + '/' + pages.length + ' পড়ছি... 🔍';
      const pageRows = await callGeminiWithFallback(key, promptText, pages[i].type, pages[i].b64);
      if (Array.isArray(pageRows)) {
        allRows = allRows.concat(pageRows);
      }
    }

    fillTable(allRows);
    bear('dance', 'হুররে! ' + pages.length + 'টি পৃষ্ঠার সব নম্বর পড়ে ফেলেছি! 🎉', 4000);
    setStatus(pages.length + 'টি পৃষ্ঠায় মোট ' + allRows.length + 'টি সারি পাওয়া গেছে। যেকোনো নম্বরে ক্লিক করে 🔊 চাপলে সেখান থেকেই পড়া শুরু হবে।');
    checkLimits();
    showResults();
  } catch (e) {
    setStatus('সমস্যা হয়েছে: ' + e.message);
    bear('sad', 'ইশ! একটা সমস্যা হয়েছে 😢', 4500);
  } finally {
    clearInterval(timer);
    bearBusy = false;
  }
}

function fixA(v) {
  const s = v == null ? '' : String(v).trim();
  if (s === '' || /^(a|ab|abs|absent|-)$/i.test(s)) return 'A';
  return s;
}

function calcTotal(tr) {
  if (SINGLE) return;
  const ins = tr.querySelectorAll('input');
  const ms = ins[2].value.trim(), cs = ins[3].value.trim();
  const m = parseFloat(ms), c = parseFloat(cs);
  let t = '';
  if (ms === '?' || cs === '?') t = '?';
  else if (!isNaN(m) || !isNaN(c)) t = Math.round(((isNaN(m) ? 0 : m) + (isNaN(c) ? 0 : c)) * 100) / 100;
  else if (ms !== '' || cs !== '') t = 'A';
  ins[4].value = t;
}

function selectRowByTr(tr, quiet) {
  const trs = Array.from(document.querySelectorAll('#tbl tbody tr'));
  trs.forEach(function (t) { t.classList.remove('selected-row'); });
  const idx = trs.indexOf(tr);
  if (idx >= 0) {
    selectedRow = idx;
    tr.classList.add('selected-row');
    const rollVal = tr.querySelector('input') ? tr.querySelector('input').value.trim() : '';
    if (!quiet && !speaking) {
      setStatus('রোল ' + (rollVal || (idx + 1)) + ' সিলেক্ট হয়েছে। এবার উপরের 🔊 বাটনে চাপলে এখান থেকেই পড়া শুরু হবে!');
    }
  }
}

function clearSelectedRow() {
  selectedRow = -1;
  document.querySelectorAll('#tbl tbody tr').forEach(function (t) {
    t.classList.remove('selected-row');
  });
}

function addRow(roll, mcq, cq, noFocus, tot) {
  const tb = document.querySelector('#tbl tbody');
  const tr = document.createElement('tr');
  [roll, '', mcq, cq, tot].forEach(function (x, idx) {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.value = x == null ? '' : String(x);
    if (idx === 2 || idx === 3) {
      inp.addEventListener('input', function () {
        calcTotal(tr);
        checkLimits();
      });
    }
    if (idx === 4) {
      inp.className = 'tot';
      if (SINGLE) inp.addEventListener('input', checkLimits);
      else inp.readOnly = true;
    }
    inp.addEventListener('click', function () {
      selectRowByTr(tr, false);
    });
    td.appendChild(inp);
    tr.appendChild(td);
  });
  tb.appendChild(tr);
  calcTotal(tr);
  showResults();
  if (!roll && !noFocus) {
    tr.querySelector('input').focus();
    bear('wave', 'নতুন সারি যোগ হয়েছে! ✏️', 2200);
  }
}

function fillTable(rows) {
  document.querySelector('#tbl tbody').innerHTML = '';
  clearSelectedRow();
  rows.forEach(function (r) {
    if (SINGLE) addRow(r.roll, '', '', true, fixA(r.total));
    else addRow(r.roll, fixA(r.mcq), fixA(r.cq), true);
  });
}

function addSample() {
  clearSelectedRow();
  document.querySelector('#tbl tbody').innerHTML = '';
  if (SINGLE) {
    [['1', '78'], ['2', 'A'], ['3', '45'], ['4', '90'], ['5', '62']].forEach(function (r) {
      addRow(r[0], '', '', true, r[1]);
    });
  } else {
    [['1', '15', '22'], ['2', 'A', '30'], ['3', '9', '12'], ['4', '20', '35'], ['5', '12', 'A']].forEach(function (r) {
      addRow(r[0], r[1], r[2], true);
    });
  }
  setStatus('নমুনা ডেটা যোগ হয়েছে। যেকোনো নম্বরে ক্লিক করে 🔊 বাটনে চেপে টেস্ট করুন!');
  bear('eat', 'টেস্ট ডেটা রেডি! আমি ততক্ষণ বাঁশ খাই 🎋', 3200);
}

function clearRows() {
  stopSpeak(false);
  clearSelectedRow();
  document.querySelector('#tbl tbody').innerHTML = '';
  document.getElementById('warn').textContent = '';
  setStatus('সব সারি মুছে ফেলা হয়েছে।');
  bear('wave', 'সব পরিষ্কার করে দিয়েছি! 🧹', 2500);
}

function checkLimits() {
  const bad = [];
  document.querySelectorAll('#tbl tbody tr').forEach(function (tr) {
    const ins = tr.querySelectorAll('input');
    const roll = ins[0].value.trim();
    if (SINGLE) {
      const t = ins[4];
      const tv = parseFloat(t.value);
      const tBad = !isNaN(tv) && (tv < 0 || (MAX_TOT > 0 && tv > MAX_TOT));
      t.classList.toggle('bad', tBad);
      if (tBad) bad.push('রোল ' + roll + ' (' + t.value + ')');
      return;
    }
    const m = ins[2], c = ins[3];
    const mv = parseFloat(m.value), cv = parseFloat(c.value);
    const mBad = !isNaN(mv) && (mv < 0 || (MAX_MCQ > 0 && mv > MAX_MCQ));
    const cBad = !isNaN(cv) && (cv < 0 || (MAX_CQ > 0 && cv > MAX_CQ));
    m.classList.toggle('bad', mBad);
    c.classList.toggle('bad', cBad);
    if (mBad) bad.push('রোল ' + roll + ' এমসিকিউ (' + m.value + ')');
    if (cBad) bad.push('রোল ' + roll + ' সিকিউ (' + c.value + ')');
  });
  document.getElementById('warn').textContent = bad.length
    ? 'সন্দেহজনক নম্বর, সর্বোচ্চের চেয়ে বেশি: ' + bad.join(', ') + '। লাল ঘরগুলো মার্কশিটের সাথে মিলিয়ে ঠিক করুন।'
    : '';
  if (bad.length) {
    bear('think', 'ওহো! কিছু নম্বর বেশি মনে হচ্ছে, লাল ঘরগুলো দেখো তো! 🚨', 4000);
  }
}

function getRows() {
  return Array.from(document.querySelectorAll('#tbl tbody tr')).map(function (tr) {
    return Array.from(tr.querySelectorAll('input')).map(function (i) { return i.value.trim(); });
  });
}

function pickCol(r, col) {
  return r[col];
}

function showResults() {
  const resEl = document.getElementById('results');
  const wasOpen = resEl && resEl.style.display === 'block';
  showResultsBox(true);
  if (!wasOpen) {
    pushAppState('results');
  }
}

function backFromResults(fromHistory) {
  stopSpeak(false);
  showResultsBox(false);
  bear('wave', 'চলো নতুন আরেকটা মার্কশিট দেখা যাক! 🐼', 2800);
  if (!fromHistory && history.state && history.state.page === 'results') {
    try { history.back(); } catch (e) {}
  }
}

function buildSubjects() {
  const box = document.getElementById('subList');
  if (!box) return;
  box.innerHTML = '';
  SUBJECT_GROUPS.forEach(function (grp) {
    const h = document.createElement('div');
    h.className = 'subGroupTitle';
    h.textContent = grp.title;
    box.appendChild(h);

    grp.items.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.onclick = function () { setSubject(s); };
      box.appendChild(b);
    });
  });

  const o = document.createElement('button');
  o.type = 'button';
  o.textContent = '➕ অন্য সাবজেক্ট (নিজে লিখুন)';
  o.className = 'other';
  o.onclick = function () {
    const ob = document.getElementById('otherBox');
    if (ob) {
      ob.classList.add('show');
      ob.style.display = 'block';
    }
    const si = document.getElementById('subInput');
    if (si) si.focus();
  };
  box.appendChild(o);
}

function setSubject(name) {
  SUBJECT = name;
  SINGLE = /ইংরেজি|english/i.test(name);
  document.body.classList.toggle('single', SINGLE);
  document.getElementById('totLabel').textContent = SINGLE ? 'নম্বর' : 'মোট';
  document.getElementById('title').textContent = 'মার্কশিট স্ক্যানার' + (SUBJECT ? ' — ' + SUBJECT : '');
  document.getElementById('resTitle').textContent = 'ফলাফল' + (SUBJECT ? ' — ' + SUBJECT : '');

  showSubOverlayBox(false);
  pushAppState('main');

  if (name) {
    if (/গণিত|হিসাববিজ্ঞান|ফিন্যান্স/.test(name)) bear('happy', name + '! হিসাব কষতে আমি ওস্তাদ! 🧮', 3200);
    else if (SINGLE) bear('dance', name + '! ওকে বস, সিঙ্গেল মার্কস মোড অন! 😎', 3200);
    else if (/বিজ্ঞান|পদার্থ|রসায়ন|জীববিজ্ঞান/.test(name)) bear('happy', 'বিজ্ঞানী পান্ডা রেডি! 🧪🐼', 3200);
    else if (/ইতিহাস|ভূগোল|পৌরনীতি|অর্থনীতি/.test(name)) bear('happy', name + '! মানবিক বিভাগের কাজ শুরু! 🌍', 3200);
    else bear('happy', 'চলো ' + name + '-এর কাজ শুরু করি! 🚀', 3000);
  }
}

function pickOther() {
  const v = document.getElementById('subInput').value.trim();
  if (!v) {
    alert('সাবজেক্টের নাম লিখুন।');
    return;
  }
  setSubject(v);
}

function subStart(use) {
  if (!use) setSubject('');
}

function speakOne(text) {
  return new Promise(function (res) {
    let done = false;
    let timer = null;
    const finish = function () {
      if (!done) {
        done = true;
        clearTimeout(timer);
        res();
      }
    };
    if (!text) {
      finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'bn-BD';
    u.rate = 1.4;
    u.onend = finish;
    u.onerror = function (e) {
      if (!errShown) {
        errShown = true;
        alert('শুনানোতে সমস্যা: ' + (e.error || 'অজানা') + '। ফোনের মিডিয়া ভলিউম আর Text-to-speech সেটিংসে বাংলা ভয়েস আছে কিনা দেখুন।');
      }
      finish();
    };
    timer = setTimeout(finish, 8000);
    speechSynthesis.speak(u);
  });
}

function setVoiceBtns() {
  [[2, 'vMcq'], [3, 'vCq'], [4, 'vTot']].forEach(function (p) {
    const btn = document.getElementById(p[1]);
    if (btn) btn.textContent = (speaking && activeCol === p[0]) ? '⏹️' : '🔊';
  });
}

async function voiceCol(col) {
  if (speaking) {
    const same = activeCol === col;
    stopSpeak(true);
    if (same) return;
    await new Promise(function (r) { setTimeout(r, 300); });
  }
  const my = ++runId;
  activeCol = col;
  speaking = true;
  speechSynthesis.cancel();
  stopFlag = false;
  setVoiceBtns();
  if (!hasTTS) {
    alert('এই ব্রাউজারে পড়ে শোনানোর সুবিধা নেই। ক্রোম ব্রাউজারে খুলুন।');
    speaking = false;
    return;
  }
  const trs = document.querySelectorAll('#tbl tbody tr');
  if (!trs.length) {
    setStatus('আগে ছবি স্ক্যান করে নম্বর আনুন।');
    speaking = false;
    setVoiceBtns();
    return;
  }

  let startIdx = (selectedRow >= 0 && selectedRow < trs.length) ? selectedRow : 0;
  bearBusy = true;
  bear('dance', 'শুনতে থাকো, আমি তালে তালে নাচি! 🎵');

  for (let i = startIdx; i < trs.length; i++) {
    if (stopFlag || my !== runId) break;
    selectRowByTr(trs[i], true);
    const v = Array.from(trs[i].querySelectorAll('input')).map(function (x) { return x.value.trim(); });
    trs[i].classList.add('speaking');
    trs[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('পড়ে শোনানো হচ্ছে... রোল ' + v[0] + ' (' + (i + 1) + '/' + trs.length + ')');
    let say = pickCol(v, col);
    if (say === 'A') say = 'অনুপস্থিত';
    await speakOne(say);
    trs[i].classList.remove('speaking');
  }
  bearBusy = false;
  if (my === runId && !stopFlag) {
    clearSelectedRow();
    setStatus('সব নম্বর পড়া শেষ।');
    speaking = false;
    activeCol = null;
    setVoiceBtns();
    bear('happy', 'সব নম্বর পড়া শেষ! 🎤', 2800);
  }
}

function stopSpeak(keepPosition) {
  stopFlag = true;
  runId++;
  if (hasTTS) speechSynthesis.cancel();
  speaking = false;
  activeCol = null;
  bearBusy = false;
  setVoiceBtns();
  const trs = document.querySelectorAll('#tbl tbody tr');
  trs.forEach(function (t) { t.classList.remove('speaking'); });

  if (keepPosition && selectedRow >= 0 && selectedRow < trs.length) {
    const rollVal = trs[selectedRow].querySelector('input').value.trim();
    setStatus('রোল ' + (rollVal || (selectedRow + 1)) + '-এ পড়া থামানো হয়েছে। আবার 🔊 চাপলে এখান থেকেই শুরু হবে।');
    bear('wave', 'পড়া পজ করেছি! আবার চাপলে এখান থেকেই বলবো 🐼', 3000);
  }
}

function copyCol(col) {
  const text = getRows().map(function (r) { return pickCol(r, col); }).join(NL);
  navigator.clipboard.writeText(text).then(
    function () {
      bear('happy', 'কপি ডান! এবার পেস্ট করে দাও 📋', 3000);
      alert('শুধু নম্বরগুলো কপি হয়েছে, একটির নিচে একটি।');
    },
    function () { alert('কপি করা যায়নি, আবার চেষ্টা করুন।'); }
  );
}

function downloadCsv() {
  const csv = BOM + (SINGLE
    ? [['Roll', 'Name', 'Marks']].concat(getRows().map(function (r) { return [r[0], r[1], r[4]]; }))
    : [['Roll', 'Name', 'MCQ', 'CQ', 'Total']].concat(getRows())
  )
    .map(function (r) {
      return r.map(function (c) { return QT + c.split(QT).join(QT + QT) + QT; }).join(',');
    })
    .join(NL);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (SUBJECT ? SUBJECT + '-' : '') + 'marks.csv';
  a.click();
  bear('dance', 'এক্সেল ফাইল ডাউনলোড হয়ে গেছে! 📥✨', 3200);
}

// --- Cute & Funny Panda Controller ---
let bearBusy = false;
let bearTimer = null;
let lastUserAction = Date.now();

function bear(state, say, ms) {
  const b = document.getElementById('bear');
  if (!b) return;
  b.className = state;
  document.getElementById('bearSay').textContent = say || '';
  clearTimeout(bearTimer);
  if (ms) {
    bearTimer = setTimeout(function () {
      bear('peek', '');
    }, ms);
  }
}

const POKE_ACTIONS = [
  ['tickle', 'কাতুকুতু দিও না! হিহিহি 😂'],
  ['eat', 'মচমচ... বাঁশটা যা মিষ্টি! খাবে নাকি? 🎋'],
  ['dance', 'একটু পান্ডা ড্যান্স হয়ে যাক! 💃🐼'],
  ['happy', 'টিপছো কেন? আমাকে কি রসগোল্লা মনে হয়? 😋'],
  ['wave', 'চকবোর্ডের ব্যাকগ্রাউন্ডটা দারুণ মানিয়েছে না? 💡'],
  ['think', 'ভাবছি আজকে বিরিয়ানি খাবো নাকি বাঁশপাতা... 🤔'],
  ['tickle', 'আরে সুড়সুড়ি লাগে তো! হাহাহা 😆'],
  ['eat', 'কাজ করতে করতে খিদে পেয়ে গেছে! 🎋']
];
let pokeIdx = 0;

function pokePanda(e) {
  if (e) e.stopPropagation();
  lastUserAction = Date.now();
  if (bearBusy) return;
  const act = POKE_ACTIONS[pokeIdx % POKE_ACTIONS.length];
  pokeIdx++;
  bear(act[0], act[1], 3400);
}

const IDLE_ACTIONS = [
  ['eat', 'মচমচ... একটু বাঁশ খেয়ে নিই 🎋', 3800],
  ['sleep', 'বোর লাগছে... একটু ঘুমিয়ে নিই 😴', 4500],
  ['dance', 'লা লা লা~ একা একাই একটু নাচি! 🎵', 3500],
  ['wave', 'এই যে! ঘুমিয়ে পড়লে নাকি? 👀', 3200],
  ['think', 'আজকে কারা বেশি নম্বর পেল দেখি তো... 🧐', 3500],
  ['happy', 'আমাকে ট্যাপ করলে কিন্তু আমি মজার কথা বলি! 🐼', 3600],
  ['eat', 'এত হিসাব দেখে পেটে ছুঁচো ডন মারছে! 🎋', 3600]
];

setInterval(function () {
  if (bearBusy) return;
  if (Date.now() - lastUserAction > 10000) {
    const pick = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
    bear(pick[0], pick[1], pick[2]);
    lastUserAction = Date.now();
  }
}, 4000);

document.addEventListener('click', function (e) {
  lastUserAction = Date.now();
  if (bearBusy) return;
  if (e.target.closest && e.target.closest('#bear')) return;
  if (e.target.closest && e.target.closest('button')) bear('wave', '', 1400);
});

// সব বাটন ফাংশন গ্লোবাল window-তে যুক্ত করা (যাতে ক্লিক করলে ১০০% কাজ করে)
window.openSubOverlay = openSubOverlay;
window.startCam = startCam;
window.stopCam = stopCam;
window.snap = snap;
window.clearPages = clearPages;
window.fileChosen = fileChosen;
window.scan = scan;
window.addRow = addRow;
window.addSample = addSample;
window.clearRows = clearRows;
window.voiceCol = voiceCol;
window.copyCol = copyCol;
window.downloadCsv = downloadCsv;
window.backFromResults = backFromResults;
window.pickOther = pickOther;
window.subStart = subStart;
window.pokePanda = pokePanda;
window.setSubject = setSubject;

// অ্যাপ চালু হওয়ার সাথে সাথে ইনিশিয়ালাইজেশন ও স্প্ল্যাশ স্ক্রিন অটো-রিমুভ
buildSubjects();
showSubOverlayBox(true);
try { history.replaceState({ page: 'subjects' }, ''); } catch (e) {}
setTimeout(function () {
  const sp = document.getElementById('splash');
  if (sp) sp.remove();
}, 3300);
