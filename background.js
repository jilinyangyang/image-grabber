/**
 * background.js —— Service Worker（后台脚本）
 * 职责：
 *  1. 接收 content.js 发送的 GRAB_IMAGES 消息；
 *  2. 把图片列表存入 chrome.storage.local（供画廊页读取）；
 *  3. 打开扩展自带的画廊页 gallery.html。
 */
'use strict';

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // 只处理来自内容脚本的提取结果
  if (msg && msg.type === 'GRAB_IMAGES' && Array.isArray(msg.images)) {
    chrome.storage.local
      .set({ grabImages: msg.images, grabAt: Date.now() })
      .then(function () {
        // 在新标签页打开画廊页展示所有图片
        return chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
      })
      .catch(function (err) {
        console.error('保存图片列表或打开画廊页失败：', err);
      });
    // 保持消息通道，让 content.js 的异步回调能正常返回
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
