// Renders the trip tiles, the detail view (#trip/<id>) and the maps.
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gm = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hrs = h => (Math.floor(h) + (h % 1 ? '½' : '')) + ' h';
const ALL = [...DAY_TRIPS, ...MULTI_TRIPS];
const byId = id => ALL.find(t => t.id === id);

function photo(name, { label = '', cls = '', lazy = true, alt = '', link = true } = {}) {
  const p = PHOTOS[name];
  if (!p) return '';
  return `<figure class="ph ${cls}"><img src="img/${name}.jpg" alt="${esc(alt || label)}" ${lazy ? 'loading="lazy"' : ''} width="${p.w}" height="${p.h}">${label ? `<span class="lbl">${esc(label)}</span>` : ''}<figcaption>${link ? `<a href="${p.page}" target="_blank" rel="noopener">${esc(p.credit)}</a>` : `<span style="color:#fff">${esc(p.credit)}</span>`}</figcaption></figure>`;
}
function tiles(m) {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }).addTo(m);
  if (dark) m.getContainer().style.filter = 'brightness(.82) contrast(1.05)';
}
const pin = c => L.divIcon({ className: '', html: `<div class="pin" style="background:${c}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
const num = (n, c) => L.divIcon({ className: '', html: `<div class="num" style="background:${c}">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
const homeIcon = L.divIcon({ className: '', html: '<div class="home">⌂</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
const effortChip = e => `<span class="chip ${e === 'easy' ? 'easy' : e === 'medium' ? 'med' : 'hard'}">${EFFORT[e]}</span>`;
const momChip = t => t.tags.includes('mom') ? '<span class="chip">👵 Good with Mom</span>' : '';

/* ---------- day-trip tiles + filters ---------- */
const FILTERS = [['all', 'All'], ['mom', 'Good with Mom'], ['hike', 'Hiking'], ['coast', 'Coast'], ['town', 'Towns'], ['short', 'Under 8 h']];
$('#filters').innerHTML = FILTERS.map(([k, l], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}">${l}</button>`).join('');
$('#dayTiles').innerHTML = DAY_TRIPS.map(t => `
  <a class="tile" href="#trip/${t.id}" data-tags="${t.tags.join(' ')}${t.total < 8 ? ' short' : ''}">
    ${photo(t.cover, { alt: t.title, link: false }).replace('</figure>', `<span class="dur">${hrs(t.total)}</span></figure>`)}
    <div class="tb"><h3>${esc(t.title)}</h3>
      <div class="meta"><span><b>≈ ${hrs(t.total)}</b> total</span><span>🚗 ${t.drive} driving</span>${t.boat ? `<span>⛴ ${t.boat} boat</span>` : ''}</div>
      <div class="tags">${effortChip(t.effort)}${momChip(t)}</div></div>
  </a>`).join('');
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
  const f = b.dataset.f;
  document.querySelectorAll('#dayTiles .tile').forEach(el => el.hidden = f !== 'all' && !el.dataset.tags.split(' ').includes(f));
});

/* ---------- multi-day tiles (the picture is the route map) ---------- */
$('#multiTiles').innerHTML = MULTI_TRIPS.map(t => `
  <a class="tile multi" href="#trip/${t.id}" style="--c:${t.color}">
    <div class="tmap"><div class="lm" id="tm-${t.id}"></div></div>
    <div class="tb"><h3>${t.days} days · ${t.nights} nights</h3>
      <div class="name">${esc(t.title)}</div>
      <div class="meta"><span>🚗 ≈ ${t.km} km</span><span>🛏 ${esc(t.bases)}</span><span>${t.weather} ${t.weatherNote}</span></div></div>
  </a>`).join('');
const tileMapOpts = { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false };
MULTI_TRIPS.forEach(t => {
  const m = L.map('tm-' + t.id, tileMapOpts); tiles(m);
  const line = L.polyline(ROUTES[t.k], { color: t.color, weight: 4, opacity: .9 }).addTo(m);
  L.marker(HOME, { icon: homeIcon }).addTo(m);
  t.stopsList.filter(s => s[2]).forEach(s => L.marker(s[1], { icon: num('🛏', t.color) }).addTo(m));
  m.fitBounds(line.getBounds(), { padding: [14, 14] });
});

/* ---------- detail view ---------- */
// Justified photo rows: each photo grows in proportion to its aspect ratio, so rows fill edge to edge.
function gallery(t) {
  return `<div class="gal">${t.photos.map((p, i) => {
    const r = Math.min(Math.max(PHOTOS[p].w / PHOTOS[p].h, 1), 2).toFixed(3);
    return photo(p, { lazy: i > 0, alt: t.title }).replace('<figure class="ph ', `<figure style="--r:${r}" class="ph `);
  }).join('')}</div>`;
}
let dmap = null;
function mapsRoute(stops) {
  const home = HOME.join(',');
  const wp = stops.map(s => s[1].join(',')).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${home}&destination=${home}&waypoints=${encodeURIComponent(wp)}&travelmode=driving`;
}
function pairsHtml(t) {
  if (!t.pairs || !t.pairs.length) return '';
  return `<div class="pairs"><span class="muted">Combine on back-to-back days with:</span>${t.pairs.map(id => `<a class="chip" href="#trip/${id}">${esc(byId(id).title)}</a>`).join('')}</div>`;
}
function prevNext(t) {
  const list = t.k ? MULTI_TRIPS : DAY_TRIPS, i = list.indexOf(t);
  const p = list[(i - 1 + list.length) % list.length], n = list[(i + 1) % list.length];
  return `<div class="pn"><a href="#trip/${p.id}">← ${esc(p.title)}</a><a href="#trip/${n.id}">${esc(n.title)} →</a></div>`;
}
function dayDetail(t) {
  return `
  <p class="eyebrow">Day trip from Torrevieja · ${esc(t.where)}</p>
  <h2>${esc(t.title)}</h2>
  <div class="kv"><div><b>≈ ${hrs(t.total)}</b><span>door to door</span></div><div><b>${t.drive}</b><span>driving${t.boat ? ' + ' + t.boat + ' boat' : ''}</span></div><div><b>${EFFORT[t.effort]}</b><span>effort</span></div><div><b>${t.tags.includes('mom') ? 'Yes' : 'Better without'}</b><span>with Mom</span></div></div>
  <p class="lead">${t.summary}</p>
  ${gallery(t)}
  <div class="tw">
    <div style="display:grid;gap:10px"><h3 class="h3" style="margin-top:0">Itinerary</h3>
      <ol class="plan">${t.plan.map(([time, h, p, d]) => `<li><div class="t">${time}</div><div><b class="h">${h}</b>${p ? `<p>${p}</p>` : ''}${d ? `<div class="drv">${d}</div>` : ''}</div></li>`).join('')}</ol></div>
    <div style="display:grid;gap:14px;align-content:start">
      <div class="dmap" id="dmap"></div>
      <div class="btnrow"><a class="btn" href="${mapsRoute(t.stops)}" target="_blank" rel="noopener">Open the route in Google Maps ↗</a>${t.stops.map(s => `<a class="btn ghost" href="${gm(s[2])}" target="_blank" rel="noopener">${esc(s[0])} ↗</a>`).join('')}</div>
      <div class="notes"><h3>Good to know</h3><ul>${t.tips.map(x => `<li>${x}</li>`).join('')}</ul></div>
    </div>
  </div>
  ${pairsHtml(t)}
  ${prevNext(t)}`;
}
function multiDetail(t) {
  return `
  <p class="eyebrow" style="color:${t.color}">Multi-day trip from Torrevieja · ${t.days} days, ${t.nights} nights</p>
  <h2>${esc(t.title)}</h2>
  <div class="kv"><div><b>${t.days} days</b><span>${t.nights} nights</span></div><div><b>≈ ${t.km} km</b><span>driving, round trip</span></div><div><b>${t.weather}</b><span>${t.weatherNote}</span></div><div><b>${t.bases.split('·').length} base${t.bases.includes('·') ? 's' : ''}</b><span>${esc(t.bases)}</span></div></div>
  <p class="lead">${t.summary}</p>
  ${gallery(t)}
  <div class="tw" style="--c:${t.color}">
    <div style="display:grid;gap:10px"><h3 class="h3" style="margin-top:0">Day by day</h3>
      <ol class="days">${t.days_.map(([h, p, d], i) => `<li><div class="d">Day ${i + 1}</div><div><b>${h}</b><p>${p}</p><div class="drv">${d}</div></div></li>`).join('')}</ol>
      <div class="notes"><h3>Timing</h3><ul><li>${t.christmas}</li><li>${t.shorter}</li></ul></div>
    </div>
    <div style="display:grid;gap:14px;align-content:start">
      <div class="dmap" id="dmap"></div>
      <div class="btnrow"><a class="btn" style="background:${t.color}" href="${mapsRoute(t.stopsList.slice(0, 9))}" target="_blank" rel="noopener">Open the route in Google Maps ↗</a></div>
      <div class="tblwrap"><table class="stays"><thead><tr><th>Area</th><th>Airbnb example (entire place, 3 guests)</th><th>/night</th></tr></thead><tbody>
        ${t.stays.map(([a, u, n, d, p]) => `<tr><td>${esc(a)}</td><td><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a><br><span class="muted">${esc(d)}</span></td><td class="n">${p}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Prices from an Airbnb search on 18 Nov 2026 for 3 adults, before fees. Use them for scale, not as a booking.</p>
      <div class="pc"><div><h4>👍 Why</h4><ul>${t.pros.map(x => `<li>${x}</li>`).join('')}</ul></div><div><h4>👎 Watch out</h4><ul>${t.cons.map(x => `<li>${x}</li>`).join('')}</ul></div></div>
    </div>
  </div>
  ${prevNext(t)}`;
}
function drawDetailMap(t) {
  if (dmap) { dmap.remove(); dmap = null; }
  dmap = L.map('dmap', { scrollWheelZoom: false }); tiles(dmap);
  const color = t.color || css('--sea');
  const line = L.polyline(ROUTES[t.k || t.id], { color, weight: 4, opacity: .9 }).addTo(dmap);
  L.marker(HOME, { icon: homeIcon, zIndexOffset: 1000 }).bindPopup('<b>Torrevieja</b><br>Mom’s house').addTo(dmap);
  const stops = t.stops || t.stopsList;
  stops.forEach((s, i) => {
    const q = t.stops ? s[2] : s[0];
    const icon = t.stops ? num(i + 1, color) : (s[2] ? num('🛏', color) : pin(color));
    L.marker(s[1], { icon }).bindPopup(`<b>${esc(s[0])}</b><br><a href="${gm(q)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`).addTo(dmap);
  });
  if (t.id === 'tabarca') L.polyline([stops[0][1], stops[1][1]], { color, weight: 3, dashArray: '6 6' }).addTo(dmap);
  const b = line.getBounds(); stops.forEach(s => b.extend(s[1]));
  dmap.fitBounds(b, { padding: [20, 20] });
}
const detail = $('#detail');
function route() {
  const m = location.hash.match(/^#trip\/([\w-]+)/);
  const t = m && byId(m[1]);
  if (!t) {
    document.title = 'Spain Dec ’26 Trips';
    if (!detail.hidden) { detail.hidden = true; document.body.classList.remove('locked'); if (dmap) { dmap.remove(); dmap = null; } }
    return;
  }
  $('#dcrumb').textContent = t.k ? 'Multi-day trips' : 'Day trips';
  $('#dbody').innerHTML = t.k ? multiDetail(t) : dayDetail(t);
  detail.hidden = false; document.body.classList.add('locked'); detail.scrollTop = 0;
  document.title = t.title + ' · Spain Dec ’26';
  drawDetailMap(t);
}
function closeDetail() {
  // Drop the #trip/... hash without scrolling: the list underneath kept its scroll position.
  history.pushState(null, '', location.pathname + location.search);
  document.title = 'Spain Dec ’26 Trips';
  route();
}
$('#back').addEventListener('click', closeDetail);
addEventListener('keydown', e => { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });
addEventListener('hashchange', route);
route();

/* ---------- overview map ---------- */
(function () {
  const m = L.map('ovmap', { scrollWheelZoom: false }); tiles(m);
  const dayG = L.layerGroup().addTo(m), evG = L.layerGroup().addTo(m);
  DAY_TRIPS.forEach(t => {
    const s = t.stops[t.stops.length > 1 && t.id !== 'tabarca' ? 0 : t.stops.length - 1];
    L.marker(s[1], { icon: pin(css('--sea')) }).bindPopup(`<b>${esc(t.title)}</b><br>≈ ${hrs(t.total)} · ${t.drive} driving<br><a href="#trip/${t.id}">Open the trip →</a>`).addTo(dayG);
  });
  EVENTS.forEach(e => L.marker(e.ll, { icon: pin(css('--plum')) }).bindPopup(`<b>${esc(e.t)}</b><br>${esc(e.s)}<br><a href="${gm(e.q)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`).addTo(evG));
  const ov = { [`<span style="color:${css('--sea')}">●</span> Day trips`]: dayG, [`<span style="color:${css('--plum')}">●</span> Events`]: evG };
  MULTI_TRIPS.forEach(t => {
    const g = L.layerGroup([L.polyline(ROUTES[t.k], { color: t.color, weight: 4, opacity: .8 }).bindPopup(`<b>${esc(t.title)}</b><br>${t.days} days · ≈ ${t.km} km<br><a href="#trip/${t.id}">Open the trip →</a>`)]).addTo(m);
    ov[`<span style="color:${t.color}">━</span> ${esc(t.short)}`] = g;
  });
  L.marker(HOME, { icon: homeIcon, zIndexOffset: 1000 }).bindPopup('<b>Torrevieja</b><br>Mom’s house').addTo(m);
  L.control.layers(null, ov, { collapsed: innerWidth < 700 }).addTo(m);
  m.fitBounds([[36.7, -3.2], [40.5, 0.5]]);
})();
