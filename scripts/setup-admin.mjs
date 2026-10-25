import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {DEFAULT_DIR,hashPassword} from '../server/core.mjs';
const dir=resolve(process.env.DATA_DIR||DEFAULT_DIR);
if(!process.stdin.isTTY){console.error('Setup akun admin perlu terminal interaktif (TTY).');process.exit(1);}
const path=join(dir,'auth.json');
const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true});
const ask=(prompt)=>new Promise(resolve=>rl.question(prompt,resolve));
console.log('\n=== SETUP AKUN ADMIN SCHOOLHUB ===');
console.log('Akun ini HANYA untuk mengubah katalog portal, BUKAN login ke TU/LMS.');
let existed=false;try{await readFile(path);existed=true;}catch(e){if(e.code!=='ENOENT')throw e;}
if(existed){const answer=(await ask('Akun admin sudah ada. Ganti password? ketik GANTI: ')).trim();if(answer!=='GANTI'){rl.close();process.exit(0);}}
// Terminal echoed input is intentionally disabled during password prompts.
function hiddenQuestion(q){return new Promise(resolve=>{
 const output=rl._writeToOutput;
 rl._writeToOutput=function(str){if(!str.includes('\n')) return;output.call(rl,str);};
 process.stdout.write(q);
 rl.question('',answer=>{rl._writeToOutput=output; console.log();resolve(answer);});
});}
try{
 const a=await hiddenQuestion('Password admin baru (minimal 12 karakter): ');
 const b=await hiddenQuestion('Ulangi password: ');
 if(a!==b) throw new Error('Password tidak sama.');
 const credential=await hashPassword(a);
 await mkdir(dir,{recursive:true});
 await writeFile(path,JSON.stringify(credential,null,2)+'\n',{mode:0o600});
 console.log('Akun admin berhasil disiapkan. Sesi login lama perlu restart server untuk dicabut saat rotasi password.');
}catch(e){console.error('Gagal:',e.message);process.exitCode=1;}
finally{rl.close();}
