'use strict';

/* Selge kolmene treenija menüü ja neljane treeneri menüü.
 * Laetakse pärast olemasolevaid täiendusi, et krediidid, mallid ja WOD-pank säiliksid.
 */
(function(){
  const s=window.state;
  if(!s || !window.renderMine || !window.renderTrainings || !window.renderMore)return;

  const previousMine=window.renderMine;
  const previousTrainings=window.renderTrainings;
  const previousMore=window.renderMore;

  const icons={
    bell:'<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 20h4"/></svg>',
    share:'<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.6 6.6-4m-6.6 6.8 6.6 4"/></svg>',
    info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9.5h.01"/></svg>',
    exit:'<svg viewBox="0 0 24 24"><path d="M10 5H5v14h5m4-11 4 4-4 4m4-4H9"/></svg>',
    bank:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>'
  };

  function menu(label,details,onclick,svg){
    return '<button type="button" class="menu-item" onclick="'+onclick+'">'+
      '<div class="menu-main"><div class="menu-icon">'+svg+'</div><div>'+
      '<div class="menu-label">'+label+'</div>'+
      '<div class="menu-desc">'+details+'</div></div></div><span class="chev" aria-hidden="true">›</span></button>';
  }

  function accountSettings(){
    const install=window.crossfitInstall?.moreItem?.()||'';
    const rows=menu('Teavitused','Vaata sõnumeid ja määra teavituste luba',"go('notifications')",icons.bell)+
      menu('Kutsu sõber','Jaga treeningurakenduse linki','openShare()',icons.share)+
      install+
      menu('Rakenduse info','Versioon ja kasutustingimused','openInfo()',icons.info)+
      menu('Logi välja','Lõpeta selle seadme sessioon','logout()',icons.exit);
    return '<details class="account-settings card"><summary>Konto ja seaded <span aria-hidden="true">⌄</span></summary>'+
      '<div class="menu-list account-settings-menu">'+rows+'</div></details>';
  }

  window.renderMine=function(){
    const content=previousMine();
    if(window.isTrainer())return content;
    const settings=accountSettings();
    const before='<div class="section"><h2>Krediidi ajalugu</h2>';
    return content.includes(before) ? content.replace(before,settings+before) : content+settings;
  };

  window.renderTrainings=function(){
    const content=previousTrainings();
    if(!window.isTrainer())return content;
    const rows=s.wodBank||[];
    const pending=rows.filter(e=>e.status==='pending').length;
    const review=rows.filter(e=>e.status==='review').length;
    const summary=[pending?pending+' töötlemata':'',review?review+' kinnitamata':''].filter(Boolean).join(' · ')||
      rows.length+' kirjet';
    const entry=menu('WOD-pank','Treeningutekstid ja originaalfotod · '+summary,'openWodBank()',icons.bank);
    const tools='<div class="trainer-wod-entry"><div class="section"><h2>Treeningute tööriistad</h2></div>'+
      '<div class="menu-list">'+entry+'</div></div>';
    const section='<div class="segment">';
    return content.includes(section)?content.replace(section,tools+section):tools+content;
  };

  window.renderMore=function(){
    let content=previousMore();
    if(!window.isTrainer())return content;
    // WOD-pangal on nüüd oma koht „Treeningud“ vaates. Ära dubleeri „Haldus“ vaates.
    const from='<button class="menu-item" onclick="openWodBank()">';
    const start=content.indexOf(from);
    if(start>=0){
      const end=content.indexOf('</button>',start);
      if(end>=0)content=content.slice(0,start)+content.slice(end+'</button>'.length);
    }
    content=content.replace('<h1 class="page-title">Veel</h1>','<h1 class="page-title">Haldus</h1>');
    content=content.replace('Profiil, jagamine ja rakenduse seaded.','Treeneri tööriistad, jagamine ja seaded.');
    return content;
  };
})();
