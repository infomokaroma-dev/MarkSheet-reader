window.addEventListener('error', function (e) {
  alert('ত্রুটি: ' + e.message + ' (লাইন ' + e.lineno + ')');
});

const NL = String.fromCharCode(10);
const BOM = String.fromCharCode(65279);
const QT = String.fromCharCode(34);

let stream = null;
let imageB64 = null;
let imageType = 'image/jpeg';
let MAX_MCQ = 0;
let MAX_CQ = 0;
let SUBJECT = ''; let SINGLE = false; let MAX_TOT = 0;
let speaking = false;
let stopFlag = false;
let activeCol = null;
let runId = 0;
let errShown = false;
const hasTTS = !!window.speechSynthesis;

const SUBJECTS = ['বাংলা', 'বাংলা ১ম পত্র', 'বাংলা ২য় পত্র', 'ইংরেজি', 'ইংরেজি ১ম পত্র', 'ইংরেজি ২য় পত্র', 'গণিত', 'উচ্চতর গণিত', 'বিজ্ঞান', 'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'বাংলাদেশ ও বিশ্বপরিচয়', 'ধর্ম ও নৈতিক শিক্ষা', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'কৃষিশিক্ষা', 'গার্হস্থ্য বিজ্ঞান'];

function setStatus(t) {
  document.getElementById('status').textContent = t;
  document.getElementById('rstatus').textContent = t;
}

function setKey() {
  const k = prompt('আপনার Google AI Studio API key দিন:');
  if (k) localStorage.setItem('gkey', k.trim());
}

async function startCam() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false
    });
    document.getElementById('video').srcObject = stream;
    document.getElementById('camBox').style.display = 'block';
    setStatus('ক্যামেরা চালু হয়েছে। মার্কশিট ফ্রেমে এনে ছবি তুলুন।');
  } catch (e) {
    setStatus('ক্যামেরা চালু করা যায়নি: ' + e.message + ' (ব্রাউজারকে ক্যামেরার অনুমতি দিন)');
  }
}

function stopCam() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById('camBox').style.display = 'none';
}

function snap() {
  const v = document.getElementById('video');
  if (!v.videoWidth) { setStatus('ক্যামেরা এখনো প্রস্তুত নয়, একটু অপেক্ষা করুন।'); return; }
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  imageB64 = dataUrl.split(',')[1];
  imageType = 'image/jpeg';
  const p = document.getElementById('preview');
  p.src = dataUrl;
  p.style.display = 'block';
  stopCam();
  setStatus('ছবি তোলা হয়েছে। এবার “ছবি থেকে নম্বর পড়ুন” চাপুন।');
}

