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
let store, data, view='mine', brush='yes', active=0, selected='', pending=0, roomId='', creating=false;
let errorCount=0;
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
function refresh(){
  if(!data) return;
  $('board').hidden=false;
  $('paint').hidden=view!=='mine';$('groupHelp').hidden=view!=='group';
  for(const id of ['mine','group']) $(id).setAttribute('aria-pressed',String(view===id));
  Array.from($('brushes').children).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status===brush)));
  const members=Object.keys(data.members);
  for(const [date,b] of cells){
    const mine=vote(store.uid,date);
    const count=members.filter(uid=>vote(uid,date)==='yes').length;
    const scheduled=data.night===date;
    const heat=count?'heat'+Math.ceil(3*count/members.length):'';
    b.className=['day',view==='mine'?mine:heat,date===today?'today':'',scheduled?'scheduled':''].join(' ');
    b.lastChild.textContent=view==='mine'?(marks[mine]||''):`${count}/${members.length}`;
    b.setAttribute('aria-label',[longDate(date),date===today?'today':'',scheduled?'confirmed game night':'',view==='mine'?(names[mine]||'Unanswered'):`${count} of ${members.length} available`].filter(Boolean).join(', '));
  }
  $('identity').textContent=(data.members[store.uid]||'You')+' · '+members.length+(members.length===1?' player':' players');
  if(data.night>=today) $('identity').textContent+=' · ★ Game night '+longDate(data.night);
  if($('detail').open) renderDetails();
}
async function save(action){
  const before=errorCount;
  pending++;$('save').textContent='Saving…';
  try{await action()}catch{errorCount++;$('save').textContent='Couldn’t save. Check your connection and try again.'}
  finally{pending--;if(!pending && before===errorCount) $('save').textContent=firebaseConfig?'Saved':'Saved on this device'}
}
function renderDetails(){
  $('detailTitle').textContent=longDate(selected);
  const rows=$('roster');rows.replaceChildren();
  for(const [uid,name] of Object.entries(data.members).sort((a,b)=>a[1].localeCompare(b[1]))){
    const row=el('div',undefined,'row'), status=vote(uid,selected);
    row.append(el('span',name+(uid===store.uid?' (you)':'')),el('small',names[status]||'Unanswered',status));
    rows.append(row);
  }
  const same=data.night===selected;
  $('confirm').hidden=data.host!==store.uid;
  $('confirm').textContent=same?'Unconfirm game night':data.night>=today?'Move game night here':'Confirm game night';
}
function chooseDay(date){
  if(view==='mine'){save(()=>store.mark(date,brush));return}
  selected=date;renderDetails();$('detail').showModal();
}
function switchMonth(index){
  active=index;
  document.querySelectorAll('.month').forEach((m,i)=>m.classList.toggle('active',i===active));
  document.querySelectorAll('.monthSwitch button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===active)));
}
function build(){
  for(const [key,name] of Object.entries(names)){
    const b=button(marks[key]+' '+name,()=>{brush=key;refresh()},'pill '+key);
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
      b.append(el('span',String(date.getDate())),el('small'));
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
  if(!local){
    local={members:{you:'You',ada:'Ada',sam:'Sam'},host:'you',votes:{},night:''};
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
  const saved=localStorage.getItem('table-night-room');
  roomId=hash.slice(5)||saved;
  creating=!roomId;
  if(creating) roomId=crypto.randomUUID().replaceAll('-','');
  store=await (await import('./cloud.js')).connect(firebaseConfig,roomId);
  if(!creating && !(await store.exists())) throw Error('This table could not be found. Check your invite link.');
  if(!creating && await store.joined()){remember();watch();return}
  $('notice').textContent=creating?'Create a table and invite your friends.':'Enter your name to join this table.';
  $('joinButton').textContent=creating?'Create table':'Join table';$('join').hidden=false;
}
function remember(){
  location.hash='room='+roomId;localStorage.setItem('table-night-room',roomId);
}
$('join').onsubmit=async e=>{
  e.preventDefault();const name=$('name').value.trim();
  if(!name){$('name').focus();return}
  $('joinButton').disabled=true;
  try{await store.join(name,creating);remember();watch()}
  catch{$('notice').textContent='Couldn’t join the table. Check the connection and Firestore rules.'}
  finally{$('joinButton').disabled=false}
};
for(const id of ['mine','group']) $(id).onclick=()=>{view=id;refresh()};
$('confirm').onclick=()=>{const night=data.night===selected?'':selected;$('detail').close();save(()=>store.schedule(night))};
$('close').onclick=()=>$('detail').close();
$('done').onclick=()=>$('invite').close();
$('share').onclick=()=>{$('inviteLink').value=location.href;$('copy').textContent='Copy link';$('invite').showModal()};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copy').textContent='Copied'}catch{$('inviteLink').select();$('copy').textContent='Select and copy the link'}};
window.addEventListener('hashchange',()=>{if(roomId && location.hash!=='#room='+roomId) location.reload()});
function checkDate(){if(!pending && dateKey(new Date())!==today) location.reload()}
window.addEventListener('focus',checkDate);setInterval(checkDate,60000);
start().catch(err=>{$('notice').textContent=err.message.startsWith('This ')?err.message:'Couldn’t open this calendar. Check connectivity and Firebase setup, then reload.'});
