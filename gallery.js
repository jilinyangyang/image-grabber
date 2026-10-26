/**
 * gallery.js —— 画廊页逻辑
 * 职责：
 *  1. 读取 content.js 提取、后台存储的图片列表；
 *  2. 网格化展示（缩略图 + 尺寸 + 复选框）；
 *  3. 全选 / 反选 / 已选计数；
 *  4. 下载选中图片：统一转 PNG（canvas 转换），文件名 商品图_序号.png（序号补零）；
 *  5. 支持打包下载为 ZIP；提供进度与完成反馈。
 */
(function () {
  'use strict';

  var images = [];          // 原始图片 URL 列表
  var items = [];           // { url, w, h, selected }
  var isBusy = false;

  var grid = document.getElementById('ig-grid');
  var emptyBox = document.getElementById('ig-empty');
  var countEl = document.getElementById('ig-count');
  var progressBox = document.getElementById('ig-progress');
  var progressText = document.getElementById('ig-progress-text');
  var progressFill = document.getElementById('ig-progress-fill');
  var toastEl = document.getElementById('ig-toast');

  /* ================= 1. 读取并渲染 ================= */
  function load() {
    chrome.storage.local.get(['grabImages'], function (res) {
      images = res.grabImages || [];
      if (images.length === 0) {
        emptyBox.hidden = false;
        countEl.textContent = '共 0 张，已选 0 张';
        return;
      }
      items = images.map(function (url) {
        return { url: url, w: 0, h: 0, selected: true };
      });
      render();
    });
  }

  function render() {
    grid.innerHTML = '';
    items.forEach(function (item, idx) {
      var card = document.createElement('div');
      card.className = 'ig-card';
      card.dataset.index = idx;

      // 缩略图
      var img = document.createElement('img');
      img.className = 'ig-thumb';
      img.loading = 'lazy';
      img.alt = '商品图 ' + (idx + 1);
      img.src = item.url;
      // 拿到自然尺寸后回填
      img.addEventListener('load', function () {
        item.w = img.naturalWidth;
        item.h = img.naturalHeight;
        sizeEl.textContent = item.w + ' × ' + item.h;
      });
      img.addEventListener('error', function () {
        img.classList.add('ig-thumb-error');
        sizeEl.textContent = '加载失败';
      });

      // 尺寸信息
      var sizeEl = document.createElement('div');
      sizeEl.className = 'ig-size';
      sizeEl.textContent = '读取中…';

      // 序号角标
      var badge = document.createElement('div');
      badge.className = 'ig-badge';
      badge.textContent = String(idx + 1).padStart(3, '0');

      // 复选框
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'ig-check';
      check.checked = item.selected;
      check.addEventListener('change', function () {
        item.selected = check.checked;
        card.classList.toggle('ig-selected', check.checked);
        updateCount();
      });

      // 点击卡片切换选中
      card.addEventListener('click', function (e) {
        if (e.target === check) return;
        check.checked = !check.checked;
        item.selected = check.checked;
        card.classList.toggle('ig-selected', check.checked);
        updateCount();
      });

      card.appendChild(check);
      card.appendChild(img);
      card.appendChild(sizeEl);
      card.appendChild(badge);
      if (item.selected) card.classList.add('ig-selected');
      grid.appendChild(card);
    });
    updateCount();
  }

  /* ================= 2. 全选 / 反选 / 计数 ================= */
  function setAllSelected(selected) {
    items.forEach(function (item) { item.selected = selected; });
    var cards = grid.querySelectorAll('.ig-card');
    cards.forEach(function (card) {
      var idx = Number(card.dataset.index);
      var check = card.querySelector('.ig-check');
      check.checked = selected;
      card.classList.toggle('ig-selected', selected);
      items[idx].selected = selected;
    });
    updateCount();
  }

  function invertSelection() {
    items.forEach(function (item) { item.selected = !item.selected; });
    var cards = grid.querySelectorAll('.ig-card');
    cards.forEach(function (card) {
      var idx = Number(card.dataset.index);
      var check = card.querySelector('.ig-check');
      check.checked = items[idx].selected;
      card.classList.toggle('ig-selected', items[idx].selected);
    });
    updateCount();
  }

  function updateCount() {
    var n = items.filter(function (it) { return it.selected; }).length;
    countEl.textContent = '共 ' + items.length + ' 张，已选 ' + n + ' 张';
  }

  /* ================= 3. 下载 ================= */

  // 把网络图片转换为 PNG dataURL（canvas 中转，解决跨域与格式统一）
  function convertToPng(url) {
    return fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return createImageBitmap(blob);
      })
      .then(function (bitmap) {
        var canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        var dataUrl = canvas.toDataURL('image/png');
        bitmap.close();
        return { dataUrl: dataUrl, w: canvas.width, h: canvas.height };
      });
  }

  // 通过 chrome.downloads 下载单个文件
  function downloadUrl(url, filename) {
    return new Promise(function (resolve) {
      chrome.downloads.download({ url: url, filename: filename, saveAs: false }, function (downloadId) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ ok: true, downloadId: downloadId });
        }
      });
    });
  }

  // 序号补零文件名
  function filenameFor(i, total) {
    var pad = String(total).length;
    return '商品图_' + String(i + 1).padStart(pad, '0') + '.png';
  }

  // 下载选中（逐张转 PNG 后下载）
  async function downloadSelectedPng() {
    if (isBusy) return;
    var selected = items.filter(function (it) { return it.selected; });
    if (selected.length === 0) { showToast('请先勾选要下载的图片'); return; }

    isBusy = true;
    setProgress(true, '正在转换并下载…', 0);
    var okCount = 0;
    var failCount = 0;

    for (var i = 0; i < selected.length; i++) {
      var item = selected[i];
      var name = filenameFor(i, selected.length);
      setProgress(true, '正在下载 ' + (i + 1) + '/' + selected.length + '：' + name, (i / selected.length) * 100);
      try {
        var png = await convertToPng(item.url);
        var res = await downloadUrl(png.dataUrl, name);
        if (res.ok) okCount++;
        else { failCount++; console.warn('下载失败 ' + item.url, res.error); }
      } catch (e) {
        failCount++;
        console.warn('转换失败 ' + item.url, e);
      }
    }

    setProgress(false);
    isBusy = false;
    showToast('下载完成：成功 ' + okCount + ' 张，失败 ' + failCount + ' 张');
  }

  // 打包下载为 ZIP（store 方式，支持中文文件名）
  async function downloadSelectedZip() {
    if (isBusy) return;
    var selected = items.filter(function (it) { return it.selected; });
    if (selected.length === 0) { showToast('请先勾选要下载的图片'); return; }

    isBusy = true;
    setProgress(true, '正在打包 ' + selected.length + ' 张图片…', 0);
    var files = [];
    for (var i = 0; i < selected.length; i++) {
      setProgress(true, '正在打包 ' + (i + 1) + '/' + selected.length, (i / selected.length) * 100);
      try {
        var png = await convertToPng(selected[i].url);
        var bytes = dataUrlToBytes(png.dataUrl);
        files.push({ name: filenameFor(i, selected.length), data: bytes });
      } catch (e) {
        console.warn('打包跳过失败图片：' + selected[i].url, e);
      }
    }
    if (files.length === 0) {
      setProgress(false);
      isBusy = false;
      showToast('没有可打包的图片');
      return;
    }
    var zipBytes = makeZip(files);
    var zipUrl = bytesToDataUrl(zipBytes, 'application/zip');
    var res = await downloadUrl(zipUrl, '商品图片.zip');
    setProgress(false);
    isBusy = false;
    showToast(res.ok ? 'ZIP 打包完成，已下载 ' + files.length + ' 张图片' : 'ZIP 下载失败：' + (res.error || ''));
  }

  /* ================= 4. 工具：dataURL 与字节互转、ZIP ================= */
  function dataUrlToBytes(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToDataUrl(bytes, mime) {
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return 'data:' + mime + ';base64,' + btoa(bin);
  }

  // CRC32 表与计算
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(data) {
    var c = 0xffffffff;
    for (var i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // 简易 ZIP 打包（Store 无压缩），支持 UTF-8 中文文件名
  function makeZip(files) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;

    function push(dvBytes) { parts.push(dvBytes); }

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var nameBytes = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);
      var dataLen = data.length;

      // 本地文件头 30 字节
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);        // 版本
      lh.setUint16(6, 0x0800, true);    // UTF-8 文件名标志
      lh.setUint16(8, 0, true);         // 压缩方式：store
      lh.setUint16(10, 0, true);        // 修改时间
      lh.setUint16(12, 0x0021, true);   // 修改日期
      lh.setUint32(14, crc, true);
      lh.setUint32(18, dataLen, true);
      lh.setUint32(22, dataLen, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      push(new Uint8Array(lh.buffer));
      push(nameBytes);
      push(data);

      // 中央目录记录 46 字节
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, 0, true);
      cd.setUint16(14, 0x0021, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, dataLen, true);
      cd.setUint32(24, dataLen, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer));
      central.push(nameBytes);

      offset += 30 + nameBytes.length + dataLen;
    }

    // 中央目录总长度
    var centralSize = central.reduce(function (s, b) { return s + b.length; }, 0);
    // EOCD 22 字节
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, offset, true);
    eocd.setUint16(20, 0, true);

    var all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
    var out = new Uint8Array(all.reduce(function (s, b) { return s + b.length; }, 0));
    var p = 0;
    for (var j = 0; j < all.length; j++) {
      out.set(all[j], p);
      p += all[j].length;
    }
    return out;
  }

  /* ================= 5. 进度条与提示 ================= */
  function setProgress(show, text, percent) {
    if (show) {
      progressBox.hidden = false;
      progressText.textContent = text;
      progressFill.style.width = (percent == null ? 0 : percent) + '%';
    } else {
      progressBox.hidden = true;
    }
  }

  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* ================= 6. 事件绑定 ================= */
  document.getElementById('ig-select-all').addEventListener('click', function () { setAllSelected(true); });
  document.getElementById('ig-select-invert').addEventListener('click', invertSelection);
  document.getElementById('ig-download-png').addEventListener('click', downloadSelectedPng);
  document.getElementById('ig-download-zip').addEventListener('click', downloadSelectedZip);
  document.getElementById('ig-back').addEventListener('click', function () {
    if (history.length > 1) history.back();
    else window.close();
  });

  // 启动
  load();
})();
