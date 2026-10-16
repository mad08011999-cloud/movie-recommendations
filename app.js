(async function(){
"use strict";
const $=s=>document.querySelector(s), LS=k=>localStorage.getItem(k), SET=(k,v)=>localStorage.setItem(k,v);
const DEF_REPO="mad08011999-cloud/movie-recommendations";
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),2600)};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const T=await (await fetch("catalog.json")).json();
T.forEach(t=>{t.genres=t.genres||[];t.language=t.language||"Unknown";t.blob=(t.title+" "+t.genres.join(" ")+" "+t.desc+" "+t.type+" "+t.language).toLowerCase()});
const BY=Object.fromEntries(T.map(t=>[t.id,t]));
// theme
const theme=LS("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
document.documentElement.dataset.theme=theme;
$("#themeBtn").onclick=()=>{const n=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=n;SET("theme",n)};
// status
let ST=JSON.parse(LS("status")||"{}");
let autoPush=()=>{};const saveST=()=>{SET("status",JSON.stringify(ST))};
const stOf=id=>ST[id]?.status||"none";
// filters
const years=T.map(t=>t.year).filter(Boolean),YMIN=Math.min(...years),YMAX=Math.max(...years);
const langs=[...new Set(T.map(t=>t.language))].sort((a,b)=>T.filter(t=>t.language===b).length-T.filter(t=>t.language===a).length);
langs.forEach(l=>$("#lang").insertAdjacentHTML("beforeend",`<option>${esc(l)}</option>`));
const gc={};T.forEach(t=>t.genres.forEach(g=>gc[g]=(gc[g]||0)+1));
const GEN=Object.keys(gc).sort((a,b)=>gc[b]-gc[a]);
const selG=new Set();
$("#genres").innerHTML=GEN.map(g=>`<span class="chip" data-g="${esc(g)}">${esc(g)} <small>${gc[g]}</small></span>`).join("");
$("#genres").onclick=e=>{const c=e.target.closest(".chip");if(!c)return;const g=c.dataset.g;selG.has(g)?selG.delete(g):selG.add(g);c.classList.toggle("on");page=1;render()};
$("#y1").min=$("#y2").min=YMIN;$("#y1").max=$("#y2").max=YMAX;$("#y1").value=YMIN;$("#y2").value=YMAX;
let tab="all",page=1,vibe=null; const PER=48;
const TABS=[["all","All"],["todo","To watch"],["watching","Watching"],["watched","✅ Watched"]];
function tabs(){$("#tabs").innerHTML=TABS.map(([k,n])=>`<span class="tab ${tab===k?"on":""}" data-t="${k}">${n} (${k==="all"?T.length:T.filter(t=>stOf(t.id)===k).length})</span>`).join("")}
$("#tabs").onclick=e=>{const c=e.target.closest(".tab");if(c){tab=c.dataset.t;page=1;render()}};
["rf","q","type","lang","y1","y2","sort"].forEach(id=>$("#"+id).addEventListener("input",()=>{page=1;render()}));
$("#reset").onclick=()=>{$("#q").value="";$("#type").value="all";$("#lang").value="all";$("#y1").value=YMIN;$("#y2").value=YMAX;selG.clear();document.querySelectorAll("#genres .chip").forEach(c=>c.classList.remove("on"));clearVibe();};
$("#more").onclick=()=>{page++;render()};
// ---- vibe search (local) ----
const SYN={funny:["comedy","hilarious","humor","comic","laugh"],comedy:["funny","humor","comic"],scary:["horror","terrifying","haunted","supernatural","creepy"],horror:["scary","haunted","ghost","demon"],romantic:["romance","love","relationship"],romance:["love","romantic"],love:["romance","romantic","relationship"],"feel-good":["comedy","heartwarming","uplifting","family","friendship"],feelgood:["comedy","heartwarming","uplifting"],uplifting:["inspiring","heartwarming","triumph"],sad:["drama","tragic","grief","loss","death"],emotional:["drama","grief","family","tearjerker"],dark:["crime","thriller","murder","violent","psychological"],thriller:["suspense","mystery","crime","tense"],suspense:["thriller","mystery"],twist:["mystery","thriller","secret","revealed"],mindbending:["sci-fi","psychological","mystery","reality"],"mind-bending":["sci-fi","psychological","mystery","reality"],action:["fight","battle","chase","mission"],heist:["robbery","thief","steal","crime","con"],space:["sci-fi","astronaut","planet","alien"],future:["sci-fi","dystopian","technology"],scifi:["sci-fi","science"],"sci-fi":["science","future","alien","space"],kids:["family","animation","animated","children"],family:["kids","children","father","mother"],animated:["animation"],cartoon:["animation"],anime:["animation","japanese"],sports:["sport","team","coach","championship","football","boxing","cricket"],sport:["sports","team","coach"],underdog:["sport","team","coach","overcome"],true:["biography","based","real","history"],biopic:["biography","life"],war:["soldier","army","battle","history"],history:["historical","war","period"],music:["musical","band","singer","song"],detective:["mystery","crime","investigation","murder"],murder:["crime","killer","detective"],killer:["serial","murder","thriller"],school:["teen","high","college","student"],teen:["high","school","coming-of-age","young"],college:["university","student"],friends:["friendship","friend"],road:["trip","journey"],adventure:["journey","quest","adventure"],magic:["fantasy","wizard","witch"],fantasy:["magic","myth","kingdom"],superhero:["marvel","dc","comic","powers","action"],courtroom:["lawyer","trial","court","legal"],wedding:["marriage","romance","bride"],relaxing:["comedy","light","family"],light:["comedy","romance"],cozy:["comedy","family","romance"],binge:["series"],show:["series"],series:["series"],movie:["movie"],film:["movie"],bollywood:["hindi"],tollywood:["telugu"],korean:["korean"],kdrama:["korean","series"],indian:["hindi","telugu","tamil","malayalam","kannada"],time:["time","travel"],travel:["journey","trip"],zombie:["undead","horror","apocalypse"],alien:["sci-fi","extraterrestrial"],robot:["ai","sci-fi","android"],revenge:["vengeance","avenge","crime"],spy:["espionage","agent","cia","secret"],gangster:["mafia","crime","mob"],politics:["political","president","government"]};
const STOP=new Set("a an the and or of to in on with for about that this is are be some something like want watch me my i show movie film where who which very really kind sort any".split(" "));
const stem=w=>w.replace(/(ing|ies|es|s|ed)$/,"");
function localRank(q){
  const words=q.toLowerCase().match(/[a-z0-9\-]+/g)||[];const terms=new Map();
  words.forEach(w=>{if(STOP.has(w))return;terms.set(w,3);(SYN[w]||SYN[stem(w)]||[]).forEach(s=>{if(!terms.has(s))terms.set(s,1.5)})});
  const wantType=/\b(series|show|shows|tv|binge|kdrama)\b/.test(q)?"series":/\b(movie|movies|film|films)\b/.test(q)?"movie":null;
  const res=[];
  T.forEach(t=>{let sc=0,hit=[];const gl=t.genres.map(g=>g.toLowerCase());
    terms.forEach((wt,term)=>{const st=stem(term);
      if(gl.some(g=>g===term||g===st||stem(g)===st)){sc+=wt*2.5;hit.push(term)}
      else if(t.title.toLowerCase().includes(term)){sc+=wt*1.5;hit.push(term)}
      else if(st.length>2&&new RegExp("\\b"+st.replace(/[-]/g,"\\-")).test(t.blob)){sc+=wt;hit.push(term)}
      else if(term===t.language.toLowerCase()){sc+=wt*2;hit.push(term)}});
    if(wantType&&t.type!==wantType)sc*=.3;
    if(sc>0){sc+=(t.rating||5)*.15+Math.log1p(t.saves||0)*.1;res.push({id:t.id,sc,why:[...new Set(hit)].slice(0,4).join(", ")})}});
  return res.sort((a,b)=>b.sc-a.sc);
}
const ai=()=>({base:(LS("aiBase")||"https://api.openai.com/v1").replace(/\/$/,""),model:LS("aiModel")||"gpt-4o-mini",key:LS("aiKey")||""});
const aiNote=()=>$("#aiMode").textContent=ai().key?`AI mode: ${ai().model} re-ranks on-device matches (key stored only in this browser).`:"On-device smart matching (genres, plots, mood synonyms). Add your own LLM API key in Settings for true AI ranking.";
aiNote();
async function llmRank(q,cands){
  const {base,model,key}=ai();
  const list=cands.map(c=>{const t=BY[c.id];return `${t.id}|${t.title} (${t.year},${t.type},${t.language})|${t.genres.join("/")}|${t.desc.slice(0,160)}`}).join("\n");
  const r=await fetch(base+"/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model,temperature:0.2,messages:[{role:"system",content:"You pick movies/series that best match a user's described vibe. Only choose from the provided list. Reply with JSON only: {\"picks\":[{\"id\":\"tt...\",\"why\":\"short reason\"}]} with up to 30 picks, best first."},{role:"user",content:`Vibe: ${q}\n\nCatalog (id|title|genres|plot):\n${list}`}]})});
  if(!r.ok)throw new Error("AI "+r.status);
  const j=await r.json();const txt=j.choices[0].message.content;const m=JSON.parse(txt.slice(txt.indexOf("{"),txt.lastIndexOf("}")+1));
  return m.picks.filter(p=>BY[p.id]).map((p,i)=>({id:p.id,sc:1000-i,why:"🤖 "+p.why}));
}
async function runVibe(){
  const q=$("#vibe").value.trim();if(!q)return clearVibe();
  let res=localRank(q);
  if(ai().key){
    $("#vibeBtn").textContent="Thinking…";
    try{let pool=res.slice(0,120);if(pool.length<40)pool=pool.concat(T.filter(t=>!pool.some(p=>p.id===t.id)).sort((a,b)=>(b.saves||0)-(a.saves||0)).slice(0,120-pool.length).map(t=>({id:t.id})));res=await llmRank(q,pool)}
    catch(e){toast("AI failed ("+e.message+"), used on-device matching")}
    $("#vibeBtn").textContent="Find matches";
  }
  vibe={q,res:res.slice(0,60)};page=1;render();
  if(!res.length)toast("No matches — try different words");
}
function clearVibe(){vibe=null;$("#vibe").value="";page=1;render()}
$("#vibeBtn").onclick=runVibe;$("#vibe").onkeydown=e=>{if(e.key==="Enter")runVibe()};$("#vibeClr").onclick=clearVibe;
const EX=["feel-good underdog sports story","dark psychological thriller with a twist","light romantic comedy for a cozy night","mind-bending sci-fi","bingeable crime series","Indian family drama"];
$("#ex").innerHTML=EX.map(e=>`<span class="chip">${e}</span>`).join("");
$("#ex").onclick=e=>{if(e.target.classList.contains("chip")){$("#vibe").value=e.target.textContent;runVibe()}};
// ---- render ----
function filtered(){
  const rf=$("#rf").value,q=$("#q").value.trim().toLowerCase(),ty=$("#type").value,lg=$("#lang").value,y1=+$("#y1").value||0,y2=+$("#y2").value||9999;
  let list=vibe?vibe.res.map(r=>Object.assign({},BY[r.id],{why:r.why})):T.slice();
  list=list.filter(t=>(!q||t.blob.includes(q))&&(ty==="all"||t.type===ty)&&(lg==="all"||t.language===lg)&&(!t.year||(t.year>=y1&&t.year<=y2))&&[...selG].every(g=>t.genres.includes(g))&&(tab==="all"||stOf(t.id)===tab)&&(tab!=="watched"||rf==="all"||(ST[t.id]?.rating||"none")===rf));
  if(!vibe){const s=$("#sort").value,f={saves:(a,b)=>(b.saves||0)-(a.saves||0),rating:(a,b)=>(b.rating||0)-(a.rating||0),new:(a,b)=>(b.year||0)-(a.year||0),old:(a,b)=>(a.year||9999)-(b.year||9999),az:(a,b)=>a.title.localeCompare(b.title)}[s];list.sort(f)}
  return list;
}
const RT={dislike:["👎","Not for me"],like:["👍","Like"],love:["👍👍","Love it!!"]};
function card(t){const s=stOf(t.id);
  return `<article class="card" data-id="${t.id}"><div class="poster" ${t.poster?`style="background-image:url('${esc(t.poster)}')"`:""}>${t.poster?"":`<div class="ph">${esc(t.title)}</div>`}<span class="badge">${t.type}</span>${t.rating?`<span class="badge rt">★ ${t.rating}</span>`:""}${s==="watched"&&ST[t.id].rating?`<span class="badge rb">${RT[ST[t.id].rating][0]} ${RT[ST[t.id].rating][1]}</span>`:""}</div>
  <div class="body"><div class="t">${esc(t.title)}</div><div class="s">${t.year||"—"} · ${esc(t.language)} · ${esc(t.genres.join(", "))}</div>
  ${t.why?`<div class="why">Matched: ${esc(t.why)}</div>`:""}<div class="d" title="Click to expand">${esc(t.desc)}</div>
  <div class="st">${[["todo","To watch"],["watching","Watching"],["watched","Watched ✓"]].map(([k,n])=>`<button data-s="${k}" class="${s===k?"on":""}" aria-pressed="${s===k}">${n}</button>`).join("")}</div>${s==="watched"?`<div class="rate">${Object.entries(RT).map(([k,[e,n]])=>`<button data-r="${k}" class="${ST[t.id].rating===k?"on":""}" aria-pressed="${ST[t.id].rating===k}" title="${n}">${e} ${n}</button>`).join("")}</div>`:""}</div></article>`}
function render(){tabs();$("#rf").style.display=tab==="watched"?"":"none";const list=filtered();
  $("#cnt").textContent=`${T.length} titles · ${T.filter(t=>stOf(t.id)==="watched").length} watched`;
  $("#info").textContent=(vibe?`Vibe matches for “${vibe.q}”: `:"")+`${list.length} title${list.length===1?"":"s"}`;
  $("#grid").innerHTML=list.length?list.slice(0,page*PER).map(card).join(""):`<div class="empty" style="grid-column:1/-1"><b>Nothing here</b><br>Try loosening the filters.</div>`;
  $("#more").style.display=list.length>page*PER?"":"none";
}
$("#grid").onclick=e=>{const rb=e.target.closest(".rate button");if(rb){const id=rb.closest(".card").dataset.id,r=rb.dataset.r;const o=ST[id];if(o.rating===r)delete o.rating;else o.rating=r;o.updatedAt=new Date().toISOString();PEND[id]="watched";savePend();saveST();render();flush();return}
const b=e.target.closest(".st button");if(b){const id=b.closest(".card").dataset.id,s=b.dataset.s;
    if(stOf(id)===s)delete ST[id];else ST[id]={status:s,title:BY[id].title,updatedAt:new Date().toISOString()};
    PEND[id]=ST[id]?ST[id].status:"none";savePend();saveST();render();flush();if(s==="watched"&&ST[id])toast(`“${BY[id].title}” added to Watched`);return}
  const d=e.target.closest(".d");if(d)d.classList.toggle("open")};
// ---- settings / sync ----
$("#setBtn").onclick=()=>{$("#aiBase").value=LS("aiBase")||"";$("#aiModel").value=LS("aiModel")||"";$("#aiKey").value=ai().key;$("#dlg").showModal()};
$("#save").onclick=()=>{["aiBase","aiModel","aiKey"].forEach(k=>{const v=$("#"+k).value.trim();v?SET(k,v):localStorage.removeItem(k)});aiNote();$("#dlg").close();toast("Settings saved in this browser")};
["ghRepo","ghTok"].forEach(k=>localStorage.removeItem(k));
// ---- Supabase ----
const SB_URL="https://mazrqepjgdtdraxpcptk.supabase.co",SB_KEY="sb_publishable_-2do3uyVQ4kcl7PfnBeDpw_mWEc7TXN",SITE="https://mad08011999-cloud.github.io/movie-recommendations/";
const sb=window.supabase?window.supabase.createClient(SB_URL,SB_KEY):null;let user=null;
const sync=(m)=>$("#sync").textContent=m;
let PEND=JSON.parse(LS("pending")||"{}");const savePend=()=>SET("pending",JSON.stringify(PEND));
async function flush(){if(!sb||!user)return;const ids=Object.keys(PEND);if(!ids.length)return sync("☁️ Synced");sync("⏳ Saving…");
  try{const up=ids.filter(id=>PEND[id]!=="none").map(id=>({user_id:user.id,title_id:id,status:ST[id].status,updated_at:ST[id].updatedAt,rating:ST[id].status==="watched"?(ST[id].rating||null):null}));const del=ids.filter(id=>PEND[id]==="none");
    if(up.length){const{error}=await sb.from("watch_status").upsert(up,{onConflict:"user_id,title_id"});if(error)throw error}
    if(del.length){const{error}=await sb.from("watch_status").delete().eq("user_id",user.id).in("title_id",del);if(error)throw error}
    ids.forEach(id=>delete PEND[id]);savePend();sync("☁️ Synced")}catch(e){sync("⚠️ Sync failed – will retry");console.error(e)}}
autoPush=()=>{};
const origSave=saveST;
async function load(){sync("⏳ Loading…");const{data,error}=await sb.from("watch_status").select("title_id,status,updated_at,rating");if(error){sync("⚠️ Load failed");return}
  const remote={};data.forEach(r=>remote[r.title_id]={status:r.status,title:BY[r.title_id]?.title||"",updatedAt:r.updated_at,...(r.rating?{rating:r.rating}:{})});
  const mk="merged_"+user.id;
  if(!LS(mk)){Object.entries(ST).forEach(([id,v])=>{const r=remote[id];if(!r||(v.updatedAt||"")>(r.updatedAt||""))PEND[id]=v.status});SET(mk,"1")}
  Object.entries(remote).forEach(([id,v])=>{if(PEND[id]&&PEND[id]!=="none"&&(ST[id]?.updatedAt||"")>=(v.updatedAt||""))return;if(PEND[id]==="none")return;ST[id]=v});
  Object.keys(ST).forEach(id=>{if(!remote[id]&&!PEND[id])delete ST[id]});
  SET("status",JSON.stringify(ST));savePend();render();await flush()}
let mode="in";
const show=(el,t,good)=>{el.textContent=t;el.className="msg show "+(good?"good":"bad")},hide=el=>el.className="msg";
const friendly=e=>{const m=(e&&e.message||String(e)).toLowerCase();
  if(m.includes("provider is not enabled")||m.includes("unsupported provider"))return"Google sign-in isn't switched on yet. Please use email for now.";
  if(m.includes("invalid login"))return"That email and password don't match. Try again or reset your password.";
  if(m.includes("email not confirmed"))return"Please confirm your email first — check your inbox for the confirmation link.";
  if(m.includes("already registered")||m.includes("already been registered"))return"An account with this email already exists. Try signing in instead.";
  if(m.includes("rate limit")||m.includes("too many"))return"Too many attempts. Please wait a minute and try again.";
  if(m.includes("password should be")||m.includes("weak"))return"Password is too weak — use at least 6 characters.";
  if(m.includes("failed to fetch")||m.includes("network"))return"Can't reach the server. Check your connection.";
  return e.message||"Something went wrong. Please try again."};
const emOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function setMode(m){mode=m;document.querySelectorAll("#auth .seg button").forEach(b=>b.classList.toggle("on",b.dataset.m===m));
  $("#aTitle").textContent=m==="in"?"Welcome back":"Create your account";$("#aSub").textContent=m==="in"?"Sign in":"Create account";
  $("#aPw").autocomplete=m==="in"?"current-password":"new-password";$("#forgot").style.visibility=m==="in"?"":"hidden";hide($("#msg"));$("#eEm").textContent=$("#ePw").textContent=""}
function openAuth(rec){$("#aMain").style.display=rec?"none":"";$("#aRec").style.display=rec?"":"none";if(!rec)setMode(mode);$("#auth").showModal()}
const busy=(b,on,t)=>{b.disabled=on;if(on){b._t=b.innerHTML;b.textContent=t||"Please wait…"}else if(b._t)b.innerHTML=b._t};
if(sb){
document.querySelectorAll("#auth .seg button").forEach(b=>b.onclick=()=>setMode(b.dataset.m));
$("#authX").onclick=()=>$("#auth").close();
const tog=(btn,inp)=>btn.onclick=()=>{const p=$(inp).type==="password";$(inp).type=p?"text":"password";btn.textContent=p?"Hide":"Show"};tog($("#pwT"),"#aPw");tog($("#pwT2"),"#nPw");
$("#aEm").oninput=()=>$("#eEm").textContent="";$("#aPw").oninput=()=>$("#ePw").textContent="";
$("#gBtn").onclick=async()=>{hide($("#msg"));busy($("#gBtn"),true,"Redirecting to Google…");
  try{let en=true;try{const r=await fetch(SB_URL+"/auth/v1/settings",{headers:{apikey:SB_KEY}});if(r.ok)en=!!(await r.json()).external?.google}catch(_){}
  if(!en)throw new Error("provider is not enabled");const{error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:SITE}});if(error)throw error}catch(e){show($("#msg"),friendly(e));busy($("#gBtn"),false)}};
$("#aForm").onsubmit=async e=>{e.preventDefault();hide($("#msg"));const em=$("#aEm").value.trim(),pw=$("#aPw").value;let bad=false;
  if(!emOk(em)){$("#eEm").textContent="Enter a valid email address.";bad=true}
  if(pw.length<6){$("#ePw").textContent=pw?"Password must be at least 6 characters.":"Enter your password.";bad=true}
  if(bad)return;const b=$("#aSub");busy(b,true);
  try{if(mode==="in"){const{error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error)throw error;$("#auth").close();toast("Signed in ✓")}
    else{const{data,error}=await sb.auth.signUp({email:em,password:pw,options:{emailRedirectTo:SITE}});if(error)throw error;
      if(data.user&&data.user.identities&&data.user.identities.length===0)throw new Error("already registered");
      if(data.session){$("#auth").close();toast("Account created ✓")}else show($("#msg"),"Almost there! Check your inbox to confirm your email, then sign in.",true)}}
  catch(x){show($("#msg"),friendly(x))}busy(b,false)};
$("#forgot").onclick=async()=>{const em=$("#aEm").value.trim();if(!emOk(em)){$("#eEm").textContent="Enter your email above, then click Forgot password.";return}
  const{error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:SITE});error?show($("#msg"),friendly(error)):show($("#msg"),"Password reset link sent — check your email.",true)};