async function fileChosen() {
  const f = document.getElementById('photo').files[0];
  if (!f) return;
  imageB64 = await toBase64(f);
  imageType = f.type || 'image/jpeg';
  const p = document.getElementById('preview');
  p.src = URL.createObjectURL(f);
  p.style.display = 'block';
  setStatus('ছবি বাছাই হয়েছে। এবার “ছবি থেকে নম্বর পড়ুন” চাপুন।');
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function askMax() { if (SINGLE) { const t = prompt('সর্বোচ্চ নম্বর কত?'); if (t === null) return false; const z = parseFloat(t); if (isNaN(z) || z <= 0) { alert('সঠিক সংখ্যা দিন, আবার চেষ্টা করুন।'); return false; } MAX_TOT = z; return true; }
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
  const key = localStorage.getItem('gkey');
  if (!key) { setKey(); return; }
  if (!imageB64) { alert('আগে ছবি তুলুন বা বেছে নিন'); return; }
  if (!askMax()) return;
  document.getElementById('warn').textContent = '';
  const t0 = Date.now(); bearBusy = true; bear('think', 'পড়ছি... 🤔');
  const timer = setInterval(() => {
    setStatus('পড়া হচ্ছে, একটু অপেক্ষা করুন... ' + Math.floor((Date.now() - t0) / 1000) + ' সেকেন্ড');
  }, 500);
  try {
    const example = JSON.stringify([{ roll: '1', mcq: '15', cq: '22' }, { roll: '2', mcq: 'A', cq: '30' }]);
    let promptText = 'This is a photo of a handwritten school marksheet with four columns: Roll, Name (blank, ignore it), MCQ marks, and CQ marks. The maximum possible MCQ mark is ' + MAX_MCQ + ' and the maximum possible CQ mark is ' + MAX_CQ + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + example + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the MCQ or CQ box of a row is blank or empty, use the letter A (it means absent). If a box has something written but it is unreadable, use a question mark.'; if (SINGLE) promptText = 'This is a photo of a handwritten school marksheet with three columns: Roll, Name (blank, ignore it), and Marks (one total mark per student). The maximum possible mark is ' + MAX_TOT + '. Extract every row that has a roll number. Return ONLY a JSON array like ' + JSON.stringify([{ roll: '1', total: '78' }, { roll: '2', total: 'A' }]) + '. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If the marks box of a row is blank or empty, use the letter A (it means absent). If it has something written but it is unreadable, use a question mark.';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + key;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: promptText },
          { inline_data: { mime_type: imageType, data: imageB64 } }
        ]}],
        generationConfig: { response_mime_type: 'application/json' }
      })
    });
    const data = await resp.json();
    if (data.error) { throw new Error('Google বলছে: ' + (data.error.message || JSON.stringify(data.error))); }
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('কোনো উত্তর আসেনি। আরেকটু পরিষ্কার ছবি দিয়ে আবার চেষ্টা করুন।'); }
    const rows = JSON.parse(data.candidates[0].content.parts[0].text);
    fillTable(rows); bear('happy', 'দারুণ! হয়ে গেছে 🎉', 3500);
    setStatus(rows.length + ' টি সারি পাওয়া গেছে। ফাঁকা ঘরে A বসেছে। ভুল থাকলে ঘরে চাপ দিয়ে ঠিক করুন।');
    checkLimits();
    showResults();
  } catch (e) {
    setStatus('সমস্যা হয়েছে: ' + e.message); bear('sad', 'ইশ! একটা সমস্যা হয়েছে 😢', 4500);
  } finally {
    clearInterval(timer); bearBusy = false;
  }
}

function fixA(v) {
  const s = v == null ? '' : String(v).trim();
  if (s === '' || /^(a|ab|abs|absent|-|—)$/i.test(s)) return 'A';
  return s;
}

function calcTotal(tr) { if (SINGLE) return;
  const ins = tr.querySelectorAll('input');
  const ms = ins[2].value.trim(), cs = ins[3].value.trim();
  const m = parseFloat(ms), c = parseFloat(cs);
  let t = '';
  if (ms === '?' || cs === '?') t = '?';
  else if (!isNaN(m) || !isNaN(c)) t = Math.round(((isNaN(m) ? 0 : m) + (isNaN(c) ? 0 : c)) * 100) / 100;
  else if (ms !== '' || cs !== '') t = 'A';
  ins[4].value = t;
}

function addRow(roll, mcq, cq, noFocus, tot) {
  const tb = document.querySelector('#tbl tbody');
  const tr = document.createElement('tr');
  [roll, '', mcq, cq, tot].forEach((x, idx) => {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.value = x == null ? '' : String(x);
    if (idx === 2 || idx === 3) {
      inp.addEventListener('input', function () { calcTotal(tr); checkLimits(); });
    }
    if (idx === 4) { inp.className = 'tot'; if (SINGLE) inp.addEventListener('input', checkLimits); else inp.readOnly = true; }
    td.appendChild(inp);
    tr.appendChild(td);
  });
  tb.appendChild(tr);
  calcTotal(tr);
  showResults();
  if (!roll && !noFocus) tr.querySelector('input').focus();
}

function fillTable(rows) {
  document.querySelector('#tbl tbody').innerHTML = '';
  rows.forEach(r => { if (SINGLE) addRow(r.roll, '', '', true, fixA(r.total)); else addRow(r.roll, fixA(r.mcq), fixA(r.cq), true); });
}

