// Test-bench UI over the Phase 3 core.
//
// This is a thin client of the *real* library: it imports straight from
// `../src` and Vite bundles it on every build (ADR-0010). There is no separate
// re-bundle step, so the deployed demo can never drift from the core.
import * as R from '../src/index.js';
// The bundled standard set (~45 methods) is a *subpath* export, not part of the
// root entry (ADR-0019) — an npm consumer imports it as
// `ringing-lib-ts/data/standard-set`; in-repo we reach the same module directly.
import { STANDARD_SET } from '../src/data/standard-set.js';

const lib = new R.MethodLibrary(STANDARD_SET);
const ENTRIES = STANDARD_SET;

// Tiny cross-tab bus so the Search tab can hand a found calling to Compose & Prove.
const bus: { loadCompose?: (entryIdx: number, calling: string) => void } = {};

// Methods in display order: by stage ascending, then name. The original index
// (`i`) stays the canonical id used everywhere (option values, ENTRIES lookups),
// so sorting the *display* never disturbs the lookups.
const SORTED_METHODS = ENTRIES
  .map((e, i) => ({ e, i }))
  .sort((a, b) => a.e.stage - b.e.stage || a.e.name.localeCompare(b.e.name));

// ---- helpers ----
function $(id){ return document.getElementById(id); }
const BELL_NAMES = R.BELL_NAMES;

// Standard calls for a method — bob/single default, or the Grandsire/Stedman
// special cases — decided by the library itself (ADR-0009's standardCalls),
// not duplicated here. Takes a built Method, not a raw STANDARD_METHODS entry.
function callsFor(method){
  return R.standardCalls(method);
}
function isStedman(entry){ return /stedman/i.test(entry.name); }
function callLabel(calls){
  if (calls.length === 0) return '. = plain (plain touches only — see note)';
  return calls.map(c => `${c.symbol} = ${c.name}`).join(",  ") + ",  . = plain";
}
function methodFor(entry){
  return R.Method.fromPlaceNotation(entry.notation, entry.stage, entry.name);
}
function rowEl(rowStr, opts){
  opts = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'rowline' + (opts.false ? ' false':'') + (opts.lead ? ' lead':'') + (opts.start ? ' start':'');
  if (opts.idx !== undefined){
    const i = document.createElement('span'); i.className='idx'; i.textContent = opts.idx; wrap.appendChild(i);
  }
  for (const ch of rowStr){
    const b = document.createElement('span');
    b.className = 'bell' + (ch === opts.hl ? ' hl' : ch === opts.hl2 ? ' hl2' : '');
    b.textContent = ch;
    wrap.appendChild(b);
  }
  if (opts.mark){
    const m = document.createElement('span');
    m.className = 'callmark' + (opts.mark === 'S' ? ' single' : ' bob');
    m.textContent = opts.mark;
    m.title = opts.mark === 'S' ? 'single' : 'bob';
    wrap.appendChild(m);
  }
  return wrap;
}
function fillBellSelect(sel, stage, withNone){
  sel.innerHTML = '';
  if (withNone){ const o=document.createElement('option'); o.value=''; o.textContent='—'; sel.appendChild(o); }
  for (let i=0;i<stage;i++){
    const o=document.createElement('option'); o.value=BELL_NAMES[i]; o.textContent=BELL_NAMES[i]; sel.appendChild(o);
  }
}

// ===================== TABS =====================
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $('view-'+t.dataset.view).classList.add('active');
}));

