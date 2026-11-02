const {createClient}=require('@supabase/supabase-js');
const webpush=require('web-push');
const {createHash}=require('node:crypto');
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const plus=(iso,days)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
function nextDate(starts,cycle,today){if(!starts.length)return null;const gaps=[];for(let i=1;i<starts.length;i++){const d=days(starts[i-1],starts[i]);if(d>=15&&d<=60)gaps.push(d)}const length=gaps.length>=2?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):cycle;let candidate=plus(starts[starts.length-1],length);for(let i=0;i<300&&candidate<today;i++)candidate=plus(candidate,length);return candidate}
exports.handler=async()=>{const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'];if(required.some(k=>!process.env[k]))return{statusCode:500,body:'Missing server configuration'};
webpush.setVapidDetails('mailto:'+ (process.env.VAPID_CONTACT_EMAIL||'admin@example.com'),process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const client=db(),today=new Date().toISOString().slice(0,10);let sent=0,failed=0;
const {data:subs,error:se}=await client.from('push_subscriptions').select('user_id,endpoint,subscription').eq('enabled',true);if(se)throw se;
for(const sub of subs||[]){try{const [{data:periods,error:pe},{data:profile,error:re}]=await Promise.all([client.from('periods').select('start_date').eq('user_id',sub.user_id).order('start_date',{ascending:true}),client.from('profiles').select('cycle_length').eq('user_id',sub.user_id).maybeSingle()]);if(pe||re)throw pe||re;
const starts=(periods||[]).map(x=>x.start_date),predicted=nextDate(starts,profile?.cycle_length||28,today);if(!predicted||plus(today,2)!==predicted)continue;
const id=createHash('sha256').update(sub.user_id+'|'+sub.endpoint+'|'+predicted).digest('hex');
const {data:existing,error:ee}=await client.from('push_delivery_log').select('id').eq('id',id).maybeSingle();if(ee)throw ee;if(existing)continue;
await webpush.sendNotification(sub.subscription,JSON.stringify({body:'Regl tarihin yaklaşıyor 💗'}));
const {error:le}=await client.from('push_delivery_log').insert({id,user_id:sub.user_id,predicted_date:predicted});if(le)throw le;sent++;
}catch(e){failed++;if(e.statusCode===404||e.statusCode===410)await client.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);console.error('Push delivery failed:',e.message)}}
return{statusCode:200,body:JSON.stringify({sent,failed})}};
