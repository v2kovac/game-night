import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeFirestore,doc,collection,getDoc,getDocFromServer,runTransaction,setDoc,updateDoc,deleteDoc,onSnapshot,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function connect(config, roomId) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  // Avoid streaming responses being buffered by mobile browsers or proxies.
  const db = initializeFirestore(app, {experimentalForceLongPolling:true});
  const room = doc(db,'rooms',roomId);
  const member = doc(room,'members',user.uid);
  const people = collection(room,'members');
  const vote = (date,uid) => doc(room,'months',date.slice(0,7),'votes',uid+'_'+date);
  return {
    uid:user.uid,
    async roomInfo(){return (await getDoc(room)).data()},
    async joined(){return (await getDoc(member)).exists()},
    async join({name,roster,slot}){
      let stage='membership write';
      const writeSelection=async()=>{
        if(slot!==undefined && slot!=='0'){
          const claim=doc(room,'claims',slot);
          stage='roster lookup';
          const existing=await getDocFromServer(claim);
          stage='membership write';
          if(existing.exists()){
            await setDoc(member,{slot});
            return;
          }
          stage='first selection';
          await runTransaction(db,async transaction=>{
            // Recheck inside the transaction so simultaneous joins keep one vote identity.
            if(!(await transaction.get(claim)).exists()) transaction.set(claim,{uid:user.uid});
            transaction.set(member,{slot});
          });
          return;
        }
        const batch = writeBatch(db);
        if(roster) batch.set(room,{host:user.uid,night:'',roster});
        batch.set(member,slot===undefined?{name}:{slot});
        await batch.commit();
      };

      try{
        try{await writeSelection()}
        catch(err){
          if(roster || !['permission-denied','unauthenticated'].includes(err.code)) throw err;
          stage='session refresh';
          // Keep the existing browser identity and refresh only its credentials.
          await user.getIdToken(true);
          if(auth.currentUser?.uid!==user.uid) throw err;
          await writeSelection();
        }
      }catch(err){
        throw Object.assign(new Error('Unable to save player selection'),{code:err.code,stage});
      }
    },
    watch(months, fixedRoster, publish, fail){
      const data={members:{},claims:{},votes:{},host:'',night:''};
      const ready=new Set(), monthly={};
      function changed(key){
        ready.add(key);
        if(ready.size===months.length+(fixedRoster?3:2)) publish(data);
      }
      const stops=[
        onSnapshot(room,s=>{Object.assign(data,s.data());changed('room')},fail),
        onSnapshot(people,s=>{data.members=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));changed('people')},fail)
      ];
      if(fixedRoster){
        stops.push(onSnapshot(collection(room,'claims'),s=>{
          data.claims=Object.fromEntries(s.docs.map(d=>[d.id,d.data().uid]));
          changed('claims');
        },fail));
      }
      for(const month of months){
        stops.push(onSnapshot(collection(room,'months',month,'votes'),snap=>{
          monthly[month]=Object.fromEntries(snap.docs.map(d=>[d.id,d.data().status]));
          data.votes=Object.assign({},...Object.values(monthly));
          changed(month);
        },fail));
      }
      return ()=>stops.forEach(stop=>stop());
    },
    async mark(date,status,uid=user.uid){
      if(status==='clear') await deleteDoc(vote(date,uid));
      else await setDoc(vote(date,uid),{uid,date,status});
    },
    async schedule(date){await updateDoc(room,{night:date})}
  };
}
