const {createClient}=require('@supabase/supabase-js');
const webpush=require('web-push');
exports.handler=async(event)=>{
if(event.httpMethod!=='POST')return{statusCode:405,body:'Method not allowed'};
const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer /i,'');
if(!token)return{statusCode:401,body:'Sign in required'};
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)return{statusCode:503,body:'Server configuration incomplete'};
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:{user},error}=await db.auth.getUser(token);
if(error||!user)return{statusCode:401,body:'Invalid session'};
const {data:subs,error:queryError}=await db.from('push_subscriptions').select('endpoint,subscription').eq('user_id',user.id).eq('enabled',true);
if(queryError)return{statusCode:500,body:'Subscriptions unavailable'};
if(!subs?.length)return{statusCode:404,body:'No active subscriptions'};
webpush.setVapidDetails('mailto:'+(process.env.VAPID_CONTACT_EMAIL||'notifications@example.com'),process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
let sent=0;
for(const sub of subs){try{await webpush.sendNotification(sub.subscription,JSON.stringify({body:'Bu bir My Cycle test bildirimidir 💗'}));sent++}catch(e){console.error('Test push delivery failed',e.statusCode||'',e.message);if([404,410].includes(e.statusCode))await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',sub.endpoint)}}
return{statusCode:sent?200:502,body:JSON.stringify({sent})};
};