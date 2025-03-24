import { cropText, waitForElementToExistAndSelect } from '../../../utils'
import { config } from '../index.mjs'

export default {
  init: async (hostname, userConfig, getInput, mountComponent) => {
    if (location.pathname.includes('/bangumi')) return false
    try {
      // B站页面是SSR的，如果插入过早，页面 js 检测到实际 Dom 和期望 Dom 不一致，会导致重新渲染
      await waitForElementToExistAndSelect('img.bili-avatar-img')
      const getVideoPath = () =>
        location.pathname + `?p=${new URLSearchParams(location.search).get('p') || 1}`
      let oldPath = getVideoPath()
      const checkPathChange = async () => {
        const newPath = getVideoPath()
        if (newPath !== oldPath) {
          oldPath = newPath
          mountComponent(config.bilibili)
        }
      }
      window.setInterval(checkPathChange, 500)
    } catch (e) {
      /* empty */
    }
    return true
  },
  inputQuery: async () => {
    try {
      // 1. 获取 bvid，并确定当前分P（如果是多P视频）
      const bvid = location.pathname.replace('video', '').replaceAll('/', '')
      const pIndex = Number(new URLSearchParams(location.search).get('p') || 1) - 1

      // 2. 通过 wbi 接口获取 aid
      const wbiResponse = await fetch(
        `https://api.bilibili.com/x/web-interface/wbi/view?bvid=${bvid}`,
      )
      const wbiData = await wbiResponse.json()
      const aid = wbiData?.data?.aid
      if (!aid) throw new Error('未能获取到 aid，请检查 bvid 是否正确')

      // 3. 获取分 P 信息（这里依然可以用 pagelist 先拿到 cid 和标题）
      const pagelistResponse = await fetch(
        `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`,
      )
      const pagelistData = await pagelistResponse.json()
      const videoList = pagelistData.data || []
      const cid = videoList[pIndex]?.cid
      const title = videoList[pIndex]?.part || ''

      if (!cid) throw new Error('未能获取到 cid，请检查视频是否多 P 或其它问题')

      // 4. 通过新接口（/x/player/wbi/v2）获取字幕信息
      const infoResponse = await fetch(
        `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`,
        {
          credentials: 'include',
        },
      )
      const infoData = await infoResponse.json()
      const subtitleList = infoData?.data?.subtitle?.subtitles || []
      if (!subtitleList.length) {
        console.log('没有可用的字幕')
        return
      }

      // 这里默认使用第一个字幕
      let subtitleUrl = subtitleList[0].subtitle_url
      // 若返回的链接是 "//" 开头，需要补全为 "https:" 或其他协议
      if (subtitleUrl.startsWith('//')) {
        subtitleUrl = 'https:' + subtitleUrl
      } else if (!subtitleUrl.startsWith('http')) {
        // 有时可能漏了协议，这里默认用 https
        subtitleUrl = 'https://' + subtitleUrl
      }

      // 5. 拉取字幕内容
      const subtitleResponse = await fetch(subtitleUrl)
      const subtitleData = await subtitleResponse.json()
      const subtitles = subtitleData.body || []

      // 将所有字幕拼接到一起
      let subtitleContent = ''
      for (let i = 0; i < subtitles.length; i++) {
        // 这里用逗号隔开，或者自行按换行等方式整合
        if (i === subtitles.length - 1) subtitleContent += subtitles[i].content
        else subtitleContent += subtitles[i].content + ','
      }

      // 6. 根据需求对字幕内容做处理（例如生成提问 prompt）
      return await cropText(
        `用尽量简练的语言,联系视频标题,对视频进行内容摘要,同时仍要保留重要细节和标题信息,如果可能的话,使用markdown语法将视频内容总结为结构化信息,视频标题为:"${title}",字幕内容为:\n${subtitleContent}`,
      )
    } catch (e) {
      console.error(e)
    }
  },
}
