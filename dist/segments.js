const masks = new Map([
  [0b1110111,'0'], [0b0100100,'1'], [0b1011101,'2'], [0b1101101,'3'],
  [0b0101110,'4'], [0b1101011,'5'], [0b1111011,'6'], [0b0100101,'7'],
  [0b1111111,'8'], [0b1101111,'9']
]);

// Decode a straight, tightly cropped seven-segment display. Reject incomplete patterns.
export function readSegments(data,width,height) {
  if (width<32 || height<16) return;
  const brightness = new Uint8Array(width*height);
  const histogram = new Uint32Array(256);
  let sum=0;
  for (let i=0;i<brightness.length;i++) {
    const p=i*4;
    const value=Math.round(.299*data[p]+.587*data[p+1]+.114*data[p+2]);
    brightness[i]=value;
    histogram[value]++;
    sum+=value;
  }

  // Choose a threshold that best separates lit segments from the background.
  let threshold=0, dark=0, darkSum=0, best=0;
  for (let tone=0;tone<255;tone++) {
    dark+=histogram[tone];
    darkSum+=tone*histogram[tone];
    const light=brightness.length-dark;
    if (!dark || !light) continue;
    const difference=darkSum/dark-(sum-darkSum)/light;
    const score=dark*light*difference*difference;
    if (score>best) {best=score;threshold=tone;}
  }
  if (!best || Math.sqrt(best)/brightness.length<12) return;

  let edgeLight=0, edges=0;
  for (let x=0;x<width;x++) {
    edgeLight+=Number(brightness[x]>threshold)+Number(brightness[(height-1)*width+x]>threshold);
    edges+=2;
  }
  for (let y=1;y<height-1;y++) {
    edgeLight+=Number(brightness[y*width]>threshold)+Number(brightness[y*width+width-1]>threshold);
    edges+=2;
  }
  const lightInk=edgeLight<edges/2;
  const on=(x,y)=>(brightness[y*width+x]>threshold)===lightInk;
  const columns=new Uint32Array(width);
  let top=height,bottom=-1;
  for (let y=0;y<height;y++) {
    let count=0;
    for (let x=0;x<width;x++) {
      if (on(x,y)) {columns[x]++;count++;}
    }
    if (count>=Math.max(2,width*.025)) {top=Math.min(top,y);bottom=y;}
  }
  const digitHeight=bottom-top+1;
  if (digitHeight<12 || top===0 || bottom===height-1) return;

  const groups=[];
  let start=-1;
  for (let x=0;x<=width;x++) {
    if (x<width && columns[x]>=Math.max(2,digitHeight*.045)) {
      if (start<0) start=x;
    } else if (start>=0) {
      groups.push([start,x]);
      start=-1;
    }
  }
  if (groups.length<2 || groups.length>9 || groups[0][0]===0 || groups.at(-1)[1]===width) return;

  function coverage(left,right,x0,y0,x1,y1) {
    let ink=0, count=0;
    for (let y=top+Math.floor(y0*digitHeight);y<top+Math.ceil(y1*digitHeight);y++) {
      for (let x=left+Math.floor(x0*(right-left));x<left+Math.ceil(x1*(right-left));x++) {
        ink+=Number(on(x,y));
        count++;
      }
    }
    return ink/count;
  }

  const zones=[
    [.32,0,.68,.15], [.04,.17,.24,.37], [.76,.17,.96,.37],
    [.32,.43,.68,.57], [.04,.63,.24,.83], [.76,.63,.96,.83], [.32,.85,.68,1]
  ];
  let result='';
  for (const [left,right] of groups) {
    const ratio=(right-left)/digitHeight;
    if (ratio<.25) {
      const middle=coverage(left,right,0,.46,1,.54);
      const upper=coverage(left,right,0,0,1,.32);
      const lower=coverage(left,right,0,.65,1,1);
      if (upper>.36 && lower>.36 && middle<Math.min(upper,lower)*.85) result+='1';
      else if (upper<.12 && middle<.12 && lower>.23 && result && !result.includes('.')) result+='.';
      else return;
      continue;
    }
    if (ratio>1.2) return;
    let mask=0;
    for (const [i,zone] of zones.entries()) {
      const fill=coverage(left,right,...zone);
      if (fill>.25 && fill<.48) return;
      if (fill>=.48) mask|=1<<i;
    }
    const digit=masks.get(mask);
    if (digit===undefined) return;
    result+=digit;
  }
  return /^\d{2,8}(?:\.\d{1,2})?$/.test(result) ? Number(result) : undefined;
}
