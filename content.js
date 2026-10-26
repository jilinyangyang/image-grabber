/**
 * content.js —— 内容脚本
 * 职责：
 *  1. 在电商商品详情页右下角注入「获取图片」悬浮按钮；
 *  2. 点击后扫描当前页面的所有商品图片（<img>、srcset、data-* 懒加载、背景图）；
 *  3. 过滤图标/Logo/占位图/过小图片，去重后发送给后台，由后台打开画廊页。
 */
(function () {
  'use strict';

  var BTN_ID = 'ig-grab-btn';

  /* ---------- 1. 商品详情页判断（简单 URL 特征） ---------- */
  function isDetailPage() {
    var url = location.href;
    return (
      /\/item(\.htm)?([?#]|$)/i.test(url) || // 淘宝/天猫：/item.htm 或 /item/xxx
      /item\.jd\.com/i.test(url) ||          // 京东：item.jd.com/xxx.html
      /\/goods(\/|\.html|[?#]|$)/i.test(url) || // 拼多多 goods 详情
      /\/detail/i.test(url)
    );
  }

  /* ---------- 2. 工具函数 ---------- */
  // 把相对路径 / 协议相对地址补全为绝对 URL
  function toAbsoluteUrl(u) {
    if (!u) return null;
    u = u.trim();
    if (!u || u.indexOf('data:') === 0 || u.indexOf('blob:') === 0) return null;
    try {
      return new URL(u, location.href).href;
    } catch (e) {
      return null;
    }
  }

  // 判断是否应过滤（图标/Logo/占位/过小/格式）
  function shouldFilter(src, el) {
    if (!src) return true;
    // 图片格式与关键词特征
    if (/\.(svg|ico)([?#]|$)/i.test(src)) return true;
    if (/(icon|logo|sprite|placeholder|blank|loading|spacer|1px|beacon|default\.(png|jpg))/i.test(src)) return true;
    if (/data:image\/svg/i.test(src)) return true;
    // 已知宽高且过小（<100px）
    var w = el ? (el.naturalWidth || el.width) : 0;
    var h = el ? (el.naturalHeight || el.height) : 0;
    if (w && h && (w < 100 || h < 100)) return true;
    // 元素类名/id 含 icon/logo 等
    if (el) {
      var cls = (el.className || '') + ' ' + (el.id || '');
      if (/(^|[\s-_])(icon|logo|sprite|placeholder|avatar|loading)([\s-_]|$)/i.test(cls)) return true;
    }
    return false;
  }

  // 从单个 <img> 收集可能的多来源地址
  function collectFromImg(img) {
    var list = [];
    var src = img.getAttribute('src');
    if (src && !shouldFilter(src, img)) list.push(toAbsoluteUrl(src));

    // srcset：取每一档候选地址
    var srcset = img.getAttribute('srcset');
    if (srcset) {
      var parts = srcset.split(',');
      for (var i = 0; i < parts.length; i++) {
        var url = toAbsoluteUrl(parts[i].trim().split(/\s+/)[0]);
        if (url) list.push(url);
      }
    }
    // 常见懒加载属性，逐一尝试
    var attrs = [
      'data-src', 'data-lazy-src', 'data-original', 'data-lazyload',
      'data-ks-lazyload', 'data-actualsrc', 'data-img', 'data-url'
    ];
    for (var j = 0; j < attrs.length; j++) {
      var v = img.getAttribute(attrs[j]);
      if (v && !shouldFilter(v, img)) {
        var u = toAbsoluteUrl(v);
        if (u) list.push(u);
      }
    }
    return list;
  }

  /* ---------- 3. 扫描页面图片 ---------- */
  function scanImages() {
    var urls = new Set();

    function push(u) {
      if (u) urls.add(u);
    }

    // 1) 所有 <img>
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      collectFromImg(imgs[i]).forEach(push);
    }

    // 2) 内联背景图（background-image）
    var bgEls = document.querySelectorAll('[style*="background"], [data-background]');
    for (var j = 0; j < bgEls.length; j++) {
      var el = bgEls[j];
      var bi = el.style && el.style.backgroundImage;
      if (bi && bi !== 'none') {
        var m = bi.match(/url\(["']?(.*?)["']?\)/);
        if (m && m[1]) {
          var u = toAbsoluteUrl(m[1]);
          if (u && !shouldFilter(u, el)) push(u);
        }
      }
      var db = el.getAttribute('data-background');
      if (db) {
        var u2 = toAbsoluteUrl(db);
        if (u2 && !shouldFilter(u2, el)) push(u2);
      }
    }

    // 最后再统一过滤一次非商品图，并限制数量避免卡顿
    var result = [];
    urls.forEach(function (u) {
      if (!shouldFilter(u, null) && result.length < 500) result.push(u);
    });
    return result;
  }

  /* ---------- 4. 注入按钮 ---------- */
  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    var btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.textContent = '获取图片';
    btn.addEventListener('click', onGrabClick);
    document.body.appendChild(btn);
  }

  /* ---------- 5. 点击提取 ---------- */
  function onGrabClick() {
    var btn = document.getElementById(BTN_ID);
    if (!btn || btn.classList.contains('ig-loading')) return;
    btn.textContent = '提取中…';
    btn.classList.add('ig-loading');

    // 稍等片刻让懒加载图片进入 DOM / 被解析
    setTimeout(function () {
      var images = scanImages();
      chrome.runtime.sendMessage({ type: 'GRAB_IMAGES', images: images }, function () {
        // 后台打开画廊页后，恢复按钮
        btn.textContent = '获取图片';
        btn.classList.remove('ig-loading');
      });
    }, 60);
  }

  /* ---------- 6. 初始化 ---------- */
  function init() {
    // 仅在商品详情页注入，其他页面不显示（满足需求）
    if (!isDetailPage()) return;
    if (document.body) ensureButton();
    else window.addEventListener('DOMContentLoaded', ensureButton);
  }

  // 兼容 SPA 动态路由（部分详情页通过前端路由切换）
  window.addEventListener('hashchange', init);
  init();
})();
