export const PROVIDERS=Object.freeze({
  zhipu:Object.freeze({name:'智谱',apiKeyUrl:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',keyName:'zhipuApiKey',model:'glm-4.7-flash',endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions'}),
  siliconflow:Object.freeze({name:'硅基流动',apiKeyUrl:'https://cloud.siliconflow.cn/me/account/ak',keyName:'siliconflowApiKey',model:'Qwen/Qwen3-8B',endpoint:'https://api.siliconflow.cn/v1/chat/completions'})
});
export function providerConfig(id='zhipu') {
  if(!Object.hasOwn(PROVIDERS,id)) throw new Error('不支持的模型服务商。');
  return PROVIDERS[id];
}
