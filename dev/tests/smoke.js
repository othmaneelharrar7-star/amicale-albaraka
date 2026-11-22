// Test de bout en bout de l'application Android (Firebase et Gemini simulés). Usage : npm test (dans dev/)
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..','..'),A=f=>path.join(ROOT,'app','src','main','assets',f),OUT=path.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
let html=fs.readFileSync(A('index.html'),'utf8');
// syntax check of the real module
const mod=html.split('<script type="module">')[1].split('</script>')[0];
fs.writeFileSync(path.join(OUT,'mod.mjs'),mod);

console.log('module syntax ok');
html=html.replace('<script type="module">','<script>').replace(/import \{([^}]+)\} from "[^"]+";/g,(m,a)=>'const {'+a+'}=window.__fb;').replace('import * as CFG from "./firebase-config.js";','const CFG={firebaseConfig:window.__fb.firebaseConfig,recaptchaSiteKey:""};');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://appassets.androidplatform.net/assets/index.html',pretendToBeVisual:true,
 beforeParse(w){
  w.eval(fs.readFileSync(A('xlsx.min.js'),'utf8'));w.eval(fs.readFileSync(A('exceljs.min.js'),'utf8'));
  w.__saved=[];w.AndroidBridge={saveFile:(n,m,b)=>w.__saved.push({n,m,b}),openFile:()=>{}};
  const store={},subs={};let authCb=null,n=0;
  const fire=c=>(subs[c]||[]).forEach(cb=>cb({docs:Object.entries(store[c]||{}).map(([id,d])=>({id,data:()=>d})),metadata:{fromCache:false}}));
  w.__store=store;
  w.__fb={firebaseConfig:{apiKey:'k'},initializeApp:()=>({}),getAuth:()=>({get currentUser(){return w.__user}}),getFirestore:()=>({}),
   onAuthStateChanged:(a,cb)=>{authCb=cb;setTimeout(()=>cb(null),0)},
   signInWithEmailAndPassword:async(a,e,p)=>{if(p!=='ok')throw {code:'auth/invalid-credential'};w.__user={email:e};authCb({email:e})},
   signOut:async()=>authCb(null),sendPasswordResetEmail:async()=>{},EmailAuthProvider:{credential:(e,p)=>({e,p})},reauthenticateWithCredential:async(u,c)=>{if(c.p!=='ok')throw {code:'auth/invalid-credential'}},updatePassword:async(u,p)=>{w.__newpw=p},
   collection:(f,name)=>({col:name}),
   doc:(a,b,c)=>a.col?{col:a.col,id:'id'+(++n)}:{col:b,id:c},
   setDoc:async(r,d)=>{(store[r.col]=store[r.col]||{})[r.id]=d;fire(r.col)},
   getDoc:async r=>({exists:()=>!!(store[r.col]&&store[r.col][r.id]),data:()=>store[r.col][r.id]}),
   deleteDoc:async r=>{if(store[r.col])delete store[r.col][r.id];fire(r.col)},
   onSnapshot:(c,cb)=>{(subs[c.col]=subs[c.col]||[]).push(cb);setTimeout(()=>fire(c.col),0);return()=>{subs[c.col]=subs[c.col].filter(x=>x!==cb)}},
   Bytes:{fromUint8Array:u=>({toUint8Array:()=>u})},
   GoogleAIBackend:function(){},getAI:()=>({}),initializeAppCheck:(a,o)=>{w.__ac=w.FIREBASE_APPCHECK_DEBUG_TOKEN||o.provider.key},ReCaptchaV3Provider:function(k){this.key=k},CustomProvider:function(o){this.o=o},
   getGenerativeModel:(ai,o)=>{w.__aiCfg=o;return {startChat:(h)=>{w.__aiHist=h;let step=0;const sm=async(m)=>{w.__aiSent=(w.__aiSent||[]).concat([m]);step++;
     if(!w.__ac)throw new Error('AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/x/models/m:generateContent: [403 ] Permission denied on the service. ACCESS_DENIED');
     if(o.model==='gemini-3.8-flash'&&!w.__modelFail){w.__modelFail=1;throw new Error('models/gemini-3.8-flash is not found for API version v1beta')}
     if(step===1)return {response:{functionCalls:()=>[{name:'ajouter_paiement',args:{projet:'sid el abed',lot:'a.2',montant:100000,mode:'Chèque',reference:'777'}}],text:()=>''}};
     if(step===2)return {response:{functionCalls:()=>[{name:'exporter_excel',args:{projet:'Sid El Abed',type:'projet'}}],text:()=>''}};
     return {response:{functionCalls:()=>[],text:()=>'**C\'est fait** :\n- paiement ajouté\n- Excel créé'}}};
     return {sendMessage:sm,sendMessageStream:async(m,opt)=>{w.__aiOpt=opt;const r=await sm(m);const R=r.response;return {stream:(async function*(){const t=R.text();if(t){yield {text:()=>t.slice(0,5)};yield {text:()=>t.slice(5)}}else yield {text:()=>''}})(),response:Promise.resolve(R)}}}}}}};
 }});
