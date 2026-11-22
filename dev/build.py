# Construit l'application Android (app/src/main/assets/index.html) et la version web (dev/out/web.html)
# à partir de dev/src.html. Usage : python3 dev/build.py
import sys,re,os
D=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(D)
src=open(os.path.join(D,'src.html'),encoding='utf-8').read()
logo=open(os.path.join(D,'logo.b64')).read().strip()
os.makedirs(os.path.join(D,'out'),exist_ok=True)
open(os.path.join(D,'out','web.html'),'w',encoding='utf-8').write(src.replace('__LOGO__',logo))
s=src
def rep(a,b,c=1):
    global s
    assert s.count(a)==c,(a[:80],s.count(a))
    s=s.replace(a,b)
def cut(a,b,new,include_b=False):
    global s
    assert s.count(a)==1 and s.count(b)>=1,(a[:60],s.count(a),b[:60],s.count(b))
    i=s.index(a); j=s.index(b,i)
    s=s[:i]+new+s[j+(len(b) if include_b else 0):]
# ---- HTML
rep('<body>','<body class="locked">')
cut('<div class="gate" id="gate" hidden>','<header>','''<div id="boot" class="gate"><p id="boot-msg">Chargement… Une connexion internet est nécessaire.</p></div>
<div id="login" class="gate" hidden>
  <form id="login-form" novalidate>
    <img src="data:image/png;base64,__LOGO__" alt="Logo Amicale Albaraka" width="240" height="200">
    <h1>Gestion du bureau</h1>
    <label for="lg-email">Email<input id="lg-email" type="email" autocomplete="username" inputmode="email" placeholder="nom@gmail.com"></label>
    <label for="lg-pw">Mot de passe<input id="lg-pw" type="password" autocomplete="current-password"></label>
    <label class="check" for="lg-mem"><input id="lg-mem" type="checkbox" checked>Mémoriser l'email et le mot de passe sur cet appareil</label>
    <p class="err" id="lg-err" role="alert" style="margin:0"></p>
    <button type="submit" class="btn" id="lg-btn">Se connecter</button>
    <button type="button" class="linkbtn" id="lg-reset">Mot de passe oublié ?</button>
  </form>
</div>
''')
cut('<div class="backup" id="backup" hidden>','</main>','''<div class="backup" id="backup" hidden>
    <p>Connecté : <strong id="who"></strong></p>
    <button type="button" class="btn ghost" id="logout">Se déconnecter</button>
  </div>
''')
rep('.backup{margin-top:8px;','.gate>p{color:var(--muted);text-align:center}\n.linkbtn{background:none;border:0;color:#2457A8;font-weight:700;min-height:44px}\n.backup{margin-top:8px;')
# ---- script head
rep('<script>\n(function(){','''<script type="module">
import {initializeApp,getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail,updatePassword,reauthenticateWithCredential,EmailAuthProvider,getFirestore,collection,doc,setDoc,getDoc,deleteDoc,onSnapshot,Bytes,getAI,getGenerativeModel,GoogleAIBackend,initializeAppCheck,ReCaptchaV3Provider,CustomProvider} from "./firebase.js";
import * as CFG from "./firebase-config.js";
const firebaseConfig=CFG.firebaseConfig;
(function(){''')
cut('var standalone=false,PASS_HASH=','\n','var standalone=true,fileUrls={},auth=null,fdb=null,unsubs=[],PRE="am_",MAXB=950*1024;')
# ---- files
cut('function sha256(ascii){','function opts(list,val,first){','''function withTimeout(p,ms){return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej({code:"timeout"})},ms)})])}
function loadImg(file){return new Promise(function(res,rej){
  var u=URL.createObjectURL(file),im=new Image();
  im.onload=function(){URL.revokeObjectURL(u);res(im)};
  im.onerror=function(){URL.revokeObjectURL(u);rej({code:"file/unreadable"})};
  im.src=u;
})}
function toJpeg(im,max,q){
  var k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(im.naturalWidth*k));c.height=Math.max(1,Math.round(im.naturalHeight*k));
  var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
  return new Promise(function(res){c.toBlob(res,"image/jpeg",q)});
}
/* Les fichiers sont gardés dans Firestore (1 Mo par document) : les photos sont réduites, les PDF doivent être petits. */
async function prepare(file){
  if(file.type==="application/pdf"){
    if(file.size>MAXB)throw {code:"file/too-large-pdf"};
    return {blob:file,name:file.name,type:file.type};
  }
  var im=await loadImg(file),steps=[[1600,.8],[1280,.7],[1000,.6],[800,.5]];
  for(var i=0;i<steps.length;i++){
    var b=await toJpeg(im,steps[i][0],steps[i][1]);
    if(b&&b.size<=MAXB)return {blob:b,name:file.name.replace(/\\.[^.]*$/,"")+".jpg",type:"image/jpeg"};
  }
  throw {code:"file/too-large"};
}
function toB64(u8){var t="",C=0x8000;for(var i=0;i<u8.length;i+=C)t+=String.fromCharCode.apply(null,u8.subarray(i,i+C));return btoa(t)}
var fsAssets={
  upload:async function(file){
    var p=await prepare(file),buf=new Uint8Array(await p.blob.arrayBuffer()),r=doc(collection(fdb,PRE+"fichiers"));
    await withTimeout(setDoc(r,{name:p.name,type:p.type,size:buf.length,data:Bytes.fromUint8Array(buf),createdAt:new Date().toISOString()}),45000);
    return {id:r.id,contentType:p.type,name:p.name};
  },
  delete:function(id){if(fileUrls[id]){URL.revokeObjectURL(fileUrls[id]);delete fileUrls[id]}return deleteDoc(doc(fdb,PRE+"fichiers",id))},
  /* fichier Excel d'origine gardé tel quel (modèle pour l'export) */
  storeRaw:async function(file){
    var buf=new Uint8Array(await file.arrayBuffer());if(buf.length>MAXB)throw {code:"file/too-large"};
    var r=doc(collection(fdb,PRE+"fichiers"));
    await withTimeout(setDoc(r,{name:file.name,type:file.type||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",size:buf.length,data:Bytes.fromUint8Array(buf),createdAt:new Date().toISOString()}),45000);
    return r.id;
  },
  get:async function(id){
    var sn=await withTimeout(getDoc(doc(fdb,PRE+"fichiers",id)),45000);
    if(!sn.exists())throw {code:"file/missing"};
    var d=sn.data();return {u8:d.data.toUint8Array(),type:d.type||"application/octet-stream",name:d.name||"fichier"};
  },
  url:async function(id){
    if(fileUrls[id])return fileUrls[id];
    var f=await fsAssets.get(id);return fileUrls[id]=URL.createObjectURL(new Blob([f.u8],{type:f.type}));
  }
};
function hydrate(){
  if(!assets)return;
  document.querySelectorAll("img[data-blob]").forEach(function(im){
    var id=im.getAttribute("data-blob");im.removeAttribute("data-blob");
    fsAssets.url(id).then(function(u){im.src=u}).catch(function(){});
  });
}
async function openFile(el){
  if(el.dataset.busy)return;
  var label=el.textContent;el.dataset.busy="1";el.textContent="Ouverture…";
  try{
    var f=await fsAssets.get(el.dataset.id);
    if(window.AndroidBridge&&window.AndroidBridge.openFile)window.AndroidBridge.openFile(f.name,f.type,toB64(f.u8));
    else{
      var url=URL.createObjectURL(new Blob([f.u8],{type:f.type})),a=document.createElement("a");
      a.href=url;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},60000);
    }
  }catch(ex){
    var m=ex&&ex.code==="file/missing"?"Ce fichier n'existe plus.":"Impossible d'ouvrir le fichier. Vérifiez la connexion.";
    if(sheet)$("#form-err").textContent=m;else notice(m);
  }
  delete el.dataset.busy;el.textContent=label;
}
''')
# ---- storage
cut('function newId(col){','function errMsg(e){','''function newId(col){return doc(collection(fdb,PRE+col)).id}
function persistLocal(){}
function save(col,id,data){return withTimeout(setDoc(doc(fdb,PRE+col,id),data),45000)}
function remove(col,id){return withTimeout(deleteDoc(doc(fdb,PRE+col,id)),45000)}
''')
rep('''  if(c==="too_large")return "Fichier trop lourd (20 Mo maximum).";''','''  if(c==="file/too-large-pdf")return "PDF trop lourd : 900 Ko maximum. Prenez plutôt une photo du document.";
  if(c==="file/too-large")return "Photo trop lourde même après réduction. Essayez une autre photo.";
  if(c==="file/unreadable")return "Ce fichier ne peut pas être lu.";
  if(c==="timeout")return "La connexion est trop lente. Réessayez.";
  if(c==="permission-denied")return "Vous n'avez pas le droit de modifier ces données.";''')
