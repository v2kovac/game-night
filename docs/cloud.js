import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,updateDoc,deleteDoc,onSnapshot,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function connect(config, roomId) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const db = getFirestore(app);
  const room = doc(db,'rooms',roomId);
  const member = doc(room,'members',user.uid);
  const people = collection(room,'members');
  const vote = date => doc(room,'months',date.slice(0,7),'votes',user.uid+'_'+date);
  return {
    uid:user.uid,
    async exists(){return (await getDoc(room)).exists()},
    async joined(){return (await getDoc(member)).exists()},
    async join(name,create){
      const batch = writeBatch(db);
      if(create) batch.set(room,{host:user.uid,night:''});
      batch.set(member,{name});
      await batch.commit();
    },
    watch(months, publish, fail){
      const data={members:{},votes:{},host:'',night:''};
      const ready=new Set(), monthly={};
      function changed(key){
        ready.add(key);
        if(ready.size===months.length+2) publish(data);
      }
      const stops=[
        onSnapshot(room,s=>{Object.assign(data,s.data());changed('room')},fail),
        onSnapshot(people,s=>{data.members=Object.fromEntries(s.docs.map(d=>[d.id,d.data().name]));changed('people')},fail)
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
    async mark(date,status){
      if(status==='clear') await deleteDoc(vote(date));
      else await setDoc(vote(date),{uid:user.uid,date,status});
    },
    async schedule(date){await updateDoc(room,{night:date})}
  };
}