// ===================== COMPOSE & PROVE =====================
(function(){
  const mSel = $('c-method'), callIn = $('c-calling'), hlSel = $('c-hl');
  SORTED_METHODS.forEach(({e,i})=>{ const o=document.createElement('option'); o.value=String(i); o.textContent=`${e.name} (${e.stage})`; mSel.appendChild(o); });

  const PRESETS = {
    'Grandsire Triples': [['Plain course','.....'],['SPSPSBP (snap, 97)','s.s.s-.'],['One bob','-....']],
    'Grandsire Doubles': [['Plain course (30)','...'],['One bob','-..']],
    'Plain Bob Major':   [['Plain course','.......'],['One bob','-......']],
    'Plain Bob Triples': [['Plain course (84)','......'],['One bob','-.....']],
    'Plain Bob Minor':   [['Plain course','....'],['One bob','-...']],
    'Plain Bob Doubles': [['Plain course','...'],['One bob','-..']],
    'Cambridge Surprise Major': [['Plain course','.......'],['One bob','-......']],
    'Kent Treble Bob Minor': [['Plain course (120)','.....'],['One bob','-....']],
    'Stedman Triples': [
      ['Plain course (84)','..............'],
      ['SLQ — true 84','..bb..bb...bb.'],
      ['Single ×2 — true 168','s.............s.............'],
    ],
  };

  // Note shown under the calling box for methods needing extra explanation.
  const CALL_NOTE = {
    'Stedman Triples': 'Stedman is a <b>principle</b> called at <b>six-ends</b>. Type <b>one character per six</b> (<code class="inl">.</code>/<code class="inl">p</code> plain, <code class="inl">-</code>/<code class="inl">b</code> bob, <code class="inl">s</code> single). Internally each double-six lead maps to one of eight compound calls (ADR-0007); a bob makes 5ths and a single 5-6-7ths at the six-end. Verified true against published touches (SLQ=84, single×2=168).',
  };

  function curEntry(){ return ENTRIES[+mSel.value]; }

  // Map the typed bob alias 'B'/'b' onto this method's actual bob symbol so the
  // calling box accepts either 'B' or '-' for a bob.
  function bobSymbol(calls){
    const bob = calls.find(c => /bob/i.test(c.name));
    return bob ? bob.symbol : '-';
  }
  function normaliseCalling(str, calls){
    const sym = bobSymbol(calls);
    return [...str.trim()].map(ch => (ch === 'B' || ch === 'b') ? sym : ch).join('');
  }

  function syncMethod(){
    const e = curEntry();
    $('c-error').textContent = '';
    let calls;
    try {
      calls = callsFor(methodFor(e));
    } catch (err) {
      // e.g. a hypothetical Stedman Doubles entry — standardCalls deliberately
      // throws rather than silently returning the wrong calls (ADR-0009).
      $('c-error').textContent = 'Error: ' + err.message;
      calls = [];
    }
    const unit = isStedman(e) ? 'six' : 'lead';
    $('c-label').textContent = 'Calling — one char per ' + unit + ' (length = number of characters)';
    if (isStedman(e)){
      $('c-callhint').innerHTML = '<span style="color:var(--snap)">'+CALL_NOTE[e.name]+'</span>';
    } else {
      const bobNote = calls.length ? ' &nbsp;·&nbsp; <b>B</b> also = Bob' : '';
      $('c-callhint').innerHTML = 'Calls for this method: <b>'+callLabel(calls)+'</b>'+bobNote;
    }
    // presets
    const pc = $('c-presets'); pc.innerHTML='';
    (PRESETS[e.name]||[]).forEach(([label,str])=>{
      const b=document.createElement('button'); b.className='ghost small'; b.textContent=label;
      b.onclick=()=>{ callIn.value=str; run(); };
      pc.appendChild(b);
    });
    fillBellSelect(hlSel, e.stage, true);
    // default calling = plain course
    const def = (PRESETS[e.name] && PRESETS[e.name][0][1]) || '.....';
    callIn.value = def;
  }

  function run(){
    const e = curEntry();
    $('c-error').textContent='';
    try {
      const method = methodFor(e);
      const stedman = isStedman(e);
      let comp;
      if (stedman){
        const calling = callIn.value.trim();
        if (calling.length === 0) throw new Error('Enter a per-six calling (e.g. ".............." or "..bb..bb...bb.")');
        // Pass the selected method so higher Stedman stages (Caters, Cinques …)
        // compose at their own stage rather than being forced to Triples; the
        // library scales the six-end calls automatically (Doubles throws — caught).
        comp = R.stedmanComposition(calling, methodFor(e));
      } else {
        const calls = callsFor(method);
        const calling = normaliseCalling(callIn.value, calls); // length is taken from here
        if (calling.length === 0) throw new Error('Enter a calling — one character per lead (e.g. "....." or "s.s.s-.")');
        comp = R.Composition.fromCalling(method, calling, { calls });
      }
      const touch = new R.Touch(comp);
      const rows = touch.toArray();
      const proof = touch.prove();

      // badges
      const came = touch.comesToRounds();
      const snap = touch.isSnapFinish();
      const bs = $('c-badges'); bs.innerHTML='';
      const mk=(cls,html)=>{ const d=document.createElement('span'); d.className='badge '+(cls||''); d.innerHTML=html; bs.appendChild(d); };
      mk(proof.isTrue?'good':'bad', proof.isTrue ? '✓ TRUE' : '✗ FALSE');
      mk('', '<b>'+touch.changeCount()+'</b> changes');
      if (stedman) mk('', '<b>'+(touch.changeCount()/6)+'</b> sixes');
      mk('', '<b>'+touch.leadCount()+'</b> '+(stedman?'double-sixes':'leads'));
      mk(came?'good':'', came ? 'comes to rounds' : 'does NOT come round');
      if (snap) mk('snap', stedman ? 'six-end finish' : 'snap finish');
      if (!proof.isTrue) mk('bad', proof.falseRows.length + ' repeated row(s)');

      // identity panel
      $('c-idpanel').style.display='block';
      $('c-key').textContent = comp.key();
      $('c-hash').textContent = comp.hash();
      $('c-json').textContent = JSON.stringify(comp.toJSON());

      // false-line set (1-based line numbers from proof)
      const falseLines = new Set();
      proof.falseRows.forEach(f => f.lines.forEach(n => falseLines.add(n)));

      // Where the bobs/singles fall, as a row-index → symbol map ('-' bob, 'S' single).
      // Lead-end methods: a call at lead L lands on that lead's end row (L+1)·leadLen.
      // Stedman: six k's call is made at its six-end, displayed at row 2 + 6k.
      const leadLen = method.leadLength;
      const callMark = new Map();
      if (stedman){
        [...callIn.value.trim()].forEach((ch, k)=>{
          const c = ch.toLowerCase();
          if (c === '.' || c === 'p') return;          // plain six
          callMark.set(2 + 6*k, c === 's' ? 'S' : '-'); // bob '-' (b/-), single 'S'
        });
      } else {
        comp.calling.forEach(entry=>{
          const def = comp.callBySymbol(entry.call);
          const isSingle = def ? /single/i.test(def.name) : entry.call.toLowerCase() === 's';
          callMark.set((entry.lead + 1) * leadLen, isSingle ? 'S' : '-');
        });
      }

      // rows — mark six-ends for Stedman (rows ≡ 2 mod 6), else lead boundaries
      const hl = hlSel.value || undefined;
      const cont = $('c-rows'); cont.innerHTML='';
      rows.forEach((row, i)=>{
        const isStart = i===0;
        const isLead = stedman ? (i >= 2 && (i - 2) % 6 === 0) : (i>0 && i % leadLen === 0);
        cont.appendChild(rowEl(row.toString(), {
          idx: i, hl,
          false: falseLines.has(i+1),     // displayed row i ↔ proven line i+1
          lead: isLead, start: isStart,
          mark: callMark.get(i)           // '-' bob / 'S' single at a call point
        }));
      });
      $('c-rowcount').textContent = '— '+rows.length+' rows (start + '+touch.changeCount()+' changes)'
        + (stedman ? '; bars mark six-ends' : '')
        + (callMark.size ? '; -/S mark bobs/singles' : '');
      $('c-rowspanel').style.display='block';
    } catch(err){
      $('c-error').textContent = 'Error: '+err.message;
      $('c-rowspanel').style.display='none'; $('c-idpanel').style.display='none'; $('c-badges').innerHTML='';
    }
  }

  mSel.addEventListener('change', ()=>{ syncMethod(); run(); });
  $('c-run').addEventListener('click', run);
  callIn.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  hlSel.addEventListener('change', run);
  syncMethod(); run();

  // Let the Search tab drop a found calling straight into Compose & Prove.
  bus.loadCompose = (entryIdx, calling) => {
    mSel.value = String(entryIdx);
    syncMethod();          // resets the calling to the method default…
    callIn.value = calling; // …so set the real calling afterwards
    run();
  };
})();

