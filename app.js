const CFG = window.APP_CONFIG;
const Store = window.Store;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rub = n => Math.round(n).toLocaleString("ru-RU") + "\u00a0" + CFG.currency;
const lc = t => t ? t[0].toLowerCase() + t.slice(1) : t;
const STATUS = { new: "Новая", confirmed: "Подтверждена", onway: "В работе", done: "Выполнена", canceled: "Отменена" };
const STATUS_ORDER = ["new", "confirmed", "onway", "done"];

// ---------- настройки (прайс и бренд можно переопределить из кабинета) ----------
let S = null;
function defaults() {
  return { brand: { ...CFG.brand }, minOrder: CFG.minOrder, travelFee: CFG.travelFee,
    items: JSON.parse(JSON.stringify(CFG.items)), fabrics: JSON.parse(JSON.stringify(CFG.fabrics)), extras: JSON.parse(JSON.stringify(CFG.extras)) };
}
async function loadSettings() {
  const saved = await Store.getSettings().catch(() => null);
  S = saved ? { ...defaults(), ...saved, brand: { ...CFG.brand, ...(saved.brand || {}) } } : defaults();
  applyBrand();
}
function applyBrand() {
  const r = document.documentElement.style, c = CFG.colors;
  for (const [k, v] of Object.entries(c)) r.setProperty("--" + k, v);
  document.title = `${S.brand.name} — ${S.brand.tagline}`;
}
const itemById = id => S.items.find(i => i.id === id);

// ---------- расчёт цены ----------
function linePrice(l) {
  const it = itemById(l.itemId); if (!it) return 0;
  let base = it.perArea ? Math.max(it.minArea || 0, +l.area || 0) * it.pricePerM2 : (it.variants.find(v => v.id === l.variantId) || it.variants[0]).price;
  if (it.sides && l.sides === 2) base *= 1.8;
  const f = S.fabrics.find(f => f.id === l.fabric); if (f) base *= f.k;
  let add = 0;
  for (const eid of l.extras || []) { const e = S.extras.find(x => x.id === eid); if (!e) continue; if (e.type === "percent") base *= 1 + e.value / 100; else add += e.value; }
  return (base + add) * (it.perArea ? 1 : (l.qty || 1));
}
function total(cart) {
  const sum = cart.reduce((a, l) => a + linePrice(l), 0) + (cart.length ? (S.travelFee || 0) : 0);
  return { sum, final: cart.length ? Math.max(sum, S.minOrder) : 0, belowMin: cart.length && sum < S.minOrder };
}
function lineTitle(l) {
  const it = itemById(l.itemId); if (!it) return "?";
  const parts = [it.title];
  if (it.perArea) parts.push(`${l.area} м²`); else { const v = it.variants.find(v => v.id === l.variantId); if (v && it.variants.length > 1) parts.push(lc(v.title)); }
  if (it.sides && l.sides === 2) parts.push("2 стороны");
  const f = S.fabrics.find(f => f.id === l.fabric); if (f && f.k !== 1) parts.push(lc(f.title));
  const ex = (l.extras || []).map(id => lc(S.extras.find(e => e.id === id)?.title)).filter(Boolean);
  let s = parts.join(", "); if (ex.length) s += " + " + ex.join(", ");
  if (!it.perArea && l.qty > 1) s += ` × ${l.qty}`;
  return s;
}
const fromPrice = it => it.perArea ? `${rub(it.pricePerM2)} / м²` : "от " + rub(Math.min(...it.variants.map(v => v.price)));

// ---------- общий каркас ----------
function header(extra = "") {
  const logo = S.brand.logoUrl ? `<img src="${esc(S.brand.logoUrl)}" alt="">` : `<span>${esc(S.brand.logoText)}</span>`;
  return `<header class="top"><a class="brand" href="#/"><div class="logo">${logo}</div><div><b>${esc(S.brand.name)}</b><small>${esc(S.brand.tagline)} · ${esc(S.brand.city)}</small></div></a>${extra}</header>`;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add("show")); setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200); }

// ================================ КЛИЕНТ ================================
const draft = JSON.parse(localStorage.getItem("draft") || "null") || { cart: [], photos: [], form: {} };
const saveDraft = () => { try { localStorage.setItem("draft", JSON.stringify({ ...draft, photos: [] })); } catch {} };

