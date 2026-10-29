window.addEventListener("error", function (e) {
  alert("ত্রুটি: " + e.message + " (লাইন " + e.lineno + ")");
});

let stream = null;
let imageB64 = null;
let imageType = "image/jpeg";
let MAX_MCQ = 0;
let MAX_CQ = 0;
let SUBJECT = "";
let speaking = false;
let stopFlag = false;
let activeCol = null;
let runId = 0;
let errShown = false;
const hasTTS = !!window.speechSynthesis;

function setStatus(t) {
  document.getElementById("status").textContent = t;
  document.getElementById("rstatus").textContent = t;
}

function setKey() {
  const k = prompt("আপনার Google AI Studio API key দিন:");
  if (k) localStorage.setItem("gkey", k.trim());
}

async function startCam() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
      audio: false
    });
    document.getElementById("video").srcObject = stream;
    document.getElementById("camBox").style.display = "block";
    setStatus("ক্যামেরা চালু হয়েছে। মার্কশিট ফ্রেমে এনে ছবি তুলুন।");
  } catch (e) {
    setStatus("ক্যামেরা চালু করা যায়নি: " + e.message + " (ব্রাউজারকে ক্যামেরার অনুমতি দিন)");
  }
}

function stopCam() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById("camBox").style.display = "none";
}

function snap() {
  const v = document.getElementById("video");
  if (!v.videoWidth) { setStatus("ক্যামেরা এখনো প্রস্তুত নয়, একটু অপেক্ষা করুন।"); return; }
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  const dataUrl = c.toDataURL("image/jpeg", 0.92);
  imageB64 = dataUrl.split(",")[1];
  imageType = "image/jpeg";
  const p = document.getElementById("preview");
  p.src = dataUrl;
  p.style.display = "block";
  stopCam();
  setStatus("ছবি তোলা হয়েছে। এবার \"ছবি থেকে নম্বর পড়ুন\" চাপুন।");
}

async function fileChosen() {
  const f = document.getElementById("photo").files[0];
  if (!f) return;
  imageB64 = await toBase64(f);
  imageType = f.type || "image/jpeg";
  const p = document.getElementById("preview");
  p.src = URL.createObjectURL(f);
  p.style.display = "block";
  setStatus("ছবি বাছাই হয়েছে। এবার \"ছবি থেকে নম্বর পড়ুন\" চাপুন।");
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function askMax() {
  const a = prompt("এমসিকিউতে সর্বোচ্চ নম্বর কত?");
  if (a === null) return false;
  const b = prompt("সিকিউতে সর্বোচ্চ নম্বর কত?");
  if (b === null) return false;
  const x = parseFloat(a), y = parseFloat(b);
  if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0) {
    alert("সঠিক সংখ্যা দিন, আবার চেষ্টা করুন।");
    return false;
  }
  MAX_MCQ = x;
  MAX_CQ = y;
  return true;
}

async function scan() {
  const key = localStorage.getItem("gkey");
  if (!key) { setKey(); return; }
  if (!imageB64) { alert("আগে ছবি তুলুন বা বেছে নিন"); return; }
  if (!askMax()) return;
  document.getElementById("warn").textContent = "";
  const t0 = Date.now();
  const timer = setInterval(() => {
    setStatus("পড়া হচ্ছে, একটু অপেক্ষা করুন... " + Math.floor((Date.now() - t0) / 1000) + " সেকেন্ড");
  }, 500);
  try {
    const promptText = "This is a photo of a handwritten school marksheet with four columns: Roll, Name (blank, ignore it), MCQ marks, and CQ marks. The maximum possible MCQ mark is " + MAX_MCQ + " and the maximum possible CQ mark is " + MAX_CQ + ". Extract every row that has a roll number. Return ONLY a JSON array like [{\"roll\":\"1\",\"mcq\":\"15\",\"cq\":\"22\"}]. Read digits carefully, in the order they appear on the page. Write exactly what is written even if it looks too large. If a value is unreadable or empty use an empty string.";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + key;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: promptText },
          { inline_data: { mime_type: imageType, data: imageB64 } }
        ]}],
        generationConfig: { response_mime_type: "application/json" }
      })
    });
    const data = await resp.json();
    if (data.error) { throw new Error("Google বলছে: " + (data.error.message || JSON.stringify(data.error))); }
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error("কোনো উত্তর আসেনি। আরেকটু পরিষ্কার ছবি দিয়ে আবার চেষ্টা করুন।"); }
    const rows = JSON.parse(data.candidates[0].content.parts[0].text);
    fillTable(rows);
    setStatus(rows.length + " টি সারি পাওয়া গেছে। ভুল থাকলে ঘরে চাপ দিয়ে ঠিক করুন।");
    checkLimits();
    showResults();
  } catch (e) {
    setStatus("সমস্যা হয়েছে: " + e.message);
  } finally {
    clearInterval(timer);
  }
}

function addRow(roll, mcq, cq, noFocus) {
  const tb = document.querySelector("#tbl tbody");
  const tr = document.createElement("tr");
  [roll, "", mcq, cq].forEach((x, idx) => {
    const td = document.createElement("td");
    const inp = document.createElement("input");
    inp.value = x == null ? "" : String(x);
    if (idx === 2 || idx === 3) inp.addEventListener("input", checkLimits);
    td.appendChild(inp);
    tr.appendChild(td);
  });
  tb.appendChild(tr);
  showResults();
  if (!roll && !noFocus) tr.querySelector("input").focus();
}

