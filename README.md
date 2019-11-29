# console-log-json

## Pupose and Description
A no fuss simple drop-in replacement for `console.log()`, `console.info()`, 
`console.error()` to handle anything you throw at it and have the 
output be formatted to a consistent format in a single JSON line of text, including stack traces (if passing an error object), 
so that it can be easily parsed by tool such as LogDNA.

## Features
- The order of parameters or number of parameters don't matter, it figures out how to log it.
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
