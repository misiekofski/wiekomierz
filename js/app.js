const NOW = 2026;
const Y0 = 1938, Y1 = 2019;
const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const MIN_Q = 15, MAX_Q = 30;

// a–b: years the thing existed; mn–mx: ages at which people used it; d: share of users "daily";
// k: years of exposure for ~63% chance of use; cap: max share who used it; f: fame among people too young to have lived through it;
// sx: how common it was among women (f) and men (m), as a multiplier on cap.

// Years of exposure. Age limits are soft: younger siblings and late adopters fade in over a few years instead of a hard cut.
function exposure(it, Y) {
  let o = 0;
  for (let t = it.a; t <= it.b; t++) {
    const age = t - Y;
    o += age < it.mn ? Math.max(0, 1 - (it.mn - age) / 3) : age > it.mx ? Math.max(0, 1 - (age - it.mx) / 2) : 1;
  }
  return o;
}
function sexFactor(it, sex) {
  if (!it.sx) return 1;
  return sex ? it.sx[sex] : (it.sx.f + it.sx.m) / 2;
}
function lik(it, Y, sex) {
  const u = (it.cap ?? 1) * sexFactor(it, sex) * (1 - Math.exp(-exposure(it, Y) / (it.k ?? 1.5)));
  // Lived through it, or grew up while parents and older siblings still talked about it → almost surely heard of it.
  const h = Y + 8 <= it.b + 5 ? .92 : it.f;
  return [u * it.d, u * (1 - it.d), (1 - u) * h, (1 - u) * (1 - h)].map(p => .8 * p + .05); // leave room for people who answer against the trend
}
let L;
function buildL(sex) { L = ITEMS.map(it => YEARS.map(Y => lik(it, Y, sex))); }
buildL(null);

// Labels are written in the masculine form; switch the past tense ending for the chosen form.
function say(text) {
  if (S.sex === "f") return text.replace(/łem\b/g, "łam");
  if (S.sex === null) return text.replace(/łem\b/g, "łem/am");
  return text;
}

function prior() {
  const p = YEARS.map(Y => {
    const age = NOW - Y;
    if (age < 10) return .25;
    if (age > 72) return Math.exp(-(age - 72) / 6);
    return 1;
  });
  return norm(p);
}
function norm(p) { const s = p.reduce((a, b) => a + b, 0); return p.map(x => x / s); }
function entropy(p) { let h = 0; for (const x of p) if (x > 0) h -= x * Math.log(x); return h; }
function posterior(answers) {
  let p = prior();
  for (const { i, r } of answers) p = norm(p.map((x, y) => x * L[i][y][r]));
  return p;
}
function quantile(p, q) { let c = 0; for (let y = 0; y < p.length; y++) { c += p[y]; if (c >= q) return YEARS[y]; } return Y1; }

function nextItem(answers, post) {
  const asked = new Set(answers.map(a => a.i));
  const scored = [];
  ITEMS.forEach((_, i) => {
    if (asked.has(i)) return;
    let eh = 0;
    for (let r = 0; r < 4; r++) {
      const joint = post.map((x, y) => x * L[i][y][r]);
      const pr = joint.reduce((a, b) => a + b, 0);
      eh += pr * entropy(joint.map(x => x / pr));
    }
    scored.push({ i, g: entropy(post) - eh });
  });
  scored.sort((a, b) => b.g - a.g);
  const top = scored.slice(0, answers.length < 3 ? 4 : 2); // a little variety between games
  return top[Math.floor(Math.random() * top.length)].i;
}

function shouldStop(n, post) {
  if (n >= MAX_Q) return true;
  const w = quantile(post, .9) - quantile(post, .1);
  return (n >= MIN_Q && w <= 4) || (n >= 22 && w <= 6);
}

// ---------- rendering ----------
const app = document.getElementById("app");
const fresh = () => ({ phase: "intro", answers: [], current: null, sex: null });
let S = fresh();

function chartSVG(post) {
  const lo = quantile(post, .1), hi = quantile(post, .9);
  const max = Math.max(...post), W = 10, H = 120;
  let s = `<svg class="chart" viewBox="0 0 ${YEARS.length * W} ${H + 30}" role="img" aria-label="Rozkład prawdopodobieństwa roku urodzenia">`;
  s += `<rect class="base" x="0" y="${H}" width="${YEARS.length * W}" height="2"></rect>`;
  YEARS.forEach((Y, k) => {
    const h = Math.max(1, (post[k] / max) * (H - 4));
    s += `<rect class="b${Y >= lo && Y <= hi ? " in" : ""}" x="${k * W + 1}" y="${H - h}" width="${W - 2}" height="${h}"></rect>`;
    if (Y % 10 === 0) s += `<text x="${k * W + W / 2}" y="${H + 24}" text-anchor="middle">${Y}</text>`;
  });
  return s + `</svg>`;
}

function setPage(n) { document.getElementById("pnum").textContent = "P" + n; }

