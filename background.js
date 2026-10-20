import { createClient } from './modules/api.js';

async function fetchJson(url, credentials = 'include') {
  const response = await fetch(url, { credentials, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）。请确认视频可以播放后重试。`);
  if (Number(response.headers.get('content-length')) > 8_000_000) throw new Error('字幕文件过大，暂不支持。');
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error('字幕文件过大，暂不支持。');
  try { return JSON.parse(text); } catch { throw new Error('B 站未返回有效数据，可能需要登录或完成站内验证。'); }
}

async function requestForTab(tabId, url, options = {}) {
  if (options.subtitle) return fetchJson(url, 'omit');
  // Prefer the video's origin: the browser attaches its existing session and Referer.
  // Neither the extension nor its popup reads the raw Cookie value.
  let answer;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async endpoint => {
        if (location.protocol !== 'https:' || !/(^|\.)bilibili\.com$/.test(location.hostname)) return { transportError: true };
        try {
          const res = await fetch(endpoint, { credentials: 'include', signal: AbortSignal.timeout(15000), redirect: 'error' });
          if (!res.ok) return { httpError: res.status };
          return { data: await res.json() };
        } catch { return { transportError: true }; }
      },
      args: [url]
    });
    answer = results[0]?.result;
  } catch { /* Tab navigation or page policy: use granted host access below. */ }
  if (answer?.data) return answer.data;
  if (answer?.httpError) throw new Error(`B 站请求失败（HTTP ${answer.httpError}），请稍后重试。`);
  return fetchJson(url);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !['video','tracks','subtitle'].includes(message?.type)) return false;
  (async () => {
    if (!Number.isInteger(message.tabId)) throw new Error('没有可用的视频标签页。');
    const client = createClient((url, options) => requestForTab(message.tabId, url, options));
    if (message.type === 'video') return client.video(message.bvid);
    if (message.type === 'tracks') return client.tracks(message.bvid, message.cid);
    return client.subtitle(message.url);
  })().then(data => sendResponse({ok:true,data}), error => {
    const text = ['TimeoutError','AbortError'].includes(error.name) ? '请求超时，请检查网络后重新提取。' : error.message;
    sendResponse({ok:false,error:text || '提取失败，请稍后重试。'});
  });
  return true;
});