function days() {
  const out = [], d = new Date(); d.setHours(12);
  for (let i = 0; i < CFG.daysAhead; i++) { const x = new Date(d); x.setDate(d.getDate() + i);
    out.push({ v: x.toISOString().slice(0, 10), t: (i === 0 ? "Сегодня, " : i === 1 ? "Завтра, " : "") + x.toLocaleDateString("ru-RU", { weekday: i > 1 ? "short" : undefined, day: "numeric", month: "long" }) }); }
  return out;
}

function renderClient() {
  const app = $("#app");
  app.innerHTML = `${header(`<a class="call" href="tel:${esc(S.brand.phone.replace(/[^+\d]/g, ""))}" aria-label="Позвонить">☎</a>`)}
  <main class="client">
    <section class="hero">
      <h1>Детейлинг и мойка — <span>цена за минуту</span></h1>
      <p>Выберите услуги и класс авто — сразу увидите стоимость. Запишитесь на удобное время, приложите фото — студия подтвердит. Звонить не нужно.</p>
      <div class="chips"><span>🚗 Цена по классу авто</span><span>🕒 Запись на время</span><span>📷 Оценка по фото</span></div>
    </section>
    <h2 class="step"><i>1</i> Что делаем?</h2>
    <div class="grid">${S.items.map(it => `
      <button class="item" data-id="${it.id}">
        <div class="model" data-model="${it.model}"></div>
        <b>${esc(it.title)}</b><small>${fromPrice(it)}</small>
        <em class="qty" hidden></em>
      </button>`).join("")}</div>
    <div id="cart"></div>
    <h2 class="step"><i>2</i> Фото авто <small>необязательно, но цена будет точнее</small></h2>
    <label class="photos-drop"><input id="photo" type="file" accept="image/*" multiple><span>📷 Добавить фото</span><small>Общий вид, царапины и пятна в салоне крупным планом</small></label>
    <div id="thumbs" class="thumbs"></div>
    <h2 class="step"><i>3</i> Когда приехать в студию</h2>
    <div class="form">
      <label>Имя<input id="f-name" autocomplete="name" placeholder="Как к вам обращаться"></label>
      <label>Телефон<input id="f-phone" type="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__"></label>
      <label class="wide">Автомобиль<input id="f-addr" placeholder="Марка, модель, год — например, Kia Rio 2019"></label>
      <label>Госномер (необязательно)<input id="f-floor" placeholder="А123ВС 77"></label>
      <label>Дата<select id="f-date">${days().map(d => `<option value="${d.v}">${d.t}</option>`).join("")}</select></label>
      <label class="wide">Удобное время<div class="slots" id="f-slots">${CFG.slots.map((s, i) => `<button type="button" data-slot="${s}" class="${i === 3 ? "on" : ""}">${s}</button>`).join("")}</div></label>
      <label class="wide">Комментарий<textarea id="f-comment" rows="2" placeholder="Например: сколы на капоте, шерсть собаки в салоне"></textarea></label>
      <label class="check wide"><input id="f-consent" type="checkbox"> <span>Согласен на обработку персональных данных для связи по заявке (152-ФЗ)</span></label>
    </div>
    <p class="note">${esc(CFG.priceNote)}</p>
    <footer class="foot">${esc(S.brand.name)} · ${esc(S.brand.workHours)} · <a href="#/admin">Вход для студии</a></footer>
  </main>
  <div class="bar"><div><small id="bar-sub">Выберите услугу</small><b id="bar-sum">0 ₽</b></div><button id="submit" class="btn">Отправить заявку</button></div>`;

  const f = draft.form;
  for (const k of ["name", "phone", "addr", "floor", "comment"]) { const el = $("#f-" + k); el.value = f[k] || ""; el.oninput = () => { f[k] = el.value; saveDraft(); }; }
  if (f.date && $(`#f-date option[value="${f.date}"]`)) $("#f-date").value = f.date;
  $("#f-date").onchange = e => { f.date = e.target.value; saveDraft(); };
  if (f.slot) $$("#f-slots button").forEach(b => b.classList.toggle("on", b.dataset.slot === f.slot));
  $("#f-slots").onclick = e => { const b = e.target.closest("button"); if (!b) return; $$("#f-slots button").forEach(x => x.classList.toggle("on", x === b)); f.slot = b.dataset.slot; saveDraft(); };
  $("#f-phone").addEventListener("input", e => { let d = e.target.value.replace(/\D/g, ""); if (d[0] === "8") d = "7" + d.slice(1); if (d && d[0] !== "7") d = "7" + d; d = d.slice(0, 11);
    const p = d.slice(1); let s = "+7"; if (p.length) s += " (" + p.slice(0, 3); if (p.length >= 3) s += ") " + p.slice(3, 6); if (p.length >= 6) s += "-" + p.slice(6, 8); if (p.length >= 8) s += "-" + p.slice(8, 10);
    e.target.value = d ? s : ""; f.phone = e.target.value; saveDraft(); });
  $$(".item").forEach(b => b.onclick = () => openSheet(b.dataset.id));
  $("#photo").onchange = async e => { for (const file of e.target.files) { if (draft.photos.length >= 8) break; draft.photos.push(await compress(file)); } e.target.value = ""; renderThumbs(); };
  $("#submit").onclick = submit;
  renderCart(); renderThumbs();
}
function renderThumbs() {
  $("#thumbs").innerHTML = draft.photos.map((p, i) => `<div class="th"><img src="${p}" alt=""><button data-i="${i}" aria-label="Удалить">×</button></div>`).join("");
  $$("#thumbs button").forEach(b => b.onclick = () => { draft.photos.splice(+b.dataset.i, 1); renderThumbs(); });
}
function renderCart() {
  const cart = draft.cart, t = total(cart);
  $$(".item").forEach(b => { const n = cart.filter(l => l.itemId === b.dataset.id).reduce((a, l) => a + (itemById(l.itemId).perArea ? 1 : l.qty), 0);
    const q = $(".qty", b); q.hidden = !n; q.textContent = n; b.classList.toggle("active", !!n); });
  $("#cart").innerHTML = cart.length ? `<div class="cart"><h3>Ваш заказ</h3>${cart.map((l, i) => `<div class="line"><span>${esc(lineTitle(l))}</span><b class="p">${rub(linePrice(l))}</b><button data-e="${i}" aria-label="Изменить">✎</button><button data-d="${i}" aria-label="Удалить">×</button></div>`).join("")}
    ${t.belowMin ? `<div class="line muted"><span>Минимальный заказ</span><b class="p">${rub(S.minOrder)}</b></div>` : ""}
    <div class="line total"><span>Итого, ориентировочно</span><b class="p">${rub(t.final)}</b></div></div>` : "";
  $$("#cart [data-d]").forEach(b => b.onclick = () => { cart.splice(+b.dataset.d, 1); saveDraft(); renderCart(); });
  $$("#cart [data-e]").forEach(b => b.onclick = () => openSheet(cart[+b.dataset.e].itemId, +b.dataset.e));
  $("#bar-sum").textContent = rub(t.final);
  $("#bar-sub").textContent = cart.length ? `${cart.length} ${plural(cart.length, "позиция", "позиции", "позиций")} · ориентир` : "Выберите услугу";
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };

