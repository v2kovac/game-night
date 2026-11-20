import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeFirestore,doc,collection,getDoc,setDoc,updateDoc,deleteDoc,onSnapshot} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function connect(config, roomId) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  // Avoid streaming responses being buffered by mobile browsers or proxies.
  const db = initializeFirestore(app, {experimentalForceLongPolling:true});
  const room = doc(db,'rooms',roomId);
  const vote = (date,slot) => doc(room,'months',date.slice(0,7),'votes','slot-'+slot+'_'+date);
  return {
    async roomInfo(){return (await getDoc(room)).data()},
    async createTable(roster){await setDoc(room,{night:'',roster})},
    watch(months, publish, fail){
      const data={votes:{},night:''};
      const ready=new Set(), monthly={};
      function changed(key){
        ready.add(key);
        if(ready.size===months.length+1) publish(data);
      }
      const stops=[
        onSnapshot(room,s=>{Object.assign(data,s.data());changed('room')},fail)
      ];
      for(const month of months){
        stops.push(onSnapshot(collection(room,'months',month,'votes'),snap=>{
          monthly[month]=Object.fromEntries(snap.docs.map(d=>[d.id,d.data().status]));
          data.votes=Object.assign({},...Object.values(monthly));
          changed(month);
        },fail));
      }
      return ()=>stops.forEach(stop=>stop());
    },
    async mark(date,status,slot){
      const target=vote(date,slot);
      const write=()=>status==='clear'?deleteDoc(target):setDoc(target,{date,status,slot});
      try{await write()}
      catch(err){
        if(!['permission-denied','unauthenticated'].includes(err.code)) throw err;
        await user.getIdToken(true);
        if(auth.currentUser?.uid!==user.uid) throw err;
        await write();
      }
    },
    async schedule(date){await updateDoc(room,{night:date})}
  };
}
