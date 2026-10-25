/** Admin-only, on-demand HEAD probe. This is NOT an access-control or SSO feature.
 * Prevent SSRF by allowing only HTTPS:443, rejecting literal IPs and any DNS record
 * outside public IPv4; the verified IP is then pinned for the TLS request.
 */
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';

export function isPublicIPv4(ip) {
  if (isIP(ip)!==4) return false;
  const [a,b,c] = ip.split('.').map(Number);
  if(a===0 || a===10 || a===127 || a>=224 || a===255 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a===198&&b>=18&&b<=19 || a===192&&b===0 || a===192&&b===0&&c===2 || a===198&&b===51&&c===100 || a===203&&b===0&&c===113 || a===192&&b===88&&c===99 || a===192&&b===0&&c===0) return false;
  // Exclude IANA special-use ranges and address families where our policy is uncertain.
  return true;
}

export async function probeUrl(url, {resolveDns=lookup, timeout=4500}={}) {
  if (!url) return {state:'not-configured', message:'Alamat aplikasi belum diisi.'};
  let u;
  try { u=new URL(url); } catch {return {state:'blocked',message:'URL tidak valid.'};}
  if(u.protocol!=='https:' || u.port && u.port!=='443' || u.username || u.password || u.hash || isIP(u.hostname) || !u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) {
    return {state:'blocked', message:'Hanya domain publik HTTPS port 443 dapat diuji.'};
  }
  try {
    let timer;
    let found;
    try {
      found = await Promise.race([
        resolveDns(u.hostname,{family:4,all:true}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS timeout')),timeout);})
      ]);
    } finally {clearTimeout(timer);}
    if(!Array.isArray(found) || !found.length || found.some(a=>!isPublicIPv4(a.address))) {
      return {state:'blocked',message:'DNS mengarah ke alamat privat, khusus, atau tanpa IPv4 publik.'};
    }
    // No redirects: a 302 to a LAN/internal site is never followed.
    const status = await new Promise((resolve,reject)=>{
      const req=request(u,{method:'HEAD',timeout,rejectUnauthorized:true,lookup:(_host,_opts,cb)=>cb(null,found[0].address,4)},res=>{
        resolve(res.statusCode||0);res.resume();res.on('error',()=>{});
      });
      req.on('timeout',()=>req.destroy(new Error('Koneksi timeout')));
      req.on('error',reject);req.end();
    });
    return {state:status?'responding':'unreachable', httpStatus:status, message:status===401||status===403?'Server merespons (login/izin diperlukan).':status>=200&&status<400?'Server merespons permintaan HEAD.':`Server merespons HTTP ${status}.`};
  } catch { return {state:'unreachable',message:'Tidak dapat terhubung (DNS, TLS, timeout, atau jaringan).'}; }
}