function addSample() {
  if (SINGLE) { [['1', '78'], ['2', 'A'], ['3', '45'], ['4', '90'], ['5', '62']].forEach(r => addRow(r[0], '', '', true, r[1])); } else { [['1', '15', '22'], ['2', 'A', '30'], ['3', '9', '12'], ['4', '20', '35'], ['5', '12', 'A']].forEach(r => addRow(r[0], r[1], r[2], true)); }
  setStatus('নমুনা ডেটা যোগ হয়েছে (শুধু টেস্টের জন্য)।');
}

function clearRows() {
  stopSpeak();
  document.querySelector('#tbl tbody').innerHTML = '';
  document.getElementById('warn').textContent = '';
  setStatus('সব সারি মুছে ফেলা হয়েছে।');
}

function checkLimits() {
  const bad = [];
  document.querySelectorAll('#tbl tbody tr').forEach(tr => {
    const ins = tr.querySelectorAll('input');
    const roll = ins[0].value.trim();
    if (SINGLE) { const t = ins[4]; const tv = parseFloat(t.value); const tBad = !isNaN(tv) && (tv < 0 || (MAX_TOT > 0 && tv > MAX_TOT)); t.classList.toggle('bad', tBad); if (tBad) bad.push('রোল ' + roll + ' (' + t.value + ')'); return; } const m = ins[2], c = ins[3];
    const mv = parseFloat(m.value), cv = parseFloat(c.value);
    const mBad = !isNaN(mv) && (mv < 0 || (MAX_MCQ > 0 && mv > MAX_MCQ));
    const cBad = !isNaN(cv) && (cv < 0 || (MAX_CQ > 0 && cv > MAX_CQ));
    m.classList.toggle('bad', mBad);
    c.classList.toggle('bad', cBad);
    if (mBad) bad.push('রোল ' + roll + ' এমসিকিউ (' + m.value + ')');
    if (cBad) bad.push('রোল ' + roll + ' সিকিউ (' + c.value + ')');
  });
  document.getElementById('warn').textContent = bad.length
    ? 'সন্দেহজনক নম্বর, সর্বোচ্চের চেয়ে বেশি: ' + bad.join(', ') + '। লাল ঘরগুলো মার্কশিটের সাথে মিলিয়ে ঠিক করুন।'
    : '';
}

function getRows() {
  return [...document.querySelectorAll('#tbl tbody tr')].map(tr =>
    [...tr.querySelectorAll('input')].map(i => i.value.trim())
  );
}

// col: 2 = এমসিকিউ, 3 = সিকিউ, 4 = মোট
function pickCol(r, col) {
  return r[col];
}

function showResults() { document.getElementById('results').classList.add('show'); }

function backFromResults() {
  stopSpeak();
  document.getElementById('results').classList.remove('show');
}

function buildSubjects() {
  const box = document.getElementById('subList');
  box.innerHTML = '';
  SUBJECTS.forEach(function (s) {
    const b = document.createElement('button');
    b.textContent = s;
    b.onclick = function () { setSubject(s); };
    box.appendChild(b);
  });
  const o = document.createElement('button');
  o.textContent = '✏️ অন্য (নিজে লিখুন)';
  o.className = 'other';
  o.onclick = function () {
    document.getElementById('otherBox').classList.add('show');
    document.getElementById('subInput').focus();
  };
  box.appendChild(o);
}

function setSubject(name) {
  SUBJECT = name; SINGLE = /ইংরেজি|english/i.test(name); document.body.classList.toggle('single', SINGLE); document.getElementById('totLabel').textContent = SINGLE ? 'নম্বর' : 'মোট';
  document.getElementById('title').textContent = 'মার্কশিট স্ক্যানার' + (SUBJECT ? ' — ' + SUBJECT : '');
  document.getElementById('resTitle').textContent = 'ফলাফল' + (SUBJECT ? ' — ' + SUBJECT : '');
  document.getElementById('subOverlay').classList.remove('show');
}

function pickOther() {
  const v = document.getElementById('subInput').value.trim();
  if (!v) { alert('সাবজেক্টের নাম লিখুন।'); return; }
  setSubject(v);
}

function subStart(use) {
  if (!use) setSubject('');
}