$("#magic").onclick=async()=>{const em=$("#aEm").value.trim();if(!emOk(em)){$("#eEm").textContent="Enter your email above to get a sign-in link.";return}
  const{error}=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:SITE}});error?show($("#msg"),friendly(error)):show($("#msg"),"Sign-in link sent — check your email.",true)};
$("#aRec").onsubmit=async e=>{e.preventDefault();const pw=$("#nPw").value;if(pw.length<6){$("#eN").textContent="At least 6 characters.";return}$("#eN").textContent="";
  const{error}=await sb.auth.updateUser({password:pw});if(error)show($("#msg2"),friendly(error));else{$("#auth").close();toast("Password updated ✓")}};
document.addEventListener("click",e=>{const m=$("#acctMenu");if(m&&!e.target.closest(".acct"))m.classList.remove("open")});
}
function authUI(){const b=$("#authBox");
  if(!sb){b.innerHTML="";sync("Offline (Supabase unavailable) – saved locally");return}
  if(user){const md=user.user_metadata||{},nm=md.full_name||md.name||"",pic=md.avatar_url||md.picture||"",ini=esc((nm||user.email||"?")[0].toUpperCase());
    b.innerHTML=`<div class="acct"><button class="btn" id="acctBtn" style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px"><span class="av" ${pic?`style="background-image:url('${esc(pic)}')"`:""}>${pic?"":ini}</span><span class="s" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user.email)}</span>▾</button>
    <div class="menu" id="acctMenu">${nm?`<b>${esc(nm)}</b><br>`:""}<span class="s">${esc(user.email)}</span><p class="hint" id="syncM">${esc($("#sync").textContent)}</p><button class="btn wide" id="out">Sign out</button></div></div>`;
    $("#acctBtn").onclick=()=>$("#acctMenu").classList.toggle("open");$("#out").onclick=async()=>{await sb.auth.signOut();toast("Signed out")}}
  else{b.innerHTML=`<button class="btn acc" id="in">Sign in</button>`;sync("Saved on this device only");$("#in").onclick=()=>openAuth(false)}}
if(sb){sb.auth.onAuthStateChange((ev,s)=>{const nu=s?.user||null;const changed=(nu?.id)!==(user?.id);user=nu;authUI();if(nu&&changed)setTimeout(load,0);
    if(ev==="PASSWORD_RECOVERY")setTimeout(()=>openAuth(true),0)});
  window.addEventListener("online",flush)}
authUI();
$("#exp").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({exported:new Date().toISOString(),items:ST},null,1)],{type:"application/json"}));a.download="watchlist-status.json";a.click()};
$("#impB").onclick=()=>$("#imp").click();
$("#imp").onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());const it=j.items||j;let n=0;Object.entries(it).forEach(([id,v])=>{if(BY[id]&&v&&v.status&&(!ST[id]||(v.updatedAt||"")>(ST[id].updatedAt||""))){ST[id]=v;PEND[id]=v.status;n++}});saveST();savePend();render();flush();toast(`Imported ${n} entries`)}catch(x){toast("Invalid file")}};
render();
})();
