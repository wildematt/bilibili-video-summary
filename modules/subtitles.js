export function parseVideoUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('请先打开 B 站的普通视频播放页。'); }
  const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/i);
  if (url.protocol !== 'https:' || !/(^|\.)bilibili\.com$/.test(url.hostname) || !match) {
    throw new Error('请在 B 站 BV 视频播放页打开插件。暂不支持番剧、直播或短链接页面。');
  }
  const p = Number(url.searchParams.get('p') || 1);
  return { bvid: `BV${match[1].slice(2)}`, page: Number.isSafeInteger(p) && p > 0 ? p : 1 };
}

export function normalizeCues(json) {
  if (!json || !Array.isArray(json.body)) throw new Error('字幕文件格式不正确，缺少 body 列表。');
  const cues = json.body.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const from = Number(item.from), to = Number(item.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > 31536000 || typeof item.content !== 'string') return [];
    const text = item.content.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    return text ? [{ from, to, text }] : [];
  });
  if (!cues.length) throw new Error('这个字幕文件没有可导出的有效内容。');
  return cues.sort((a, b) => a.from - b.from);
}

export function timecode(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${timecode(c.from)} --> ${timecode(c.to)}\n${c.text}\n`).join('\n');
}
export function toTxt(cues) { return cues.map(c => c.text).join('\n'); }
export function filename(title, page, language, ext) {
  const clean = s => String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
  return `${clean(title) || '字幕'}_P${page}_${clean(language) || '默认'}.${ext}`;
}

export function safeSubtitleUrl(raw) {
  if (typeof raw !== 'string' || !raw) throw new Error('字幕下载地址为空，请重新提取。');
  let url;
  try { url = new URL(raw.startsWith('//') ? `https:${raw}` : raw); }
  catch { throw new Error('字幕下载地址无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/(^|\.)(hdslb\.com|bilibili\.com)$/.test(url.hostname)) {
    throw new Error('字幕地址不属于支持的 B 站域名，已停止下载。');
  }
  return url.href;
}
