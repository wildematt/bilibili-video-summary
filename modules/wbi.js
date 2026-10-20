// MD5 per RFC 1321, used only for Bilibili's public WBI request signature.
export function md5(text) {
  const input = new TextEncoder().encode(text);
  const data = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  data.set(input); data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, (input.length * 8) >>> 0, true);
  view.setUint32(data.length - 4, Math.floor(input.length / 0x20000000), true);
  const shifts = [7,12,17,22, 5,9,14,20, 4,11,16,23, 6,10,15,21];
  const k = Array.from({length:64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < data.length; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5*i+1)%16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3*i+5)%16; }
      else { f = c ^ (b | ~d); g = (7*i)%16; }
      const sum = (a + f + k[i] + view.getUint32(offset + g*4, true)) >>> 0;
      const s = shifts[Math.floor(i / 16)*4 + i%4];
      a = d; d = c; c = b; b = (b + ((sum << s) | (sum >>> (32-s)))) >>> 0;
    }
    a0 = (a0+a)>>>0; b0=(b0+b)>>>0; c0=(c0+c)>>>0; d0=(d0+d)>>>0;
  }
  return [a0,b0,c0,d0].map(n => [0,8,16,24].map(s => ((n>>>s)&255).toString(16).padStart(2,'0')).join('')).join('');
}

const MIX = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signWbi(params, imgUrl, subUrl, now = Math.floor(Date.now()/1000)) {
  const key = url => new URL(url).pathname.split('/').pop().split('.')[0];
  const raw = key(imgUrl) + key(subUrl);
  if (raw.length !== 64) throw new Error('B 站签名信息格式发生变化，请稍后重试。');
  const mixin = MIX.map(i => raw[i]).join('').slice(0,32);
  const query = Object.entries({...params,wts:now}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).replace(/[!'()*]/g,''))}`).join('&');
  return `${query}&w_rid=${md5(query + mixin)}`;
}
