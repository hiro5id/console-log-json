# console-log-json

## Pupose and Description
A drop-in replacement for `console.log()`, `console.info()`, 
`console.error()` to handle anything you throw at it and have the 
output be formatted to single line JSON, including stack traces, 
so that it can be easily parsed by tool such as LogDNA.

## Features
- the order of parameters or number of parameters don't matter, it figures out how to log it.
- automatically add a date stamp in UTC to every log.
- automatically parse stack traces and format them into a single
line for for easy parsing in log management software such as LogDNA.
- log extra context if passed in.
- do not explode if an exception occurs during logging, instead fall
back to original console.log, output what is possible and continue 
the program without crashing out. 
- logging is done in a non awaiting promise so that we yield to other processing while logging
- logs via error level when message contains the word "error" to properly flag errors even if a mistake is made using the wrong console.info instead of console.error.