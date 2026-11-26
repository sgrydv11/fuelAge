import {readSegments} from './segments.js';

const number = raw => {
  const token=raw.replace(/\s/g,'');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) return Number(token.replace(/,/g,''));
  if (!/^\d+(?:[.,]\d+)?$/.test(token)) return undefined;
  return Number(token.replace(',','.'));
};
export function parseScan(text,mode,unit) {
  const digits='([0-9]+(?:[.,][0-9]+)*)';
  const labeled=new RegExp('(?:\\bodometer\\b|\\bodo\\b|\\bmileage\\b)\\s*[:=]?\\s*'+digits,'i').exec(text);
  if (mode==='meter') {
    if (labeled) return {odo:number(labeled[1])};
    const candidates=[...new Set(text.split(/\r?\n/)
      .map(line=>line.trim().match(/^(\d+(?:[.,]\d+)*)(?:\s*(?:km|mi))?$/i)?.[1])
      .filter(Boolean).map(number).filter(Number.isFinite))];
    return candidates.length===1 ? {odo:candidates[0]} : {ambiguous:candidates.length>1};
  }
  const units={L:'l|ltr|ltrs|liters?|litres?',gal:'gal|gallons?',kg:'kg|kilograms?',kWh:'kwh'};
  const lines=text.split(/\r?\n/).filter(line=>!/(?:\/|per\s*)\s*(?:l\b|ltr|gal|kg|kwh|litre|liter)/i.test(line));
  const quantityPattern=new RegExp(digits+'\\s*(?:'+units[unit]+')\\b','i');
  const unitFirst=new RegExp('(?:\\bqty\\b|\\bquantity\\b|\\bvolume\\b)\\s*[:=]?\\s*'+digits+'(?:\\s*(?:'+units[unit]+'))?\\s*$','i');
  const quantity=lines.map(line=>line.match(quantityPattern)?.[1] ?? line.match(unitFirst)?.[1]).find(Boolean);
  return {odo:labeled ? number(labeled[1]):undefined,qty:quantity ? number(quantity):undefined};
}
export async function compressImage(file) {
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();
    img.src=url;
    await img.decode();
    const scale=Math.min(1,1400/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.78);
  } finally {URL.revokeObjectURL(url);}
}
const pendingNativeScans = new Map();
let nextScan = 0;

function scanOnAndroid(photo,crop) {
  window.fuelAgeScanResult = (id,text) => pendingNativeScans.get(id)?.(text);
  return new Promise((resolve,reject)=>{
    const id=String(++nextScan);
    const timer=setTimeout(()=>{
      pendingNativeScans.delete(id);
      reject(new Error('Android OCR took too long'));
    },20000);
    pendingNativeScans.set(id,text=>{
      clearTimeout(timer);
      pendingNativeScans.delete(id);
      if (typeof text==='string') resolve(text);
      else reject(new Error('Android OCR could not read this photo'));
    });
    const {left=0,top=0,width=0,height=0}=crop ?? {};
    try {window.FuelAgeAndroid.recognize(id,photo.split(',')[1],left,top,width,height);}
    catch {window.fuelAgeScanResult(id,null);}
  });
}

async function scanSegments(photo,crop) {
  const img=new Image();
  img.src=photo;
  await img.decode();
  const {left,top,width,height}=crop;
  const scale=Math.min(1,640/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,left,top,width,height,0,0,canvas.width,canvas.height);
  return readSegments(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
}

let worker;
export async function scanImage(photo,mode,unit,crop) {
  const segments=mode==='meter' && crop ? await scanSegments(photo,crop) : undefined;
  if (window.FuelAgeAndroid) {
    try {
      const result=parseScan(await scanOnAndroid(photo,crop),mode,unit);
      if (segments!==undefined && result.odo!==undefined && segments!==result.odo) return {ambiguous:true};
      return segments===undefined ? result : {odo:segments};
    } catch (error) {
      if (segments!==undefined) return {odo:segments};
      throw error;
    }
  }
  if (segments!==undefined) return {odo:segments};
  if (mode==='meter' && !crop) {
    try {
      const available=await fetch('/api/odometer',{method:'HEAD',signal:AbortSignal.timeout(3000)});
      if (available.headers.get('x-fueltrack-ocr')!=='available') throw new Error('Local OCR is disabled');
      const resp=await fetch('/api/odometer',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:await (await fetch(photo)).blob(),signal:AbortSignal.timeout(30000)});
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const result=await resp.json();
        if (Number.isFinite(result.odometer)) return {odo:result.odometer};
      }
    } catch { /* The standalone site uses browser OCR. */ }
  }
  if (!window.Tesseract) throw new Error('OCR is unavailable. Enter the values manually.');
  let engine, timer;
  const recognize = async () => {
    if (!worker) worker=window.Tesseract.createWorker('eng',1,{
      workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
      corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
      errorHandler:()=>{}
    });
    engine=await worker;
    await engine.setParameters({
      tessedit_char_whitelist:mode==='meter'?'0123456789.,':'',
      tessedit_pageseg_mode:mode==='meter'?(crop?'7':'11'):'11'
    });
    const options=crop ? {rectangle:crop} : {};
    const {data:{text}}=await engine.recognize(photo,options);
    return parseScan(text,mode,unit);
  };
  try {
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('OCR took too long')),25000);
    });
    return await Promise.race([recognize(),timeout]);
  } catch (error) {
    const failedWorker=worker;
    worker=undefined;
    if (engine) void engine.terminate().catch(()=>{});
    else if (failedWorker) void failedWorker.then(instance=>instance.terminate()).catch(()=>{});
    throw error;
  } finally {clearTimeout(timer);}
}
