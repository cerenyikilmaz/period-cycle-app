import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const plus=(iso,days)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
function nextDate(starts,cycle,today){
  if(!starts.length)return null;
  const gaps=[];
  for(let i=1;i<starts.length;i++){const d=days(starts[i-1],starts[i]);if(d>=15&&d<=60)gaps.push(d)}
  const length=gaps.length>=2?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):cycle;
  let candidate=plus(starts[starts.length-1],length);
  for(let i=0;i<300&&candidate<today;i++)candidate=plus(candidate,length);
  return candidate;
}
async function sendReminders(env){
  for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY']){
    if(!env[key])throw new Error('Missing Worker secret: '+key);
  }
  webpush.setVapidDetails('mailto:'+(env.VAPID_CONTACT_EMAIL||'admin@example.com'),env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
  const today=new Date().toISOString().slice(0,10);
  const {data:subs,error:se}=await client.from('push_subscriptions').select('user_id,endpoint,subscription').eq('enabled',true);
  if(se)throw se;
  let sent=0,failed=0;
  for(const sub of subs||[]){
    try{
      const [{data:periods,error:pe},{data:profile,error:re}]=await Promise.all([
        client.from('periods').select('start_date').eq('user_id',sub.user_id).order('start_date',{ascending:true}),
        client.from('profiles').select('cycle_length').eq('user_id',sub.user_id).maybeSingle()
      ]);
      if(pe||re)throw pe||re;
      const predicted=nextDate((periods||[]).map(x=>x.start_date),profile?.cycle_length||28,today);
      if(!predicted||plus(today,2)!==predicted)continue;
      const id=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.user_id+'|'+sub.endpoint+'|'+predicted));
      const hash=Array.from(new Uint8Array(id),b=>b.toString(16).padStart(2,'0')).join('');
      const {data:existing,error:ee}=await client.from('push_delivery_log').select('id').eq('id',hash).maybeSingle();
      if(ee)throw ee;
      if(existing)continue;
      await webpush.sendNotification(sub.subscription,JSON.stringify({body:'Regl tarihin yaklaşıyor 💗'}));
      const {error:le}=await client.from('push_delivery_log').insert({id:hash,user_id:sub.user_id,predicted_date:predicted});
      if(le)throw le;
      sent++;
    }catch(e){
      failed++;
      if(e.statusCode===404||e.statusCode===410)await client.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);
      console.error('Push delivery failed:',e.message);
    }
  }
  return {sent,failed};
}
// One-off scheduled test. Remove the TEST_* secrets after the first successful run.
async function sendOneTimeTest(env){
  if(!env.TEST_USER_ID || !env.TEST_RUN_ID)return;
  const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'];
  for(const key of required)if(!env[key])throw new Error('Missing Worker secret: '+key);
  const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
  const runId=env.TEST_RUN_ID;
  const {data:subs,error}=await client.from('push_subscriptions').select('user_id,endpoint,subscription').eq('user_id',env.TEST_USER_ID).eq('enabled',true);
  if(error)throw error;
  webpush.setVapidDetails('mailto:'+(env.VAPID_CONTACT_EMAIL||'admin@example.com'),env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  let sent=0,failed=0;
  for(const sub of subs||[]){
    const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test|'+runId+'|'+sub.user_id+'|'+sub.endpoint));
    const id=Array.from(new Uint8Array(hashBytes),b=>b.toString(16).padStart(2,'0')).join('');
    const {data:existing,error:lookupError}=await client.from('push_delivery_log').select('id').eq('id',id).maybeSingle();
    if(lookupError)throw lookupError;
    if(existing)continue;
    try{
      await webpush.sendNotification(sub.subscription,JSON.stringify({body:'Minik bir deneme bildirimi 💗 Bildirim sistemimiz artık Cloudflare\'da!'}));
      const {error:logError}=await client.from('push_delivery_log').insert({id,user_id:sub.user_id,predicted_date:new Date().toISOString().slice(0,10)});
      if(logError)throw logError;
      sent++;
    }catch(e){failed++;console.error('Test push failed:',e.message)}
  }
  console.log('One-time targeted test',JSON.stringify({sent,failed}));
}
export default {
  async scheduled(event,env,ctx){ctx.waitUntil(event.cron==='*/5 * * * *'?sendOneTimeTest(env):sendReminders(env).then(result=>console.log('Reminder run',JSON.stringify(result))))},
  async fetch(){return new Response('My Cycle reminders worker is running.',{status:200})}
};
