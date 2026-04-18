/* tslint:disable:only-arrow-functions */
import { expect } from 'chai';
import { LoggerAdaptToConsole, LoggerRestoreConsole, overrideStdOut, restoreStdOut } from '../src';

describe('when a request-like error occurs', function () {
  it('catches error properly and logs it as JSON', async function () {
    const { originalWrite, outputText } = overrideStdOut();
    LoggerAdaptToConsole();

    try {
      // Simulate the kind of error that request-promise / cheerio would produce
      // (a RequestError with name, message, stack, and extra properties)
      const simulatedError: any = new Error('Error: getaddrinfo ENOTFOUND 123.xynon-existante.com');
      simulatedError.name = 'RequestError';
      simulatedError.options = { uri: 'https://123.xynon-existante.com' };
      console.log(simulatedError);
    } finally {
      restoreStdOut(originalWrite);
      LoggerRestoreConsole();
    }

    expect(JSON.parse(outputText[0]).level).eql('error');
    expect(JSON.parse(outputText[0]).message).eql('  - Error: getaddrinfo ENOTFOUND 123.xynon-existante.com');
    expect(JSON.parse(outputText[0]).errCallStack).contain('123.xynon-existante.com');
  });
});
