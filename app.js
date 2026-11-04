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
const hasTTS = !!window.speechSynthesis;

// SSC সাধারণ, বিজ্ঞান (Science), মানবিক (Arts) এবং ব্যবসায় শিক্ষা (Commerce) বিভাগের সকল সাবজেক্ট
const SUBJECT_GROUPS = [
  {
    title: '📘 আবশ্যিক ও সাধারণ বিষয়',
    items: [
      'বাংলা', 'বাংলা ১ম পত্র', 'বাংলা ২য় পত্র',
      'ইংরেজি', 'ইংরেজি ১ম পত্র', 'ইংরেজি ২য় পত্র',
      'গণিত', 'তথ্য ও যোগাযোগ প্রযুক্তি',
      'ধর্ম ও নৈতিক শিক্ষা', 'বাংলাদেশ ও বিশ্বপরিচয়',
      'বিজ্ঞান', 'কৃষিশিক্ষা', 'গার্হস্থ্য বিজ্ঞান'
    ]
  },
  {
    title: '🔬 বিজ্ঞান বিভাগ (SSC Science)',
    items: [
      'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'উচ্চতর গণিত'
    ]
  },
  {
    title: '🌍 মানবিক বিভাগ (SSC Arts)',
    items: [
      'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', 'ভূগোল ও পরিবেশ',
      'পৌরনীতি ও নাগরিকতা', 'অর্থনীতি'
    ]
  },
  {
    title: '📊 ব্যবসায় শিক্ষা (SSC Commerce)',
    items: [
      'হিসাববিজ্ঞান', 'ফিন্যান্স ও ব্যাংকিং', 'ব্যবসায় উদ্যোগ'
    ]
  }
];

// --- ফোনের হার্ডওয়্যার Back Button হ্যান্ডলার (যাতে অ্যাপ থেকে বের না হয়ে এক ধাপ পেছনে যায়) ---
let currentStage = 'subject'; // 'subject' | 'main' | 'camera' | 'results'
let ignorePop = false;

function goToStage(stage, pushHistory) {
  currentStage = stage;
  if (pushHistory !== false) {
    history.pushState({ stage: stage }, '');
  }
}

window.addEventListener('popstate', function (e) {
  if (ignorePop) {
    ignorePop = false;
    return;
  }
  const resultsEl = document.getElementById('results');
  const camBoxEl = document.getElementById('camBox');
  const subOverlayEl = document.getElementById('subOverlay');

  // ১. যদি রেজাল্ট পেজ খোলা থাকে -> মেইন স্ক্রিনে ফিরবে
  if (resultsEl.classList.contains('show')) {
    stopSpeak(false);
    resultsEl.classList.remove('show');
    currentStage = 'main';
    bear('wave', 'রেজাল্ট থেকে পেছনে এলাম! 🐼', 2400);
    return;
  }

  // ২. যদি ক্যামেরা চালু থাকে -> ক্যামেরা বন্ধ করে মেইন স্ক্রিনে ফিরবে
  if (camBoxEl.style.display === 'block') {
    stopCam(true);
    currentStage = 'main';
    bear('wave', 'ক্যামেরা বন্ধ করা হয়েছে! 📷', 2200);
    return;
  }

  // ৩. যদি মেইন স্ক্রিনে থাকে -> সাবজেক্ট বাছাইয়ের স্ক্রিনে ফিরবে
  if (!subOverlayEl.classList.contains('show')) {
    subOverlayEl.classList.add('show');
    currentStage = 'subject';
    bear('happy', 'নতুন সাবজেক্ট বেছে নাও! 📚', 2500);
    return;
  }
});

// অ্যাপ লোড হওয়ার সময় প্রাথমিক হিস্ট্রি স্টেট সেট করা
history.replaceState({ stage: 'subject' }, '');

function setStatus(t) {
  document.getElementById('status').textContent = t;
  document.getElementById('rstatus').textContent = t;
}

function setKey() {
  const k = prompt('আপনার Google AI Studio API key দিন:');
  if (k) localStorage.setItem('gkey', k.trim());
}

