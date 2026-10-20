import { signWbi } from './wbi.js';
import { safeSubtitleUrl } from './subtitles.js';

export function createClient(request) {
  const root = 'https://api.bilibili.com';
  const check = result => {
    if (result?.code === 0 && result.data) return result.data;
    const code = result?.code;
    if (code === -101) throw new Error('请先在当前 Chrome 中登录 B 站，再重新提取。');
    if (code === -404 || code === 62002) throw new Error('视频不存在、已删除，或当前账号没有访问权限。');
    if ([-352,-412,-403].includes(code)) throw new Error('B 站暂时拒绝了请求。请确认视频能正常播放，稍后再试。');
    throw new Error(`B 站接口返回错误${code == null ? '' : `（${code}）`}：${String(result?.message || '响应格式异常').slice(0,160)}`);
  };
  return {
    async video(bvid) {
      if (!/^BV[\da-zA-Z]{10}$/.test(bvid)) throw new Error('视频 BV 号无效。');
      const data = check(await request(`${root}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`));
      const pages = (data.pages || []).filter(p => Number.isSafeInteger(p.cid) && p.cid > 0).map(p=>({cid:p.cid,page:p.page,part:p.part}));
      if (!pages.length) throw new Error('未找到视频分 P 信息。');
      return { bvid, title: data.title || bvid, pages };
    },
    async tracks(bvid, cid) {
      if (!/^BV[\da-zA-Z]{10}$/.test(bvid) || !Number.isSafeInteger(cid) || cid <= 0) throw new Error('视频参数无效，请重新打开插件。');
      const params = {bvid, cid};
      let result = await request(`${root}/x/player/wbi/v2?${new URLSearchParams(params)}`);
      if ([-400,-403,-352].includes(result?.code)) {
        const nav = await request(`${root}/x/web-interface/nav`);
        const keys = nav?.data?.wbi_img;
        if (keys?.img_url && keys?.sub_url) {
          result = await request(`${root}/x/player/wbi/v2?${signWbi(params,keys.img_url,keys.sub_url)}`);
        }
      }
      const data = check(result);
      const tracks = (data.subtitle?.subtitles || []).filter(t=>t.subtitle_url).map(t=>({
        language: t.lan || 'unknown', label: t.lan_doc || t.lan || '字幕', url: safeSubtitleUrl(t.subtitle_url)
      }));
      if (!tracks.length && data.need_login_subtitle) throw new Error('B 站要求登录后才能读取字幕。请先登录 B 站并刷新视频页，再重新提取。');
      if (!tracks.length) throw new Error('当前分 P 没有可提取的字幕。画面内嵌文字无法直接导出，可尝试其他分 P。');
      return tracks;
    },
    subtitle(url) { return request(safeSubtitleUrl(url), { subtitle: true }); }
  };
}
