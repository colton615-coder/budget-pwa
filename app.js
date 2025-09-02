/* Budget Buddy – complete app logic */
'use strict';

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const id = () => Math.random().toString(36).slice(2,10);
  const num = v => Math.max(0, parseFloat(v||'0')) || 0;
  const sum = a => a.reduce((x,y)=>x+y,0);
  const esc = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ym = d => d.toISOString().slice(0,7);
  const daysIn = ym => { const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); };

  // Groups/Categories
  const GROUPS = [
    ['housing','Housing','var(--c-housing)', ['Rent/Mortgage','Insurance/Property Taxes']],
    ['transport','Transportation','var(--c-transport)', ['Car Payment','Car Insurance']],
    ['utilities','Utilities','var(--c-utilities)', ['Electricity','Water','Internet/Cable','Phone Bill']],
    ['debt','Debt Repayment','var(--c-debt)', ['Student Loans','Credit Cards']],
    ['fixedother','Other Fixed','var(--c-fixedother)', ['Subscriptions','Other Fixed Loans']],
    ['food','Food','var(--c-food)', ['Groceries','Dining Out']],
    ['household','Household','var(--c-household)', ['Personal Care','Household Supplies']],
    ['personal','Personal','var(--c-personal)', ['Shopping','Entertainment']],
    ['medical','Medical','var(--c-medical)', ['Co-pays & Prescriptions','Health Care']],
    ['othervar','Other Variable','var(--c-othervar)', ['Fuel/Gas','Travel','Gifts']]
  ];
  const ALL = GROUPS.flatMap(([g,gl,c,items]) => items.map(n => ({ key:`${g}:${slug(n)}`, group:g, groupLabel:gl, label:n, color:c })));
  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

  // Settings
  const DEFAULTS = { currency:guessCurrency(), brand:'#0ea5e9', density:'comfortable', defaultNW:'need', charts:'on' };
  const SETTINGS = load('bb.settings', DEFAULTS);
  applySettings();

  // State
  const STATE = load('bb.state', { version:1, months:{}, goals:[] });
  const monthPicker = $('#monthPicker');
  const startMonth = STATE._lastMonth || ym(new Date());
  ensure(startMonth);
  monthPicker.value = startMonth;

  let money = new Intl.NumberFormat(undefined, { style:'currency', currency: SETTINGS.currency });

  // Init
  initTabs();
  initSheet();
  initForms();
  renderAll();

  // Tabs
  function initTabs(){
    const tabs = $('#tabs');
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('[role="tab"]'); if(!btn) return;
      switchTab(btn.dataset.tab);
    });
    tabs.addEventListener('keydown', e => {
      const items = $$('#tabs [role="tab"]');
      const i = items.findIndex(el => el.classList.contains('is-active'));
      if(e.key==='ArrowRight'){ items[(i+1)%items.length].click(); e.preventDefault(); }
      if(e.key==='ArrowLeft'){ items[(i-1+items.length)%items.length].click(); e.preventDefault(); }
    });
  }
  function switchTab(key){
    $$('#tabs [role="tab"]').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab===key);
      t.setAttribute('aria-selected', t.dataset.tab===key);
    });
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.id===`panel-${key}`));
    if(key==='overview' && SETTINGS.charts==='on') renderCharts();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  // Bottom Sheet
  function initSheet(){
    const sheet = $('#sheet'); if(!sheet) return;
    const openers = $$('.open-sheet'); const closer = $('#sheet-close');
    openers.forEach(btn => btn.addEventListener('click', ()=> sheet.setAttribute('aria-hidden','false')));
    closer?.addEventListener('click', ()=> sheet.setAttribute('aria-hidden','true'));
    sheet.addEventListener('click', e => { if(e.target===sheet) sheet.setAttribute('aria-hidden','true'); });
  }

  // Forms
  function initForms(){
    monthPicker.addEventListener('change', ()=>{
      ensure(monthPicker.value); STATE._lastMonth = monthPicker.value; save(); renderAll(); toast('Switched to '+monthPicker.value);
    });

    // Planner: build budget planner (and wire inputs)
    buildBudgetPlanner();

    // Expenses form
    $('#tx-category').innerHTML = ALL.map(c=>`<option value="${c.key}">${c.groupLabel} — ${c.label}</option>`).join('');
    $('#tx-needwant').value = SETTINGS.defaultNW;
    $('#tx-date').valueAsDate = new Date();
    $('#tx-form').addEventListener('submit', e=>{
      e.preventDefault();
      const rec = {
        id:id(),
        date: $('#tx-date').value,
        desc: $('#tx-desc').value.trim(),
        category: $('#tx-category').value,
        need: $('#tx-needwant').value==='need',
        amount: num($('#tx-amount').value),
        notes: $('#tx-notes').value.trim()
      };
      if(!rec.desc || !(rec.amount>0)) return;
      current().transactions.push(rec); save();
      renderTransactions(); renderTop(); renderCharts(); e.target.reset(); $('#tx-date').valueAsDate=new Date(); $('#tx-needwant').value=SETTINGS.defaultNW;
      toast('Expense added');
    });

    // Goals
    $('#goal-form').addEventListener('submit', e=>{
      e.preventDefault();
      const name=$('#goal-name').value.trim(), target=num($('#goal-target').value);
      if(!name || !(target>0)) return;
      (STATE.goals ||= []).push({id:id(), name, target, archived:false}); save(); renderGoals(); e.target.reset(); toast('Goal added');
    });

    // Savings
    $('#save-date').valueAsDate = new Date();
    $('#save-form').addEventListener('submit', e=>{
      e.preventDefault();
      const amt=num($('#save-amount').value), goalId=$('#save-goal').value;
      if(!goalId || !(amt>0)) return;
      current().savings.push({id:id(), date:$('#save-date').value, goalId, amount:amt}); save();
      renderSavings(); renderTop(); renderCharts(); e.target.reset(); $('#save-date').valueAsDate=new Date(); toast('Saved ✅');
    });

    // Settings
    $('#set-currency').value = SETTINGS.currency;
    $('#set-brand').value    = SETTINGS.brand;
    $('#set-density').value  = SETTINGS.density;
    $('#set-default-nw').value = SETTINGS.defaultNW;
    $('#set-charts').value   = SETTINGS.charts;

    $('#settings-form').addEventListener('submit', e=>{
      e.preventDefault();
      SETTINGS.currency  = $('#set-currency').value;
      SETTINGS.brand     = $('#set-brand').value;
      SETTINGS.density   = $('#set-density').value;
      SETTINGS.defaultNW = $('#set-default-nw').value;
      SETTINGS.charts    = $('#set-charts').value;
      store('bb.settings', SETTINGS); applySettings();
      money = new Intl.NumberFormat(undefined, { style:'currency', currency: SETTINGS.currency });
      renderAll(); toast('Settings saved');
    });

    // Data I/O (sheet)
    $('#btn-export').addEventListener('click', exportJSON);
    $('#file-import').addEventListener('change', importJSON);
    $('#btn-clear-month').addEventListener('click', ()=>{
      if(!confirm('Reset all data for '+monthPicker.value+'?')) return;
      STATE.months[monthPicker.value] = emptyMonth(); save(); renderAll(); toast('Month reset');
    });
    $('#btn-reset-all').addEventListener('click', ()=>{
      if(!confirm('Erase ALL data & settings?')) return;
      localStorage.removeItem('bb.state'); localStorage.removeItem('bb.settings'); location.reload();
    });
  }

  // Planner
  function buildBudgetPlanner(){
    const m=current();
    for(const c of ALL){ if(m.budgets[c.key]==null) m.budgets[c.key]=0; }
    const host = $('#budget-groups');
    host.innerHTML = GROUPS.map(([g,gl,color,items])=>{
      const rows = items.map(n=>{
        const key=`${g}:${slug(n)}`, val=m.budgets[key]||0;
        return `<div class="row"><label><span class="color-dot" style="background:${color}"></span>${n}</label>
          <input type="number" step="0.01" min="0" value="${val}" data-bkey="${key}"></div>`;
      }).join('');
      return `<div class="group"><h4>${gl}</h4>${rows}</div>`;
    }).join('');
    host.oninput = e=>{
      const inp=e.target.closest('input[data-bkey]'); if(!inp) return;
      m.budgets[inp.dataset.bkey]=num(inp.value); save(); renderBudgetTotals(); renderCharts();
    };
    renderBudgetTotals();
  }

  // Renderers
  function renderAll(){ renderTop(); buildBudgetPlanner(); renderTransactions(); renderGoals(); renderSavings(); if(SETTINGS.charts==='on') renderCharts(); else $('#charts').style.display='none'; }

  function renderTop(){
    const m=current(); const income=sum(m.incomes.map(x=>x.amount)); const expenses=sum(m.transactions.map(x=>x.amount));
    $('#tl-income').textContent = money.format(income);
    $('#tl-expenses').textContent = money.format(expenses);
    $('#tl-result').textContent = money.format(income-expenses);
  }
  function renderBudgetTotals(){ $('#budgeted-total').textContent = money.format(sum(Object.values(current().budgets||{}))); }

  function renderTransactions(){
    const m=current(); const body=$('#tx-tbody');
    body.innerHTML=m.transactions.map(t=>{
      const cat=ALL.find(c=>c.key===t.category);
      return `<tr>
        <td>${t.date}</td><td>${esc(t.desc)}</td>
        <td>${cat?`${cat.groupLabel} / ${cat.label}`:esc(t.category)}</td>
        <td>${t.need?'<span class="badge need">Need</span>':'<span class="badge want">Want</span>'}</td>
        <td class="r">${money.format(t.amount)}</td>
        <td>${esc(t.notes||'')}</td>
        <td class="c"><button class="btn secondary" data-del-tx="${t.id}">Delete</button></td>
      </tr>`;
    }).join('');
    body.onclick = e=>{
      const b=e.target.closest('[data-del-tx]'); if(!b) return;
      m.transactions=m.transactions.filter(x=>x.id!==b.dataset.delTx); save(); renderTransactions(); renderTop(); renderCharts();
    };
    $('#tx-total').textContent = money.format(sum(m.transactions.map(x=>x.amount)));
  }

  function renderGoals(){
    const goals=STATE.goals||[];
    const list=$('#goal-list');
    list.innerHTML = goals.map(g=>{
      const cur = totalSaved(g.id);
      const pct = Math.min(100, Math.round(cur/Math.max(1,g.target)*100));
      return `<div class="goal">
        <div style="display:flex; align-items:center; gap:.6rem">
          <strong>${esc(g.name)}</strong>
          <span class="muted">${money.format(cur)} / ${money.format(g.target)} • ${pct}%</span>
          <span style="margin-left:auto"></span>
          <button class="btn secondary" data-del-goal="${g.id}">Delete</button>
        </div>
        <div class="bar"><div style="width:${pct}%; background:linear-gradient(90deg, var(--good), var(--brand)); height:100%"></div></div>
      </div>`;
    }).join('');
    list.onclick = e=>{
      const b=e.target.closest('[data-del-goal]'); if(!b) return;
      const gid=b.dataset.delGoal;
      STATE.goals=goals.filter(x=>x.id!==gid);
      for(const k in STATE.months){ STATE.months[k].savings = STATE.months[k].savings.filter(s=>s.goalId!==gid); }
      save(); renderGoals(); renderSavings(); renderCharts();
    };
    $('#save-goal').innerHTML=goals.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  }

  function renderSavings(){
    const m=current(); const body=$('#save-tbody');
    body.innerHTML=m.savings.map(s=>{
      const goal=(STATE.goals||[]).find(g=>g.id===s.goalId);
      return `<tr><td>${s.date}</td><td>${goal?esc(goal.name):'—'}</td>
        <td class="r">${money.format(s.amount)}</td>
        <td class="c"><button class="btn secondary" data-del-save="${s.id}">Delete</button></td></tr>`;
    }).join('');
    body.onclick = e=>{
      const b=e.target.closest('[data-del-save]'); if(!b) return;
      m.savings=m.savings.filter(x=>x.id!==b.dataset.delSave); save(); renderSavings(); renderTop(); renderCharts();
    };
    $('#save-total').textContent = money.format(sum(m.savings.map(x=>x.amount)));
  }

  // Charts
  let cCat,cBud,cNW,cFlow;
  function renderCharts(){
    const wrap = $('#charts'); if(SETTINGS.charts==='off'){ wrap.style.display='none'; return; }
    wrap.style.display='grid';
    const m=current();

    const by={}; m.transactions.forEach(t=>by[t.category]=(by[t.category]||0)+t.amount);
    const k=Object.keys(by), v=k.map(x=>by[x]), col=k.map(x=>ALL.find(c=>c.key===x)?.color||'#999');
    cCat = upsert(cCat, $('#chart-category').getContext('2d'), {
      type:'doughnut',
      data:{labels:k.map(labelFor), datasets:[{data:v, backgroundColor:col, borderWidth:0}]},
      options:{plugins:{legend:{position:'bottom', labels:{color:'#cfe7ff'}}}, cutout:'55%'}
    });

    const gNames = GROUPS.map(([g,gl])=>gl);
    const budgets = GROUPS.map(([g])=> sum(ALL.filter(c=>c.group===g).map(c=> (m.budgets||{})[c.key]||0)));
    const actuals = GROUPS.map(([g])=> {
      const keys = new Set(ALL.filter(c=>c.group===g).map(c=>c.key));
      return sum(m.transactions.filter(t=>keys.has(t.category)).map(t=>t.amount));
    });
    cBud = upsert(cBud, $('#chart-budget').getContext('2d'), {
      type:'bar',
      data:{labels:gNames, datasets:[
        {label:'Budget', data:budgets, backgroundColor:'rgba(14,165,233,.45)'},
        {label:'Actual', data:actuals, backgroundColor:'rgba(34,197,94,.55)'}
      ]},
      options:{plugins:{legend:{labels:{color:'#cfe7ff'}}}, scales:{x:{ticks:{color:'#cfe7ff'}}, y:{ticks:{color:'#cfe7ff'}, grid:{color:'#173040'}}}}
    });

    const need=sum(m.transactions.filter(t=>t.need).map(t=>t.amount));
    const want=sum(m.transactions.filter(t=>!t.need).map(t=>t.amount));
    cNW = upsert(cNW, $('#chart-needwant').getContext('2d'), {
      type:'pie',
      data:{labels:['Need','Want'], datasets:[{data:[need,want], backgroundColor:['#22c55e','#ef4444'], borderWidth:0}]},
      options:{plugins:{legend:{position:'bottom', labels:{color:'#cfe7ff'}}}}
    });

    const days=daysIn(monthPicker.value); const exp=Array(days).fill(0);
    m.transactions.forEach(t=>{ const d=+t.date.split('-')[2]; if(d>=1&&d<=days) exp[d-1]+=t.amount; });
    const inc=sum(m.incomes.map(i=>i.amount)); let bal=0; const series=[];
    for(let i=0;i<days;i++){ if(i===0) bal+=inc; bal-=exp[i]; series.push(bal); }
    cFlow = upsert(cFlow, $('#chart-cashflow').getContext('2d'), {
      type:'line',
      data:{labels:Array.from({length:days},(_,i)=>String(i+1)), datasets:[{label:'Balance', data:series, borderColor:SETTINGS.brand, backgroundColor:'rgba(14,165,233,.15)', fill:true, tension:.25}]},
      options:{plugins:{legend:{labels:{color:'#cfe7ff'}}}, scales:{x:{ticks:{color:'#cfe7ff'}}, y:{ticks:{color:'#cfe7ff'}, grid:{color:'#173040'}}}}
    });
  }
  function upsert(inst, ctx, cfg){ if(inst){ inst.data=cfg.data; inst.options=cfg.options||inst.options; inst.update(); return inst; } return new Chart(ctx,cfg); }
  function labelFor(key){ const c=ALL.find(x=>x.key===key); return c?`${c.groupLabel} / ${c.label}`:key; }

  // I/O
  function exportJSON(){
    const blob=new Blob([JSON.stringify({settings:SETTINGS, state:STATE}, null, 2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`budget-buddy-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importJSON(e){
    const f=e.target.files?.[0]; if(!f) return;
    try{
      const text=await f.text(); const obj=JSON.parse(text);
      if(obj.settings) Object.assign(SETTINGS, obj.settings);
      if(obj.state)    Object.assign(STATE, obj.state);
      store('bb.settings', SETTINGS); store('bb.state', STATE);
      applySettings(); money=new Intl.NumberFormat(undefined,{style:'currency', currency:SETTINGS.currency});
      renderAll(); toast('Import complete');
    }catch(err){ alert('Import failed: '+(err?.message||err)); }
    e.target.value='';
  }

  // Utils
  function emptyMonth(){ return { incomes:[], budgets:{}, transactions:[], savings:[], debtExtra:[] }; }
  function current(){ return STATE.months[monthPicker.value]; }
  function ensure(key){ STATE.months[key] = STATE.months[key] || emptyMonth(); }
  function load(key, fallback){ try{return Object.assign({}, fallback, JSON.parse(localStorage.getItem(key)||'{}'));}catch{return {...fallback};} }
  function store(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  function save(){ store('bb.state', STATE); }
  function applySettings(){ document.documentElement.style.setProperty('--brand', SETTINGS.brand); document.documentElement.classList.toggle('compact', SETTINGS.density==='compact'); }
  function toast(msg){ const s=$('#status'); if(!s) return; s.textContent=msg; clearTimeout(toast._t); toast._t=setTimeout(()=>s.textContent='', 2500); }
  function totalSaved(goalId){ let t=0; for(const m of Object.values(STATE.months)){ for(const s of m.savings){ if(s.goalId===goalId) t+=s.amount; } } return t; }
  function guessCurrency(){ try{const r=(Intl.DateTimeFormat().resolvedOptions().locale||'en-US').split('-').pop()||'US'; return ({US:'USD',CA:'CAD',GB:'GBP',AU:'AUD',NZ:'NZD',EU:'EUR',IE:'EUR',DE:'EUR',FR:'EUR',ES:'EUR',IT:'EUR',IN:'INR',JP:'JPY',SG:'SGD',HK:'HKD',MX:'MXN',BR:'BRL',ZA:'ZAR'}[r]||'USD'); }catch{ return 'USD'; } }
})();
