import {PROVIDERS,providerConfig} from './providers.js';
export function parseModels(text) {
  const models=[...new Set(String(text).split(/[\n,，]/).map(v=>v.trim()).filter(Boolean))];
  if(!models.length || models.length>30 || models.some(v=>v.length>150 || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(v))) throw new Error('请填写有效的模型 ID，每行一个，最多 30 个。');
  return models;
}
export function modelSettings(saved={}) {
  return Object.fromEntries(Object.keys(PROVIDERS).map(id=>{
    const fallback=providerConfig(id).model;
    let models;try {models=parseModels(saved?.[id]?.models?.join('\n') || fallback);}catch {models=[fallback];}
    return [id,{models,selected:models.includes(saved?.[id]?.selected)?saved[id].selected:models[0]}];
  }));
}
