import {createPortalServer,DEFAULT_DIR} from './core.mjs';
import {resolve} from 'node:path';
const bind=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<0||port>65535) throw new Error('PORT tidak valid');
const secureCookie=process.env.COOKIE_SECURE==='1';
const allowLocalUrls=process.env.APP_ENV!=='production';
const dataDir=resolve(process.env.DATA_DIR||DEFAULT_DIR);
const app=createPortalServer({dataDir,secureCookie,allowLocalUrls});
app.listen(port,bind,()=>{
 console.log(`\nSchoolHub v2.1 aktif: http://${bind}:${app.address().port}`);
 console.log(`Panel admin: http://${bind}:${app.address().port}/admin`);
 console.log(`Data: ${dataDir}`);
 if(!secureCookie) console.warn('MODE LOCAL: cookie tanpa Secure. Produksi wajib HTTPS dan COOKIE_SECURE=1 di belakang reverse proxy.');
 if(bind==='0.0.0.0') console.warn('PERINGATAN: mendengarkan semua interface; pastikan firewall dan reverse proxy aman.');
});
