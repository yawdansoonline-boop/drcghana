/* DRC Block Calculator – App Logic v2 */
(function(){
  'use strict';

  // ── BLOCK REFERENCE DATA ──
  const BLOCKS = [
    {id:1, name:'6" Hollow (GH)',   l:450, h:225},
    {id:2, name:'9" Hollow (GH)',   l:450, h:225},
    {id:3, name:'5" Solid (GH)',    l:450, h:225},
    {id:4, name:'6" Solid (GH)',    l:450, h:225},
    {id:5, name:'US CMU 16"×8"',   l:390, h:190},
    {id:6, name:'UK 440×215',      l:440, h:215},
    {id:7, name:'Large 600×250',   l:600, h:250},
    {id:8, name:'Custom',          l:0,   h:0},
  ];

  // ── LOCAL STORAGE KEYS ──
  const LS_CALC = 'drc_calc_inputs';
  const LS_TRACKER = 'drc_tracker_inputs';

  // ── HELPER: get value from input, return 0 if empty ──
  function v(id){ const el=document.getElementById(id); return el? parseFloat(el.value)||0 : 0; }
  function s(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

  // ── SAVE / LOAD CALCULATOR INPUTS ──
  function saveCalcInputs(){
    const data = {};
    const ids = ['blockType','customLen','customHt','mortar',
      'w1l','w1h','w2l','w2h','w3l','w3h','w4l','w4h',
      'doorN','doorW','doorH','winN','winW','winH','otherOpen',
      'wastage','price','delivered','used','remaining'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if(el) data[id] = el.value;
    });
    try{ localStorage.setItem(LS_CALC, JSON.stringify(data)); }catch(e){}
  }

  function loadCalcInputs(){
    try{
      const raw = localStorage.getItem(LS_CALC);
      if(!raw) return;
      const data = JSON.parse(raw);
      Object.keys(data).forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = data[id];
      });
    }catch(e){}
  }

  // ── SAVE / LOAD TRACKER INPUTS ──
  function saveTrackerInputs(){
    const rows = [];
    document.querySelectorAll('#page-tracker .tracker-table tbody tr').forEach(tr=>{
      const inputs = tr.querySelectorAll('input');
      const row = {};
      inputs.forEach((inp,i)=>{ row['i'+i]=inp.value; });
      rows.push(row);
    });
    try{ localStorage.setItem(LS_TRACKER, JSON.stringify(rows)); }catch(e){}
  }

  function loadTrackerInputs(){
    try{
      const raw = localStorage.getItem(LS_TRACKER);
      if(!raw) return;
      const rows = JSON.parse(raw);
      const trs = document.querySelectorAll('#page-tracker .tracker-table tbody tr');
      rows.forEach((row,idx)=>{
        if(!trs[idx]) return;
        const inputs = trs[idx].querySelectorAll('input');
        Object.keys(row).forEach(k=>{
          const i = parseInt(k.replace('i',''));
          if(inputs[i]) inputs[i].value = row[k];
        });
      });
    }catch(e){}
  }

  // ── CALCULATE ──
  function calculate(){
    const bt = parseInt(document.getElementById('blockType').value)||1;

    let bL, bH;
    if(bt===8){
      bL = v('customLen');
      bH = v('customHt');
      if(!bL||!bH){s('faceArea','—');s('bpsm','—');s('totalArea','—');s('deduction','—');s('netArea','—');s('netBlocks','—');s('wasteBlocks','—');s('totalBlocks','—');s('totalCost','—');saveCalcInputs();return;}
    } else {
      const blk = BLOCKS.find(b=>b.id===bt);
      bL = blk.l; bH = blk.h;
      s('blockLen',bL); s('blockHt',bH);
    }

    const mort = v('mortar');
    const faceArea = (bL+mort)*(bH+mort)/1e6;
    const bpsm = 1/faceArea;

    s('faceArea', faceArea.toFixed(5));
    s('bpsm', bpsm.toFixed(1));

    // Walls
    const area =
      v('w1l')*v('w1h') + v('w2l')*v('w2h') +
      v('w3l')*v('w3h') + v('w4l')*v('w4h');
    s('totalArea', area.toFixed(2));

    // Deductions
    const ded = v('doorN')*v('doorW')*v('doorH') + v('winN')*v('winW')*v('winH') + v('otherOpen');
    s('deduction', ded.toFixed(2));

    // Net area
    const net = Math.max(0, area - ded);
    s('netArea', net.toFixed(2));

    // Blocks
    const netBlocks = Math.round(net * bpsm);
    const wastPct = v('wastage');
    const wasteBlocks = Math.round(netBlocks * wastPct/100);
    const totalBlocks = netBlocks + wasteBlocks;

    s('netBlocks', netBlocks.toLocaleString());
    s('wasteBlocks', wasteBlocks.toLocaleString());
    s('totalBlocks', totalBlocks.toLocaleString());

    // Cost
    const price = v('price');
    if(price>0){
      s('totalCost', (totalBlocks*price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));
    } else {
      s('totalCost','—');
    }

    // Monitoring
    const del = v('delivered'), used = v('used'), rem = v('remaining');
    if(del>0){
      s('delVsEst', (del/totalBlocks*100).toFixed(1)+'%');
      s('shortSurp', (del-totalBlocks).toLocaleString());
    }
    if(used>0){
      s('useVsEst', (used/totalBlocks*100).toFixed(1)+'%');
    }
    if(del>0 && used>0 && rem>0){
      s('unaccounted', (del-used-rem).toLocaleString());
    }

    // Save inputs after every calculation
    saveCalcInputs();
  }

  function resetOutputs(){
    ['faceArea','bpsm','totalArea','deduction','netArea','netBlocks','wasteBlocks','totalBlocks','totalCost','delVsEst','useVsEst','shortSurp','unaccounted'].forEach(id=>s(id,'—'));
  }

  // ── BLOCK TYPE CHANGE ──
  function onBlockTypeChange(){
    const bt = parseInt(document.getElementById('blockType').value)||1;
    const customRows = document.getElementById('customRows');
    if(bt===8){
      customRows.style.display='block';
      const cr2=document.getElementById('customRows2');
      if(cr2) cr2.style.display='block';
    } else {
      customRows.style.display='none';
      const cr2=document.getElementById('customRows2');
      if(cr2) cr2.style.display='none';
      const blk = BLOCKS.find(b=>b.id===bt);
      if(blk){ s('blockLen',blk.l); s('blockHt',blk.h); }
    }
    calculate();
  }

  // ── TRACKER AUTO-CALCULATE ──
  function calcTracker(){
    let runningBalance = 0;
    document.querySelectorAll('#page-tracker .tracker-table tbody tr').forEach(tr=>{
      const inputs = tr.querySelectorAll('input');
      const del = parseFloat(inputs[1]?.value)||0;
      const used = parseFloat(inputs[2]?.value)||0;
      runningBalance += del - used;
      const remCell = tr.querySelector('.remaining');
      if(remCell){
        if(del>0 || used>0){
          remCell.textContent = runningBalance.toLocaleString();
          remCell.style.color = runningBalance < 0 ? '#C00000' : '#006100';
        } else {
          remCell.textContent = '—';
          remCell.style.color = '#006100';
        }
      }
    });
    saveTrackerInputs();
  }

  // ── TABS ──
  function switchTab(tab){
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('page-'+tab).classList.add('active');
  }

  // ── INIT ──
  function init(){
    // Load saved inputs first
    loadCalcInputs();
    loadTrackerInputs();

    // Bind all calculator inputs
    document.querySelectorAll('#page-calc input, #page-calc select').forEach(el=>{
      el.addEventListener('input', calculate);
      el.addEventListener('change', calculate);
    });

    // Block type change
    const btSel = document.getElementById('blockType');
    if(btSel){
      btSel.addEventListener('change', onBlockTypeChange);
      btSel.addEventListener('input', onBlockTypeChange);
    }

    // Bind tracker inputs
    document.querySelectorAll('#page-tracker .tracker-table input').forEach(el=>{
      el.addEventListener('input', calcTracker);
      el.addEventListener('change', calcTracker);
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(t=>{
      t.addEventListener('click',()=>switchTab(t.dataset.tab));
    });

    // Initial calculation
    onBlockTypeChange();
    calcTracker();

    // Service worker (relative path works on GitHub Pages & Netlify)
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }

    // Install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e=>{
      e.preventDefault();
      deferredPrompt = e;
      const banner = document.getElementById('installBanner');
      if(banner) banner.classList.add('show');
      const installBtn = document.getElementById('installBtn');
      if(installBtn) installBtn.addEventListener('click',()=>{
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(()=>{deferredPrompt=null;banner.classList.remove('show');});
      });
      const closeBtn = document.getElementById('closeBanner');
      if(closeBtn) closeBtn.addEventListener('click',()=>banner.classList.remove('show'));
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
