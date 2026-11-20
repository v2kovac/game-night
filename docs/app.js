import {firebaseConfig} from './config.js';

const $=id=>document.getElementById(id);
const names={yes:'Available',maybe:'Maybe',no:'Unavailable',clear:'Clear'};
const marks={yes:'✓',maybe:'?',no:'×',clear:'↺'};
const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const now=new Date(), today=dateKey(now);
const months=[0,1].map(i=>new Date(now.getFullYear(),now.getMonth()+i,1,12));
const monthKeys=months.map(d=>dateKey(d).slice(0,7));
const label=(d,opts)=>d.toLocaleDateString('en-US',opts);
const longDate=day=>label(new Date(day+'T12:00:00'),{weekday:'long',month:'long',day:'numeric'});
let store, data, active=0, selected='', pending=0, roomId='', creating=false;
let errorCount=0, roomInfo;
const cells=new Map();
function el(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(cls) node.className=cls;
  return node;
}
function button(text,fn,cls){
  const node=el('button',text,cls);
  node.type='button';node.onclick=fn;return node;
}
function vote(uid,day){return data.votes[uid+'_'+day] || ''}
function players(){
  if(!data.roster) return Object.entries(data.members).map(([uid, member])=>({uid,name:member.name}));
  const claimed=new Map(Object.entries(data.members).map(([uid,member])=>[member.slot,uid]));
  return data.roster.map((name,index)=>({name:typeof name==='string'?name:'Player '+(index+1),uid:claimed.get(String(index))}));
}
function initials(name){
  const words=name.trim().split(/\s+/);
  return (words.length===1?Array.from(words[0]).slice(0,2).join(''):words[0][0]+words.at(-1)[0]).toUpperCase();
}
function refresh(){
  if(!data) return;
  $('board').hidden=false;
  const members=players();
  for(const [date,b] of cells){
    const answered=members.map(({uid,name})=>({name,status:uid?vote(uid,date):''})).filter(p=>p.status);
    const count=answered.filter(p=>p.status==='yes').length;
    const scheduled=data.night===date;
    const heat=count?'heat'+Math.ceil(3*count/members.length):'';
    b.className=['day',heat,date===today?'today':'',scheduled?'scheduled':''].join(' ');
    const list=b.lastChild;
    list.replaceChildren();
    for(const {name,status} of answered.slice(0,3)){
      const chip=el('span',initials(name),'avatar '+status);
      chip.title=name+' · '+names[status];list.append(chip);
    }
    if(answered.length>3) list.append(el('span','+'+(answered.length-3),'overflow-count'));
    b.setAttribute('aria-label',[longDate(date),date===today?'today':'',scheduled?'confirmed game night':'',`${count} of ${members.length} available`,...answered.map(p=>p.name+' '+names[p.status])].filter(Boolean).join(', '));
  }
  $('identity').textContent=(members.find(p=>p.uid===store.uid)?.name||'You')+' · '+members.length+(members.length===1?' player':' players');
  if(data.night>=today) $('identity').textContent+=' · ★ Game night '+longDate(data.night);
  if($('detail').open) renderDetails();
}
async function save(action){
  const before=errorCount;
  const status=$('detail').open?$('detailSave'):$('save');
  status.hidden=false;
  pending++;status.textContent='Saving…';
  try{await action()}catch{errorCount++;status.textContent='Couldn’t save. Check your connection and try again.'}
  finally{pending--;if(!pending && before===errorCount) status.textContent=firebaseConfig?'Saved':'Saved on this device'}
}
function renderDetails(){
  $('detailTitle').textContent=longDate(selected);
  const rows=$('roster');rows.replaceChildren();
  for(const {uid,name} of players()){
    const row=el('div',undefined,'row'), status=uid?vote(uid,selected):'';
    row.append(el('span',name+(uid===store.uid?' (you)':'')),el('small',names[status]||'Unanswered',status));
    rows.append(row);
  }
  const current=vote(store.uid,selected)||'clear';
  for(const choice of $('brushes').children) choice.setAttribute('aria-pressed',String(choice.dataset.status===current));
  const same=data.night===selected;
  $('confirm').hidden=data.host!==store.uid;
  $('confirm').textContent=same?'Unconfirm game night':data.night>=today?'Move game night here':'Confirm game night';
}
function chooseDay(date){
  selected=date;$('detailSave').hidden=true;renderDetails();$('detail').showModal();
}
function switchMonth(index){
  active=index;
  document.querySelectorAll('.month').forEach((m,i)=>m.classList.toggle('active',i===active));
  document.querySelectorAll('.monthSwitch button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===active)));
}
function build(){
  for(const [key,name] of Object.entries(names)){
    const b=button(marks[key]+' '+name,()=>{const date=selected;save(()=>store.mark(date,key))},'pill '+key);
    b.dataset.status=key;$('brushes').append(b);
  }
  months.forEach((start,index)=>{
    const month=el('section',undefined,'month');
    month.append(el('h2',label(start,{month:'long',year:'numeric'})));
    const grid=el('div',undefined,'grid');
    for(const d of ['Su','Mo','Tu','We','Th','Fr','Sa']) grid.append(el('span',d,'weekday'));
    for(let i=0;i<start.getDay();i++) grid.append(el('span'));
    const date=new Date(start);
    while(date.getMonth()===start.getMonth()){
      const key=dateKey(date), b=button('',()=>chooseDay(key),'day');
      b.append(el('span',String(date.getDate())),el('span',undefined,'avatars'));
      b.disabled=key<today;cells.set(key,b);grid.append(b);
      date.setDate(date.getDate()+1);
    }
    month.append(grid);$('months').append(month);
    document.querySelector('.monthSwitch').append(button(label(start,{month:'long'}),()=>switchMonth(index)));
  });
  switchMonth(0);
}
function preview(){
  const key='table-night-preview-v1';
  let local;
  try{local=JSON.parse(localStorage.getItem(key))}catch{}
  if(local) local.members=Object.fromEntries(Object.entries(local.members).map(([uid,member])=>[uid,typeof member==='string'?{name:member}:member]));
  if(!local){
    local={members:{you:{name:'You'},ada:{name:'Ada'},sam:{name:'Sam'}},host:'you',votes:{},night:''};
    for(const day of cells.keys()){
      const dow=new Date(day+'T12:00:00').getDay();
      if([4,5,6].includes(dow)) local.votes['ada_'+day]=dow===4?'maybe':'yes';
      if([0,5,6].includes(dow)) local.votes['sam_'+day]=dow===6?'maybe':'yes';
    }
  }
  function persist(next){localStorage.setItem(key,JSON.stringify(next));local=next;data=local;refresh()}
  store={uid:'you',mark(day,status){
    const next=structuredClone(local);
    if(status==='clear') delete next.votes['you_'+day];else next.votes['you_'+day]=status;
    persist(next);
  },schedule(day){persist({...local,night:day})}};
  data=local;$('notice').textContent='Local preview · Ada and Sam are sample players. Changes stay in this browser.';refresh();
}
function watch(){
  $('join').hidden=true;$('notice').textContent='Loading your table…';
  store.watch(monthKeys,next=>{
    data=next;$('notice').textContent='';$('share').hidden=false;refresh();
  },()=>{$('notice').textContent='Sync stopped. Reload to reconnect.';$('board').hidden=true});
}
async function start(){
  build();
  if(!firebaseConfig){preview();return}
  const hash=location.hash.slice(1);
  if(hash && !/^room=[0-9a-f]{32}$/.test(hash)) throw Error('This invite link is incomplete. Ask the host to resend it.');
  let saved;
  try{saved=localStorage.getItem('table-night-room')}catch{}
  roomId=hash.slice(5)||(new URLSearchParams(location.search).has('new')?'':saved);
  creating=!roomId;
  if(creating) roomId=crypto.randomUUID().replaceAll('-','');
  store=await (await import('./cloud.js?v=3')).connect(firebaseConfig,roomId);
  if(!creating){
    roomInfo=await store.roomInfo();
    if(!roomInfo) throw Error('This table could not be found. Check your invite link.');
    if(await store.joined()){remember();watch();return}
  }
  await showJoin();
}
async function showJoin(){
  const fixed=Array.isArray(roomInfo?.roster);
  $('name').hidden=fixed;$('nameLabel').hidden=fixed;$('name').required=!fixed;
  $('guestsField').hidden=!creating;$('playerField').hidden=!fixed;
  $('player').required=fixed;
  $('notice').textContent=creating?'Set your roster before sharing the invite.':fixed?'Choose your name from the roster.':'Enter your name to join this table.';
  $('joinButton').textContent=creating?'Create table':'Join table';
  $('joinButton').disabled=false;
  if(fixed){
    const claimed=new Set(await store.claimedSlots());
    $('player').replaceChildren(new Option('Select your name',''));
    for(const [index,name] of roomInfo.roster.entries()){
      if(index===0 || claimed.has(String(index))) continue;
      $('player').add(new Option(name,String(index)));
    }
    if($('player').options.length===1){
      $('notice').textContent='All roster spots have already been claimed.';
      $('joinButton').disabled=true;
    }
  }
  $('join').hidden=false;
}
function remember(){
  // A table is usable even if the browser blocks local storage.
  try{localStorage.setItem('table-night-room',roomId)}catch{}
  try{history.replaceState(null,'',inviteUrl())}catch{}
}
function inviteUrl(){
  const url=new URL(location.href);
  url.searchParams.delete('new');
  url.hash='room='+roomId;
  return url.href;
}
$('join').onsubmit=async e=>{
  e.preventDefault();
  const name=$('name').value.trim();
  const roster=creating?[name,...$('guests').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean)]:undefined;
  const slot=creating?'0':roomInfo?.roster?$('player').value:undefined;
  if(roster && (roster.length>24 || roster.some(n=>!n||n.length>32) || new Set(roster.map(n=>n.toLowerCase())).size!==roster.length)){
    $('notice').textContent='Use up to 24 distinct names, each 1–32 characters long.';
    return;
  }
  if(slot===undefined && !name){$('name').focus();return}
  if(slot==='') return;
  $('joinButton').disabled=true;
  $('notice').textContent=creating?'Creating your table…':'Joining the table…';
  try{
    await store.join({name,roster,slot});
  }catch(err){
    if(!creating && roomInfo?.roster && err.code==='permission-denied'){
      try{
        await showJoin();
        if(!$('joinButton').disabled) $('notice').textContent='That spot may have been claimed. Choose from the updated list.';
        return;
      }catch{}
    }
    $('joinButton').disabled=false;
    const code=typeof err?.code==='string' && /^[a-z/-]+$/.test(err.code)?err.code:'unknown';
    $('notice').textContent=`Couldn’t ${creating?'create':'join'} the table (${code}). Try again.`;
    return;
  }
  creating=false;
  remember();
  watch();
};
$('confirm').onclick=()=>{const night=data.night===selected?'':selected;$('detail').close();save(()=>store.schedule(night))};
$('close').onclick=()=>$('detail').close();
$('done').onclick=()=>$('invite').close();
$('share').onclick=()=>{$('inviteLink').value=inviteUrl();$('copy').textContent='Copy link';$('invite').showModal()};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copy').textContent='Copied'}catch{$('inviteLink').select();$('copy').textContent='Select and copy the link'}};
window.addEventListener('hashchange',()=>{if(roomId && location.hash!=='#room='+roomId) location.reload()});
function checkDate(){if(!pending && dateKey(new Date())!==today) location.reload()}
window.addEventListener('focus',checkDate);setInterval(checkDate,60000);
start().catch(err=>{$('notice').textContent=err.message.startsWith('This ')?err.message:'Couldn’t open this calendar. Check connectivity and Firebase setup, then reload.'});