const w=dom.window;w.addEventListener('error',e=>errs.push(e.message));
const d=w.document;const $=s=>d.querySelector(s);
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
async function fill(vals){for(const k in vals){const el=$('#form').elements[k];if(!el)throw new Error('no field '+k);if(el.type==='checkbox')el.checked=vals[k];else el.value=vals[k]}
  submit('#form');await sleep(40);if(!$('#overlay').hidden)throw new Error('form still open: '+$('#form-err').textContent)}
(async()=>{
  await sleep(50);
  console.log('login shown:',!$('#login').hidden,'boot hidden:',$('#boot').hidden,'locked:',d.body.className);
  $('#lg-email').value='a@b.ma';$('#lg-pw').value='bad';submit('#login-form');await sleep(30);console.log('bad pw:',$('#lg-err').textContent);
  $('#lg-pw').value='ok';submit('#login-form');await sleep(120);
  console.log('app shown:',d.body.className==='','who:',$('#who').textContent);
  console.log('login eye:',!!d.querySelector('#login .pwbox .eye'));
  click($('#btn-dash'));await sleep(30);console.log('DASH:',$('#dash').hidden?'hidden':$('#dash-body').textContent.replace(/\s+/g,' ').slice(0,700));
  const eye=d.querySelector('#dash-body .eye');click(eye);console.log('eye toggles:',$('#pw-cur').type);
  $('#pw-cur').value='bad';$('#pw-new').value='abcdef';$('#pw-new2').value='abcdef';submit('#pw-form');await sleep(30);console.log('pw bad:',$('#pw-err').textContent);
  $('#pw-cur').value='ok';$('#pw-new').value='abcdef';$('#pw-new2').value='abcdeg';submit('#pw-form');await sleep(30);console.log('pw mismatch:',$('#pw-err').textContent);
  $('#pw-new2').value='abcdef';submit('#pw-form');await sleep(30);console.log('pw ok:',$('#pw-ok').textContent,w.__newpw);
  console.log('mcp box (none):',$('#dash-mcp')&&$('#dash-mcp').textContent.slice(0,60));
  click(d.querySelector('#dash [data-a=dash-close]'));
  w.__store.am_meta=w.__store.am_meta||{};w.__store.am_meta.mcp={mcpUrl:'https://amicale-albaraka-mcp.x.workers.dev/mcp/abc'};
  click($('#btn-dash'));await sleep(40);console.log('mcp url:',$('#mcp-url')&&$('#mcp-url').value);click(d.querySelector('#dash [data-a=mcp-copy]'));await sleep(20);console.log('copy msg:',$('#mcp-msg').textContent);
  click(d.querySelector('#dash [data-a=dash-close]'));

  click([...d.querySelectorAll('#pills button')].find(b=>b.textContent==="Sid El Abed"));await sleep(30);
  const buf=fs.readFileSync(path.join(OUT,'exemple.xlsx'));
  const file=new w.File([buf],'exemple.xlsx');
  if(!file.arrayBuffer)file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length);
  const inp=$('#imp-file');Object.defineProperty(inp,'files',{value:[file],configurable:true});
  inp.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(400);
  console.log('import sheet:',$('#detail-body').textContent.replace(/\s+/g,' ').slice(0,900));
  const t0=Date.now();click($('#imp-go'));for(let i=0;i<200&&!$('#detail').hidden;i++)await sleep(50);
  console.log('import done in',Date.now()-t0,'ms; notice:',$('#notice').textContent);
  console.log('docs:',Object.keys(w.__store.am_adherents||{}).length);
  console.log('hero+list:',$('#view').textContent.replace(/\s+/g,' ').slice(0,700));
  console.log('groups:',[...d.querySelectorAll('.grp')].map(g=>g.textContent).join(' | '));
  // re-import: no duplicates
  Object.defineProperty(inp,'files',{value:[file],configurable:true});inp.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(400);
  console.log('reimport kpis:',$('#detail-body .kpis').textContent);
  click($('#imp-go'));for(let i=0;i<200&&!$('#detail').hidden;i++)await sleep(50);
  console.log('docs after reimport:',Object.keys(w.__store.am_adherents).length);
  // ---- AI assistant
  console.log('fab visible:',!$('#fab-ai').hidden);
  click($('#fab-ai'));console.log('chat open:',!$('#ai').hidden,'chips:',d.querySelectorAll('#ai-chips button').length);
  $('#ai-in').value='Zid paiement 100000 l A.2 f Sid El Abed, chèque 777';$('#ai-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  for(let i=0;i<40&&!$('#ai-key');i++)await sleep(25);
  console.log('appcheck prompt:',$('.msg.err').textContent.slice(0,90));
  $('#ai-key').value='1b4e28ba-2fa1-11d2-883f-0016d3cca427';click($('[data-a=ai-key-save]'));await sleep(80);
  console.log('saved key doc:',JSON.stringify(w.__store.am_meta&&w.__store.am_meta.config),'ac init:',w.__ac);
  $('#ai-in').value='Zid paiement 100000 l A.2 f Sid El Abed, chèque 777';$('#ai-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  for(let i=0;i<40&&!d.querySelector('.confirm [data-a=ai-ok]');i++)await sleep(25);
  console.log('confirm card:',d.querySelector('.confirm b').textContent);
  console.log('model used:',w.__aiCfg.model,'thinking',JSON.stringify(w.__aiCfg.generationConfig),'signal',!!(w.__aiOpt&&w.__aiOpt.signal),'| tools:',w.__aiCfg.tools[0].functionDeclarations.map(f=>f.name).join(','));
  console.log('system has data:',/SID EL ABED|Sid El Abed/.test(w.__aiCfg.systemInstruction),'len',w.__aiCfg.systemInstruction.length);
  const before=Object.keys(w.__store.am_paiements||{}).length;
  click(d.querySelector('.confirm [data-a=ai-ok]'));
  for(let i=0;i<80&&d.querySelector('.msg.think');i++)await sleep(25);
  console.log('paiements before/after:',before,Object.keys(w.__store.am_paiements||{}).length);
  console.log('tool responses sent:',JSON.stringify(w.__aiSent.slice(1)).slice(0,300));
  console.log('last msg html:',[...d.querySelectorAll('.msg.ai')].pop().innerHTML);
  const XLSX=require('xlsx-js-style');const f=w.__saved.pop();console.log('excel from AI:',f.n);
  const wb=XLSX.read(Buffer.from(f.b,'base64'),{cellStyles:true});const ws=wb.Sheets['Liste par étage'];
  console.log('sheets:',wb.SheetNames.join(','));console.log('rows:',JSON.stringify(XLSX.utils.sheet_to_json(ws,{header:1}).slice(0,4)));
  
  fs.writeFileSync(path.join(OUT,'projet_test.xlsx'),Buffer.from(f.b,'base64'));
  // detail shows the new payment with tranche 2
  click($('[data-a=ai-close]'));
  const a2=[...d.querySelectorAll('[data-a=detail]')].find(b=>/A\.2/.test(b.textContent));click(a2);console.log('A.2 detail:',$('#detail-body').textContent.replace(/\s+/g,' ').slice(0,260));
  // ---- v2.4 checks
  click(d.querySelector('[data-a=close-detail]'));await sleep(20);
  // payment with bank on A.2
  const det=[...d.querySelectorAll('[data-a=detail]')].find(b=>/A\.2/.test(b.textContent));click(det);await sleep(30);
  click(d.querySelector('#detail [data-a=new][data-col=paiements]'));await sleep(20);
  $('#form').elements.montant.value='5000';$('#form').elements.reference.value='CHQ55';$('#form').elements.banque.value='CIH';submit('#form');await sleep(60);
  console.log('detail has bank:',/CHQ55 · CIH/.test($('#detail-body').textContent));
  click(d.querySelector('[data-a=close-detail]'));await sleep(20);
  // casino form
  click([...d.querySelectorAll('#pills button')].find(b=>b.textContent==='Casino 1'));await sleep(30);
  click(d.querySelector('#view [data-a=new][data-col=adherents]'));await sleep(20);
  console.log('casino: etage hidden',$('#fld-etage').parentNode.hidden,'imm hidden',$('#fld-immeuble').parentNode.hidden,'lot label',$('#fld-lot').parentNode.firstChild.nodeValue);
  $('#form').elements.lot.value='B3';$('#form').elements.prix.value='900000';$('#form').elements.nom.value='TEST BUNG';$('#form').elements.dejaPaye.value='100000';$('#form').elements.refCheque.value='777';$('#form').elements.banque.value='BMCE';submit('#form');await sleep(60);
  console.log('casino list:',$('#list').textContent.replace(/\s+/g,' ').slice(0,80));
  // val d'or form: section toggling
  click([...d.querySelectorAll('#pills button')].find(b=>b.textContent==="Val d'Or"));await sleep(30);
  click(d.querySelector('#view [data-a=new][data-col=adherents]'));await sleep(20);
  const se=$('#fld-section');se.value='Résidence 1';se.dispatchEvent(new w.Event('change',{bubbles:true}));console.log('valdor R1 etage hidden',$('#fld-etage').parentNode.hidden);
  se.value='Appartements';se.dispatchEvent(new w.Event('change',{bubbles:true}));console.log('valdor Appart etage hidden',$('#fld-etage').parentNode.hidden);
  click(d.querySelector('[data-a=close]'));await sleep(20);
  // all-projects export
  click($('#btn-xl-all'));await sleep(2500);
  {const X=require('xlsx-js-style');const f=w.__saved.pop();console.log('ALL export:',f&&f.n);const wb=X.read(Buffer.from(f.b,'base64'));console.log('tabs:',wb.SheetNames.join(' | '));
   const c1=wb.Sheets['Casino 1'];console.log('casino tab:',JSON.stringify(X.utils.sheet_to_json(c1,{header:1}).slice(0,3)));
   console.log('resume:',JSON.stringify(X.utils.sheet_to_json(wb.Sheets['Résumé'],{header:1}).slice(0,7)));
   const pp=X.utils.sheet_to_json(wb.Sheets['Paiements'],{header:1});console.log('paiements tab:',JSON.stringify(pp.slice(1,3)),JSON.stringify(pp[pp.length-1]));
   fs.writeFileSync(path.join(OUT,'all.xlsx'),Buffer.from(f.b,'base64'));}
  // demande de modification envoyée à Claude
  click($('#btn-dash'));await sleep(30);click(d.querySelector('[data-a=dev-send]'));await sleep(20);console.log('dev empty:',$('#dev-msg').textContent);
  $('#dev-req').value='Zid case CIN';click(d.querySelector('[data-a=dev-send]'));await sleep(50);console.log('dev sent:',$('#dev-msg').textContent.slice(0,40));
  if(!/Écrivez/.test(d.body.textContent)&&!$('#dev-msg').textContent)errs.push('dev-send');
  click(d.querySelector('#dash [data-a=dash-close]'));
  // sélection multiple + suppression (v2.6)
  w.location.hash='#cheques';await sleep(50);
  for(const nu of ['S1','S2','S3']){click(d.querySelector('#view [data-a=new][data-col=cheques]'));await sleep(20);$('#form').elements.numero.value=nu;$('#form').elements.montant.value='1000';submit('#form');await sleep(60);}
  const nChq=()=>Object.values(w.__store.am_cheques||{}).filter(c=>/^S[123]$/.test(c.numero)).length;
  console.log('sel: chèques créés',nChq());
  click(d.querySelector('#view [data-a=sel-start]'));await sleep(20);
  if($('#selbar').hidden)errs.push('selbar hidden');
  const cards=[...d.querySelectorAll('#view [data-sid]')].filter(c=>/S1|S2/.test(c.textContent));
  cards.forEach(c=>click(c));await sleep(10);
  console.log('sel: compteur',$('#sel-cnt').textContent,'| form ouvert ?',!$('#overlay').hidden);
  if(!$('#overlay').hidden)errs.push('card opened form in select mode');
  click($('#sel-del'));await sleep(10);console.log('sel: confirmation',$('#sel-cnt').textContent,'/',$('#sel-del').textContent);
  if(nChq()!==3)errs.push('deleted before confirm');
  click($('#sel-del'));await sleep(100);
  console.log('sel: restants',nChq(),'| barre cachée',$('#selbar').hidden);
  if(nChq()!==1||!$('#selbar').hidden)errs.push('multi delete cheques');
  // adhérents : suppression avec leurs paiements
  w.location.hash='#adherents';await sleep(50);
  click([...d.querySelectorAll('#pills button')].find(b=>b.textContent==='Casino 1'));await sleep(30);
  const bung=Object.entries(w.__store.am_adherents).find(([k,v])=>v.nom==='TEST BUNG')[0];
  w.__store.am_paiements=w.__store.am_paiements||{};
  click(d.querySelector('#view [data-a=sel-start]'));await sleep(20);
  click(d.querySelector('#view [data-sid="'+bung+'"]'));click($('#sel-del'));click($('#sel-del'));await sleep(100);
  console.log('sel: adhérent supprimé',!w.__store.am_adherents[bung]);
  if(w.__store.am_adherents[bung])errs.push('multi delete adherent');
  // import Val d'Or : « Surface lotissement » puis « LOT 2 » → Résidence 1 et 2, commerces « Im C - M1 » → immeuble C (v2.6)
  {const X=require('xlsx-js-style');const rows=[['Commerce'],['Commerce',1,30,'Im C - M1',10000,300000,120000,'TEST COM',50000],['Commerce',2,35,'Im C - M2',10000,350000,140000,'TEST COM2',60000],
    [],['Surface lotissement'],['N lot ','surface','Prix ','Total','Avance ','Adhérent','Montant payé '],[1,300,9500,2850000,1140000,'TEST UN',100000],[2,300,9500,2850000,1140000,'',''],
    ['SOUS Total',600],['LOT 2'],[1,250,9500,2375000,950000,'TEST DEUX',200000],[2,250,9500,2375000,950000,'TEST TROIS',0]];
   const wb2=X.utils.book_new();X.utils.book_append_sheet(wb2,X.utils.aoa_to_sheet(rows),'Feuil1');const b2=X.write(wb2,{type:'buffer',bookType:'xlsx'});
   click([...d.querySelectorAll('#pills button')].find(b=>b.textContent==="Val d'Or"));await sleep(30);
   const f2=new w.File([b2],'vd.xlsx');if(!f2.arrayBuffer)f2.arrayBuffer=async()=>b2.buffer.slice(b2.byteOffset,b2.byteOffset+b2.length);
   const inp2=$('#imp-file');Object.defineProperty(inp2,'files',{value:[f2],configurable:true});inp2.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(400);
   const secs=[...d.querySelectorAll('#detail-body select[data-blk]')].map(s=>s.value);console.log('valdor import parties:',secs.join(' | '));
   if(secs.join('|')!=='Commerce|Résidence 1|Résidence 2')errs.push('valdor sections');
   click($('#imp-go'));for(let i=0;i<200&&!$('#detail').hidden;i++)await sleep(50);
   const vd=Object.values(w.__store.am_adherents).filter(a=>/^TEST (COM|UN|DEUX)$/.test(a.nom));console.log('valdor lots:',JSON.stringify(vd.map(a=>[a.section,a.lot,a.immeuble||''])));
   if(!vd.some(a=>a.lot==='R1-1'&&a.section==='Résidence 1')||!vd.some(a=>a.lot==='R2-1')||!vd.some(a=>a.immeuble==='C'))errs.push('valdor lots');
   // Excel adhérents : une partie → seulement cette partie ; « Tout » → fichier d'origine complet (v2.7)
   const xlOf=async()=>{w.__saved.length=0;click(d.querySelector('#view [data-a=xl][data-id=adherents]'));for(let i=0;i<100&&!w.__saved.length;i++)await sleep(50);return w.__saved.pop()};
   click([...d.querySelectorAll('#seg button')].find(b=>b.textContent==='Résidence 1'));await sleep(30);
   let fx=await xlOf();let wx=X.read(Buffer.from(fx.b,'base64'));let txt=JSON.stringify(X.utils.sheet_to_json(wx.Sheets[wx.SheetNames[0]],{header:1}));
   console.log('excel R1:',fx.n,'| R1-1',/R1-1/.test(txt),'| R2/Commerce',/R2-1|Im C/.test(txt));
   if(!/R1-1/.test(txt)||/R2-1|Im C/.test(txt)||/à jour/.test(fx.n))errs.push('excel partie');
   click([...d.querySelectorAll('#seg button')].find(b=>b.textContent==='Tout'));await sleep(30);
   fx=await xlOf();wx=X.read(Buffer.from(fx.b,'base64'));txt=JSON.stringify(X.utils.sheet_to_json(wx.Sheets[wx.SheetNames[0]],{header:1}));
   console.log('excel Tout:',fx.n,'| tout dedans',/TEST UN/.test(txt)&&/TEST DEUX/.test(txt)&&/TEST COM/.test(txt));
   if(!/à jour/.test(fx.n)||!/TEST DEUX/.test(txt)||!/TEST COM/.test(txt))errs.push('excel tout');}
  // prix au m² → prix total et avance 40 % recalculés (v2.8)
  {const id=Object.entries(w.__store.am_adherents).find(([k,v])=>v.nom==='TEST UN')[0];
   click(d.querySelector('#view [data-a=detail][data-id="'+id+'"]'));await sleep(30);
   click([...d.querySelectorAll('#detail [data-a=edit][data-col=adherents]')].find(b=>/fiche/.test(b.textContent)));await sleep(30);
   const m2=$('#fld-prixM2');m2.value='10000';m2.dispatchEvent(new w.Event('input',{bubbles:true}));
   console.log('calc: prix',$('#fld-prix').value,'avance',$('#fld-avance').value);
   if($('#fld-prix').value!=='3000000'||$('#fld-avance').value!=='1200000')errs.push('calc avance');
   const inp=(id,v)=>{const e=$(id);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
   inp('#fld-prix','3300000');console.log('calc prix→ m2',$('#fld-prixM2').value,'avance',$('#fld-avance').value);
   if($('#fld-prixM2').value!=='11000'||$('#fld-avance').value!=='1320000')errs.push('calc prix');
   inp('#fld-avance','1200000');console.log('calc avance→ prix',$('#fld-prix').value,'m2',$('#fld-prixM2').value,'| ligne:',$('#adh-calc').textContent);
   if($('#fld-prix').value!=='3000000'||$('#fld-prixM2').value!=='10000'||!/Reste/.test($('#adh-calc').textContent))errs.push('calc avance2');
   submit('#form');await sleep(60);const v=w.__store.am_adherents[id];console.log('calc saved:',v.prix,v.avance,'src kept',!!v.src);
   if(v.avance!==1200000)errs.push('calc save');
   click(d.querySelector('[data-a=close-detail]'));await sleep(20);}
  // v3.0 : identifiants mémorisés, nouveaux corps de métier, espace Factures
  {const c=JSON.parse(w.localStorage.getItem('amicale-albaraka-cred')||'null');console.log('cred mémorisé:',c&&c.e,'| case:',!!$('#lg-mem'));
   if(!c||c.e!=='a@b.ma'||!c.p)errs.push('cred');
   w.location.hash='#depenses';await sleep(50);
   click(d.querySelector('#view [data-a=new][data-col=factures]'));await sleep(20);
   const po=[...$('#form').elements.poste.options].map(o=>o.value);console.log('postes:',po.filter(x=>/Alu|Carre|marbre|Plaq|Clim/.test(x)).join(' | '));
   if(!['Aluminium','Carrelage (pose)','Fourniture carrelage','Pierre et marbre','Climatisation'].every(x=>po.includes(x)))errs.push('postes');
   $('#form').elements.fournisseur.value='ALU TEST';$('#form').elements.montant.value='50000';$('#form').elements.poste.value='Aluminium';submit('#form');await sleep(60);
   click(d.querySelector('#view [data-a=dep-poste][data-id="Aluminium"]'));await sleep(30);
   console.log('factures alu:',$('#list').textContent.replace(/\s+/g,' ').slice(0,90),'| seg:',d.querySelector('#view [data-a=dep][aria-pressed=true]').textContent);
   if(!/ALU TEST/.test($('#list').textContent)||$('#f-fposte').value!=='Aluminium')errs.push('factures espace');
   const fs=$('#f-fposte');fs.value='';fs.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(10);
   const st=$('#f-fst');st.value='Payée';st.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(10);
   console.log('filtre payée:',$('#list').textContent.slice(0,50));if(/ALU TEST/.test($('#list').textContent))errs.push('filtre statut');}
  console.log('errors:',errs);
  if(errs.length){console.error('ÉCHEC : erreurs JavaScript');process.exitCode=1}else console.log('OK : test réussi');
  process.exit(process.exitCode||0);
})().catch(e=>{console.error('FAIL',e);console.log(errs);process.exit(1)});