function render() {
  const post = posterior(S.answers);
  if (S.phase === "intro") {
    setPage(100);
    app.innerHTML = `
      <div class="page">
        <div class="band"><span>Strona główna</span><span>Pytań: do ${MAX_Q}</span></div>
        <h1>Zgadnę, <em>ile masz lat.</em></h1>
        <p class="lede">Zapytam o rzeczy, które w Polsce każde pokolenie zna z innej strony: <b>Pewex</b>, <b>Pegasus</b>, <b>Gadu-Gadu</b>, <b>gimnazjum</b>, <b>TikTok</b>. Do każdej wybierz jedną z czterech odpowiedzi: od „na co dzień” po „pierwsze słyszę”. Ich treść dopasowuje się do pytania, na przykład przy grach brzmią tak jak niżej. Po maksymalnie ${MAX_Q} pytaniach podam Twój wiek.</p>
        <div class="keys" aria-hidden="true">
          ${LABELS.play.map((t, r) => `<div class="key ${COLORS[r]}" style="cursor:default"><span class="sw">${r + 1}</span>${t}</div>`).join("")}
        </div>
        <p class="small">Klawisze 1–4 też działają. Kolejne pytanie dobieram tak, żeby jak najlepiej zawęzić rocznik, więc każda gra wygląda trochę inaczej. Płeć pomaga mi dobrać pytania i odpowiednio czytać odpowiedzi, bo dziewczyny i chłopaki w tych samych latach bawili się czym innym.</p>
        <div class="row">
          <button class="btn" id="start-f" data-sex="f">Start: kobieta ▸</button>
          <button class="btn" id="start-m" data-sex="m">Start: mężczyzna ▸</button>
          <button class="btn ghost" id="start-x" data-sex="">Wolę nie podawać</button>
        </div>
      </div>`;
    app.querySelectorAll("[data-sex]").forEach(b => b.onclick = () => {
      S.sex = b.dataset.sex || null;
      buildL(S.sex);
      S.phase = "quiz";
      S.current = nextItem(S.answers, posterior(S.answers));
      render();
    });
    return;
  }
  if (S.phase === "quiz") {
    const n = S.answers.length, it = ITEMS[S.current];
    setPage(101 + n);
    const lo = quantile(post, .1), hi = quantile(post, .9), med = quantile(post, .5);
    app.innerHTML = `
      <div class="page">
        <div class="band"><span>Pytanie ${n + 1}</span><span>z maks. ${MAX_Q}</span></div>
        <div class="bar" aria-hidden="true"><i style="width:${(n / MAX_Q) * 100}%"></i></div>
        <p class="q">${it.q}</p>
        <div class="keys">
          ${labels(it).map((t, r) => `<button class="key ${COLORS[r]}" id="ans${r}" data-r="${r}"><span class="sw">${r + 1}</span>${say(t)}</button>`).join("")}
        </div>
        <div class="signal">
          <div class="lbl"><span>Sygnał: rocznik</span><span>${n >= 5 ? `Na razie myślę: <b>${lo}–${hi}</b>` : "Zbieram dane…"}</span></div>
          ${chartSVG(post)}
        </div>
        <div class="row">
          ${n > 0 ? `<button class="btn ghost" id="back">◂ Cofnij</button>` : ""}
          ${n >= 10 ? `<button class="btn ghost" id="finish">Zgaduj już</button>` : ""}
        </div>
      </div>`;
    app.querySelectorAll(".key").forEach(b => b.onclick = () => answer(+b.dataset.r));
    const back = document.getElementById("back");
    if (back) back.onclick = () => { const last = S.answers.pop(); S.current = last.i; render(); };
    const fin = document.getElementById("finish");
    if (fin) fin.onclick = () => { S.phase = "result"; render(); };
    return;
  }
  // result
  setPage(888);
  const med = quantile(post, .5), lo = quantile(post, .1), hi = quantile(post, .9);
  const age = NOW - med;
  const k0 = YEARS.indexOf(med);
  const tells = S.answers
    .map(({ i, r }) => {
      const avg = YEARS.reduce((s, _, y) => s + prior()[y] * L[i][y][r], 0);
      return { i, r, w: Math.log(L[i][k0][r] / avg) };
    })
    .sort((a, b) => b.w - a.w).slice(0, 5);
  app.innerHTML = `
    <div class="page">
      <div class="band"><span>Wynik</span><span>${S.answers.length} odpowiedzi</span></div>
      <p class="small" style="font-family:var(--display);font-size:24px;text-transform:uppercase;color:var(--cyan)">Masz około</p>
      <p class="verdict">${age}<small> lat</small></p>
      <div class="facts">
        <div class="fact"><div class="k">Rocznik</div><div class="v">${med}</div></div>
        <div class="fact"><div class="k">Przedział wieku</div><div class="v">${NOW - hi}–${NOW - lo}</div></div>
        <div class="fact"><div class="k">Pewność</div><div class="v">80%</div></div>
      </div>
      <div class="signal">
        <div class="lbl"><span>Rozkład: rok urodzenia</span><span><b>${lo}–${hi}</b></span></div>
        ${chartSVG(post)}
      </div>
      <h2>Co Cię zdradziło</h2>
      <ul class="tells">
        ${tells.map(t => `<li><span>${ITEMS[t.i].q}</span><span class="a" style="color:var(--${["red", "green", "yellow", "cyan"][t.r]})">${say(labels(ITEMS[t.i])[t.r])}</span></li>`).join("")}
      </ul>
      <div class="row"><button class="btn" id="again">Jeszcze raz ▸</button></div>
    </div>`;
  document.getElementById("again").onclick = () => { S = fresh(); render(); };
}

function answer(r) {
  S.answers.push({ i: S.current, r });
  const post = posterior(S.answers);
  if (shouldStop(S.answers.length, post)) S.phase = "result";
  else S.current = nextItem(S.answers, post);
  render();
}

document.addEventListener("keydown", e => {
  if (S.phase !== "quiz" || e.ctrlKey || e.metaKey || e.altKey) return;
  const r = "1234".indexOf(e.key);
  if (r >= 0) answer(r);
});

function tick() {
  const d = new Date(), p = x => String(x).padStart(2, "0");
  document.getElementById("date").textContent = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
  document.getElementById("clock").textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
tick(); setInterval(tick, 1000);

render();