// ===================== SEARCH =====================
(function(){
  const mSel = $('s-method'), minIn = $('s-minchanges'), maxIn = $('s-maxchanges'), callsSel = $('s-calls'),
        limIn = $('s-limit'), runBtn = $('s-run');

  // Lead-end methods go through searchTouches; Stedman's six-based calling goes
  // through searchStedmanTouches (ADR-0012). Both are in scope for the bounded
  // searcher now — every method the library can prove can also be searched.
  const SEARCHABLE = SORTED_METHODS;

  SEARCHABLE.forEach(({e,i})=>{
    const o=document.createElement('option'); o.value=String(i); o.textContent=`${e.name} (${e.stage})`;
    mSel.appendChild(o);
  });

  function curEntry(){ return ENTRIES[+mSel.value]; }

  // The call set to search over, honouring the bobs-only / singles-only / both toggle.
  function searchCalls(method){
    const all = callsFor(method);
    if (callsSel.value === 'bobs') return all.filter(c => /bob/i.test(c.name));
    if (callsSel.value === 'singles') return all.filter(c => /single/i.test(c.name));
    return all;
  }

  // Stedman's searcher takes plain 'bob'/'single' codes, not CallDefinitions
  // (it makes one single-character call per six — ADR-0012).
  function stedmanSearchCalls(){
    if (callsSel.value === 'bobs') return ['bob'];
    if (callsSel.value === 'singles') return ['single'];
    return ['bob','single'];
  }

  function render(report, entry, callLegend){
    const cont = $('s-results'); cont.innerHTML='';
    const sixBased = isStedman(entry);
    const unit = sixBased ? 'sixes' : 'leads';

    report.results.forEach(r=>{
      const it=document.createElement('div'); it.className='compitem';
      const len=document.createElement('span'); len.className='len'; len.innerHTML=`<b>${r.changes}</b> ch`;
      const lds=document.createElement('span'); lds.className='lds'; lds.textContent=`${r.leads} ${unit}`;
      const cl=document.createElement('span'); cl.className='cl'; cl.textContent = r.calling === '' ? '(plain course)' : r.calling;
      it.append(len, lds, cl);
      if (r.snap){ const s=document.createElement('span'); s.className='snapb'; s.textContent='SNAP'; it.appendChild(s); }
      const op=document.createElement('span'); op.className='open'; op.textContent='open in Compose ›'; it.appendChild(op);
      it.title = 'Open this calling in Compose & Prove';
      it.onclick = ()=>{
        bus.loadCompose && bus.loadCompose(+mSel.value, r.calling);
        document.querySelector('.tab[data-view="compose"]').click();
      };
      cont.appendChild(it);
    });

    // count + truth note
    const ne = r => r.snap ? 0 : 1;
    $('s-rescount').textContent =
      `— ${report.results.length} shown` +
      (report.truncated ? ' (more exist — raise the limit or narrow the calls)' : ' (complete within the length limit)') +
      `; ` + (callLegend ? callLegend + ', ' : '') + '. plain';
    $('s-resultspanel').style.display='block';

    const bs=$('s-badges'); bs.innerHTML='';
    const mk=(cls,html)=>{ const d=document.createElement('span'); d.className='badge '+(cls||''); d.innerHTML=html; bs.appendChild(d); };
    if (report.results.length===0){
      mk('', 'No true come-round touches found within the limit');
    } else {
      const shortest = report.results[0];
      mk('good', `shortest: <b>${shortest.changes}</b> changes`);
      const snaps = report.results.filter(r=>r.snap).length;
      if (snaps) mk('snap', `${snaps} snap finish${snaps>1?'es':''}`);
    }
  }

  function run(){
    $('s-error').textContent='';
    const entry = curEntry();
    const sixBased = isStedman(entry);
    let maxChanges = Math.min(250, Math.max(14, parseInt(maxIn.value,10) || 250));
    let minChanges = Math.min(maxChanges, Math.max(0, parseInt(minIn.value,10) || 0));
    let limit = Math.min(1000, Math.max(1, parseInt(limIn.value,10) || 200));
    minIn.value = String(minChanges); maxIn.value = String(maxChanges); limIn.value = String(limit);

    // Legend of the calls in use this run (used by render).
    const legendOf = arr => arr.join(', ');
    const symFor = { bob: '-', single: 's' };

    $('s-status').textContent = 'Searching…';
    $('s-resultspanel').style.display='none'; $('s-badges').innerHTML='';
    runBtn.disabled = true;

    // Defer so the "Searching…" note paints before the (synchronous) search runs.
    setTimeout(()=>{
      try {
        const method = methodFor(entry);
        const t0 = performance.now();
        let report, callLegend;
        if (sixBased){
          const calls = stedmanSearchCalls(); // ['bob'] / ['single'] / both
          report = R.searchStedmanTouches({ method, calls, minChanges, maxChanges, limit });
          callLegend = legendOf(calls.map(c => `${c} ${symFor[c]}`));
        } else {
          const calls = searchCalls(method);
          report = R.searchTouches({ method, calls, minChanges, maxChanges, limit });
          callLegend = legendOf(calls.map(c => `${c.name.toLowerCase()} ${c.symbol}`));
        }
        const ms = Math.round(performance.now() - t0);
        render(report, entry, callLegend);
        const unit = sixBased ? 'sixes' : 'leads';
        $('s-status').textContent =
          `Searched to ${report.leadsSearched} ${unit} in ${ms} ms` +
          (report.truncated ? ' — stopped at the result limit or search budget.' : '.');
      } catch(err){
        $('s-error').textContent = 'Error: '+err.message;
        $('s-status').textContent='';
      } finally {
        runBtn.disabled = false;
      }
    }, 20);
  }

  runBtn.addEventListener('click', run);
  callsSel.addEventListener('change', run);
  [minIn, maxIn, limIn].forEach(el => el.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); }));
  // Default to Grandsire Triples if present (its snaps make the demo interesting).
  const gIdx = SEARCHABLE.findIndex(({e}) => /grandsire/i.test(e.name));
  if (gIdx >= 0) mSel.value = String(SEARCHABLE[gIdx].i);
  run();
})();