function speakOne(text) {
  return new Promise(res => {
    let done = false;
    let timer = null;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); res(); } };
    if (!text) { finish(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'bn-BD';
    u.rate = 1.4;
    u.onend = finish;
    u.onerror = (e) => {
      if (!errShown) {
        errShown = true;
        alert('শুনানোতে সমস্যা: ' + (e.error || 'অজানা') + '। ফোনের মিডিয়া ভলিউম আর Text-to-speech সেটিংসে বাংলা ভয়েস আছে কিনা দেখুন।');
      }
      finish();
    };
    timer = setTimeout(finish, 8000);
    speechSynthesis.speak(u);
  });
}

function setVoiceBtns() {
  [[2, 'vMcq'], [3, 'vCq'], [4, 'vTot']].forEach(p => {
    document.getElementById(p[1]).textContent = (speaking && activeCol === p[0]) ? '⏹' : '🔊';
  });
}

async function voiceCol(col) {
  if (speaking) {
    const same = activeCol === col;
    stopSpeak();
    if (same) return;
    await new Promise(r => setTimeout(r, 300));
  }
  const my = ++runId;
  activeCol = col;
  speaking = true;
  speechSynthesis.cancel();
  stopFlag = false;
  setVoiceBtns();
  if (!hasTTS) { alert('এই ব্রাউজারে পড়ে শোনানোর সুবিধা নেই। ক্রোম ব্রাউজারে খুলুন।'); speaking = false; return; }
  const trs = document.querySelectorAll('#tbl tbody tr');
  if (!trs.length) { setStatus('আগে ছবি স্ক্যান করে নম্বর আনুন।'); speaking = false; setVoiceBtns(); return; }
  for (let i = 0; i < trs.length; i++) {
    if (stopFlag || my !== runId) break;
    const v = [...trs[i].querySelectorAll('input')].map(x => x.value.trim());
    trs[i].classList.add('speaking');
    setStatus('🔊 পড়ে শোনানো হচ্ছে... রোল ' + v[0] + ' (' + (i + 1) + '/' + trs.length + ')');
    let say = pickCol(v, col);
    if (say === 'A') say = 'অনুপস্থিত';
    await speakOne(say);
    trs[i].classList.remove('speaking');
  }
  if (my === runId) {
    setStatus('পড়া শেষ।');
    speaking = false;
    activeCol = null;
    setVoiceBtns();
  }
}

function stopSpeak() {
  stopFlag = true;
  runId++;
  speechSynthesis.cancel();
  speaking = false;
  activeCol = null;
  setVoiceBtns();
  document.querySelectorAll('#tbl tbody tr').forEach(t => t.classList.remove('speaking'));
}

function copyCol(col) {
  const text = getRows().map(r => pickCol(r, col)).join(NL);
  navigator.clipboard.writeText(text).then(
    () => alert('শুধু নম্বরগুলো কপি হয়েছে, একটির নিচে একটি।'),
    () => alert('কপি করা যায়নি, আবার চেষ্টা করুন।')
  );
}

function downloadCsv() {
  const csv = BOM + (SINGLE ? [['Roll', 'Name', 'Marks']].concat(getRows().map(r => [r[0], r[1], r[4]])) : [['Roll', 'Name', 'MCQ', 'CQ', 'Total']].concat(getRows()))
    .map(r => r.map(c => QT + c.split(QT).join(QT + QT) + QT).join(','))
    .join(NL);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (SUBJECT ? SUBJECT + '-' : '') + 'marks.csv';
  a.click();
}

buildSubjects();
document.getElementById('subOverlay').classList.add('show'); let bearBusy = false; let bearTimer = null; function bear(state, say, ms) { const b = document.getElementById('bear'); if (!b) return; b.className = state; document.getElementById('bearSay').textContent = say || ''; clearTimeout(bearTimer); if (ms) bearTimer = setTimeout(function () { bear('peek', ''); }, ms); } document.addEventListener('click', function (e) { if (bearBusy) return; if (e.target.closest && e.target.closest('button')) bear('wave', '', 1400); }); setTimeout(function () { bear('wave', 'নমস্কার! 🐻', 3000); }, 3400);