function fillTable(rows) {
  document.querySelector("#tbl tbody").innerHTML = "";
  rows.forEach(r => addRow(r.roll, r.mcq, r.cq, true));
}

function addSample() {
  [["1", "15", "22"], ["2", "18", "30"], ["3", "9", "12"], ["4", "20", "35"], ["5", "12", "18"]].forEach(r => addRow(r[0], r[1], r[2], true));
  setStatus("নমুনা ডেটা যোগ হয়েছে (শুধু টেস্টের জন্য)।");
}

function clearRows() {
  stopSpeak();
  document.querySelector("#tbl tbody").innerHTML = "";
  document.getElementById("warn").textContent = "";
  setStatus("সব সারি মুছে ফেলা হয়েছে।");
}

function checkLimits() {
  const bad = [];
  document.querySelectorAll("#tbl tbody tr").forEach(tr => {
    const ins = tr.querySelectorAll("input");
    const roll = ins[0].value.trim();
    const m = ins[2], c = ins[3];
    const mv = parseFloat(m.value), cv = parseFloat(c.value);
    const mBad = !isNaN(mv) && (mv < 0 || (MAX_MCQ > 0 && mv > MAX_MCQ));
    const cBad = !isNaN(cv) && (cv < 0 || (MAX_CQ > 0 && cv > MAX_CQ));
    m.classList.toggle("bad", mBad);
    c.classList.toggle("bad", cBad);
    if (mBad) bad.push("রোল " + roll + " এমসিকিউ (" + m.value + ")");
    if (cBad) bad.push("রোল " + roll + " সিকিউ (" + c.value + ")");
  });
  document.getElementById("warn").textContent = bad.length
    ? "সন্দেহজনক নম্বর, সর্বোচ্চের চেয়ে বেশি: " + bad.join(", ") + "। লাল ঘরগুলো মার্কশিটের সাথে মিলিয়ে ঠিক করুন।"
    : "";
}

function getRows() {
  return [...document.querySelectorAll("#tbl tbody tr")].map(tr =>
    [...tr.querySelectorAll("input")].map(i => i.value.trim())
  );
}

function pickCol(r, col) {
  return col === "mcq" ? r[2] : r[3];
}

function showResults() { document.getElementById("results").classList.add("show"); }

function backFromResults() {
  stopSpeak();
  document.getElementById("results").classList.remove("show");
}

function subStart(use) {
  if (use) {
    SUBJECT = document.getElementById("subInput").value.trim();
    document.getElementById("title").textContent = "মার্কশিট স্ক্যানার" + (SUBJECT ? " — " + SUBJECT : "");
    document.getElementById("resTitle").textContent = "ফলাফল" + (SUBJECT ? " — " + SUBJECT : "");
  }
  document.getElementById("subOverlay").classList.remove("show");
}

function speakOne(text) {
  return new Promise(res => {
    let done = false;
    let timer = null;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); res(); } };
    if (!text) { finish(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "bn-BD";
    u.rate = 1.4;
    u.onend = finish;
    u.onerror = (e) => {
      if (!errShown) {
        errShown = true;
        alert("শুনানোতে সমস্যা: " + (e.error || "অজানা") + "। ফোনের মিডিয়া ভলিউম আর Text-to-speech সেটিংসে বাংলা ভয়েস আছে কিনা দেখুন।");
      }
      finish();
    };
    timer = setTimeout(finish, 8000);
    speechSynthesis.speak(u);
  });
}

function setVoiceBtns() {
  [["mcq", "vMcq"], ["cq", "vCq"]].forEach(p => {
    document.getElementById(p[1]).textContent = (speaking && activeCol === p[0]) ? "⏹" : "🔊";
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
  if (!hasTTS) { alert("এই ব্রাউজারে পড়ে শোনানোর সুবিধা নেই। ক্রোম ব্রাউজারে খুলুন।"); speaking = false; return; }
  const trs = document.querySelectorAll("#tbl tbody tr");
  if (!trs.length) { setStatus("আগে ছবি স্ক্যান করে নম্বর আনুন।"); speaking = false; setVoiceBtns(); return; }
  for (let i = 0; i < trs.length; i++) {
    if (stopFlag || my !== runId) break;
    const v = [...trs[i].querySelectorAll("input")].map(x => x.value.trim());
    trs[i].classList.add("speaking");
    setStatus("🔊 পড়ে শোনানো হচ্ছে... রোল " + v[0] + " (" + (i + 1) + "/" + trs.length + ")");
    await speakOne(pickCol(v, col));
    trs[i].classList.remove("speaking");
  }
  if (my === runId) {
    setStatus("পড়া শেষ।");
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
  document.querySelectorAll("#tbl tbody tr").forEach(t => t.classList.remove("speaking"));
}

function copyCol(col) {
  const text = getRows().map(r => pickCol(r, col)).join("\n");
  navigator.clipboard.writeText(text).then(
    () => alert("শুধু নম্বরগুলো কপি হয়েছে, একটির নিচে একটি।"),
    () => alert("কপি করা যায়নি, আবার চেষ্টা করুন।")
  );
}

function downloadCsv() {
  const csv = "\uFEFF" + [["Roll", "Name", "MCQ", "CQ"], ...getRows()]
    .map(r => r.map(c => '"' + c.replace(/"/g, '""') + '"').join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = (SUBJECT ? SUBJECT + "-" : "") + "marks.csv";
  a.click();
}

document.getElementById("subOverlay").classList.add("show");