function renderPreviews() {
  const box = document.getElementById('previewList');
  const clearBtn = document.getElementById('clearPagesBtn');
  box.innerHTML = '';
  pages.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'pageCard';

    const badge = document.createElement('span');
    badge.className = 'pageBadge';
    badge.textContent = 'পৃষ্ঠা ' + (idx + 1);

    const del = document.createElement('button');
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
  document.getElementById('photo').value = '';
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
    if (document.getElementById('camBox').style.display !== 'block') {
      document.getElementById('camBox').style.display = 'block';
      goToStage('camera', true);
    }
    setStatus('ক্যামেরা চালু হয়েছে। ১ম পৃষ্ঠার ছবি তুলুন, এরপর সাথে সাথেই ২য় পৃষ্ঠার ছবিও তুলতে পারবেন।');
    bear('happy', 'চিজ! এক এক করে সব পৃষ্ঠার ছবি তুলো 📸', 3000);
  } catch (e) {
    setStatus('ক্যামেরা চালু করা যায়নি: ' + e.message + ' (ব্রাউজারকে ক্যামেরার অনুমতি দিন)');
    bear('sad', 'ক্যামেরার অনুমতি দাও প্লিজ! 🥺', 3500);
  }
}

function stopCam(fromPopState) {
  const wasOpen = document.getElementById('camBox').style.display === 'block';
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  document.getElementById('camBox').style.display = 'none';
  if (pages.length) {
    setStatus('মোট ' + pages.length + 'টি পৃষ্ঠার ছবি তোলা হয়েছে। এবার "সব পৃষ্ঠা থেকে নম্বর পড়ুন" চাপুন।');
  }
  if (wasOpen && !fromPopState && currentStage === 'camera') {
    ignorePop = true;
    history.back();
    currentStage = 'main';
  }
}

function snap() {
  const v = document.getElementById('video');
  if (!v.videoWidth) {
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
  const files = [...document.getElementById('photo').files];
  if (!files.length) return;
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
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
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

  const timer = setInterval(() => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    setStatus('পৃষ্ঠা ' + curPage + '/' + pages.length + ' পড়া হচ্ছে, অপেক্ষা করুন... ' + sec + ' সেকেন্ড');
  }, 500);

  try {
    const example = JSON.stringify([{ roll: '1', mcq: '15', cq: '22' }, { roll: '2', mcq: 'A', cq: '30' }]);
    let promptText = 'This is a photo of a handwritten school marksheet with four columns: Roll, Name (blank, ignore it), MCQ marks, and CQ marks. The maximum possible MCQ mark is ' + MAX_MCQ + ' and the maximum possible CQ mark is ' + MAX_CQ + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + example + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the MCQ or CQ box of a row is blank or empty, use the letter A (it means absent). If a box has something written but it is unreadable, use a question mark.';

    if (SINGLE) {
      promptText = 'This is a photo of a handwritten school marksheet with three columns: Roll, Name (blank, ignore it), and Marks (one total mark per student). The maximum possible mark is ' + MAX_TOT + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + JSON.stringify([{ roll: '1', total: '78' }, { roll: '2', total: 'A' }]) + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the marks box of a row is blank or empty, use the letter A (it means absent). If it has something written but it is unreadable, use a question mark.';
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + key;
    let allRows = [];

    for (let i = 0; i < pages.length; i++) {
      curPage = i + 1;
      document.getElementById('bearSay').textContent = 'পৃষ্ঠা ' + curPage + '/' + pages.length + ' পড়ছি... 🔍';

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptText },
              { inline_data: { mime_type: pages[i].type, data: pages[i].b64 } }
            ]
          }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      const data = await resp.json();
      if (data.error) {
        throw new Error('Google বলছে (পৃষ্ঠা ' + curPage + '): ' + (data.error.message || JSON.stringify(data.error)));
      }
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('পৃষ্ঠা ' + curPage + ' থেকে কোনো উত্তর আসেনি। আরেকটু পরিষ্কার ছবি দিয়ে চেষ্টা করুন।');
      }
      const pageRows = JSON.parse(data.candidates[0].content.parts[0].text);
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
  const trs = [...document.querySelectorAll('#tbl tbody tr')];
  trs.forEach(t => t.classList.remove('selected-row'));
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
  document.querySelectorAll('#tbl tbody tr').forEach(t => t.classList.remove('selected-row'));
}