rep('''"PDF ou photo, 20 Mo maximum"''','''"Photo, ou PDF de moins de 900 Ko"''')
rep('''data.fileId=up.id;data.fileName=file.name;''','''data.fileId=up.id;data.fileName=up.name||file.name;''')
# ---- events
cut('''  else if(a==="file"){e.preventDefault();openFile(id)}''','''  else if(a==="close-detail")''','''  else if(a==="file"){e.preventDefault();openFile(el)}
''')
cut('''$("#imp").addEventListener''','''function route(){''','''function authMsg(ex){
  var c=ex&&ex.code;
  if(c==="auth/network-request-failed")return "Pas de connexion internet.";
  if(c==="auth/too-many-requests")return "Trop d'essais. Réessayez dans quelques minutes.";
  if(c==="auth/user-disabled")return "Ce compte a été désactivé.";
  if(c==="auth/invalid-credential"||c==="auth/wrong-password"||c==="auth/user-not-found"||c==="auth/invalid-email"||c==="auth/missing-password")return "Email ou mot de passe incorrect.";
  return "Connexion impossible. Réessayez.";
}
/* identifiants mémorisés sur l'appareil (case « Mémoriser ») pour se reconnecter sans les retaper */
var CRED_KEY="amicale-albaraka-cred";
function credSave(email,pw){try{if($("#lg-mem").checked)localStorage.setItem(CRED_KEY,JSON.stringify({e:email,p:btoa(unescape(encodeURIComponent(pw)))}));else localStorage.removeItem(CRED_KEY)}catch(e){}}
function credFill(){try{var c=JSON.parse(localStorage.getItem(CRED_KEY)||"null");if(c&&c.e){$("#lg-email").value=c.e;$("#lg-pw").value=decodeURIComponent(escape(atob(c.p||"")));$("#lg-mem").checked=true}}catch(e){}}
credFill();
$("#login-form").addEventListener("submit",async function(e){
  e.preventDefault();
  var err=$("#lg-err"),btn=$("#lg-btn"),email=$("#lg-email").value.trim(),pw=$("#lg-pw").value;
  err.textContent="";
  if(!email||!pw){err.textContent="Saisissez votre email et votre mot de passe.";return}
  btn.disabled=true;btn.textContent="Connexion…";
  try{await signInWithEmailAndPassword(auth,email,pw);credSave(email,pw);$("#lg-pw").value=""}
  catch(ex){err.textContent=authMsg(ex)}
  btn.disabled=false;btn.textContent="Se connecter";
});
$("#lg-reset").addEventListener("click",async function(){
  var err=$("#lg-err"),email=$("#lg-email").value.trim();
  if(!email){err.textContent="Saisissez d'abord votre email, puis appuyez de nouveau ici.";return}
  try{await sendPasswordResetEmail(auth,email);err.textContent="Si ce compte existe, un email pour changer le mot de passe vient d'être envoyé."}
  catch(ex){err.textContent=authMsg(ex)}
});
$("#logout").addEventListener("click",function(){signOut(auth).catch(function(){})});
function showOnly(w){
  $("#boot").hidden=w!=="boot";$("#login").hidden=w!=="login";if(w==="login")credFill();
  document.body.classList.toggle("locked",w!=="app");$("#backup").hidden=w!=="app";
}
''')
cut('/* ---------- start ---------- */','start();\n})();','''/* ---------- start ---------- */
var DEFAULTS=[["casino1","Casino 1",""],["casino2","Casino 2",""],["valdor","Val d'Or","Appartements, Résidence 1, Résidence 2, Commerce"],["sidelabed","Sid El Abed",""]];
async function seedOnce(){
  try{
    var m=doc(fdb,PRE+"meta","init"),sn=await getDoc(m);
    if(sn.exists())return;
    for(var i=0;i<DEFAULTS.length;i++)
      await setDoc(doc(fdb,PRE+"projets",DEFAULTS[i][0]),{nom:DEFAULTS[i][1],sections:DEFAULTS[i][2],budget:0,ordre:i+1,createdAt:new Date().toISOString()});
    await setDoc(m,{at:new Date().toISOString()});
  }catch(e){}
}
function start(){
  try{var u0=JSON.parse(localStorage.getItem("amicale-albaraka-ui")||"null");if(u0){ui.projet=u0.projet||"";ui.section=u0.section||""}}catch(e){}
  if(!firebaseConfig||!firebaseConfig.apiKey||firebaseConfig.apiKey.indexOf("REMPLACER")===0){
    $("#boot-msg").textContent="Configuration Firebase manquante : remplissez le fichier firebase-config.js (voir LISEZMOI).";return;
  }
  var app=initializeApp(firebaseConfig);
  auth=getAuth(app);fdb=getFirestore(app);assets=fsAssets;
  ACCOUNT={email:function(){return auth.currentUser&&auth.currentUser.email||""},
    changePassword:async function(cur,nw){var u=auth.currentUser;if(!u)throw {code:"auth/no-user"};await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,cur));await updatePassword(u,nw);try{if(localStorage.getItem(CRED_KEY))localStorage.setItem(CRED_KEY,JSON.stringify({e:u.email,p:btoa(unescape(encodeURIComponent(nw)))}))}catch(e){}},
    logout:function(){signOut(auth).catch(function(){})},
    getMcp:async function(){var sn=await getDoc(doc(fdb,PRE+"meta","mcp"));return sn.exists()?sn.data():null}};
  var acDone=false,acKey="";
  GEM={app:app,getAI:getAI,getGenerativeModel:getGenerativeModel,GoogleAIBackend:GoogleAIBackend,
    hasAppCheck:function(){return acDone},
    /* App Check (reCAPTCHA v3) : clé du site dans firebase-config.js, ou enregistrée depuis l'assistant dans Firestore */
    /* App Check : jeton de débogage (gardé dans Firestore, lisible seulement par les comptes du bureau) ou clé reCAPTCHA v3 */
    ensureAppCheck:async function(){
      if(acDone)return;
      var key=String(CFG.recaptchaSiteKey||"").trim(),dbg=String(CFG.appCheckDebugToken||"").trim();
      try{var sn=await getDoc(doc(fdb,PRE+"meta","config"));if(sn.exists()){var d=sn.data();dbg=dbg||String(d.appCheckDebugToken||"").trim();key=key||String(d.recaptchaSiteKey||"").trim()}}catch(e){}
      try{
        if(dbg){self.FIREBASE_APPCHECK_DEBUG_TOKEN=dbg;initializeAppCheck(app,{provider:new CustomProvider({getToken:function(){return Promise.reject(new Error("debug"))}}),isTokenAutoRefreshEnabled:true});acDone=true;acKey=dbg}
        else if(key){initializeAppCheck(app,{provider:new ReCaptchaV3Provider(key),isTokenAutoRefreshEnabled:true});acDone=true;acKey=key}
      }catch(e){}
    },
    saveSiteKey:async function(k){
      var isDbg=/^[0-9a-f]{8}-/i.test(k),data={updatedAt:new Date().toISOString()};
      data[isDbg?"appCheckDebugToken":"recaptchaSiteKey"]=k;
      await setDoc(doc(fdb,PRE+"meta","config"),data,{merge:true});
      /* le service IA garde l'état App Check du moment où il a été créé : on recharge l'application */
      return "restart";
    }};
  onAuthStateChanged(auth,function(u){
    unsubs.forEach(function(f){f()});unsubs=[];
    if(!u){
      COLS.forEach(function(c){state[c]=[];loaded[c]=false});
      closeSheet();closeDetail();aiClose();dashClose();aiTurns=[];$("#ai-msgs").innerHTML="";$("#fab-ai").hidden=true;showOnly("login");return;
    }
    $("#who").textContent=u.email||"";
    notice("");showOnly("app");route();$("#fab-ai").hidden=false;
    var seeded=false;
    COLS.forEach(function(col){
      unsubs.push(onSnapshot(collection(fdb,PRE+col),function(snap){
        state[col]=snap.docs.map(function(d){return Object.assign({},d.data(),{id:d.id})});
        loaded[col]=true;
        if(col==="projets"&&!snap.metadata.fromCache&&!snap.docs.length&&!seeded){seeded=true;seedOnce()}
        renderAll();
      },function(){
        loaded[col]=true;
        notice("Les données ne sont pas accessibles. Vérifiez la connexion et vos droits d'accès.");
        renderAll();
      }));
    });
  });
}
''')
rep('var XLSX_SRC="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js";','var XLSX_SRC="./xlsx.min.js";')
rep('var EXCELJS_SRC="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";','var EXCELJS_SRC="./exceljs.min.js";')
out=s.replace('__LOGO__',logo)
dest=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'app','src','main','assets','index.html')
open(dest,'w',encoding='utf-8').write(out)
print('Android :',dest,len(out),'octets ; web : dev/out/web.html')
