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
let errorCount=0, roomInfo, localSlot, brush='yes';
const cells=new Map();
const pendingVotes=new Map();
const visibleInitials=5;
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
function myVoteId(){return 'slot-'+localSlot}
function players(){
  return data.roster.map((name,index)=>({name:typeof name==='string'?name:'Player '+(index+1),uid:'slot-'+index}));
}
function initials(name){
  const words=name.trim().split(/\s+/);
  return (words.length===1?Array.from(words[0]).slice(0,2).join(''):words[0][0]+words.at(-1)[0]).toUpperCase();
}
function refresh(){
  if(!data) return;
  $('board').hidden=false;
  $('switchPlayer').hidden=!firebaseConfig;
  const members=players();
  const currentPlayer=myVoteId();
  for(const [date,b] of cells){
    const answered=members.map(({uid,name})=>({name,status:uid?vote(uid,date):''})).filter(p=>p.status);
    const count=answered.filter(p=>p.status==='yes').length;
    const scheduled=data.night===date;
    const ownStatus=vote(currentPlayer,date);
    b.className=['day',ownStatus,date===today?'today':'',scheduled?'scheduled':''].join(' ');
    const list=b.lastChild;
    list.replaceChildren();
    for(const {name,status} of answered.slice(0,visibleInitials)){
      const chip=el('span',initials(name),'avatar '+status);
      chip.title=name+' · '+names[status];list.append(chip);
    }
    if(ownStatus) b.dataset.own=marks[ownStatus];
    else delete b.dataset.own;
    if(answered.length>visibleInitials) list.append(el('span','+'+(answered.length-visibleInitials),'overflow-count'));
    b.setAttribute('aria-label',[longDate(date),date===today?'today':'',scheduled?'confirmed game night':'',`${count} of ${members.length} available`,...answered.map(p=>p.name+' '+names[p.status])].filter(Boolean).join(', '));
  }
  $('identity').textContent=(members.find(p=>p.uid===myVoteId())?.name||'You')+' · '+members.length+(members.length===1?' player':' players');
  if(data.night>=today) $('identity').textContent+=' · ★ Game night '+longDate(data.night);
  renderCandidates(members);
  if(selected) renderDetails();
}
function renderCandidates(members){
  const candidates=[];
  for(const date of cells.keys()){
    if(date<today) continue;
    const counts={yes:0,maybe:0,no:0,unanswered:0};
    for(const {uid} of members){
      const status=uid?vote(uid,date):'';
      counts[status||'unanswered']++;
    }
    candidates.push({date,...counts});
  }
  candidates.sort((a,b)=>a.no-b.no || b.yes-a.yes || b.maybe-a.maybe || a.date.localeCompare(b.date));
  $('candidateDates').replaceChildren(...candidates.slice(0,3).map(day=>{
    const row=el('li');
    row.append(el('strong',longDate(day.date)),el('span',
      `${day.no} unavailable · ${day.yes} available · ${day.maybe} maybe · ${day.unanswered} unanswered`));
    return row;
  }));
}
async function save(action){
  const before=errorCount;
  const status=$('save');
  status.hidden=false;
  pending++;status.textContent='Saving…';
  try{await action()}catch{errorCount++;status.textContent='Couldn’t save. Check your connection and try again.'}
  finally{pending--;if(!pending && before===errorCount) status.textContent=firebaseConfig?'Saved':'Saved on this device'}
}
function renderDetails(){
  $('daySummary').hidden=false;
  $('detailTitle').textContent=longDate(selected);
  const rows=$('roster');rows.replaceChildren();
  for(const {uid,name} of players()){
    const row=el('div',undefined,'row'), status=uid?vote(uid,selected):'';
    row.append(el('span',name+(uid===myVoteId()?' (you)':'')),el('small',names[status]||'Unanswered',status));
    rows.append(row);
  }
  const same=data.night===selected;
  $('confirm').hidden=localSlot!=='0';
  $('confirm').textContent=same?'Unconfirm game night':data.night>=today?'Move game night here':'Confirm game night';
}
function chooseDay(date){
  selected=date;
  renderDetails();
  const uid=myVoteId();
  const key=uid+'_'+date;
  const current=pendingVotes.get(key)?.status ?? vote(uid,date);
  if(!current && brush==='clear') return;
  const change={status:current===brush || brush==='clear'?'':brush};
  const slot=localSlot;
  pendingVotes.set(key,change);
  save(async()=>{
    try{await store.mark(date,change.status||'clear',slot)}
    finally{if(pendingVotes.get(key)===change) pendingVotes.delete(key)}
  });
}
function switchMonth(index){
  active=index;
  document.querySelectorAll('.month').forEach((m,i)=>m.classList.toggle('active',i===active));
  document.querySelectorAll('.monthSwitch button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===active)));
}
function build(){
  for(const [key,name] of Object.entries(names)){
    const control=button(marks[key]+' '+name,()=>{
      brush=key;
      for(const choice of $('quickMark').children) choice.setAttribute('aria-pressed',String(choice.dataset.status===brush));
      $('calendarHelp').textContent=brush==='clear'?'Tap a date to clear your answer.':`Tap a date to mark ${names[brush].toLowerCase()}. Tap a matching answer to clear it.`;
      refresh();
    },'pill '+key);
    control.dataset.status=key;
    control.setAttribute('aria-pressed',String(key===brush));
    $('quickMark').append(control);
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
  const key='table-night-preview-v2';
  let local;
  try{local=JSON.parse(localStorage.getItem(key))}catch{}
  if(!local){
    local={roster:['You','Ada','Sam'],votes:{},night:''};
    for(const day of cells.keys()){
      const dow=new Date(day+'T12:00:00').getDay();
      if([4,5,6].includes(dow)) local.votes['slot-1_'+day]=dow===4?'maybe':'yes';
      if([0,5,6].includes(dow)) local.votes['slot-2_'+day]=dow===6?'maybe':'yes';
    }
  }
  function persist(next){localStorage.setItem(key,JSON.stringify(next));local=next;data=local;refresh()}
  localSlot='0';
  store={mark(day,status){
    const next=structuredClone(local);
    if(status==='clear') delete next.votes['slot-0_'+day];else next.votes['slot-0_'+day]=status;
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
  store=await (await import('./cloud.js?v=15')).connect(firebaseConfig,roomId);
  if(!creating){
    roomInfo=await store.roomInfo();
    if(!roomInfo) throw Error('This table could not be found. Check your invite link.');
    if(!Array.isArray(roomInfo.roster)) throw Error('This table has no roster. Create a new table to send a fresh invite.');
    if(!new URLSearchParams(location.search).has('choose')){
      try{localSlot=localStorage.getItem('table-night-player:'+roomId)}catch{}
      if(validSelection(localSlot)){remember();watch();return}
    }
  }
  await showJoin();
}
function validSelection(slot){
  return typeof slot==='string' && /^(0|[1-9][0-9]*)$/.test(slot) && Number(slot)<roomInfo.roster.length;
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
    $('player').replaceChildren(new Option('Select your name',''));
    for(const [index,name] of roomInfo.roster.entries()){
      $('player').add(new Option(index===0?name+' (host)':name,String(index)));
    }
  }
  $('join').hidden=false;
}
function remember(){
  // A table is usable even if the browser blocks local storage.
  try{
    localStorage.setItem('table-night-room',roomId);
    if(roomInfo?.roster) localStorage.setItem('table-night-player:'+roomId,localSlot);
  }catch{}
  try{history.replaceState(null,'',inviteUrl())}catch{}
}
function inviteUrl(){
  const url=new URL(location.href);
  url.searchParams.delete('new');
  url.searchParams.delete('choose');
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
  if(!creating && roomInfo?.roster){
    if(!validSelection(slot)) return;
    localSlot=slot;
    remember();
    watch();
    return;
  }
  $('joinButton').disabled=true;
  $('notice').textContent=creating?'Creating your table…':'Joining the table…';
  try{
    await store.createTable(roster);
  }catch(err){
    $('joinButton').disabled=false;
    const code=typeof err?.code==='string' && /^[a-z/-]+$/.test(err.code)?err.code:'unknown';
    const stage=err.stage?` · ${err.stage}`:'';
    $('notice').textContent=`Couldn’t ${creating?'create':'join'} the table (${code}${stage}). Try again.`;
    return;
  }
  if(roster){roomInfo={roster};localSlot='0'}
  creating=false;
  remember();
  watch();
};
$('switchPlayer').onclick=()=>{
  const url=new URL(inviteUrl());
  url.searchParams.set('choose','1');
  location.assign(url);
};
$('confirm').onclick=()=>{const night=data.night===selected?'':selected;save(()=>store.schedule(night))};
$('done').onclick=()=>$('invite').close();
$('share').onclick=()=>{$('inviteHelp').textContent=data.roster?'Anyone with this link can select any name and edit that player’s availability. Selecting the host also lets them confirm the date.':'Anyone with this link can join and see availability.';$('inviteLink').value=inviteUrl();$('copy').textContent='Copy link';$('invite').showModal()};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copy').textContent='Copied'}catch{$('inviteLink').select();$('copy').textContent='Select and copy the link'}};
window.addEventListener('hashchange',()=>{if(roomId && location.hash!=='#room='+roomId) location.reload()});
function checkDate(){if(!pending && dateKey(new Date())!==today) location.reload()}
window.addEventListener('focus',checkDate);setInterval(checkDate,60000);
start().catch(err=>{$('notice').textContent=err.message.startsWith('This ')?err.message:'Couldn’t open this calendar. Check connectivity and Firebase setup, then reload.'});
