"use strict";
const { exit } = require('process');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require("path");
const axios = require('axios');

// const request = require("request");

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

const puppeteer = require('puppeteer');
const { resolve } = require('path');
const { get } = require('http');

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

  await browser.close();
})();

let getChapter = async (chapterTitle, link, browser, mangaTilePath) => {
  let chapterPath = path.join(mangaTilePath, chapterTitle);
  if (!fs.existsSync(chapterPath)) {
    await fs.mkdir(chapterPath, err => {
      if (err) {
        console.log(err);
      }
    })
  }
  const page = await browser.newPage();
  await page.goto(link);
  let c = await page.content();
  const $ = cheerio.load(c);
  let picNodes = $('.page-break>img');
  let donwloadPromiseChunk = [];
  picNodes.each(
    (index, ele) => {
      ele = $(ele);
      let attr = ele.attr();

      let fname = attr.id.trim().replace(/[\/\\\:\*\?\"\<\>\|\s+]/g, '_');
      let src = attr['data-src'].trim();
      donwloadPromiseChunk.push(new Promise((res, rej) => downloadImg(path.join(chapterPath, fname + '.jpg'), src, res)));
    }
  );
  await page.close();
  await Promise.all(donwloadPromiseChunk)
}

let downloadImg = async (fpath, url, res) => {
  axios({
    url,
    responseType: "arraybuffer"
  }).then(({ data }) => {
    fs.writeFileSync(fpath, data, "binary");
    console.log("文件[" + fpath + "]下载完毕");
    res();
  }).catch(err=>{
    // retry
    console.log(err, "文件[" + fpath + "]下载失败,正在重试");
    downloadImg(fpath, url, res);
  })
}
