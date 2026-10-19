'use strict';

/* Paigaldamise kasutajaliides. Ei muuda kontosid, WOD-e ega registreerimisi. */
(function(){
  const APP_URL='https://karlkirch.github.io/Crossfit/';
  const GUIDE_ID='crossfitInstallGuide';
  const DISMISSED_KEY='crossfit_install_banner_dismissed_v1';
  const downloadIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/></svg>';

  function installed(){
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone===true;
  }

  function device(){
    const ua=navigator.userAgent||'';
    const ios=/iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const android=/Android/i.test(ua);
    const inApp=/FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|TikTok|Snapchat|Line\/|;\s*wv[);]|WebView/i.test(ua);
    const safari=ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
    return {ios,android,inApp,safari};
  }

  function hasDismissed(){
    try{return localStorage.getItem(DISMISSED_KEY)==='1'}catch(_){return false}
  }

  function dismissBanner(){
    try{localStorage.setItem(DISMISSED_KEY,'1')}catch(_){}
    document.querySelectorAll('.install-promo').forEach(el=>el.remove());
  }

  function authCard(){
    if(installed())return '';
    return '<section class="install-auth-card" aria-label="CrossFiti paigaldamine">' +
      '<div class="install-auth-icon">'+downloadIcon+'</div>' +
      '<div class="install-auth-copy"><strong>CrossFit telefoni avakuvale</strong>' +
      '<span>Ava järgmine kord ühe puudutusega – paigaldamine on tasuta.</span></div>' +
      '<button type="button" class="btn btn-primary install-auth-action" onclick="installApp()">Paigalda</button>' +
      '</section>';
  }

  function banner(){
    if(installed()||hasDismissed())return '';
    return '<section class="install-promo" aria-label="Paigalda rakendus">' +
      '<div class="install-promo-icon">'+downloadIcon+'</div>' +
      '<div class="install-promo-copy"><strong>Lisa CrossFit avakuvale</strong>' +
      '<span>Kiirem ligipääs treeningutele ja registreerimisele.</span></div>' +
      '<button type="button" class="install-promo-button" onclick="installApp()">Paigalda</button>' +
      '<button type="button" class="install-promo-dismiss" aria-label="Peida paigaldamiskutse" onclick="crossfitInstall.dismissBanner()">×</button>' +
      '</section>';
  }

  function moreItem(){
    if(installed())return '';
    return '<button class="menu-item" onclick="installApp()"><div class="menu-main">' +
      '<div class="menu-icon">'+downloadIcon+'</div><div><div class="menu-label">Paigalda rakendus</div>' +
      '<div class="menu-desc">Lisa CrossFit telefoni avakuvale</div></div></div><span class="chev">›</span></button>';
  }

  function guideContent(d){
    let title='Paigalda CrossFit';
    let intro='Paigaldamine toimub sinu seadme brauseri kaudu.';
    let steps=[];
    let openButton='';
    if(d.android && d.inApp){
      title='Ava CrossFit Chrome’is';
      intro='Messenger, Facebook või muu rakendusesisene brauser ei pruugi lubada paigaldamist.';
      steps=[
        'Vajuta all „Ava Chrome’is“. Kui see ei ava Chrome’i, kopeeri link ja ava see Chrome’is.',
        'Vajuta Chrome’i menüüs kolme punkti (⋮).',
        'Vali „Installi rakendus“ või „Lisa avakuvale“ ja kinnita.'
      ];
      openButton='<button class="btn btn-primary btn-block" type="button" onclick="crossfitInstall.openChrome()">Ava Chrome’is</button>';
    }else if(d.ios && (d.inApp||!d.safari)){
      title='Ava CrossFit Safaris';
      intro='Kõige kindlam viis on avada rakendus Safari brauseris.';
      steps=[
        'Ava menüüst „Ava brauseris“ või kopeeri allolev link ja kleebi see Safari aadressiribale.',
        'Vajuta Safaris jagamise ikooni (ruut ja nool).',
        'Vali „Lisa avakuvale“ ning vajuta „Lisa“.'
      ];
    }else if(d.ios){
      title='Lisa CrossFit iPhone’i avakuvale';
      steps=[
        'Vajuta Safari jagamise ikooni (ruut ja üles suunatud nool).',
        'Vali „Lisa avakuvale“.',
        'Vajuta „Lisa“. CrossFiti ikoon ilmub avakuvale.'
      ];
    }else if(d.android){
      title='Paigalda CrossFit Androidile';
      intro='Kui automaatset paigaldusakent ei näidata, saad rakenduse lisada brauseri menüüst.';
      steps=[
        'Ava see leht Chrome’is (või teises paigaldamist toetavas brauseris).',
        'Vajuta brauseri kolme punkti menüüd (⋮).',
        'Vali „Installi rakendus“ või „Lisa avakuvale“ ja kinnita.'
      ];
    }else{
      title='Paigalda CrossFit arvutisse';
      steps=[
        'Ava CrossFit Chrome’is või Edge’is.',
        'Vali aadressiriba paigaldusikoon või menüü valik „Installi rakendus“.',
        'Kinnita paigaldamine.'
      ];
    }
    const list=steps.map((step,i)=>'<li><span class="install-step-index">'+(i+1)+'</span><span>'+step+'</span></li>').join('');
    return '<div class="install-guide-hero">'+downloadIcon+'<h2 id="installGuideHeading">'+title+'</h2>' +
      '<p>'+intro+'</p></div><ol class="install-steps">'+list+'</ol>' +
      '<div class="install-guide-actions">'+openButton+
      '<button class="btn btn-soft btn-block" type="button" onclick="crossfitInstall.copyLink()">Kopeeri CrossFiti link</button></div>' +
      '<p class="install-guide-note">CrossFit ei ole praegu Google Play või App Store’i poeäpp. Avakuva ikoon luuakse veebirakendusele.</p>';
  }

  function closeGuide(){
    document.getElementById(GUIDE_ID)?.remove();
  }

  function openGuide(){
    if(installed()){
      closeGuide();
      window.toast?.('CrossFit on juba paigaldatud');
      return;
    }
    closeGuide();
    document.body.insertAdjacentHTML('beforeend',
      '<div id="'+GUIDE_ID+'" class="install-guide-overlay" role="presentation" onclick="if(event.target===this)crossfitInstall.closeGuide()">' +
      '<section class="install-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="installGuideHeading">' +
      '<button class="install-guide-close" type="button" aria-label="Sulge juhend" onclick="crossfitInstall.closeGuide()">×</button>' +
      guideContent(device())+'</section></div>');
    document.querySelector('.install-guide-close')?.focus();
  }

  async function request(){
    if(installed()){
      window.toast?.('CrossFit on juba paigaldatud');
      return;
    }
    const d=device();
    const promptEvent=window.state?.installPrompt;
    if(promptEvent && !d.inApp && !d.ios){
      try{
        window.state.installPrompt=null;
        await promptEvent.prompt();
        const result=await promptEvent.userChoice;
        if(result?.outcome==='accepted')return;
      }catch(error){
        console.warn('CrossFit: paigaldusdialoog ei avanenud',error);
      }
    }
    openGuide();
  }

  async function copyLink(){
    try{
      await navigator.clipboard.writeText(APP_URL);
      window.toast?.('CrossFiti link kopeeritud');
    }catch(_){
      window.prompt('Kopeeri CrossFiti link:',APP_URL);
    }
  }

  function openChrome(){
    const d=device();
    if(!d.android)return copyLink();
    const fallback=encodeURIComponent(APP_URL);
    const target='intent://'+location.host+location.pathname+
      '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+fallback+';end';
    location.href=target;
  }

  window.crossfitInstall={installed,authCard,banner,moreItem,dismissBanner,request,openGuide,closeGuide,copyLink,openChrome};
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && document.getElementById(GUIDE_ID))closeGuide();
  });
  window.addEventListener('appinstalled',()=>{
    closeGuide();
    document.querySelectorAll('.install-promo,.install-auth-card').forEach(el=>el.remove());
  });
})();