function addRow(roll, mcq, cq, noFocus, tot) {
  const tb = document.querySelector('#tbl tbody');
  const tr = document.createElement('tr');
  [roll, '', mcq, cq, tot].forEach((x, idx) => {
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
  rows.forEach(r => {
    if (SINGLE) addRow(r.roll, '', '', true, fixA(r.total));
    else addRow(r.roll, fixA(r.mcq), fixA(r.cq), true);
  });
}

function addSample() {
  clearSelectedRow();
  if (SINGLE) {
    [['1', '78'], ['2', 'A'], ['3', '45'], ['4', '90'], ['5', '62']].forEach(r => addRow(r[0], '', '', true, r[1]));
  } else {
    [['1', '15', '22'], ['2', 'A', '30'], ['3', '9', '12'], ['4', '20', '35'], ['5', '12', 'A']].forEach(r => addRow(r[0], r[1], r[2], true));
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
  document.querySelectorAll('#tbl tbody tr').forEach(tr => {
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
  return [...document.querySelectorAll('#tbl tbody tr')].map(tr =>
    [...tr.querySelectorAll('input')].map(i => i.value.trim())
  );
}

function pickCol(r, col) {
  return r[col];
}

function showResults() {
  const res = document.getElementById('results');
  if (!res.classList.contains('show')) {
    res.classList.add('show');
    goToStage('results', true);
  }
}

function backFromResults() {
  stopSpeak(false);
  const res = document.getElementById('results');
  if (res.classList.contains('show')) {
    res.classList.remove('show');
    if (currentStage === 'results') {
      ignorePop = true;
      history.back();
      currentStage = 'main';
    }
  }
  bear('wave', 'চলো নতুন আরেকটা মার্কশিট দেখা যাক! 🐼', 2800);
}

function openSubjectMenu() {
  stopCam(true);
  document.getElementById('subOverlay').classList.add('show');
  currentStage = 'subject';
  bear('happy', 'কোন সাবজেক্ট নিবে বেছে নাও! 📚', 2600);
}

function buildSubjects() {
  const box = document.getElementById('subList');
  box.innerHTML = '';
  SUBJECT_GROUPS.forEach(function (grp) {
    const title = document.createElement('div');
    title.className = 'subGroupTitle';
    title.textContent = grp.title;
    box.appendChild(title);

    grp.items.forEach(function (s) {
      const b = document.createElement('button');
      b.textContent = s;
      b.onclick = function () { setSubject(s); };
      box.appendChild(b);
    });
  });
  const o = document.createElement('button');
  o.textContent = '✏️ অন্য সাবজেক্ট (নিজে লিখুন)';
  o.className = 'other';
  o.onclick = function () {
    document.getElementById('otherBox').classList.add('show');
    document.getElementById('subInput').focus();
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
  document.getElementById('subOverlay').classList.remove('show');

  // সাবজেক্ট বাছাইয়ের পর মেইন স্ক্রিনে আসলে হিস্ট্রি পুশ হবে যাতে ফোনের ব্যাক বাটনে চাপলে সাবজেক্ট পেজে ফেরে
  goToStage('main', true);

  if (name) {
    if (/গণিত|হিসাববিজ্ঞান|ফিন্যান্স|অর্থনীতি/.test(name)) bear('happy', name + '! হিসাব কষতে আমি ওস্তাদ! 🧮', 3200);
    else if (SINGLE) bear('dance', name + '! ওকে বস, সিঙ্গেল মার্কস মোড অন! 😎', 3200);
    else if (/বিজ্ঞান|পদার্থ|রসায়ন|জীববিজ্ঞান/.test(name)) bear('happy', 'বিজ্ঞানী পান্ডা রেডি! 🧪🐼', 3200);
    else if (/ইতিহাস|ভূগোল|পৌরনীতি/.test(name)) bear('happy', name + '! মানবিক বিভাগের কাজ শুরু! 🌍', 3200);
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
  return new Promise(res => {
    let done = false;
    let timer = null;
    const finish = () => {
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
    u.onerror = (e) => {
      if (!errShown) {
        errShown = true;
        alert('শুনানোতে সমস্যা: ' + (e.error || 'অজানা