// ===================== METHOD EXPLORER =====================
(function(){
  const list = $('e-list');
  let active = -1;

  function plainCourse(method){
    const stage = method.stage;
    const rounds = R.Row.rounds(stage);
    const heads = [...method.leadHeads()];          // ends with rounds
    const starts = [rounds, ...heads.slice(0,-1)];
    const rows = [];
    for (const s of starts){ for (const r of method.leadRowsNoLH(s)) rows.push(r); }
    rows.push(rounds);                              // final lead head = rounds
    return { rows, leads: starts.length, heads };
  }

  function select(i){
    active = i; const e = ENTRIES[i];
    // Highlight by the item's stored method index, not its position — the list is
    // sorted for display, so child order no longer matches the ENTRIES index.
    [...list.children].forEach(c => c.classList.toggle('active', +c.dataset.idx === i));
    const method = methodFor(e);
    const pc = plainCourse(method);

    // info
    const kv = $('e-kv');
    kv.innerHTML = '';
    const add=(k,v)=>{ const dk=document.createElement('div'); dk.className='k'; dk.textContent=k;
      const dv=document.createElement('div'); dv.className='v'; dv.textContent=v; kv.append(dk,dv); };
    add('Name', e.name);
    add('Stage', e.stage + ' bells');
    add('Classification', e.classification || '—');
    add('Place notation', e.notation);
    add('Lead length', method.leadLength + ' changes');
    add('Lead head', method.leadHead().toString());
    add('Plain course', pc.leads + ' leads · ' + (pc.rows.length-1) + ' changes');
    $('e-info').style.display='block';
    $('e-toolbar').style.display='flex';
    $('e-coursebadge').textContent = pc.leads + ' leads to come round';

    fillBellSelect($('e-hl'), e.stage, false);
    fillBellSelect($('e-hl2'), e.stage, true);
    $('e-hl').value = BELL_NAMES[1];   // trace the 2nd by default
    renderRows(method, pc);

    $('e-hl').onchange = ()=>renderRows(method, pc);
    $('e-hl2').onchange = ()=>renderRows(method, pc);
  }

  function renderRows(method, pc){
    const hl = $('e-hl').value || undefined;
    const hl2 = $('e-hl2').value || undefined;
    const cont = $('e-rows'); cont.innerHTML='';
    const leadLen = method.leadLength;
    pc.rows.forEach((row,i)=>{
      cont.appendChild(rowEl(row.toString(), {
        idx:i, hl, hl2,
        lead: i>0 && i%leadLen===0,
        start: i===0
      }));
    });
    $('e-rowspanel').style.display='block';
  }

  SORTED_METHODS.forEach(({e,i})=>{
    const d=document.createElement('div'); d.className='methitem';
    d.dataset.idx = String(i);
    d.innerHTML = `<span class="nm">${e.name}</span><span class="meta">${e.classification||''} · ${e.stage}</span>`;
    d.onclick=()=>select(i);
    list.appendChild(d);
  });
  select(SORTED_METHODS[0].i);
})();

