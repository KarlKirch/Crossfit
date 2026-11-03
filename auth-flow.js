'use strict';
(function(){
  let method='email';
  let linkSent=false;
  let email='';
  let lastSent=0;
  let busy=false;
  let adapter=null;

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function message(text,bad=false){
    const el=document.getElementById('authMessage');
    if(el)el.innerHTML=text?`<div class="notice ${bad?'bad':''}">${esc(text)}</div>`:'';
  }
  function errorMessage(error){
    const msg=String(error?.message||error||'');
    if(/rate limit|too many requests|429|security purposes.*seconds/i.test(msg))return 'Liiga palju päringuid. Oota mõni minut ja proovi uuesti.';
    if(/invalid|expired|otp_expired/i.test(msg))return 'Sisselogimiskood on vigane või aegunud. Proovi uut koodi.';
    return 'E-postiga sisselogimine ei õnnestunud. Proovi uuesti või kasuta parooli.';
  }
  function render(mode,installCard=''){
    const signup=mode==='signup';
    const emailMode=!signup&&method==='email';
    const switcher=signup?'':`<div class="auth-method-switch" role="group" aria-label="Sisselogimise viis">
      <button type="button" class="${emailMode?'on':''}" aria-pressed="${emailMode}" onclick="crossfitAuth.setMethod('email')">E-posti lingiga</button>
      <button type="button" class="${emailMode?'':'on'}" aria-pressed="${!emailMode}" onclick="crossfitAuth.setMethod('password')">Parooliga</button>
    </div>`;
    const form=signup||!emailMode
      ?`<form class="form" onsubmit="event.preventDefault();submitAuth()">
        ${signup?'<div class="field"><label for="authName">Ees- ja perekonnanimi</label><input id="authName" autocomplete="name" required></div>':''}
        <div class="field"><label for="authEmail">E-posti aadress</label><input id="authEmail" type="email" inputmode="email" autocomplete="email" required></div>
        <div class="field"><label for="authPassword">Parool</label><input id="authPassword" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="6" required></div>
        ${signup?'<div class="field"><label for="authReason">Miks soovid liituda? (vabatahtlik)</label><textarea id="authReason" maxlength="300" rows="3" placeholder="Näiteks soovin osaleda CrossFiti treeningutel"></textarea></div>':''}
        <button id="authSubmitBtn" class="btn btn-primary btn-block" type="submit">${signup?'Loo konto':'Logi sisse'}</button>
        ${signup?'<p class="auth-field-note">Pärast konto loomist saadetakse liitumistaotlus treenerile. E-posti kinnitamise lisasammu ei ole vaja. Kasuta õiget e-posti aadressi konto taastamiseks.</p>':''}
      </form>`
      :linkSent
       ?`<div class="auth-email-confirm">
          <div class="auth-email-confirm-icon" aria-hidden="true">✓</div>
          <h2>Kontrolli oma postkasti</h2>
          <p>Saadsime sisselogimislingi aadressile <strong>${esc(email)}</strong>.</p>
          <p>Ava kirjas olev link. Kui e-kirjas on hoopis kuuekohaline kood, saad selle allpool sisestada.</p>
          <details class="auth-code-details"><summary>Mul on 6-kohaline kood</summary>
            <form class="form" onsubmit="event.preventDefault();crossfitAuth.verifyCode()">
              <div class="field"><label for="authCode">E-kirjaga saadud kood</label><input id="authCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required></div>
              <button id="authVerifyBtn" type="submit" class="btn btn-primary btn-block">Kinnita kood</button>
            </form>
          </details>
          <div class="auth-email-actions">
            <button id="authResendBtn" type="button" class="btn btn-soft" onclick="crossfitAuth.sendLink(true)">Saada uuesti</button>
            <button type="button" class="btn btn-outline" onclick="crossfitAuth.reset()">Muuda aadressi</button>
          </div>
        </div>`
       :`<form class="form" onsubmit="event.preventDefault();crossfitAuth.sendLink()">
          <div class="field"><label for="authEmail">E-posti aadress</label><input id="authEmail" type="email" autocomplete="email" inputmode="email" placeholder="nimi@näide.ee" value="${esc(email)}" required></div>
          <button id="authEmailSendBtn" type="submit" class="btn btn-primary btn-block">Saada sisselogimislink</button>
          <p class="auth-field-note">Parooli pole vaja. Saad e-kirja turvalise sisselogimislingiga.</p>
        </form>`;
    const joinGuide=`<section class="auth-join-guide" aria-labelledby="authJoinTitle">
        <h2 id="authJoinTitle">Kuidas Rõuge CrossFitiga liituda?</h2>
        <ol class="auth-join-steps">
          <li>Vali „Loo konto“ ning sisesta nimi, e-posti aadress ja parool.</li>
          <li>Liitumistaotlus jõuab automaatselt treenerile.</li>
          <li>Treener kinnitab sinu kasutajakonto.</li>
          <li>Pärast kinnitamist logi sisse ja registreeru treeningule.</li>
        </ol>
        <p class="auth-join-note">Konto loomiseks ei pea e-posti kinnituskirja avama.</p>
      </section>`;
    return `<div class="auth"><div class="auth-box">
      <div class="auth-logo" role="img" aria-label="Rõuge CrossFit logo"></div><h1>Rõuge CrossFit</h1>
      <p class="auth-intro">Treeningud, registreerimine ja treeningkrediit ühes kohas.</p>
      <div class="auth-card"><div class="tabs">
        <button type="button" class="${signup?'':'on'}" onclick="setAuthMode('login')">Logi sisse</button>
        <button type="button" class="${signup?'on':''}" onclick="setAuthMode('signup')">Loo konto</button>
      </div>${switcher}<div id="authMessage" role="status" aria-live="polite"></div>${form}${joinGuide}</div>
      ${installCard}
    </div></div>`;
  }
  function setMethod(next){
    method=next==='password'?'password':'email';
    linkSent=false;
    window.setAuthMode('login');
  }
  function reset(){
    email='';
    linkSent=false;
    window.setAuthMode('login');
  }
  async function sendLink(resend=false){
    if(busy||!adapter)return;
    const target=(resend?email:document.getElementById('authEmail')?.value||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)){message('Sisesta korrektne e-posti aadress.',true);return}
    if(resend && Date.now()-lastSent<60000){message('Uut linki saab saata umbes minuti pärast.',true);return}
    const btn=document.getElementById(resend?'authResendBtn':'authEmailSendBtn');
    busy=true;
    if(btn)btn.disabled=true;
    message('Saadan sisselogimislinki…');
    try{
      await adapter.send(target);
      email=target;
      linkSent=true;
      lastSent=Date.now();
      window.setAuthMode('login');
    }catch(e){message(errorMessage(e),true)}
    finally{busy=false;if(btn?.isConnected)btn.disabled=false}
  }
  async function verifyCode(){
    if(busy||!adapter)return;
    const code=document.getElementById('authCode')?.value.trim()||'';
    if(!/^\d{6}$/.test(code)){message('Sisesta kuuekohaline kood.',true);return}
    const btn=document.getElementById('authVerifyBtn');
    busy=true;
    if(btn)btn.disabled=true;
    message('Kontrollin koodi…');
    try{
      const session=await adapter.verify(email,code);
      await adapter.complete(session);
      linkSent=false;
    }catch(e){message(errorMessage(e),true)}
    finally{busy=false;if(btn?.isConnected)btn.disabled=false}
  }
  window.crossfitAuth={render,setMethod,reset,sendLink,verifyCode,configure(value){adapter=value}};
})();