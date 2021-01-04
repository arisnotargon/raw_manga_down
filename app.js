"use strict";
const { exit } = require('process');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require("path");
const axios = require('axios');
const puppeteer = require('puppeteer');

let args = require('minimist')(process.argv.slice(2));

let targetUrl = '';

if (typeof args['t'] !== 'undefined') {
  targetUrl = args['t'];
} else if (typeof args['target'] !== 'undefined') {
  targetUrl = args['target'];
}

if (targetUrl.length < 1) {
  console.log('请使用[-t --target]参数输入目标url\nplease input target url by param [-t --target]\n[-t --target]で目標URLを入力してください');
  exit();
}

let downLoadQueue = [];
let downLoadFailedQueue = [];


const getChapter = async (chapterTitle, link, browser, mangaTilePath) => {
  console.log('=======开始获取章节:*',chapterTitle, '*图片列表==========');
  let chapterPath = path.join(mangaTilePath, chapterTitle);
  if (!fs.existsSync(chapterPath)) {
    await fs.mkdir(chapterPath, err => {
      if (err) {
        console.log(err);
      }
    })
  }
  const page = await browser.newPage();
  await page.goto(link, { timeout: 0 });
  let c = await page.content();
  const $ = cheerio.load(c);
  let picNodes = $('.page-break>img');

  picNodes.each(
    (index, ele) => {
      ele = $(ele);
      let attr = ele.attr();
      downLoadQueue.push({
        picPath: path.join(chapterPath, attr.id.trim().replace(/[\/\\\:\*\?\"\<\>\|\s+]/g, '_') + '.jpg'),
        url: attr['data-src'].trim()
      });
    }
  );
  console.log('=======章节:*',chapterTitle, '*图片列表获取成功==========');

  await page.close();
}

const downLoad = async (fpath, url) => {
  return new Promise((resolve,reject) => {
    axios.get(url).then(response => {
      fs.writeFileSync(fpath, response.data);
      console.log('文件*=' + fpath + '=*下载成功');
      resolve();
    }).catch(err => {
      console.log('文件*=' + fpath + '=*下载失败,正在重试',url,typeof url,err);
      downLoadFailedQueue.push({
        picPath: fpath,
        url: url
      });
      resolve();
    });
  });
}

// 下载列表中的全部图片,递归处理失败
const downLoadAll = async () => {
  let counter = 0;
  let downLoadPromiseChunk = [];
  for(const element of downLoadQueue) {
    // console.log(element,element.url,typeof element.url);
    // exit();
    counter++;
    downLoadPromiseChunk.push(downLoad(element.picPath, element.url));
    if (counter === 5) {
      await Promise.all(downLoadPromiseChunk);
      downLoadPromiseChunk = [];
    }
  }

  if (downLoadPromiseChunk.length > 0) {
    await Promise.all(downLoadPromiseChunk);
  }

  if (downLoadFailedQueue.length > 1) {
    downLoadQueue = downLoadFailedQueue;
    downLoadFailedQueue = [];
    await downLoadAll();
  }
}

// 主函数
(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(targetUrl, { timeout: 0 });
  let c = await page.content();
  const $ = cheerio.load(c);
  let mangaTile = $('.post-title>h1').text().trim().replace(/[\/\\\:\*\?\"\<\>\|\s+]/g, '_');
  let mangaTilePath = path.join(__dirname, mangaTile);
  if (!fs.existsSync(mangaTilePath)) {
    await fs.mkdir(mangaTilePath, err => {
      if (err) {
        console.log(err);
      }
    })
  }

  let chapters = $('.wp-manga-chapter>a');

  let chapterData = [];
  chapters.each((index, ele) => {
    ele = $(ele);
    let title = ele.text().trim().replace(/[\/\\\:\*\?\"\<\>\|\s+]/g, '_')
    let link = ele.attr('href');

    chapterData.push({ title, link });
  });

  await page.close();

  let counter = 0;
  let chapterPromiseChunk = [];
  for (const chapterDatum of chapterData) {
    counter++;
    chapterPromiseChunk.push(getChapter(chapterDatum.title, chapterDatum.link, browser, mangaTilePath));
    if (counter === 5) {
      counter = 0;
      await Promise.all(chapterPromiseChunk);
    }
  }

  if (chapterPromiseChunk.length > 0) {
    await Promise.all(chapterPromiseChunk);
  }

  // fs.writeFileSync(__dirname + '/test.js', `'use strict';\n\n module.exports = ${JSON.stringify(downLoadQueue)}`, {
  //   cwd: __dirname,
  //   encoding: 'utf8',
  //   stdio: [process.stdin, process.stdout, process.stderr]
  // });

  await browser.close();

  // downLoadQueue = require('./test.js');
  // console.log(downLoadQueue.length);
  // exit();

  // TODO: download
  await downLoadAll();
})();