// ===================== ROW & CHANGE PLAYGROUND =====================
(function(){
  // change applier
  const stageSel = $('p-stage');
  [4,5,6,7,8,10,12].forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s; stageSel.appendChild(o); });
  stageSel.value = 8;
  stageSel.onchange = ()=>{ $('p-row').value = R.Row.rounds(+stageSel.value).toString(); apply(); };

  function apply(){
    $('p-error').textContent='';
    const cont = $('p-rows'); cont.innerHTML='';
    try {
      const stage = +stageSel.value;
      let row = R.Row.parse($('p-row').value.trim());
      if (row.stage !== stage){ $('p-error').textContent = `Start row is stage ${row.stage}, but stage is set to ${stage}.`; return; }
      const changes = R.PlaceNotation.parse($('p-pn').value.trim(), stage);
      cont.appendChild(rowEl(row.toString(), { idx:0, start:true }));
      changes.forEach((ch,i)=>{
        row = ch.apply(row);
        cont.appendChild(rowEl(row.toString(), { idx:i+1 }));
      });
    } catch(err){ $('p-error').textContent = 'Error: '+err.message; }
  }
  $('p-apply').onclick = apply;
  $('p-pn').addEventListener('keydown',e=>{ if(e.key==='Enter') apply(); });
  apply();

  // algebra
  function calc(){
    $('p-algerror').textContent='';
    const out = $('p-alg'); out.innerHTML='';
    try {
      const a = R.Row.parse($('p-a').value.trim());
      const b = R.Row.parse($('p-b').value.trim());
      if (a.stage !== b.stage){ $('p-algerror').textContent = `Stages differ: A is ${a.stage}, B is ${b.stage}.`; return; }
      const add=(k,v)=>{ const dk=document.createElement('div'); dk.className='k'; dk.textContent=k;
        const dv=document.createElement('div'); dv.className='v'; dv.textContent=v; out.append(dk,dv); };
      add('A', a.toString());
      add('B', b.toString());
      add('A ∘ B (compose)', a.compose(b).toString());
      add('B ∘ A (compose)', b.compose(a).toString());
      add('A⁻¹ (inverse)', a.inverse().toString());
      add('A sign', a.sign() === 1 ? '+1 (even)' : '−1 (odd)');
      add('A is rounds?', a.isRounds() ? 'yes' : 'no');
      add('A even permutation?', a.isEvenPermutation() ? 'yes' : 'no');
    } catch(err){ $('p-algerror').textContent = 'Error: '+err.message; }
  }
  $('p-calc').onclick = calc;
  calc();
})();