function openSheet(itemId, editIndex = -1) {
  const it = itemById(itemId);
  const l = editIndex >= 0 ? { ...draft.cart[editIndex], extras: [...(draft.cart[editIndex].extras || [])] }
    : { itemId, variantId: it.variants?.[0]?.id, qty: 1, area: 4, sides: 1, fabric: S.fabrics[0].id, extras: [] };
  const wrap = document.createElement("div"); wrap.className = "sheet-wrap";
  const draw = () => {
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(it.title)}">
      <button class="x" aria-label="Закрыть">×</button>
      <div class="sheet-model model active" data-model="${it.model}"></div>
      <h3>${esc(it.title)}</h3>
      ${it.perArea ? `<label class="lbl">Площадь, м²</label><div class="stepper"><button data-a="-1">−</button><input id="area" type="number" min="1" step="0.5" value="${l.area}"><button data-a="1">+</button></div><small class="hint">Например, ковёр 2×3 м = 6 м²</small>`
        : `<label class="lbl">Пакет</label><div class="opts">${it.variants.map(v => `<button data-v="${v.id}" class="${v.id === l.variantId ? "on" : ""}">${esc(v.title)}<small>${rub(v.price)}</small></button>`).join("")}</div>`}
      ${it.sides ? `<label class="lbl">Стороны</label><div class="opts"><button data-s="1" class="${l.sides === 1 ? "on" : ""}">Одна</button><button data-s="2" class="${l.sides === 2 ? "on" : ""}">Обе стороны</button></div>` : ""}
      <label class="lbl">Класс авто</label><div class="opts">${S.fabrics.map(f => `<button data-f="${f.id}" class="${f.id === l.fabric ? "on" : ""}">${esc(f.title)}${f.k !== 1 ? `<small>+${Math.round((f.k - 1) * 100)}%</small>` : ""}</button>`).join("")}</div>
      <label class="lbl">Дополнительно</label><div class="opts">${S.extras.map(e => `<button data-x="${e.id}" class="${l.extras.includes(e.id) ? "on" : ""}">${esc(e.title)}<small>${e.type === "percent" ? "+" + e.value + "%" : "+" + rub(e.value)}</small></button>`).join("")}</div>
      ${it.perArea ? "" : `<label class="lbl">Автомобилей</label><div class="stepper"><button data-q="-1">−</button><input id="qty" type="number" min="1" value="${l.qty}"><button data-q="1">+</button></div>`}
      <button class="btn big" id="add">${editIndex >= 0 ? "Сохранить" : "Добавить"} — ${rub(linePrice(l))}</button>
    </div>`;
    $(".x", wrap).onclick = close; wrap.onclick = e => { if (e.target === wrap) close(); };
    $$("[data-v]", wrap).forEach(b => b.onclick = () => { l.variantId = b.dataset.v; draw(); });
    $$("[data-s]", wrap).forEach(b => b.onclick = () => { l.sides = +b.dataset.s; draw(); });
    $$("[data-f]", wrap).forEach(b => b.onclick = () => { l.fabric = b.dataset.f; draw(); });
    $$("[data-x]", wrap).forEach(b => b.onclick = () => { const i = l.extras.indexOf(b.dataset.x); i >= 0 ? l.extras.splice(i, 1) : l.extras.push(b.dataset.x); draw(); });
    $$("[data-q]", wrap).forEach(b => b.onclick = () => { l.qty = Math.max(1, l.qty + +b.dataset.q); draw(); });
    $$("[data-a]", wrap).forEach(b => b.onclick = () => { l.area = Math.max(1, +l.area + +b.dataset.a); draw(); });
    const q = $("#qty", wrap); if (q) q.onchange = () => { l.qty = Math.max(1, parseInt(q.value) || 1); draw(); };
    const a = $("#area", wrap); if (a) a.onchange = () => { l.area = Math.max(1, parseFloat(a.value) || 1); draw(); };
    $("#add", wrap).onclick = () => { if (editIndex >= 0) draft.cart[editIndex] = l; else draft.cart.push(l); saveDraft(); renderCart(); close(); toast(editIndex >= 0 ? "Сохранено" : "Добавлено в заказ"); };
  };
  const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 200); };
  document.body.appendChild(wrap); draw(); requestAnimationFrame(() => wrap.classList.add("show"));
}

function compress(file) {
  return new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src); res(c.toDataURL("image/jpeg", 0.8)); }; img.src = URL.createObjectURL(file); });
}

async function submit() {
  const f = draft.form;
  f.date = f.date || $("#f-date").value; f.slot = f.slot || $("#f-slots .on")?.dataset.slot;
  const err = !draft.cart.length ? "Выберите хотя бы одну позицию" : !f.name ? "Укажите имя" : (f.phone || "").replace(/\D/g, "").length < 11 ? "Укажите телефон" : !f.addr ? "Укажите автомобиль" : !$("#f-consent").checked ? "Нужно согласие на обработку данных" : "";
  if (err) { toast(err); const t = !draft.cart.length ? ".grid" : !f.name ? "#f-name" : !f.addr ? "#f-addr" : (f.phone || "").length < 11 ? "#f-phone" : "#f-consent"; $(t)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  const btn = $("#submit"); btn.disabled = true; btn.textContent = "Отправляем…";
  const t = total(draft.cart);
  const req = { client: { name: f.name, phone: f.phone, address: f.addr, floor: f.floor || "", comment: f.comment || "" },
    date: f.date, slot: f.slot, items: draft.cart.map(l => ({ ...l, title: lineTitle(l), price: Math.round(linePrice(l)) })),
    estimate: Math.round(t.final), photos: draft.photos };
  try {
    const r = await Store.create(req);
    const mine = JSON.parse(localStorage.getItem("myRequests") || "[]"); mine.unshift(r.id); localStorage.setItem("myRequests", JSON.stringify(mine.slice(0, 20)));
    draft.cart = []; draft.photos = []; saveDraft();
    location.hash = "#/r/" + r.id;
  } catch (e) { toast("Не удалось отправить. Попробуйте ещё раз"); btn.disabled = false; btn.textContent = "Отправить заявку"; }
}

// ------------------------------ статус заявки ------------------------------
let statusTimer = null;
async function renderStatus(id) {
  const r = await Store.get(id);
  const app = $("#app");
  if (!r) { app.innerHTML = header() + `<main class="client"><div class="card"><h2>Заявка не найдена</h2><p>Проверьте ссылку. В демо-версии заявки хранятся только на этом устройстве.</p><a class="btn" href="#/">Новая заявка</a></div></main>`; return; }
  const idx = STATUS_ORDER.indexOf(r.status);
  const when = r.confirmedTime || `${new Date(r.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${r.slot}`;
  app.innerHTML = header(`<a class="call" href="tel:${esc(S.brand.phone.replace(/[^+\d]/g, ""))}">☎</a>`) + `<main class="client status">
    <div class="card hero-ok"><div class="big-emoji">${r.status === "done" ? "✨" : r.status === "canceled" ? "🙁" : r.status === "new" ? "📨" : "✅"}</div>
      <h1>Заявка № ${esc(r.id)}</h1><p class="st-label st-${r.status}">${STATUS[r.status]}</p>
      <p>${r.status === "new" ? "Студия посмотрит заявку и подтвердит цену и время. Обычно это занимает до 30 минут." : r.status === "confirmed" ? "Запись подтверждена. Ждём вас в студии в выбранное время." : r.status === "onway" ? "Автомобиль в работе." : r.status === "done" ? "Работа выполнена. Спасибо, что выбрали нас!" : "Заявка отменена."}</p></div>
    ${r.status !== "canceled" ? `<ol class="timeline">${STATUS_ORDER.map((s, i) => `<li class="${i <= idx ? "done" : ""}"><span></span>${STATUS[s]}</li>`).join("")}</ol>` : ""}
    <div class="card"><h3>Детали</h3>
      <div class="kv"><span>Когда</span><b>${esc(when)}</b></div>
      <div class="kv"><span>Автомобиль</span><b>${esc(r.client.address)}${r.client.floor ? ", " + esc(r.client.floor) : ""}</b></div>
      ${r.items.map(i => `<div class="kv"><span>${esc(i.title)}</span><b class="p">${rub(i.price)}</b></div>`).join("")}
      <div class="kv total"><span>${r.finalPrice ? "Цена подтверждена студией" : "Ориентировочно"}</span><b class="p">${rub(r.finalPrice || r.estimate)}</b></div>
      ${r.masterNote ? `<div class="note-box">💬 ${esc(r.masterNote)}</div>` : ""}</div>
    <div class="row"><button class="btn ghost" id="copy">Скопировать ссылку на заявку</button><a class="btn" href="#/">Новая заявка</a></div>
    <p class="note">Ссылка на эту страницу — ваш личный статус заявки. ${CFG.storage === "local" ? "Демо-версия: статус хранится на этом устройстве." : ""}</p>
  </main>`;
  $("#copy").onclick = () => { navigator.clipboard?.writeText(location.href); toast("Ссылка скопирована"); };
  clearInterval(statusTimer); statusTimer = setInterval(() => { if (location.hash === "#/r/" + id) renderStatus(id); else clearInterval(statusTimer); }, 15000);
}

// ================================ КАБИНЕТ ================================
let tab = "requests", filter = "all";
function renderAdmin() {
  if (sessionStorage.getItem("authed") !== "1") return renderPin();
  const app = $("#app");
  app.innerHTML = header(`<button class="call" id="logout" title="Выйти">⎋</button>`) + `<main class="admin">
    <nav class="tabs">${[["requests", "Заявки"], ["prices", "Прайс"], ["biz", "Бизнес"]].map(([k, t]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${t}</button>`).join("")}</nav>
    <div id="pane"></div></main>`;
  $("#logout").onclick = () => { sessionStorage.removeItem("authed"); renderAdmin(); };
  $$(".tabs button").forEach(b => b.onclick = () => { tab = b.dataset.t; renderAdmin(); });
  ({ requests: paneRequests, prices: panePrices, biz: paneBiz })[tab]();
}
function renderPin() {
  $("#app").innerHTML = header() + `<main class="admin"><div class="card pin"><h2>Кабинет студии</h2><p>Введите PIN-код</p>
    <input id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"><button class="btn big" id="go">Войти</button>
    ${CFG.storage === "local" ? `<p class="note">Демо: PIN <b>${esc(CFG.adminPin)}</b></p>` : ""}</div></main>`;
  const go = async () => { if (await Store.login($("#pin").value)) { sessionStorage.setItem("authed", "1"); renderAdmin(); } else toast("Неверный PIN"); };
  $("#go").onclick = go; $("#pin").onkeydown = e => { if (e.key === "Enter") go(); }; $("#pin").focus();
}
async function paneRequests() {
  const all = await Store.list();
  const counts = Object.fromEntries(Object.keys(STATUS).map(k => [k, all.filter(r => r.status === k).length]));
  const list = filter === "all" ? all : all.filter(r => r.status === filter);
  $("#pane").innerHTML = `
    <div class="stats"><div><b>${counts.new}</b><small>новых</small></div><div><b>${counts.confirmed + counts.onway}</b><small>в работе</small></div><div><b class="p">${rub(all.filter(r => r.status === "done").reduce((a, r) => a + (r.finalPrice || r.estimate), 0))}</b><small>выполнено</small></div></div>
    <div class="filters">${[["all", "Все"], ...Object.entries(STATUS)].map(([k, t]) => `<button data-f="${k}" class="${filter === k ? "on" : ""}">${t}${k !== "all" && counts[k] ? ` <i>${counts[k]}</i>` : ""}</button>`).join("")}</div>
    ${list.length ? list.map(reqCard).join("") : `<div class="card empty"><p>Заявок пока нет.</p><p>Откройте <a href="#/">страницу клиента</a> и отправьте тестовую заявку${CFG.storage === "local" ? " или добавьте примеры" : ""}.</p>${CFG.storage === "local" ? `<button class="btn ghost" id="seed">Добавить примеры заявок</button>` : ""}</div>`}`;
  $$(".filters button").forEach(b => b.onclick = () => { filter = b.dataset.f; paneRequests(); });
  $("#seed") && ($("#seed").onclick = async () => { await seed(); paneRequests(); });
  $$(".req").forEach(el => {
    const id = el.dataset.id;
    $(".save", el).onclick = async () => {
      const patch = { status: $(".st", el).value, finalPrice: +$(".fp", el).value || null, confirmedTime: $(".ct", el).value.trim(), masterNote: $(".mn", el).value.trim() };
      if (patch.status === "new" && (patch.finalPrice || patch.confirmedTime)) patch.status = "confirmed";
      await Store.update(id, patch); toast("Сохранено. Клиент увидит статус по своей ссылке"); paneRequests();
    };
    $(".link", el).onclick = () => { const u = location.href.split("#")[0] + "#/r/" + id; navigator.clipboard?.writeText(u); toast("Ссылка для клиента скопирована"); };
    $$(".ph img", el).forEach(img => img.onclick = () => { const w = document.createElement("div"); w.className = "lightbox"; w.innerHTML = `<img src="${img.src}">`; w.onclick = () => w.remove(); document.body.appendChild(w); });
  });
}
function reqCard(r) {
  const dt = new Date(r.createdAt);
  return `<article class="card req" data-id="${r.id}">
    <div class="req-h"><span class="pill st-${r.status}">${STATUS[r.status]}</span><b>№ ${r.id}</b><small>${dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div>
    <div class="who"><b>${esc(r.client.name)}</b> · <a href="tel:${esc(r.client.phone.replace(/[^+\d]/g, ""))}">${esc(r.client.phone)}</a></div>
    <div class="addr">🚗 ${esc(r.client.address)}${r.client.floor ? ", " + esc(r.client.floor) : ""}</div>
    <div class="addr">🕒 ${new Date(r.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}, ${esc(r.slot)}</div>
    <ul class="items">${r.items.map(i => `<li><span>${esc(i.title)}</span><b class="p">${rub(i.price)}</b></li>`).join("")}<li class="sum"><span>Расчёт приложения</span><b class="p">${rub(r.estimate)}</b></li></ul>
    ${r.client.comment ? `<div class="note-box">💬 ${esc(r.client.comment)}</div>` : ""}
    ${r.photos?.length ? `<div class="ph">${r.photos.map(p => `<img src="${p}" alt="фото">`).join("")}</div>` : ""}
    <div class="ctrl">
      <label>Статус<select class="st">${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Итоговая цена, ₽<input class="fp" type="number" placeholder="${r.estimate}" value="${r.finalPrice || ""}"></label>
      <label class="wide">Подтверждённое время<input class="ct" placeholder="Например: 18 ноября, 15:00" value="${esc(r.confirmedTime || "")}"></label>
      <label class="wide">Сообщение клиенту<input class="mn" placeholder="Например: возьму средство от запаха животных" value="${esc(r.masterNote || "")}"></label>
    </div>
    <div class="row"><button class="btn save">Сохранить и подтвердить</button><button class="btn ghost link">Ссылка клиента</button></div>
  </article>`;
}
function panePrices() {
  const p = $("#pane");
  p.innerHTML = `<div class="card"><h3>Прайс-лист</h3><p class="note">Изменения сразу появляются у клиентов в калькуляторе.</p>
    ${S.items.map((it, i) => `<div class="pr"><b>${esc(it.title)}</b>${it.perArea ? `<label>за м²<input type="number" data-i="${i}" data-k="m2" value="${it.pricePerM2}"></label>` : it.variants.map((v, j) => `<label>${esc(v.title)}<input type="number" data-i="${i}" data-j="${j}" value="${v.price}"></label>`).join("")}</div>`).join("")}
    <div class="pr"><b>Дополнительно</b>${S.extras.map((e, i) => `<label>${esc(e.title)}, ${e.type === "percent" ? "%" : "₽"}<input type="number" data-e="${i}" value="${e.value}"></label>`).join("")}</div>
    <div class="pr"><b>Класс авто (коэффициент)</b>${S.fabrics.map((f, i) => `<label>${esc(f.title)}<input type="number" step="0.05" data-fb="${i}" value="${f.k}"></label>`).join("")}</div>
    <div class="pr"><b>Общее</b><label>Минимальный заказ, ₽<input type="number" id="minOrder" value="${S.minOrder}"></label><label>Доплата за срочность, ₽<input type="number" id="travel" value="${S.travelFee}"></label></div>
    <div class="row"><button class="btn" id="savep">Сохранить прайс</button><button class="btn ghost" id="resetp">Вернуть по умолчанию</button></div></div>`;
  $("#savep").onclick = async () => {
    $$("input[data-i]", p).forEach(inp => { const it = S.items[+inp.dataset.i]; if (inp.dataset.k === "m2") it.pricePerM2 = +inp.value; else it.variants[+inp.dataset.j].price = +inp.value; });
    $$("input[data-e]", p).forEach(inp => S.extras[+inp.dataset.e].value = +inp.value);
    $$("input[data-fb]", p).forEach(inp => S.fabrics[+inp.dataset.fb].k = +inp.value);
    S.minOrder = +$("#minOrder").value; S.travelFee = +$("#travel").value;
    await Store.saveSettings(S); toast("Прайс сохранён");
  };
  $("#resetp").onclick = async () => { const b = S.brand; S = { ...defaults(), brand: b }; await Store.saveSettings(S); panePrices(); toast("Прайс сброшен"); };
}
function paneBiz() {
  const b = S.brand;
  $("#pane").innerHTML = `<div class="card"><h3>Данные бизнеса</h3>
    <div class="form">${[["name", "Название"], ["tagline", "Подпись"], ["city", "Город"], ["phone", "Телефон"], ["workHours", "Часы работы"], ["logoText", "Буква логотипа"]].map(([k, t]) => `<label>${t}<input data-b="${k}" value="${esc(b[k] || "")}"></label>`).join("")}</div>
    <div class="row"><button class="btn" id="saveb">Сохранить</button></div>
    <p class="note">Цвета, PIN и способ хранения меняются в файле <code>config.js</code> (см. ADAPT.md).</p></div>
    ${CFG.storage === "local" ? `<div class="card"><h3>Демо</h3><div class="row"><button class="btn ghost" id="seed2">Добавить примеры заявок</button><button class="btn ghost" id="wipe">Удалить все заявки</button></div></div>` : ""}`;
  $("#saveb").onclick = async () => { $$("[data-b]").forEach(i => b[i.dataset.b] = i.value); await Store.saveSettings(S); applyBrand(); renderAdmin(); toast("Сохранено"); };
  $("#seed2") && ($("#seed2").onclick = async () => { await seed(); toast("Примеры добавлены"); });
  $("#wipe") && ($("#wipe").onclick = async () => { if (!confirm("Удалить все заявки?")) return; for (const r of await Store.list()) await Store.remove(r.id); toast("Удалено"); });
}

// примерные заявки для демонстрации кабинета
async function seed() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const mk = (cart, client, date, slot) => ({ client, date, slot, items: cart.map(l => ({ ...l, title: lineTitle(l), price: Math.round(linePrice(l)) })), estimate: Math.round(total(cart).final), photos: [sampleImg(cart[0].itemId)] });
  const a = await Store.create(mk([{ itemId: "interior", variantId: "full", qty: 1, fabric: "c3", extras: ["pets"] }, { itemId: "wash", variantId: "complex", qty: 1, fabric: "c3", extras: [] }],
    { name: "Ольга", phone: "+7 (916) 123-45-67", address: "Kia Sportage 2020, белый", floor: "", comment: "Собака ездит на заднем сиденье" }, d(1), "15:00"));
  const b = await Store.create(mk([{ itemId: "polish", variantId: "full", qty: 1, fabric: "c2", extras: [] }, { itemId: "ceramic", variantId: "1", qty: 1, fabric: "c2", extras: [] }],
    { name: "Дмитрий", phone: "+7 (925) 765-43-21", address: "Toyota Camry 2018, чёрный", floor: "А123ВС 77", comment: "Мелкие царапины на дверях" }, d(2), "11:00"));
  await Store.update(b.id, { status: "confirmed", finalPrice: 32000, confirmedTime: "через 2 дня, 11:00", masterNote: "Машину оставить на 2 дня" });
  const c = await Store.create(mk([{ itemId: "ppf", variantId: "risk", qty: 1, fabric: "c4", extras: [] }],
    { name: "Анна", phone: "+7 (903) 555-12-34", address: "Land Cruiser Prado 2023", floor: "", comment: "Новая машина из салона" }, d(0), "9:00"));
  await Store.update(c.id, { status: "done", finalPrice: 52000 });
}
function sampleImg(kind) {
  const c = document.createElement("canvas"); c.width = 320; c.height = 220; const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 220); grd.addColorStop(0, "#e6f2f3"); grd.addColorStop(1, "#c9dadd"); g.fillStyle = grd; g.fillRect(0, 0, 320, 220);
  g.fillStyle = kind === "ppf" ? "#3b3f47" : kind === "polish" ? "#222831" : "#e8ecef";
  g.beginPath(); g.roundRect(30, 100, 260, 60, 22); g.fill(); g.beginPath(); g.roundRect(85, 62, 140, 52, 20); g.fill();
  g.fillStyle = "#9fd3ff"; g.beginPath(); g.roundRect(97, 70, 116, 34, 12); g.fill();
  g.fillStyle = "#2b2f38"; for (const x of [85, 235]) { g.beginPath(); g.arc(x, 162, 22, 0, 7); g.fill(); }
  g.fillStyle = "rgba(120,90,50,.35)"; g.beginPath(); g.ellipse(150, 135, 40, 10, 0, 0, 7); g.fill();
  g.fillStyle = "#59647a"; g.font = "14px sans-serif"; g.fillText("пример фото клиента", 12, 210);
  return c.toDataURL("image/jpeg", 0.7);
}

// ================================ РОУТЕР ================================
async function route() {
  const h = location.hash || "#/";
  document.body.dataset.page = h.startsWith("#/admin") ? "admin" : h.startsWith("#/r/") ? "status" : "client";
  window.scrollTo(0, 0);
  if (h.startsWith("#/admin")) return renderAdmin();
  if (h.startsWith("#/r/")) return renderStatus(decodeURIComponent(h.slice(4)));
  renderClient();
}
(async () => {
  await loadSettings();
  window.addEventListener("hashchange", route);
  await route();
  // 3D грузим после интерфейса, чтобы первый экран появлялся сразу
  import("./scene.js").then(m => m.initScenes()).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
