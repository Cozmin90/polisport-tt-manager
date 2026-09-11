// Browser integration with isolated API fixtures; no production accounts or writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
 try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const uid='00000000-0000-4000-8000-000000000001';
  const user={id:uid,email:'privacy@example.test',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:new Date().toISOString()};
  let events=[]; let failure=false; let signup;
  await context.route('https://*.supabase.co/**',async route=>{
   const url=new URL(route.request().url()); const method=route.request().method();
   const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname.endsWith('/signup')) {signup=route.request().postDataJSON(); return respond({user,session:null});}
   if(url.pathname.endsWith('/user')) return respond(user);
   if(url.pathname.endsWith('/privacy_events')) {
    if(method==='POST') {
     if(failure) return respond({message:'Simulated failure'},500);
     const event={...route.request().postDataJSON(),id:events.length+1,created_at:new Date().toISOString()};
     events = [event, ...events.filter(previous=>previous.kind!==event.kind)]; return respond(event,201);
    }
    return respond(events);
   }
   if(url.pathname.endsWith('/players')) return respond({id:uid,full_name:'Privacy Test',first_name:'Privacy',last_name:'Test',mp:2,mp_max:2,is_admin:false});
   return respond([]);
  });
  await page.goto('http://localhost:3100/login?mode=register');
  const notice=page.getByRole('checkbox',{name:/Am citit cum/});
  const media=page.getByRole('checkbox',{name:/Sunt de acord să fiu/});
  assert.equal(await notice.isChecked(),false); assert.equal(await media.isChecked(),false);
  assert.equal(await notice.getAttribute('required'),''); assert.equal(await media.getAttribute('required'),null);
  await page.getByPlaceholder('Nume',{exact:true}).fill('Test');
  await page.getByPlaceholder('Prenume',{exact:true}).fill('Privacy');
  await page.getByPlaceholder('Email',{exact:true}).fill('privacy@example.test');
  await page.getByPlaceholder('Parolă',{exact:true}).fill('Example123456!');
  await notice.check(); await page.getByRole('button',{name:'Creează cont'}).click();
  await page.getByText('Cont creat. Verifică emailul și apoi fă login.').waitFor();
  assert.equal(signup.data.media_consent,false); assert.equal(signup.data.privacy_notice_read,true);
  await context.addInitScript(({user})=>localStorage.setItem('sb-sxvegutmaojaeanaikaq-auth-token',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user});
  await page.goto('http://localhost:3100/account');
  const accountMedia=page.getByRole('checkbox',{name:/Sunt de acord să fiu/});
  await page.getByText('Acord neexprimat',{exact:true}).waitFor();
  assert.equal(await accountMedia.isChecked(),false);
  await accountMedia.click(); await page.getByRole('status').filter({hasText:'Opțiunea a fost salvată.'}).waitFor();
  assert.equal(events[0].accepted,true);
  await accountMedia.click(); await page.getByRole('status').filter({hasText:'Consimțământul foto-video a fost retras'}).waitFor();
  assert.equal(events[0].accepted,false);
  await page.reload(); await page.getByText('Fără acord foto-video',{exact:true}).first().waitFor();
  assert.equal(await accountMedia.isChecked(),false);
  failure=true; await accountMedia.click(); await page.getByRole('status').filter({hasText:'Salvarea nu a reușit'}).waitFor();
  assert.equal(await accountMedia.isChecked(),false); assert.equal(events.length,1);
  assert.equal(await page.getByText('Istoricul opțiunilor').count(),0);
  await page.getByText(/Ultima modificare:/).waitFor();
  assert.equal(await page.getByText('Opțional.',{exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:process.env.PRIVACY_SCREENSHOT || 'privacy-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: unchecked defaults, optional media signup, grant, withdrawal, reload persistence, failure preservation, mobile layout; API fixtures only.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

