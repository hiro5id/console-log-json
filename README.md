# console-log-json

<!-- markdownlint-disable -->

<!--suppress HtmlDeprecatedAttribute -->

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

<a href="https://www.npmjs.com/package/console-log-json">![title](docs/images/console-log-json-image.png)</a>

A universal JSON logger that plugs in to the existing `console.log` native function.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->

<!-- prettier-ignore-start -->

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/Logan-seongjae"><img src="https://avatars.githubusercontent.com/u/105279900?v=4?s=100" width="100px;" alt="Logan.seongjae(Benefit)"/><br /><sub><b>Logan.seongjae(Benefit)</b></sub></a><br /><a href="https://github.com/hiro5id/console-log-json/commits?author=Logan-seongjae" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

<!-- prettier-ignore-start -->

<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

<!-- markdownlint-restore -->

* *[contributing...](docs/CONTRIBUTING.md)*

## Pupose and Description

A no fuss simple drop-in replacement for `console.log()`, `console.info()`, 
`console.error()` to handle anything you throw at it and have the 
output be formatted to a consistent format in a single **JSON** line of text, including **stack traces** (if passing an error object), 
so that it can be easily parsed by tool such as LogDNA.

## Features

- The order of parameters or number of parameters don't matter, it figures out how to log it.
- Handles circular references
- Automatically add a date stamp in UTC to every log.
- Automatically parse stack traces and format them into a single line for for easy parsing in log management software such as LogDNA.
- Log extra context if passed in.
- Won't crash out and cause the application to stop, if there is a problem with logger, instead try to fall back to original console.log, output what is possible and continue. 
- Logging is done in a non awaiting promise so that we yield to other processing while logging
- Logs via error level when message contains the word "error" to properly flag errors even if a mistake is made using the wrong console.info instead of console.error.

## Usage

1. Install
   
   ```
   npm install console-log-json
   ```

2. At the entry point of the application include the package and run *LoggerAdaptToConsole()*
   
   ```
   import { LoggerAdaptToConsole } from "console-log-json";
   LoggerAdaptToConsole();
   ```
   
    This will adapt *console.log()*, *console.error()*, etc... to take in any string, or object, in any order or any number of them, and it will log a consistently formatted single line JSON to console.
    For example:
   
   ```
   console.warn('this is a message', {'some-extra-data': 'hello'});
   ```
   
    will produce:
   
   ```
   {"level":"warn","message":"this is a message","some-extra-data":"hello","@timestamp":"2019-11-29T21:44:40.463Z"}
   ```

## Environment Variable Options

To suppress some bits of the log to make it less noisy you can set these environment variables:

* CONSOLE_LOG_JSON_DISABLE_AUTO_PARSE="true"
  * Disable JSON auto parsing in `@autoParsedJson` and outputs a stringified version of data in the `message` field
* CONSOLE_LOG_JSON_NO_FILE_NAME="true"
  * Omits `@filename` in log
* CONSOLE_LOG_JSON_NO_PACKAGE_NAME="true"
  * Omits `@packageName` in log
* CONSOLE_LOG_JSON_NO_TIME_STAMP="true"
  * Omits `@timestamp` in log
* CONSOLE_LOG_JSON_NO_STACK_FOR_NON_ERROR="true"
  * Omits `@logCallStack` in log
* CONSOLE_LOG_JSON_NO_LOGGER_DEBUG="true"
  * Omits `_loggerDebug` in log
* CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS="true"
  * Omits `\n` new line characters in the log string.  -- the presence of these can help format the log for readability for some log analyzers.  But it can cause problems for others.  You can turn them off with this.

## Examples

### 1. Logging an error object

```
const err = new Error('this is a test');
console.log('hello world', err);
```

   Will produce:

```
{"level":"error","message":"hello world - this is a test","stack":"Error: this is a test    at Context.<anonymous> (console-log-json/test/logger.test.ts:260:17)    at callFn (console-log-json/node_modules/mocha/lib/runnable.js:387:21)    at Test.Runnable.run (console-log-json/node_modules/mocha/lib/runnable.js:379:7)    at Runner.runTest (console-log-json/node_modules/mocha/lib/runner.js:535:10)    at console-log-json/node_modules/mocha/lib/runner.js:653:12    at next (console-log-json/node_modules/mocha/lib/runner.js:447:14)    at console-log-json/node_modules/mocha/lib/runner.js:457:7    at next (console-log-json/node_modules/mocha/lib/runner.js:362:14)    at Immediate._onImmediate (console-log-json/node_modules/mocha/lib/runner.js:425:5)    at processImmediate (internal/timers.js:439:21)","@timestamp":"2019-11-29T21:55:33.443Z"}
```

- Notice the log level `error` is automatically chosen even though we used `console.log()` instead of `console.error()` this is because we passed in a error object, so it makes sense to log it as log level error.
- Notice the stack trace is included and formatted into one line as to not interfere with logging services such as LogDNA.  This allows them to interpret the whole thing as a single log event, rather than spread out over multiple lines, possibly even interweaved with other logs.
- The string "hello world" is included together with the same log.
- Any number of additional strings or objects can be included in the *console.log()* parameters, in any order and it will be handled consistently and sensibly.

### 2. Including extra information as an object

```
const extraInfo = {firstName: 'homer', lastName: 'simpson'};
console.log(extraInfo, 'hello world');
```

   Will produce:

```
{"level":"info","message":"hello world","age":25,"firstName":"homer","lastName":"simpson","location":"mars","@timestamp":"2019-12-01T04:10:38.861Z"}
```

- Notice that even though we supplied `hello world` as the last parameter it is still logged out as the `message` property and is always the first thing after the log `level`
- Notice the `extraInnfo` data is split out and included as individual properties at the top level ready for easy parsing and filtering in logging tools such as LogDNA.

### 3. You may include multiple objects, it will deal with them all

```
const extraInfo1 = {firstName: 'homer', lastName: 'simpson'};
const extraInfo2 = {age: 25, location: 'mars'};
console.log(extraInfo1, 'hello world', extraInfo2);
```

   Will produce:

```
{"level":"info","message":"hello world","age":25,"firstName":"homer","lastName":"simpson","location":"mars","@timestamp":"2019-12-01T04:10:38.861Z"}
```

- Again notice that we are not picky about the order in which the parameters are passed in to *console.log()*
- Notice that properties fo `extraInfo1` and `extraInfo2` are extracted and all logged in on line at the top level for easy parsing and filtering in logging tools such as LogDNA.
- Notice that properties such as `firstName` and `age` etc are sorted alphabetically for consistent appearance of logs in JSON no matter what order they are passed in.
