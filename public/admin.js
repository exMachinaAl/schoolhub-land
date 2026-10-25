'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const loginView=$('#login-view'),editorView=$('#editor-view'),loginForm=$('#login-form');
  let csrf='', site=null,dirty=false;
  const labels={tu:'Tata Usaha',lms:'LMS',perpustakaan:'Perpustakaan',inventaris:'Inventaris',magang:'SIM Magang',absensi:'Absensi'};
  const categories=[['sekolah','Akun Sekolah'],['internal','Internal'],['publik','Layanan Publik']];
  async function api(url,{method='GET',body}={}){
    const res=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
    const obj=await res.json().catch(()=>({error:'Respons server tidak valid.'}));
    if(!res.ok) throw Object.assign(new Error(obj.error||`Gagal HTTP ${res.status}`),{status:res.status});
    return obj;
  }
  function show(view){loginView.hidden=view!=='login';editorView.hidden=view!=='editor';$('#logout').hidden=view!=='editor';}
  function feedback(message,success=false){
    const el=$('#status'); el.textContent=message; el.className='status visible '+(success?'ok':'error');
  }
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function input(label,value,{area=false,type='text',max=280,hint='',wide=false}={}){
    const wrap=el('label',wide?'wide':'');wrap.append(document.createTextNode(label));
    const field=document.createElement(area?'textarea':'input');if(!area)field.type=type;field.maxLength=max;field.value=value||'';field.dataset.field=label;
    field.addEventListener('input',()=>{dirty=true;});wrap.append(field);
    if(hint)wrap.append(el('small','field-hint',hint));
    return {wrap,field};
  }
  function fieldFrom(wrapper){return wrapper.querySelector('input,select,textarea');}
  function populate(){
    $('#school-name').value=site.school.name;
    $('#school-short').value=site.school.shortName;
    $('#school-subtitle').value=site.school.subtitle;
    $('#school-year').value=site.school.academicYear;
    $('#school-email').value=site.school.contactEmail;
    const container=$('#app-editors');container.replaceChildren();$('#app-counter').textContent=String(site.applications.length).padStart(2,'0');
    site.applications.forEach((app,index)=>{
      const card=el('article','app-editor');card.dataset.id=app.id;
      const head=el('button','app-summary');head.type='button';head.setAttribute('aria-expanded',String(index===0));
      head.append(el('span','app-index',String(index+1).padStart(2,'0')));
      const summary=el('span','app-summ-text');summary.append(el('strong','',app.name),el('small','',app.url?'Alamat aplikasi sudah diatur':'Alamat aplikasi belum diatur'));head.append(summary,el('span','app-chevron','⌄'));
      const form=el('div','app-form');form.hidden=index!==0;
      head.addEventListener('click',()=>{form.hidden=!form.hidden;head.setAttribute('aria-expanded',String(!form.hidden));});
      card.append(head,form);
      const inputs={};
      function add(name,val,opts={}){const made=input(name,val,opts);form.append(made.wrap);inputs[name]=made.field;}
      add('Nama aplikasi',app.name,{max:90});add('Target pengguna',app.audience,{max:200});
      add('Deskripsi singkat',app.shortDescription,{area:true,max:280,wide:true});
      const catLabel=el('label','', 'Kategori akses');const select=document.createElement('select');
      for(const [value,label] of categories){const option=el('option','',label);option.value=value;select.append(option);}select.value=app.category;select.addEventListener('change',()=>dirty=true);catLabel.append(select);form.append(catLabel);
      add('URL aplikasi (HTTPS)',app.url,{max:1200,hint:'Kosongkan jika sistem belum dideploy. HTTP hanya boleh untuk localhost saat mode development.',wide:true});
      add('Persyaratan akses',app.requirements,{area:true,max:450,wide:true});
      add('Fitur (pisahkan dengan koma)',app.features.join(', '),{max:350,wide:true});
      const vis=el('label','check-field');const checked=document.createElement('input');checked.type='checkbox';checked.checked=app.visible!==false;checked.addEventListener('change',()=>dirty=true);vis.append(checked,document.createTextNode('Tampilkan aplikasi ini pada portal publik'));form.append(vis);
      card._controls={inputs,select,checked};container.append(card);
    });
    document.querySelectorAll('.form-grid input').forEach(field=>{field.oninput=()=>{dirty=true;};});dirty=false;
  }
  function collect(){
    const result=structuredClone(site);
    result.school={
      name:$('#school-name').value,shortName:$('#school-short').value,
      subtitle:$('#school-subtitle').value,academicYear:$('#school-year').value,contactEmail:$('#school-email').value
    };
    result.applications=document.querySelectorAll('.app-editor').length?Array.from(document.querySelectorAll('.app-editor')).map(card=>{
      const original=site.applications.find(a=>a.id===card.dataset.id);
      const {inputs,select,checked}=card._controls;
      return {...original,name:inputs['Nama aplikasi'].value,audience:inputs['Target pengguna'].value,
        shortDescription:inputs['Deskripsi singkat'].value,category:select.value,
        url:inputs['URL aplikasi (HTTPS)'].value,requirements:inputs['Persyaratan akses'].value,
        features:inputs['Fitur (pisahkan dengan koma)'].value.split(',').map(a=>a.trim()).filter(Boolean),visible:checked.checked};
    }):[];
    return result;
  }
  async function loadEditor(){site=await api('/api/admin/config');populate();show('editor');await loadHistory();}
  async function save(){
    const button=$('#save-button');button.disabled=true;$('#save-bottom').disabled=true;
    try {const conf=collect();const result=await api('/api/admin/config',{method:'PUT',body:conf});conf._baseRevision=result.revision;site=conf;dirty=false;populate();await loadHistory();feedback('Pengaturan tersimpan. Snapshot konfigurasi sebelumnya tersedia di Riwayat.',true);}
    catch(error){feedback(error.message);if(error.status===401){csrf='';show('login');}}
    finally{button.disabled=false;$('#save-bottom').disabled=false;}
  }
  function dateLabel(value){
    const d=new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : String(value);
  }
  async function loadHistory(){
    const [rev,log]=await Promise.all([api('/api/admin/revisions'),api('/api/admin/audit')]);
    const revisions=$('#revisions');revisions.replaceChildren();
    if(!rev.revisions.length) revisions.append(el('p','helper-text','Belum ada versi sebelumnya. Riwayat muncul setelah Anda menyimpan perubahan.'));
    rev.revisions.forEach((item,index)=>{
      const line=el('div','history-line');
      const copy=el('div','history-copy');copy.append(el('strong','',`Snapshot ${index+1}`),el('small','',item.id));
      const button=el('button','secondary-btn','Pulihkan');button.type='button';
      button.setAttribute('aria-label',`Pulihkan konfigurasi ${item.id}`);
      button.addEventListener('click',async()=>{
        if(dirty){feedback('Ada perubahan belum disimpan. Simpan atau batalkan sebelum memulihkan snapshot.');return;}
        if(!confirm(`Pulihkan konfigurasi dari snapshot ${item.id}? Konfigurasi sekarang akan dicadangkan lebih dulu.`))return;
        button.disabled=true;
        try{
          await api('/api/admin/restore',{method:'POST',body:{id:item.id,_baseRevision:site._baseRevision}});
          await loadEditor();feedback('Konfigurasi berhasil dipulihkan. Versi sebelumnya ikut dicadangkan.',true);
        }catch(error){feedback(error.message);}
        finally{button.disabled=false;}
      });
      line.append(copy,button);revisions.append(line);
    });
    const events=$('#audit-events');events.replaceChildren();
    if(!log.events.length) events.append(el('p','helper-text','Belum ada catatan aktivitas.'));
    const names={login:'Admin masuk',logout:'Admin keluar','config-updated':'Konfigurasi diperbarui','config-restored':'Konfigurasi dipulihkan',probe:'Pemeriksaan URL'};
    log.events.slice(0,15).forEach(item=>{
      const line=el('div','history-line');const content=el('div','history-copy');
      content.append(el('strong','',names[item.action]||item.action),el('small','',dateLabel(item.at)));
      line.append(content);events.append(line);
    });
  }
  $('#refresh-history').addEventListener('click',async()=>{
    try{await loadHistory();feedback('Riwayat dan audit dimuat ulang.',true);}catch(error){feedback(error.message);}
  });
  $('#check-links').addEventListener('click',async()=>{
    const button=$('#check-links');button.disabled=true;
    $('#check-time').textContent='Sedang memeriksa URL yang tersimpan…';
    try{
      const response=await api('/api/admin/check-links',{method:'POST',body:{}});
      const box=$('#check-results');box.replaceChildren();
      const labels={responding:'Server merespons',unreachable:'Tidak terjangkau',blocked:'Tidak dapat diuji','not-configured':'Belum terhubung'};
      response.results.forEach(item=>{
        const row=el('div','result-line');
        const head=el('div','result-head');
        head.append(el('strong','',item.name),el('span',`state-${item.state}`,labels[item.state]||item.state));
        row.append(head,el('small','',item.message));box.append(row);
      });
      $('#check-time').textContent=`Diperiksa: ${dateLabel(response.checkedAt)}`;
      await loadHistory();
    }catch(error){$('#check-time').textContent=error.message;feedback(error.message);}
    finally{button.disabled=false;}
  });
  loginForm.addEventListener('submit',async event=>{
    event.preventDefault();const submit=$('#login-submit');submit.disabled=true;
    const message=$('#login-message');message.className='feedback';message.textContent='Memeriksa akun…';
    try {
      await api('/api/admin/login',{method:'POST',body:{password:$('#password').value}});
      $('#password').value='';
      const session=await api('/api/admin/session');csrf=session.csrf;
      await loadEditor();
    }catch(error){message.className='feedback error';message.textContent=error.message;}
    finally{submit.disabled=false;}
  });
  $('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:{}});}catch{}csrf='';site=null;dirty=false;show('login');$('#login-message').textContent='Sesi pengelola telah ditutup.';});
  $('#save-button').addEventListener('click',save);$('#save-bottom').addEventListener('click',save);
  $('#reset-button').addEventListener('click',()=>{populate();feedback('Perubahan yang belum disimpan telah dibatalkan.',true);});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  (async()=>{
    try{const sess=await api('/api/admin/session');csrf=sess.csrf;await loadEditor();}
    catch{show('login');}
  })();
})();
