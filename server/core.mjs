import {createServer} from 'node:http';
import {readFile, writeFile, rename, mkdir, readdir, unlink} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {probeUrl} from './probe.mjs';
import {promisify} from 'node:util';
const scrypt = promisify(scryptCallback);
export const DEFAULT_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data');
const PUB = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public');
const MAX_REQUEST = 75_000;
const SESSION_DURATION = 8 * 60 * 60 * 1000;
const FAIL_WINDOW = 15 * 60 * 1000;
const FAIL_LIMIT = 7;
const HISTORY_LIMIT = 20;
const AUDIT_LIMIT = 250;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const STATIC = new Map([
  ['/','index.html'], ['/index.html','index.html'], ['/styles.css','styles.css'],
  ['/app.js','app.js'], ['/admin','admin.html'], ['/admin.html','admin.html'],
  ['/admin.css','admin.css'], ['/admin.js','admin.js'], ['/favicon.svg','favicon.svg']
]);
const categories = new Set(['sekolah','publik','internal']);
const icons = new Set(['file-text','graduation-cap','book-open','boxes','briefcase-business','calendar-check']);
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
function ensureText(value, max, label, required=true){
  if (typeof value !== 'string') throw new Error(`${label} harus berupa teks.`);
  const t = value.trim();
  if ((required && !t) || t.length > max) throw new Error(`${label} wajib diisi (maksimal ${max} karakter).`);
  return t;
}
export function checkAppUrl(input, allowLocal=false){
  const v = ensureText(input, 1200, 'URL aplikasi', false);
  if (!v) return '';
  let u; try {u=new URL(v);}catch{throw new Error('URL aplikasi tidak valid.');}
  if (u.username || u.password || u.hash) throw new Error('URL tidak boleh mengandung kredensial atau fragmen.');
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(allowLocal && local && u.protocol === 'http:')) {
    throw new Error('Gunakan HTTPS; hanya HTTP localhost yang diizinkan untuk development.');
  }
  return u.href;
}
export function validateSite(input, allowLocal=false){
  if (!isPlainObject(input) || !isPlainObject(input.school) || !Array.isArray(input.applications)) throw new Error('Struktur konfigurasi tidak valid.');
  const school = {
    name:ensureText(input.school.name,100,'Nama sekolah'),
    shortName:ensureText(input.school.shortName,28,'Nama singkat'),
    subtitle:ensureText(input.school.subtitle || 'Pusat layanan digital sekolah',140,'Subjudul'),
    contactEmail:ensureText(input.school.contactEmail || '',180,'Email bantuan',false),
    academicYear:ensureText(input.school.academicYear,40,'Tahun ajaran')
  };
  if (school.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.contactEmail)) throw new Error('Format email bantuan tidak valid.');
  if (input.applications.length > 36) throw new Error('Maksimal 36 aplikasi.');
  const ids = new Set();
  const applications = input.applications.map((a,i)=>{
    if (!isPlainObject(a)) throw new Error(`Aplikasi #${i+1} tidak valid.`);
    const id=ensureText(a.id,40,'ID aplikasi');
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw new Error(`ID aplikasi ${id} tidak valid atau duplikat.`);
    ids.add(id);
    if (!categories.has(a.category)) throw new Error(`Kategori ${id} tidak dikenali.`);
    if (!icons.has(a.icon)) throw new Error(`Ikon ${id} tidak dikenali.`);
    if (!Array.isArray(a.features) || a.features.length > 8) throw new Error(`Fitur ${id} maksimal delapan.`);
    const features=a.features.map(f=>ensureText(f,45,'Nama fitur'));
    return {
      id, name:ensureText(a.name,90,`Nama ${id}`),
      shortDescription:ensureText(a.shortDescription,280,`Deskripsi ${id}`),
      audience:ensureText(a.audience,200,`Pengguna ${id}`),
      category:a.category, icon:a.icon,
      url:checkAppUrl(a.url || '',allowLocal),
      requirements:ensureText(a.requirements,450,`Syarat ${id}`),
      features, visible:a.visible!==false
    };
  });
  return {school,applications};
}
export async function hashPassword(password){
  if (typeof password!=='string' || password.length < 12 || password.length > 256) throw new Error('Password admin 12–256 karakter.');
  const salt=randomBytes(24).toString('hex');
  const hash=(await scrypt(password,Buffer.from(salt,'hex'),64)).toString('hex');
  return {kdf:'scrypt',salt,hash};
}
async function checkPassword(password, record){
  if (!record || record.kdf!=='scrypt') return false;
  try {
    const expected=Buffer.from(record.hash,'hex');
    if (expected.length!==64 || !/^[0-9a-f]{48}$/.test(record.salt)) return false;
    const candidate=await scrypt(password,Buffer.from(record.salt,'hex'),64);
    return timingSafeEqual(expected,candidate);
  } catch {return false;}
}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function atomicJson(file, val){
  const tmp=`${file}.${randomBytes(8).toString('hex')}.tmp`;
  await mkdir(dirname(file),{recursive:true});
  try {
    await writeFile(tmp,JSON.stringify(val,null,2)+'\n',{mode:0o600,flag:'wx'});
    await rename(tmp,file);
  } catch (e){try{await import('node:fs/promises').then(fs=>fs.unlink(tmp));}catch{} throw e;}
}
function send(res,status,obj,headers={}){
  const body=Buffer.from(JSON.stringify(obj));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store',...headers}); res.end(body);
}
function cookieParams(secure){return `Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION/1000}${secure?'; Secure':''}`;}
function getCookie(req,key){
  const match=(req.headers.cookie||'').match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match?match[1]:null;
}
async function readBody(req){
  if (!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Konten harus JSON.'),{status:415});
  let size=0, chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_REQUEST) throw Object.assign(new Error('Data terlalu besar.'),{status:413});chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('JSON tidak valid.'),{status:400});}
}
function originAllowed(req,secure){
  const origin=req.headers.origin;
  if (origin){
    try {const parsed=new URL(origin);return parsed.host===req.headers.host && (secure?parsed.protocol==='https:': ['http:','https:'].includes(parsed.protocol));}catch{return false;}
  }
  return req.headers['sec-fetch-site']!=='cross-site';
}
export function createPortalServer({dataDir=DEFAULT_DIR,secureCookie=false,allowLocalUrls=true,probe=probeUrl}={}){
  const digest = raw=>createHash('sha256').update(raw).digest('hex');
  const historyDir=join(dataDir,'revisions');
  let lastProbeAt=0;
  const readAudit=async()=>{try{const d=await readJson(join(dataDir,'audit.json'));return Array.isArray(d)?d.slice(-AUDIT_LIMIT):[];}catch(e){if(e.code==='ENOENT')return [];throw e;}};
  const audit=async(action,details={})=>{
    const items=await readAudit();
    items.push({at:new Date().toISOString(),action,details});
    await atomicJson(join(dataDir,'audit.json'),items.slice(-AUDIT_LIMIT));
  };
  const saveHistory=async(raw)=>{
    await mkdir(historyDir,{recursive:true});
    const id=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(5).toString('hex')}`;
    await writeFile(join(historyDir,`${id}.json`),raw,{encoding:'utf8',flag:'wx',mode:0o600});
    const names=(await readdir(historyDir)).filter(x=>/^20[0-9TZa-f-]+\.json$/.test(x)).sort();
    for(const name of names.slice(0,Math.max(0,names.length-HISTORY_LIMIT))) await unlink(join(historyDir,name));
    return id;
  };
  const loadConfig=async()=>{
    const raw=await readFile(join(dataDir,'site.json'),'utf8');
    return {raw,revision:digest(raw),data:validateSite(JSON.parse(raw),allowLocalUrls)};
  };
  const sessions=new Map(), failures=new Map();
  let mutation=Promise.resolve();
  const enqueue=(fn)=>{const job=mutation.then(fn);mutation=job.catch(()=>{});return job;};
  return createServer(async(req,res)=>{
    const common={
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin',
      'X-Frame-Options':'DENY', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      ...(secureCookie?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{})
    };
    Object.entries(common).forEach(([k,v])=>res.setHeader(k,v));
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      const authToken=getCookie(req,'sh_sid');
      const sess=authToken&&sessions.get(authToken);
      const validSession=!!(sess && sess.expires>Date.now());
      if (sess && !validSession) sessions.delete(authToken);
      if(pathname.startsWith('/api/')){
        if(req.method==='GET' && pathname==='/api/health') return send(res,200,{ok:true,service:'SchoolHub',version:'2.1.0'});
        if(req.method==='GET' && pathname==='/api/public/config'){
          const {data}=await loadConfig();
          return send(res,200,{school:data.school,applications:data.applications.filter(a=>a.visible)});
        }
        if(req.method==='GET' && pathname==='/api/admin/session'){
          if (!validSession) return send(res,401,{authenticated:false});
          return send(res,200,{authenticated:true,csrf:sess.csrf});
        }
        if(req.method==='POST' && pathname==='/api/admin/login'){
          if(!originAllowed(req,secureCookie)) return send(res,403,{error:'Permintaan lintas situs ditolak.'});
          const source=req.socket.remoteAddress||'unknown';
          const now=Date.now();
          let record=failures.get(source);if(record&&now>record.until){failures.delete(source);record=null;}
          if(record&&record.attempts>=FAIL_LIMIT) return send(res,429,{error:'Terlalu banyak percobaan. Ulangi dalam 15 menit.'});
          const body=await readBody(req);
          if(typeof body.password!=='string' || body.password.length>256) return send(res,400,{error:'Password tidak valid.'});
          let credential=null;try{credential=await readJson(join(dataDir,'auth.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
          if(!credential) return send(res,503,{error:'Admin belum disiapkan. Jalankan npm run setup-admin di server.'});
          if(!await checkPassword(body.password,credential)){
            failures.set(source,{attempts:(record?.attempts||0)+1,until:now+FAIL_WINDOW});
            return send(res,401,{error:'Kredensial tidak cocok.'});
          }
          failures.delete(source);
          await enqueue(()=>audit('login'));
          if(validSession) sessions.delete(authToken);
          const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
          sessions.set(token,{csrf,expires:now+SESSION_DURATION});
          return send(res,200,{ok:true},{'Set-Cookie':`sh_sid=${token}; ${cookieParams(secureCookie)}`});
        }
        if(!pathname.startsWith('/api/admin/')) return send(res,404,{error:'Tidak ditemukan.'});
        if(!validSession) return send(res,401,{error:'Login admin diperlukan.'});
        if(req.method==='GET' && pathname==='/api/admin/config') {
          const {data,revision}=await loadConfig();
          return send(res,200,{...data,_baseRevision:revision});
        }
        if(req.method==='GET' && pathname==='/api/admin/audit') return send(res,200,{events:(await readAudit()).slice(-100).reverse()});
        if(req.method==='GET' && pathname==='/api/admin/revisions') {
          let names=[];try{names=await readdir(historyDir);}catch(e){if(e.code!=='ENOENT')throw e;}
          const items=names.filter(x=>/^20[0-9TZa-f-]+\.json$/.test(x)).sort().reverse().slice(0,HISTORY_LIMIT)
            .map(filename=>({id:filename.slice(0,-5),createdAt:filename.slice(0,19).replace(/-/g,(c,offset)=>offset===13||offset===16?':':c).replace('T','T')}));
          return send(res,200,{revisions:items});
        }
        if(req.method==='POST' && pathname==='/api/admin/check-links') {
          if(!originAllowed(req,secureCookie)||req.headers['x-csrf-token']!==sess.csrf) return send(res,403,{error:'CSRF tidak valid.'});
          const now=Date.now();
          if(now-lastProbeAt<30000) return send(res,429,{error:'Pemeriksaan tersedia maksimal sekali setiap 30 detik.'});
          lastProbeAt=now;
          const {data}=await loadConfig();
          const results=[];
          // Sequential probes: bounded outbound traffic. No status is published to the public portal.
          for(const app of data.applications){
            const result=await probe(app.url);
            results.push({id:app.id,name:app.name,...result});
          }
          await enqueue(()=>audit('probe',{checked:results.length}));
          return send(res,200,{checkedAt:new Date().toISOString(),results});
        }
        if(req.method==='POST' && pathname==='/api/admin/logout'){
          if(!originAllowed(req,secureCookie)||req.headers['x-csrf-token']!==sess.csrf) return send(res,403,{error:'CSRF tidak valid.'});
          sessions.delete(authToken);
          await enqueue(()=>audit('logout'));
          return send(res,200,{ok:true},{'Set-Cookie':`sh_sid=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie?'; Secure':''}`});
        }
        if(req.method==='PUT' && pathname==='/api/admin/config'){
          if(!originAllowed(req,secureCookie)||req.headers['x-csrf-token']!==sess.csrf) return send(res,403,{error:'CSRF tidak valid.'});
          const body=await readBody(req);
          const candidate=validateSite(body,allowLocalUrls);
          if(typeof body._baseRevision!=='string'||!/^[a-f0-9]{64}$/.test(body._baseRevision)) return send(res,400,{error:'Versi konfigurasi hilang. Muat ulang panel admin.'});
          const result=await enqueue(async()=>{
            const current=await loadConfig();
            if(body._baseRevision!==current.revision) return null;
            await saveHistory(current.raw);
            await atomicJson(join(dataDir,'site.json'),candidate);
            await audit('config-updated',{apps:candidate.applications.length, visible:candidate.applications.filter(a=>a.visible).length});
            return digest(await readFile(join(dataDir,'site.json'),'utf8'));
          });
          if(!result) return send(res,409,{error:'Konfigurasi sudah diperbarui di tab lain. Muat ulang sebelum menyimpan.'});
          return send(res,200,{ok:true,updatedAt:new Date().toISOString(),revision:result});
        }
        if(req.method==='POST' && pathname==='/api/admin/restore'){
          if(!originAllowed(req,secureCookie)||req.headers['x-csrf-token']!==sess.csrf) return send(res,403,{error:'CSRF tidak valid.'});
          const body=await readBody(req);
          if(typeof body.id!=='string'||!/^20[0-9TZa-f-]{20,55}$/.test(body.id)||typeof body._baseRevision!=='string') return send(res,400,{error:'ID revisi atau versi konfigurasi tidak valid.'});
          const result=await enqueue(async()=>{
            const current=await loadConfig();
            if(current.revision!==body._baseRevision) return {conflict:true};
            let original;
            try {original=await readFile(join(historyDir,`${body.id}.json`),'utf8');}
            catch(e){if(e.code==='ENOENT')return {missing:true};throw e;}
            const restored=validateSite(JSON.parse(original),allowLocalUrls);
            await saveHistory(current.raw);
            await atomicJson(join(dataDir,'site.json'),restored);
            await audit('config-restored',{from:body.id});
            return {revision:digest(await readFile(join(dataDir,'site.json'),'utf8'))};
          });
          if(result.conflict) return send(res,409,{error:'Konfigurasi sudah berubah. Muat ulang panel sebelum pemulihan.'});
          if(result.missing) return send(res,404,{error:'Revisi tidak ditemukan.'});
          return send(res,200,{ok:true,...result});
        }
        return send(res,405,{error:'Metode tidak didukung.'});
      }
      if(req.method!=='GET' && req.method!=='HEAD') return send(res,405,{error:'Metode tidak didukung.'});
      const file=STATIC.get(pathname);if(!file) return send(res,404,{error:'Halaman tidak ditemukan.'});
      const bytes=await readFile(join(PUB,file));const ext=file.substring(file.lastIndexOf('.'));
      res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=3600'});
      return res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){
      if(e.status) return send(res,e.status,{error:e.message});
      if(e.message&&(/tidak valid|wajib diisi|maksimal|HTTPS|Kategori|Ikon|Fitur|URL|password|duplikat|harus berupa|Format email/i).test(e.message)) return send(res,400,{error:e.message});
      console.error('[SchoolHub]',e.message);
      return send(res,500,{error:'Kesalahan internal server.'});
    }
  });
}
