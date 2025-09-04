/* Ledgerly+ — full app.js
   Features: IndexedDB storage, budgets, filters, export/import,
             settings (theme/primary/currency/density), charts (trend, bars, donut),
             day-by-day view, bottom tab bar navigation.
   No external libraries.
*/
(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  const state = {
    currencyCode: guessCurrency(),
    currencyFmt: null,
    installPrompt: null,
    db: null,
    budgets: [],       // {id, category, limit}
    transactions: [],  // {id, type, date, category, amount, note}
    settings: { theme:'auto', primary:'#0ea5e9', density:'', currency:'' }
  };

  /* ---------- Currency ---------- */
  function setCurrency(code){
    try{
      state.currencyCode = (code || state.settings.currency || guessCurrency()).toUpperCase();
      state.currencyFmt = new Intl.NumberFormat(navigator.language || 'en-US', { style:'currency', currency: state.currencyCode });
    }catch{
      state.currencyCode = 'USD';
      state.currencyFmt = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' });
    }
  }
  function fmtMoney(n){ return state.currencyFmt.format(+n || 0); }
  function guessCurrency(){
    try{
      const region = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || 'US';
      const map = { US:'USD', GB:'GBP', AU:'AUD', CA:'CAD', EU:'EUR', DE:'EUR', FR:'EUR', IN:'INR', JP:'JPY' };
      return map[region] || 'USD';
    }catch{ return 'USD'; }
  }
  const todayStr = () => new Date().toISOString().slice(0,10);
  const parseAmount = s => Math.round(parseFloat(s || '0') * 100) / 100;

  /* ---------- IndexedDB Helper ---------- */
  const idb = {
    open(name='ledgerly', version=2){
      return new Promise((res, rej) => {
        const req = indexedDB.open(name, version);
        req.onupgradeneeded = () => {
          const db = req.result;
          if(!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath:'id', autoIncrement:true }).createIndex('date', 'date');
          if(!db.objectStoreNames.contains('budget')) db.createObjectStore('budget', { keyPath:'id', autoIncrement:true }).createIndex('category', 'category', { unique:true });
          if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'k' });
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    },
    tx(db, store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); },
    all(db, store){ return new Promise((res, rej) => {
      const os = idb.tx(db, store); const out = [];
      os.openCursor().onsuccess = e => { const c=e.target.result; if(!c) return res(out); out.push(c.value); c.continue(); };
      os.transaction.onerror = () => rej(os.transaction.error);
    });},
    add(db, store, value){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').add(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);} ); },
    put(db, store, value){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').put(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);} ); },
    delete(db, store, id){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').delete(id); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);} ); },
    clear(db, store){ return new Promise((res, rej)=>{ const r=idb.tx(db,store,'readwrite').clear(); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);} ); },
    getMeta(db,k){ return new Promise((res,rej)=>{ const r=idb.tx(db,'meta').get(k); r.onsuccess=()=>res(r.result?.v); r.onerror=()=>rej(r.error); }); },
    setMeta(db,k,v){ return new Promise((res,rej)=>{ const r=idb.tx(db,'meta','readwrite').put({k,v}); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); }); }
  };

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    byId('year') && (byId('year').textContent = new Date().getFullYear());
    $('#monthLabel') && ($('#monthLabel').textContent = monthName(new Date()) + ' totals');

    await initDB();
    await loadAll();
    await loadSettings();
    applySettings();
    setCurrency();
    renderAll();
    wireUI();
    setupTabs();         // bottom tab bar + section switching
    registerSW();
    setupInstall();
    maybeShowIosTip();
  });

  async function initDB(){ state.db = await idb.open('ledgerly', 2); }
  async function loadAll(){
    [state.transactions, state.budgets] = await Promise.all([ idb.all(state.db,'tx'), idb.all(state.db,'budget') ]);
  }
  async function loadSettings(){
    const saved = await idb.getMeta(state.db,'settings');
    if(saved) state.settings = Object.assign(state.settings, saved);
  }
  function saveSettings(){ return idb.setMeta(state.db,'settings', state.settings); }

  function applySettings(){
    // theme
    const root = document.documentElement;
    const theme = state.settings.theme || 'auto';
    if(theme==='light') root.setAttribute('data-theme','light');
    else if(theme==='dark') root.setAttribute('data-theme','dark');
    else root.setAttribute('data-theme','auto');

    // primary color
    root.style.setProperty('--primary-custom', state.settings.primary || '#0ea5e9');

    // density
    document.body.classList.toggle('dense', state.settings.density === 'dense');
  }

  /* ---------- UI Wiring ---------- */
  function wireUI(){
    const txDialog = byId('txDialog');
    const budgetDialog = byId('budgetDialog');
    const settingsDialog = byId('settingsDialog');

    byId('addBtn')?.addEventListener('click', () => openTxDialog());
    byId('closeTxDialog')?.addEventListener('click', () => txDialog?.close());
    byId('cancelTx')?.addEventListener('click', () => txDialog?.close());

    byId('addBudgetBtn')?.addEventListener('click', () => openBudgetDialog());
    byId('closeBudgetDialog')?.addEventListener('click', () => budgetDialog?.close());
    byId('cancelBudget')?.addEventListener('click', () => budgetDialog?.close());

    byId('settingsBtn')?.addEventListener('click', ()=> openSettings());
    byId('closeSettings')?.addEventListener('click', ()=> settingsDialog?.close());
    byId('cancelSettings')?.addEventListener('click', ()=> settingsDialog?.close());
    byId('settingsForm')?.addEventListener('submit', onSaveSettings);

    byId('txForm')?.addEventListener('submit', onSaveTx);
    byId('budgetForm')?.addEventListener('submit', onSaveBudget);

    // Filters
    byId('filterForm')?.addEventListener('input', debounce(()=>{ renderTransactions(); drawExpenseBars(); }, 100));
    byId('clearFilters')?.addEventListener('click', (e)=>{ e.preventDefault(); byId('filterForm').reset(); renderTransactions(); drawExpenseBars(); });

    // Export/Import
    byId('exportBtn')?.addEventListener('click', onExport);
    byId('importFile')?.addEventListener('change', onImport);

    byId('closeIosTip')?.addEventListener('click', ()=> byId('iosTip').hidden = true);

    $$('dialog').forEach(d => d.addEventListener('cancel', e => { e.preventDefault(); d.close(); }));
  }

  function openTxDialog(tx=null){
    const d = byId('txDialog'); if(!d) return;
    byId('txDialogTitle').textContent = tx ? 'Edit transaction' : 'Add transaction';
    byId('txType').value = tx?.type || 'expense';
    byId('txDate').value = tx?.date || todayStr();
    byId('txCategory').value = tx?.category || '';
    byId('txAmount').value = tx ? Math.abs(tx.amount).toFixed(2) : '';
    byId('txNote').value = tx?.note || '';
    byId('txId').value = tx?.id || '';
    d.showModal(); byId('txType').focus();
  }
  function openBudgetDialog(b=null){
    const d = byId('budgetDialog'); if(!d) return;
    byId('budgetDialogTitle').textContent = b ? 'Edit budget' : 'Add budget';
    byId('budgetCategory').value = b?.category || '';
    byId('budgetLimit').value = b?.limit?.toFixed(2) || '';
    byId('budgetId').value = b?.id || '';
    d.showModal(); byId('budgetCategory').focus();
  }
  function openSettings(){
    const d = byId('settingsDialog'); if(!d) return;
    byId('setTheme').value = state.settings.theme || 'auto';
    byId('setPrimary').value = state.settings.primary || '#0ea5e9';
    byId('setCurrency').value = state.settings.currency || state.currencyCode || 'USD';
    byId('setDensity').value = state.settings.density || '';
    d.showModal();
  }

  /* ---------- Save handlers ---------- */
  async function onSaveTx(e){
    e.preventDefault();
    const amtRaw = parseAmount(byId('txAmount').value);
    const sign = byId('txType').value === 'expense' ? -1 : 1;
    const tx = {
      id: byId('txId').value ? Number(byId('txId').value) : undefined,
      type: byId('txType').value,
      date: byId('txDate').value,
      category: byId('txCategory').value.trim(),
      amount: amtRaw * sign,
      note: byId('txNote').value.trim()
    };
    if(!tx.date || !tx.category || !amtRaw){ alert('Please fill required fields.'); return; }

    if(tx.id){
      await idb.put(state.db, 'tx', tx);
      const idx = state.transactions.findIndex(t => t.id === tx.id);
      state.transactions[idx] = tx;
    } else {
      tx.id = await idb.add(state.db, 'tx', tx);
      state.transactions.push(tx);
    }
    byId('txDialog').close();
    renderAll();
  }

  async function onSaveBudget(e){
    e.preventDefault();
    const rec = {
      id: byId('budgetId').value ? Number(byId('budgetId').value) : undefined,
      category: byId('budgetCategory').value.trim(),
      limit: parseAmount(byId('budgetLimit').value)
    };
    if(!rec.category){ alert('Category required.'); return; }
    if(rec.id){
      await idb.put(state.db, 'budget', rec);
      const i = state.budgets.findIndex(b => b.id === rec.id);
      state.budgets[i] = rec;
    } else {
      try{
        rec.id = await idb.add(state.db, 'budget', rec);
        state.budgets.push(rec);
      }catch{ alert('Budget category must be unique.'); }
    }
    byId('budgetDialog').close();
    renderAll();
  }

  async function onSaveSettings(e){
    e.preventDefault();
    state.settings.theme = byId('setTheme').value;
    state.settings.primary = byId('setPrimary').value || '#0ea5e9';
    state.settings.currency = (byId('setCurrency').value || '').toUpperCase();
    state.settings.density = byId('setDensity').value;
    await saveSettings();
    applySettings();
    setCurrency(state.settings.currency);
    renderAll();
    byId('settingsDialog').close();
  }

  /* ---------- Rendering ---------- */
  function renderAll(){
    fillCategoryFilters();
    renderKPIs();
    renderBudgets();
    renderTransactions();
    renderDaily();
    drawTrend();
    drawExpenseBars();
    drawBudgetDonut();
  }

  function fillCategoryFilters(){
    const set = new Set(state.transactions.map(t => t.category).concat(state.budgets.map(b=>b.category)).filter(Boolean));
    const options = Array.from(set).sort().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    byId('categoryFilter') && (byId('categoryFilter').innerHTML = `<option value="">All</option>${options}`);
    byId('categoryList') && (byId('categoryList').innerHTML = options);
  }

  function monthKey(d=new Date()){ return d.toISOString().slice(0,7); } // YYYY-MM
  function monthName(d){ return d.toLocaleDateString(undefined, { month:'long', year:'numeric' }); }

  function renderKPIs(){
    const mk = monthKey();
    const monthTx = state.transactions.filter(t => t.date.startsWith(mk));
    const incomeMonth = monthTx.filter(t => t.amount>0).reduce((s,t)=> s+t.amount,0);
    const expenseMonth = monthTx.filter(t => t.amount<0).reduce((s,t)=> s+Math.abs(t.amount),0);
    const netMonth = incomeMonth - expenseMonth;

    const incomeAll = state.transactions.filter(t=>t.amount>0).reduce((s,t)=> s+t.amount,0);
    const expenseAll = state.transactions.filter(t=>t.amount<0).reduce((s,t)=> s+Math.abs(t.amount),0);
    const balance = incomeAll - expenseAll;

    byId('kpiBalance') && (byId('kpiBalance').textContent = fmtMoney(balance));
    byId('kpiIncomeMonth') && (byId('kpiIncomeMonth').textContent = fmtMoney(incomeMonth));
    byId('kpiExpenseMonth') && (byId('kpiExpenseMonth').textContent = fmtMoney(expenseMonth));
    byId('kpiNetMonth') && (byId('kpiNetMonth').textContent = fmtMoney(netMonth));
    $('#monthLabel') && ($('#monthLabel').textContent = monthName(new Date()) + ' totals');
  }

  function renderBudgets(){
    const ul = byId('budgetList'); if(!ul) return;
    ul.innerHTML = '';
    const mk = monthKey(new Date());
    const frag = document.createDocumentFragment();

    state.budgets.forEach(b => {
      const spent = state.transactions
        .filter(t => t.type==='expense' && t.category===b.category && t.date.startsWith(mk))
        .reduce((s,t)=> s + Math.abs(t.amount), 0);

      const left = Math.max(0, (b.limit || 0) - spent);
      const pct = b.limit ? Math.min(100, Math.round((spent / b.limit) * 100)) : 0;

      const li = document.createElement('li');
      li.className = 'budget-item';
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(b.category)}</strong>
          <div class="hint">Spent ${fmtMoney(spent)} of ${fmtMoney(b.limit || 0)} — Left ${fmtMoney(left)} (${pct}%)</div>
          <div class="progress" aria-label="Budget progress for ${escapeHtml(b.category)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span style="width:${pct}%"></span>
          </div>
        </div>
        <div>
          <button class="btn small" data-edit-budget="${b.id}">Edit</button>
          <button class="btn small ghost" data-del-budget="${b.id}">Delete</button>
        </div>
      `;
      frag.appendChild(li);
    });
    ul.appendChild(frag);

    ul.onclick = async (e)=>{
      const eb = e.target.getAttribute('data-edit-budget');
      const dbtn = e.target.getAttribute('data-del-budget');
      if(eb){
        const rec = state.budgets.find(x => x.id === Number(eb));
        openBudgetDialog(rec);
      }
      if(dbtn){
        if(confirm('Delete this budget?')){
          await idb.delete(state.db, 'budget', Number(dbtn));
          state.budgets = state.budgets.filter(x => x.id !== Number(dbtn));
          renderAll();
        }
      }
    };
  }

  function filteredTx(){
    const f = {
      from: byId('fromDate')?.value,
      to: byId('toDate')?.value,
      type: byId('typeFilter')?.value,
      category: byId('categoryFilter')?.value,
      q: (byId('searchInput')?.value || '').toLowerCase().trim(),
      sort: byId('sortBy')?.value
    };
    let list = [...state.transactions];
    if(f.from) list = list.filter(t => t.date >= f.from);
    if(f.to) list = list.filter(t => t.date <= f.to);
    if(f.type) list = list.filter(t => t.type === f.type);
    if(f.category) list = list.filter(t => t.category === f.category);
    if(f.q) list = list.filter(t =>
      (t.note||'').toLowerCase().includes(f.q) ||
      (t.category||'').toLowerCase().includes(f.q) ||
      Math.abs(t.amount).toFixed(2).includes(f.q)
    );
    const sorters = {
      'date-desc': (a,b)=> b.date.localeCompare(a.date),
      'date-asc': (a,b)=> a.date.localeCompare(b.date),
      'amount-desc': (a,b)=> Math.abs(b.amount) - Math.abs(a.amount),
      'amount-asc': (a,b)=> Math.abs(a.amount) - Math.abs(b.amount),
    };
    list.sort(sorters[f.sort] || sorters['date-desc']);
    return list;
  }

  function renderTransactions(){
    const tbody = byId('txTableBody'); if(!tbody) return;
    tbody.innerHTML = '';
    const rows = filteredTx();
    byId('txCount') && (byId('txCount').textContent = `${rows.length} item${rows.length!==1?'s':''}`);

    const frag = document.createDocumentFragment();
    rows.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.date}</td>
        <td>${t.type === 'income' ? 'Income' : 'Expense'}</td>
        <td>${escapeHtml(t.category)}</td>
        <td class="right amount ${t.amount<0?'neg':'pos'}">${fmtMoney(Math.abs(t.amount))}</td>
        <td>${escapeHtml(t.note || '')}</td>
        <td>
          <button class="icon-btn" aria-label="Edit" data-edit="${t.id}">✎</button>
          <button class="icon-btn" aria-label="Delete" data-del="${t.id}">🗑</button>
        </td>`;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    tbody.onclick = async (e) => {
      const editId = e.target.getAttribute('data-edit');
      const delId = e.target.getAttribute('data-del');
      if(editId){
        const tx = state.transactions.find(x => x.id === Number(editId));
        openTxDialog(tx);
      }
      if(delId){
        if(confirm('Delete this transaction?')){
          await idb.delete(state.db, 'tx', Number(delId));
          state.transactions = state.transactions.filter(x => x.id !== Number(delId));
          renderAll();
        }
      }
    };
  }

  function renderDaily(){
    const ul = byId('dailyList'); if(!ul) return;
    ul.innerHTML = '';
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth(); // 0-based
    const lastDay = new Date(year, month+1, 0).getDate();
    const mk = monthKey(now);

    const monthTx = state.transactions.filter(t => t.date.startsWith(mk));
    const monthExp = monthTx.filter(t=>t.amount<0).reduce((s,t)=> s + Math.abs(t.amount), 0) || 1;

    const frag = document.createDocumentFragment();
    for(let d=1; d<=lastDay; d++){
      const dd = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayTx = monthTx.filter(t => t.date === dd);
      const inc = dayTx.filter(t=>t.amount>0).reduce((s,t)=> s+t.amount,0);
      const exp = dayTx.filter(t=>t.amount<0).reduce((s,t)=> s+Math.abs(t.amount),0);
      const net = inc - exp;
      const pct = Math.round((exp / monthExp) * 100);

      const li = document.createElement('li');
      li.className = 'day-row';
      li.innerHTML = `
        <div><strong>${new Date(dd).toLocaleDateString(undefined,{weekday:'short', day:'numeric'})}</strong><br><small>${dayTx.length} tx</small></div>
        <div class="amount pos">${fmtMoney(inc)}</div>
        <div class="amount neg">-${fmtMoney(exp)}</div>
        <div class="amount ${net>=0?'pos':'neg'}" title="${pct}% of monthly spend">${fmtMoney(net)}</div>
      `;
      frag.appendChild(li);
    }
    ul.appendChild(frag);
  }

  /* ---------- Charts ---------- */
  function chartInit(canvas){
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth - 16;
    const h = +canvas.getAttribute('height');
    canvas.width = w * DPR; canvas.height = h * DPR; canvas.style.width = w+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.clearRect(0,0,w,h);
    return {ctx,w,h};
  }

  function drawTrend(){
    const cvs = byId('trendChart'); if(!cvs) return;
    const {ctx,w,h} = chartInit(cvs);
    const days = 30;
    const now = new Date();
    const series = [];
    let cum = 0;
    for(let i=days-1;i>=0;i--){
      const d = new Date(now); d.setDate(now.getDate()-i);
      const key = d.toISOString().slice(0,10);
      cum += state.transactions.filter(t => t.date === key).reduce((s,t)=> s + t.amount, 0);
      series.push(cum);
    }
    const min = Math.min(0, Math.min(...series));
    const max = Math.max(0, Math.max(...series), 1);
    const range = max - min || 1;
    const xStep = w / (days-1);

    // grid
    ctx.strokeStyle = '#ffffff25'; ctx.lineWidth = 1;
    for(let i=0;i<5;i++){ const y=(h/4)*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0, '#22d3ee'); grad.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue('--primary'));
    ctx.strokeStyle = grad; ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((v,i)=>{ const x=i*xStep; const y=h - ((v - min)/range)*h; i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();

    // zero line
    const zeroY = h - ((0 - min)/range)*h;
    ctx.strokeStyle = '#ef4444aa'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(0,zeroY); ctx.lineTo(w,zeroY); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawExpenseBars(){
    const cvs = byId('expenseBarChart'); if(!cvs) return;
    const {ctx,w,h} = chartInit(cvs);
    const mk = monthKey(new Date());
    const monthTx = filteredTx().filter(t => t.date.startsWith(mk)); // respects filters
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const data = [];
    for(let d=1; d<=daysInMonth; d++){
      const dd = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const exp = monthTx.filter(t=> t.date===dd && t.amount<0).reduce((s,t)=> s+Math.abs(t.amount),0);
      data.push(exp);
    }
    const max = Math.max(1, ...data);
    const gap = 1;
    const barW = Math.max(2, Math.floor((w - gap*(data.length-1)) / data.length));
    data.forEach((v,i)=>{
      const x = i * (barW + gap);
      const bh = Math.round((v/max)* (h-10));
      ctx.fillStyle = v ? getComputedStyle(document.documentElement).getPropertyValue('--neg') : '#ffffff22';
      ctx.fillRect(x, h-bh, barW, bh);
    });
  }

  function drawBudgetDonut(){
    const cvs = byId('budgetDonut'); if(!cvs) return;
    const ctx = cvs.getContext('2d');
    const { width:W, height:H } = cvs;
    const cx = W/2, cy = H/2, r = Math.min(cx,cy)-6, thickness = 18;

    const mk = monthKey(new Date());
    const monthBudget = state.budgets.reduce((s,b)=> s + (b.limit||0), 0);
    const monthSpent = state.transactions.filter(t => t.type==='expense' && t.date.startsWith(mk))
      .reduce((s,t)=> s + Math.abs(t.amount), 0);
    const pct = monthBudget ? Math.min(100, Math.round((monthSpent/monthBudget)*100)) : 0;

    ctx.clearRect(0,0,W,H);
    ctx.lineWidth = thickness; ctx.lineCap = 'round';
    // background ring
    ctx.strokeStyle = '#ffffff22';
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    // progress ring
    const start = -Math.PI/2;
    const end = start + (Math.PI*2) * (pct/100);
    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue('--primary'));
    grad.addColorStop(1, '#22d3ee');
    ctx.strokeStyle = grad;
    ctx.beginPath(); ctx.arc(cx,cy,r,start,end); ctx.stroke();

    byId('donutPct') && (byId('donutPct').textContent = `${pct}%`);
    byId('donutCaption') && (byId('donutCaption').textContent = `${fmtMoney(monthSpent)} / ${fmtMoney(monthBudget || 0)}`);
  }

  /* ---------- Export / Import ---------- */
  function onExport(){
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      currency: state.currencyCode,
      budgets: state.budgets,
      transactions: state.transactions,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ledgerly-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function onImport(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    try{
      const data = JSON.parse(text);
      if(!Array.isArray(data.transactions) || !Array.isArray(data.budgets)) throw new Error('Invalid file');
      await idb.clear(state.db, 'tx'); await idb.clear(state.db, 'budget');
      state.transactions = []; state.budgets = [];
      for(const b of data.budgets){
        const rec = { category: String(b.category), limit: Number(b.limit)||0 };
        rec.id = await idb.add(state.db, 'budget', rec);
        state.budgets.push(rec);
      }
      for(const t of data.transactions){
        const rec = {
          type: t.amount >= 0 ? 'income' : 'expense',
          date: t.date,
          category: String(t.category),
          amount: Number(t.amount),
          note: String(t.note||'')
        };
        rec.id = await idb.add(state.db, 'tx', rec);
        state.transactions.push(rec);
      }
      if(data.settings){ state.settings = Object.assign(state.settings, data.settings); applySettings(); setCurrency(data.settings.currency); }
      renderAll(); alert('Import complete ✔️');
    }catch{
      alert('Import failed. File not recognized.');
    } finally { e.target.value = ''; }
  }

  /* ---------- Install / PWA ---------- */
  function setupInstall(){
    window.addEventListener('beforeinstallprompt', (e)=>{
      e.preventDefault(); state.installPrompt = e; byId('installBtn') && (byId('installBtn').hidden = false);
    });
    byId('installBtn')?.addEventListener('click', async ()=>{
      if(!state.installPrompt) return;
      const evt = state.installPrompt; state.installPrompt = null; byId('installBtn').hidden = true;
      await evt.prompt();
    });
  }
  async function registerSW(){ if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('sw.js'); }catch{} } }
  function maybeShowIosTip(){
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(isIos && !isStandalone && byId('iosTip')){ setTimeout(()=>{ byId('iosTip').hidden = false; }, 800); }
  }

  /* ---------- Bottom Tab Bar ---------- */
  function setupTabs(){
    // Only add if the page has a <main>
    if(!$('main')) return;

    // Create tab bar if not present
    if(!$('.tabbar')){
      const bar = document.createElement('nav');
      bar.className = 'tabbar';
      bar.innerHTML = `
        <button id="tabOverview" class="active" aria-label="Overview">🏠<br><small>Overview</small></button>
        <button id="tabBudgets" aria-label="Budgets">📊<br><small>Budgets</small></button>
        <button id="tabTx" aria-label="Transactions">💵<br><small>Transactions</small></button>
        <button id="tabSettings" aria-label="Settings">⚙️<br><small>Settings</small></button>
      `;
      document.body.appendChild(bar);
    }
    const bar = $('.tabbar');

    function revealSectionFromAnchor(anchorId){
      // hide all top-level sections
      $$('main > section').forEach(sec => sec.hidden = true);
      // find the heading then its section
      const el = byId(anchorId);
      const sec = el ? el.closest('section') : null;
      (sec || $('section.summary')).hidden = false;
    }

    // Wire tabs
    const setActive = id => { bar.querySelectorAll('button').forEach(b=>b.classList.remove('active')); byId(id).classList.add('active'); };

    byId('tabOverview').addEventListener('click', ()=>{ setActive('tabOverview'); revealSectionFromAnchor('summaryTitle'); window.scrollTo({top:0,behavior:'smooth'}); });
    byId('tabBudgets').addEventListener('click', ()=>{ setActive('tabBudgets'); revealSectionFromAnchor('budgetsTitle'); });
    byId('tabTx').addEventListener('click', ()=>{ setActive('tabTx'); revealSectionFromAnchor('txTitle'); });
    byId('tabSettings').addEventListener('click', ()=>{ setActive('tabSettings'); openSettings(); });

    // Start on Overview
    revealSectionFromAnchor('summaryTitle');
  }

  /* ---------- Helpers ---------- */
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
})();
/* === PATCH: reliable bottom tabs + no messy scrolling === */
(function initBottomTabsAndLayout(){
  // re-define setupTabs with a more robust version and run it now
  function setupTabs() {
    const main = document.querySelector('main');
    if (!main) return;

    // Create tabbar once
    let bar = document.querySelector('.tabbar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.className = 'tabbar';
      bar.innerHTML = `
        <button id="tabOverview" class="active" aria-label="Overview">🏠<br><small>Overview</small></button>
        <button id="tabBudgets" aria-label="Budgets">📊<br><small>Budgets</small></button>
        <button id="tabTx" aria-label="Transactions">💵<br><small>Transactions</small></button>
        <button id="tabSettings" aria-label="Settings">⚙️<br><small>Settings</small></button>
      `;
      document.body.appendChild(bar);
    }

    // Prevent full-page scroll; we control scroll only inside <main>
    document.body.style.overflow = 'hidden';
    main.style.overflow = 'auto';

    // Layout: make <main> exactly fit between sticky header and fixed tabbar
    const header = document.querySelector('.app-header');
    function layout() {
      const headerH = header ? header.offsetHeight : 0;
      const tabH = bar.offsetHeight;
      // Use innerHeight for mobile viewport correctness (includes/updates with dynamic bars)
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const safePadding = 4; // small breathing room
      const h = Math.max(200, vh - headerH - tabH - safePadding);
      main.style.height = h + 'px';
    }
    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', layout);

    // Helper: show only one top-level section
    function showOnlySectionByAnchor(anchorId) {
      // hide all sections
      Array.from(main.querySelectorAll(':scope > section')).forEach(sec => sec.hidden = true);
      // find the section that contains the anchor (usually an <h2 id="...">)
      const anchor = document.getElementById(anchorId);
      const section = anchor ? anchor.closest('section') : null;
      (section || main.querySelector('section.summary') || main.querySelector('section') ).hidden = false;
      // reset scroll position inside the scroll container
      main.scrollTo({ top: 0, behavior: 'instant' in main ? 'instant' : 'auto' });
    }

    // Activate tab UI styles
    function setActive(btn) {
      bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // One listener for all buttons (more robust for emoji/small clicks)
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'tabOverview') {
        setActive(btn);
        showOnlySectionByAnchor('summaryTitle');
      }
      else if (btn.id === 'tabBudgets') {
        setActive(btn);
        showOnlySectionByAnchor('budgetsTitle');
      }
      else if (btn.id === 'tabTx') {
        setActive(btn);
        showOnlySectionByAnchor('txTitle');
      }
      else if (btn.id === 'tabSettings') {
        setActive(btn);
        // Don't hide current section; open settings dialog on top
        if (typeof openSettings === 'function') openSettings();
      }
    });

    // Initial view = Overview
    showOnlySectionByAnchor('summaryTitle');
  }

  // Replace any earlier setupTabs definition and run now
  try { setupTabs(); } catch {}
})();
