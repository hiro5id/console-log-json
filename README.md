# console-log-json

## Pupose and Description
A drop-in replacement for `console.log()`, `console.info()`, 
`console.error()` to handle anything you throw at it and have the 
output be formatted to a consistent format in a single JSON line of text, including stack traces, 
so that it can be easily parsed by tool such as LogDNA.

## Features
- The order of parameters or number of parameters don't matter, it figures out how to log it.
- Automatically add a date stamp in UTC to every log.
- Automatically parse stack traces and format them into a single line for for easy parsing in log management software such as LogDNA.
- Log extra context if passed in.
- Won't crash out and cause the application to stop, if there is a problem with logger, instead try to fall back to original console.log, output what is possible and continue. 
- Logging is done in a non awaiting promise so that we yield to other processing while logging
- Logs via error level when message contains the word "error" to properly flag errors even if a mistake is made using the wrong console.info instead of console.error.