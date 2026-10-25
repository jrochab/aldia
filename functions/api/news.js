// Cloudflare Pages Function: GET /api/news
// Edite SOURCES para cambiar medios o cantidades. Solo medios sin suscripción.
const SOURCES={
 nacional:{n:4,feeds:['https://www.diarioextra.com/feed/','https://www.crhoy.com/feed/','https://www.lateja.cr/arc/outboundfeeds/rss/?outputType=xml','https://semanariouniversidad.com/feed/','https://www.teletica.com/rss/feed/noticias/nacional']},
 mundo:{n:3,feeds:['https://feeds.bbci.co.uk/mundo/rss.xml','https://rss.dw.com/rdf/rss-es-all','https://www.france24.com/es/rss']},
 deportes:{n:3,feeds:['https://www.diarioextra.com/categoria/deportes/feed/','https://www.lateja.cr/arc/outboundfeeds/rss/?outputType=xml']},
 tecnologia:{n:2,feeds:['https://feeds.weblogssl.com/xataka2','https://feeds.weblogssl.com/genbeta']}};
const MAX_AGE_H=36,BLOCK=/nacion\.com|elfinancierocr|elpais\.com|nytimes|wsj\.com|ft\.com/i,UA={'user-agent':'Mozilla/5.0 (compatible; AlDiaBot/1.0)'};
const SPORT=/deport|f[uú]tbol|baloncesto|boxeo|tenis|b[eé]isbol|ciclismo|nataci[oó]n|liga|selecci[oó]n/i;
const tag=(s,t)=>{const m=s.match(new RegExp('<'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+t+'>','i'));return m?m[1]:''};
const dec=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,e)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e]));
const txt=s=>dec(dec(s).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function excerpt(s,max=320){s=txt(s).replace(/\s*(?:La entrada|La publicación|El artículo|The post)\b.{0,300}?(?:apareció primero en|appeared first on).*$/i,'').replace(/\s*\[(?:…|\.\.\.)\]\s*$/,'').trim();if(s.length>max){s=s.slice(0,max);const p=Math.max(s.lastIndexOf('. '),s.lastIndexOf('? '),s.lastIndexOf('! '));s=p>max*.5?s.slice(0,p+1):s.slice(0,s.lastIndexOf(' ')).replace(/[\s,;:.]+$/,'')+'…'}return s}
const http=u=>/^https?:\/\//i.test(u)?u:'';
function parse(xml){const head=xml.split(/<item[\s>]|<entry[\s>]/i)[0],source=txt(tag(head,'title'))||'';
 return xml.split(/<item[\s>]|<entry[\s>]/i).slice(1).map(b=>{const d=new Date(txt(tag(b,'pubDate')||tag(b,'published')||tag(b,'updated')||tag(b,'dc:date')));
  const url=http(txt(tag(b,'link'))||(b.match(/<link[^>]+href=["']([^"']+)/i)||[])[1]||'');
  return{title:txt(tag(b,'title')),raw:excerpt(tag(b,'description')||tag(b,'summary')||tag(b,'content:encoded')||tag(b,'content')),url,date:isNaN(d)?null:d.toISOString(),source,tags:[...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(m=>txt(m[1])).join(' ')}}).filter(i=>i.title&&i.url&&i.date)}
const words=t=>new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\W+/).filter(w=>w.length>3));
const similar=(a,b)=>{const x=words(a),y=words(b);let k=0;x.forEach(w=>y.has(w)&&k++);return k/(Math.min(x.size,y.size)||1)>.6};
async function readable(url){try{const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(7000)});if(!r.ok)return null;const h=(await r.text()).slice(0,300000);
 return !(/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(h)||/class=["'][^"']*(paywall|subscriber-only|premium-content)/i.test(h)||/suscr[ií]base para (leer|continuar|acceder)/i.test(h))}catch{return null}}
async function summarize(items,env){if(!env.ANTHROPIC_API_KEY||!items.length)return;try{
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(15000),
 body:JSON.stringify({model:env.MODEL||'claude-haiku-5-5',max_tokens:2000,messages:[{role:'user',content:'Resume cada noticia en 2 oraciones en español neutro, usando solo lo que dice el texto. Responde SOLO un arreglo JSON de strings, en el mismo orden.\n'+JSON.stringify(items.map(i=>i.title+'. '+i.raw))}]})});
 const a=JSON.parse((await r.json()).content[0].text.replace(/```json|```/g,''));items.forEach((i,k)=>{if(typeof a[k]==='string'&&a[k])i.summary=a[k]})}catch{}}
async function build(env){const cache=new Map(),get=u=>cache.get(u)||cache.set(u,fetch(u,{headers:UA,signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.text():Promise.reject()).then(parse).catch(()=>[])).get(u);
 const out=[],now=Date.now();
 for(const[cat,{n,feeds}]of Object.entries(SOURCES)){const lists=await Promise.all(feeds.map(get));let pool=lists.flat().filter(i=>!BLOCK.test(i.url)&&now-Date.parse(i.date)<MAX_AGE_H*36e5&&Date.parse(i.date)<now+36e5);
  if(cat==='deportes')pool=pool.filter(i=>SPORT.test(i.url+' '+i.tags+' '+i.title));
  if(cat==='nacional')pool=pool.filter(i=>!/\/(deportes|mundo|internacional|farandula)\//i.test(i.url));
  pool.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  const picked=[],per={};for(const i of pool){if(picked.some(p=>p.url===i.url||similar(p.title,i.title)))continue;if((per[i.source]||0)>=Math.ceil(n/2))continue;per[i.source]=(per[i.source]||0)+1;picked.push(i);if(picked.length>=n+2)break}
  const ok=await Promise.all(picked.map(i=>readable(i.url)));picked.forEach((i,k)=>i.verified=ok[k]===true);
  const sel=picked.filter((_,k)=>ok[k]===true).concat(picked.filter((_,k)=>ok[k]===null)).slice(0,n).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  sel.forEach(i=>{i.cat=cat;i.summary=i.raw||'Consulte el original.';out.push(i)})}
 await summarize(out,env);return{generated:new Date().toISOString(),items:out.map(({cat,title,summary,source,url,date,verified})=>({cat,title,summary,source,url,date,verified}))}}
export async function onRequestGet({request,env,waitUntil}){const u=new URL(request.url),c=caches.default,key=new Request(u.origin+'/api/news');
 if(!u.searchParams.has('fresh')){const hit=await c.match(key);if(hit)return hit}
 const res=new Response(JSON.stringify(await build(env)),{headers:{'content-type':'application/json;charset=utf-8','cache-control':'public, max-age=900'}});waitUntil(c.put(key,res.clone()));return res}
