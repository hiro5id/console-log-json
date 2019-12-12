/* tslint:disable:only-arrow-functions */
import {expect} from "chai";
import * as cheerio from 'cheerio';
import {LoggerAdaptToConsole, LoggerRestoreConsole, overrideStdOut, restoreStdOut} from "../src";


describe('when cheerio error occurs', async function() {

   it('catches error properly', async function () {
      const {originalWrite, outputText} = overrideStdOut();
      LoggerAdaptToConsole();
      const rp = require('request-promise');
      try {
         const cheerioAPI = await rp({
            transform: (body: any) => cheerio.load(body),
            uri: 'https://123.xynon-existante.com',
         });
         console.log(cheerioAPI);
      } catch (err) {
         await console.log(err);
      }

      restoreStdOut(originalWrite);
      LoggerRestoreConsole();

      console.log(outputText[0]);
      expect(JSON.parse(outputText[0]).level).eql("error");
      expect(JSON.parse(outputText[0]).message).eql("Error: getaddrinfo ENOTFOUND 123.xynon-existante.com");
      expect(JSON.parse(outputText[0]).errCallStack).contain("123.xynon-existante.com");
   })
});