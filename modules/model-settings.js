import {PROVIDERS,providerConfig} from './providers.js';

// Model choices are maintained by the extension, never from user input.
export function modelSettings() {
  return Object.fromEntries(Object.keys(PROVIDERS).map(id=>{
    const model=providerConfig(id).model;
    return [id,{models:[model],selected:model}];
  }));
}

export async function credentialFingerprint(key,model) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([key,model])));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
