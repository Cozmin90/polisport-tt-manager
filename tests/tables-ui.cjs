const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const uid='00000000-0000-4000-8000-000000000001';const tid='00000000-0000-4000-8000-000000000002';
 const user={id:uid,email:'test@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}};
 await context.addInitScript(({user})=>localStorage.setItem('sb-sxvegutmaojaeanaikaq-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),{user});
 let created;let tables=4;let groups=[];let members=[];let matches=[];
 const regs=Array.from({length:24},(_,i)=>({player_id:`player-${i}`,status:'REGISTERED',present:true,attended:true,mp_before:24-i,players:{full_name:`Player ${i}`,mp:24-i,mp_max:24-i,amatur_mp:0}}));
 await context.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;const method=route.request().method();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/user'))return send(user);
  if(path.endsWith('/players'))return send({id:uid,is_admin:true});
  if(path.endsWith('/tournaments')){
   if(method==='POST'){created=route.request().postDataJSON();return send([],201);}
   if(method==='PATCH'){tables=route.request().postDataJSON().table_count;return send({table_count:tables});}
   if(!url.searchParams.has('id'))return send([]);
   return send({id:tid,title:'Test tables',format:'GROUPS_KO',status:'UPCOMING',registration_open:true,max_players:24,table_count:tables,is_rated:false});
  }
  if(path.endsWith('/registrations'))return send(regs);
  if(path.endsWith('/groups')){
   if(method==='POST'){groups=route.request().postDataJSON().map((g,i)=>({...g,id:`group-${i}`}));return send(groups,201);}
   return send(groups.filter(g=>`eq.${g.stage}`===url.searchParams.get('stage')));
  }
  if(path.endsWith('/group_members')){
   if(method==='POST'){members=route.request().postDataJSON();return send([],201);}
   return send(members.filter(m=>`eq.${m.group_id}`===url.searchParams.get('group_id')).map(m=>({...m,players:{full_name:m.player_id}})));
  }
  if(path.endsWith('/matches')){
   if(method==='POST'){matches=route.request().postDataJSON();return send([],201);}
   return send(matches.filter(m=>`eq.${m.stage}`===url.searchParams.get('stage')).map((m,i)=>({...m,id:`match-${i}`})));
  }
  return send([]);
 });
 await page.goto('http://localhost:3100/admin/tournaments/new');
 await page.getByPlaceholder('Ex: PoliSport TT – Etapa 1').fill('Large tournament Hobby');
 await page.locator('input[type=datetime-local]').fill('2026-10-01T10:00');
 await page.getByPlaceholder('Ex: 16 (lasă gol pentru nelimitat)').fill('24');
 await page.getByLabel('Mese disponibile pentru acest turneu').fill('4');
 await page.getByRole('status').filter({hasText:'4 grupe × 6 jucători'}).waitFor();
 await page.getByRole('button',{name:'Creează turneu',exact:true}).click();
 await page.waitForURL('http://localhost:3100/');assert.equal(created.table_count,4);assert.equal(created.max_players,24);
 await page.goto('http://localhost:3100/admin/tournaments/'+tid);
 await page.getByLabel('Mese disponibile pentru acest turneu').waitFor();
 assert.equal(await page.getByLabel('Mese disponibile pentru acest turneu').inputValue(),'4');
 await page.getByLabel('Mese disponibile pentru acest turneu').fill('5');
 await page.getByRole('button',{name:'Salvează numărul de mese'}).click();
 await page.getByText(/Mese salvate: 5/).waitFor();assert.equal(tables,5);
 await page.getByLabel('Mese disponibile pentru acest turneu').fill('4');
 await page.getByRole('button',{name:'Salvează numărul de mese'}).click();
 await page.getByText(/Mese salvate: 4/).waitFor();
 await page.getByRole('button',{name:'GENEREAZĂ GRUPE ȘI MECIURI (GRUPE)',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#table-count')?.disabled);
 assert.equal(groups.length,4);assert.equal(members.length,24);
 assert.equal(new Set(members.map(m=>m.player_id)).size,24);
 for(const group of groups)assert.equal(members.filter(m=>m.group_id===group.id).length,6);
 await page.waitForTimeout(300);assert.equal(matches.length,60);
 assert.deepEqual(errors,[]);
 console.log('PASS: create 24/4, persisted setting, edit 5→4, generate 4 groups of 6, all 24 assigned once, 60 matches, field locked afterwards. API fixtures only.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
