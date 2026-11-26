import {ordered,summarize,quantityUnit,mileageUnit,changeUnits} from './mileage.js';
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
const today = (offset=0) => {
  const d = new Date();
  d.setDate(d.getDate()+offset);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const key = 'fueltrack.v1';
const sample = {
  id:'sample',sample:true,name:'Daily Commuter',type:'Car',fuel:'Petrol',distance:'km',volume:'L',
  logs:[ [41200,34], [41698,35.6], [42261,36.8], [42768,35.4], [43380,38.5], [43943,35.2], [44551,36.7] ]
    .map(([odo,qty],i) => ({id:'sample-'+i,date:today(-7*(6-i)),odo,qty,cost:qty*96,full:true,sample:true}))
};
let state;
try {state=JSON.parse(localStorage.getItem(key)) ?? {vehicles:[sample],active:'sample'};}
catch {state={vehicles:[sample],active:'sample'};}
const icons = {
  fuel:'<path d="M3 22h12M5 22V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v18M5 10h8m0 4h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-7l-4-4m2 2v3h2"/>',
  car:'<path d="m5 11 1.5-5h11l1.5 5M5 18v2m14-2v2M3 12l2-1h14l2 1v6H3zm3 2h2m8 0h2"/>',
  gauge:'<path d="M4 17a9 9 0 1 1 16 0H4zm8-4 4-4"/>',
  trend:'<path d="m3 17 6-6 4 4 7-8m-5 0h5v5"/>',
  road:'<path d="m7 3-4 18M17 3l4 18M12 3v3m0 3v3m0 3v6"/>',
  cost:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-13 5h3"/>',
  history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit:'<path d="m4 16-1 5 5-1L20 8l-4-4L4 16zm10-10 4 4"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>'
};
function icon(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (n,d=2) => Number.isFinite(n) ? n.toLocaleString(undefined,{maximumFractionDigits:d}) : '—';
const day = (date,year=false) => new Date(date+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric',...(year ? {year:'numeric'} : {})});
const active = () => state.vehicles.find(v=>v.id===state.active);
function notify(message='') {$('notice').textContent=message;$('notice').hidden=!message;}
function commit(next, message='') {
  try {localStorage.setItem(key,JSON.stringify(next));}
  catch {return false;}
  state=next;
  render();
  notify(message);
  return true;
}
function replaceVehicle(v,message) {
  const vehicles = state.vehicles.some(item=>item.id===v.id)
    ? state.vehicles.map(item=>item.id===v.id?v:item) : [...state.vehicles,v];
  return commit({vehicles,active:v.id},message);
}
function chart(legs,unit) {
  if (!legs.length) return '<p class="empty">Mileage will appear here after two full fill-ups.</p>';
  const width=540,height=265,left=51,right=18,top=24,bottom=44;
  const values=legs.map(l=>l.mileage);
  const margin=Math.max((Math.max(...values)-Math.min(...values))*.18,Math.max(...values)*.035);
  const min=Math.max(0,Math.min(...values)-margin), max=Math.max(...values)+margin;
  const y=n=>top+(max-n)/(max-min)*(height-top-bottom);
  const x=i=>legs.length===1?(left+width-right)/2:left+i*(width-left-right)/(legs.length-1);
  const points=legs.map((l,i)=>x(i)+','+y(l.mileage)).join(' ');
  const grid=Array.from({length:5},(_,i)=>{
    const n=min+(max-min)*i/4;
    return '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="#e3ebed" stroke-dasharray="4 4"/><text x="'+(left-8)+'" y="'+(y(n)+4)+'" font-size="14" text-anchor="end">'+fmt(n,1)+'</text>';
  }).join('');
  return '<svg class="chart-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Mileage trend in '+esc(unit)+'">'+grid+
    (legs.length>1?'<polygon points="'+x(0)+','+(height-bottom)+' '+points+' '+x(legs.length-1)+','+(height-bottom)+'" fill="#e3f5ef"/>':'')+
    '<polyline points="'+points+'" fill="none" stroke="#078373" stroke-width="3" stroke-linejoin="round"/>'+
    legs.map((l,i)=>'<circle cx="'+x(i)+'" cy="'+y(l.mileage)+'" r="5" fill="#078373" stroke="white" stroke-width="2"><title>'+day(l.date)+' · '+fmt(l.mileage)+' '+esc(unit)+'</title></circle>'+
      (legs.length<=6 || i%2===0 && i<legs.length-2 || i===legs.length-1?'<text x="'+x(i)+'" y="'+(height-14)+'" font-size="13" text-anchor="'+(i===legs.length-1&&legs.length>1?'end':'middle')+'">'+day(l.date)+'</text>':'')).join('')+'</svg>';
}
function render() {
  const v=active();
  $('vehicle').innerHTML=state.vehicles.length ? state.vehicles.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('') : '<option>No vehicles</option>';
  $('vehicle').value=v?.id ?? '';
  $('vehicle').disabled=!v;
  $('addLog').textContent=v?'＋ Add fuel log':'＋ Add vehicle';
  $('clear').hidden=!state.vehicles.some(item=>item.sample || item.logs.some(log=>log.sample));
  $('dashboard').hidden=!v;
  if (!v) return;
  const result=summarize(v.logs), unit=mileageUnit(v), qty=quantityUnit(v);
  const rows=[
    ['gauge','Average mileage',result.average,unit],['trend','Last fill-up mileage',result.latest,unit],
    ['road','Distance tracked',result.distance,v.distance],['cost','Average running cost',result.running,'/'+v.distance]
  ];
  $('cards').innerHTML=rows.map(([name,label,value,u])=>'<article class="card"><span class="icon-tile">'+icon(name)+'</span><p>'+label+'</p><div class="value">'+fmt(value)+'<small>'+esc(u)+'</small></div></article>').join('');
  $('metric').textContent=unit;
  $('chart').innerHTML=chart(result.intervals.slice(-10),unit);
  $('count').textContent=v.logs.length+' '+(v.logs.length===1?'entry':'entries');
  const mileage = new Map(result.intervals.map(item=>[item.id,item.mileage]));
  $('history').innerHTML=[...result.rows].reverse().map(l=>'<div class="row"><div><strong>'+day(l.date,true)+'</strong><small>'+fmt(l.odo)+' '+v.distance+' · '+(l.full?'Full tank':'Partial fill')+'</small></div>'+
    '<div><strong>'+fmt(l.qty)+' '+qty+'</strong><small class="mileage">'+(mileage.has(l.id)?fmt(mileage.get(l.id))+' '+unit:'—')+'</small></div><div class="row-actions">'+
    (l.photo?'<button data-photo="'+esc(l.id)+'" aria-label="View attached photo"><img class="thumb" alt="" src="'+esc(l.photo)+'"></button>':'')+
    '<button data-edit="'+esc(l.id)+'" aria-label="Edit log">'+icon('edit')+'</button><button data-delete="'+esc(l.id)+'" aria-label="Delete log">'+icon('trash')+'</button></div></div>').join('') ||
    '<p class="empty">Add a fuel log to start tracking this vehicle.</p>';
}
const editor=$('editor');
function openEditor(title,content) {
  editor.innerHTML='<div class="dialog-head"><h2 id="dialogTitle">'+title+'</h2><button type="button" class="close" aria-label="Close">'+icon('close')+'</button></div>'+content;
  editor.setAttribute('aria-labelledby','dialogTitle');
  editor.querySelector('.close').onclick=()=>editor.close();
  if (!editor.open) editor.showModal();
}
const selectOptions = (items,current) => items.map(([value,label])=>'<option value="'+value+'"'+(value===current?' selected':'')+'>'+label+'</option>').join('');
function garage() {
  openEditor('Garage',state.vehicles.map(v=>'<div class="garage-row"><div><strong>'+esc(v.name)+'</strong><p>'+v.type+' · '+v.fuel+'</p></div><div class="photo-tools"><button data-switch="'+esc(v.id)+'">Select</button><button data-vehicle="'+esc(v.id)+'">Edit</button></div></div>').join('')+
    '<div class="form-actions"><button class="primary" id="newVehicle">＋ Add vehicle</button></div>');
  $('newVehicle').onclick=()=>vehicleForm();
  editor.querySelectorAll('[data-vehicle]').forEach(b=>b.onclick=()=>vehicleForm(state.vehicles.find(v=>v.id===b.dataset.vehicle)));
  editor.querySelectorAll('[data-switch]').forEach(b=>b.onclick=()=>{
    if (commit({...state,active:b.dataset.switch})) editor.close();
    else notify('Could not save the active vehicle.');
  });
}
function vehicleForm(v) {
  const options = items=>items.map(x=>[x,x]);
  openEditor(v?'Edit vehicle':'Add vehicle','<form id="vehicleForm"><div class="form-grid">'+
    '<label>Vehicle name<input name="name" required maxlength="55" value="'+esc(v?.name)+'" placeholder="Daily Commuter"></label>'+
    '<label>Vehicle type<select name="type">'+selectOptions(options(['Car','Bike/Motorcycle','Scooter','Truck']),v?.type)+'</select></label>'+
    '<label>Fuel type<select name="fuel">'+selectOptions(options(['Petrol','Diesel','CNG','Electric']),v?.fuel)+'</select></label>'+
    '<label>Distance unit<select name="distance">'+selectOptions([['km','Kilometers'],['mi','Miles']],v?.distance)+'</select></label>'+
    '<label id="volumeLabel">Volume unit<select name="volume">'+selectOptions([['L','Liters'],['gal','US gallons']],v?.volume)+'</select></label></div>'+
    '<p class="error" role="alert"></p><div class="form-actions"><button type="button" id="backGarage">Back to garage</button><button class="primary">Save vehicle</button></div></form>');
  $('backGarage').onclick=garage;
  const form=$('vehicleForm');
  const volumeVisibility=()=>{$('volumeLabel').hidden=['CNG','Electric'].includes(form.elements.fuel.value);};
  form.elements.fuel.onchange=volumeVisibility;
  volumeVisibility();
  form.onsubmit=e=>{
    e.preventDefault();
    const fields=Object.fromEntries(new FormData(form));
    fields.name=fields.name.trim();
    const error=form.querySelector('.error');
    if (!fields.name) {error.textContent='Enter a vehicle name.';return;}
    const next={...v,...fields,id:v?.id ?? uid(),logs:v?.logs ?? []};
    if (v?.logs.length) {
      const liquid=unit=>['L','gal'].includes(unit);
      if (quantityUnit(v)!==quantityUnit(next) && !(liquid(quantityUnit(v))&&liquid(quantityUnit(next)))) {
        error.textContent='Add a separate vehicle to track fuel measured in a different quantity unit.';
        return;
      }
      next.logs=v.logs.map(log=>changeUnits(log,v,next));
    }
    if (replaceVehicle(next)) editor.close();
    else error.textContent='Could not save. Browser storage may be full.';
  };
}
import {compressImage,scanImage} from './ocr.js';
let scanning=false;
function logForm(v,log) {
  const unit=quantityUnit(v);
  openEditor(log?'Edit fuel log':'Add fuel log','<form id="logForm"><div class="form-grid">'+
    '<label>Date<input name="date" type="date" required value="'+(log?.date ?? today())+'"></label>'+
    '<label>Odometer ('+v.distance+')<input name="odo" type="number" min="0" step="any" inputmode="decimal" required value="'+esc(log?.odo)+'"></label>'+
    '<label>Fuel added ('+unit+')<input name="qty" type="number" min="0" step="any" inputmode="decimal" required value="'+esc(log?.qty)+'"></label>'+
    '<label><select name="costKind" aria-label="Cost type"><option value="total">Total cost</option><option value="unit">Price per '+unit+'</option></select><input name="cost" aria-label="Optional cost" placeholder="Optional" type="number" min="0" step="any" inputmode="decimal" value="'+esc(log?.cost)+'"></label></div>'+
    '<label class="check"><input name="full" type="checkbox"'+((log?.full ?? true)?' checked':'')+'>Full tank</label>'+
    '<div class="scan"><strong>Odometer or receipt photo</strong><div class="photo-tools"><button type="button" id="uploadButton">Upload photo</button><button type="button" id="cameraButton">Use camera</button>'+
    '<input id="uploadFile" type="file" accept="image/*" hidden><input id="cameraFile" type="file" accept="image/*" capture="environment" hidden></div>'+
    '<div id="previewFrame" class="preview-frame" hidden><img class="preview" id="preview" alt="Fuel log attachment"><span id="selection" hidden></span></div><div class="photo-tools" id="scanTools" hidden>'+
    '<select id="scanMode" aria-label="Photo type"><option value="meter">Odometer</option><option value="receipt">Fuel receipt</option></select>'+
    '<button type="button" id="scanButton">Read photo</button><button type="button" id="removePhoto">Remove</button></div>'+
    '<p id="scanStatus" role="status"></p></div><p class="error" role="alert"></p><div class="form-actions"><button type="button" id="cancelLog">Cancel</button><button class="primary" id="saveLog">Save fuel log</button></div></form>');
  const form=$('logForm'), preview=$('preview'), status=$('scanStatus'), scan=$('scanButton'), save=$('saveLog');
  const selection=$('selection');
  let photo=log?.photo, crop, start, loading=false;
  const refresh=()=>{
    $('previewFrame').hidden=!photo;
    $('scanTools').hidden=!photo;
    selection.hidden=true;
    if (photo) preview.src=photo;
    else preview.removeAttribute('src');
    scan.disabled=scanning;
  };
  refresh();
  if (photo) status.textContent='Drag over the odometer digits to select a region, or read the whole photo.';
  function point(event) {
    const box=preview.getBoundingClientRect();
    return [Math.min(1,Math.max(0,(event.clientX-box.left)/box.width)),Math.min(1,Math.max(0,(event.clientY-box.top)/box.height))];
  }
  preview.draggable=false;
  preview.style.touchAction='none';
  preview.onpointerdown=e=>{
    if ($('scanMode').value!=='meter') return;
    start=point(e);
    preview.setPointerCapture(e.pointerId);
  };
  preview.onpointercancel=()=>{start=undefined;};
  preview.onpointerup=e=>{
    if (!start) return;
    const end=point(e);
    const [x,y]=start.map((n,i)=>Math.min(n,end[i]));
    const [w,h]=start.map((n,i)=>Math.abs(n-end[i]));
    start=undefined;
    if (w<.03 || h<.03) {
      crop=undefined;
      selection.hidden=true;
      status.textContent='Reading the whole photo.';
      return;
    }
    crop={left:Math.floor(x*preview.naturalWidth),top:Math.floor(y*preview.naturalHeight),
      width:Math.max(1,Math.floor(w*preview.naturalWidth)),height:Math.max(1,Math.floor(h*preview.naturalHeight))};
    Object.assign(selection.style,{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'});
    selection.hidden=false;
    status.textContent='Odometer region selected. Tap Read photo to scan it.';
  };
  $('scanMode').onchange=()=>{crop=undefined;refresh();status.textContent='';};
  $('uploadButton').onclick=()=>$('uploadFile').click();
  $('cameraButton').onclick=()=>$('cameraFile').click();
  for (const id of ['uploadFile','cameraFile']) $(id).onchange=async e=>{
    const file=e.target.files[0];
    if (!file || loading) return;
    loading=true;
    save.disabled=true;
    try {
      const image=await compressImage(file);
      if (!form.isConnected) return;
      photo=image;
      crop=undefined;
      refresh();
      status.textContent='Photo attached. Drag over odometer digits to select a region, or read the whole photo.';
    } catch {status.textContent='Could not open this image. Try a JPEG, PNG, or another supported photo.';}
    finally {loading=false;save.disabled=false;e.target.value='';}
  };
  $('removePhoto').onclick=()=>{photo=undefined;crop=undefined;refresh();status.textContent='';};
  scan.onclick=async()=>{
    if (scanning || !photo) return;
    const source=photo, mode=$('scanMode').value;
    const original={odo:form.elements.odo.value,qty:form.elements.qty.value};
    scanning=true;
    scan.disabled=true;
    status.textContent='Reading photo…';
    try {
      const result=await scanImage(photo,mode,unit,crop);
      if (!form.isConnected || photo!==source || $('scanMode').value!==mode) return;
      for (const name of ['odo','qty']) {
        if (Number.isFinite(result[name]) && form.elements[name].value===original[name]) form.elements[name].value=result[name];
      }
      status.textContent=Object.values(result).some(Number.isFinite)
        ? 'Review the extracted values before saving.'
        : 'No matching numbers found. Try a closer photo or enter the values manually.';
    } catch {if (photo===source) status.textContent='Photo reading failed. You can enter the values manually.';}
    finally {scanning=false;($('scanButton') ?? scan).disabled=false;}
  };
  $('cancelLog').onclick=()=>editor.close();
  form.onsubmit=e=>{
    e.preventDefault();
    if (loading) return;
    const f=form.elements;
    const qty=Number(f.qty.value),odo=Number(f.odo.value);
    const cost=f.cost.value===''?null:Number(f.cost.value)*(f.costKind.value==='unit'?qty:1);
    const next={...log,id:log?.id ?? uid(),date:f.date.value,odo,qty,cost,full:f.full.checked,photo};
    const error=form.querySelector('.error');
    if (!Number.isFinite(qty)||qty<=0) {error.textContent='Enter a fuel quantity greater than zero.';return;}
    if (!Number.isFinite(odo) || (cost!==null && !Number.isFinite(cost))) {error.textContent='Enter a valid odometer reading and cost.';return;}
    const logs=ordered([...v.logs.filter(item=>item.id!==next.id),next]);
    if (logs.some((item,i)=>i>0&&item.odo<logs[i-1].odo)) {
      error.textContent='The odometer must increase across log dates.';return;
    }
    const first=v.logs.length===0;
    const message=first?(next.full?'Baseline odometer recorded. Add your next full fill-up to see mileage!':'Odometer recorded. A full fill-up will set the mileage baseline.'):'Fuel log saved.';
    if (replaceVehicle({...v,logs},message)) editor.close();
    else error.textContent='Could not save. Browser storage may be full. Try a smaller photo or remove an old attachment.';
  };
}
$('vehicle').onchange=e=>{
  if (!commit({...state,active:e.target.value})) {render();notify('Could not save the active vehicle.');}
};
$('garage').onclick=garage;
$('addLog').onclick=()=>active()?logForm(active()):vehicleForm();
$('clear').onclick=()=>{
  if (!confirm('Clear the sample entries? Your own fuel logs will be kept.')) return;
  const vehicles=state.vehicles.map(v=>({...v,sample:false,logs:v.logs.filter(l=>!l.sample)}))
    .filter(v=>!state.vehicles.find(old=>old.id===v.id).sample||v.logs.length>0);
  const next=vehicles.some(v=>v.id===state.active)?state.active:vehicles[0]?.id;
  if (!commit({vehicles,active:next},'Sample data cleared.')) notify('Could not clear sample data.');
};
$('history').onclick=e=>{
  const button=e.target.closest('button');
  if (!button) return;
  const v=active();
  const id=button.dataset.edit ?? button.dataset.delete ?? button.dataset.photo;
  const log=v.logs.find(item=>item.id===id);
  if (!log) return;
  if (button.dataset.edit) logForm(v,log);
  if (button.dataset.delete && confirm('Delete this fuel log?')) {
    if (!replaceVehicle({...v,logs:v.logs.filter(item=>item.id!==id)},'Fuel log deleted.')) notify('Could not delete this log.');
  }
  if (button.dataset.photo) {
    const dialog=$('photoDialog');
    dialog.innerHTML='<div class="dialog-head"><h2>Attached photo</h2><button class="close" aria-label="Close photo">'+icon('close')+'</button></div><img alt="Odometer or receipt" src="'+esc(log.photo)+'">';
    dialog.querySelector('button').onclick=()=>dialog.close();
    dialog.showModal();
  }
};
render();
