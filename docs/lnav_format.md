# Consuming logs with lnav

In lnav it is possible to give it a format file to have it parse and hilight bits.

here is an example that can be loaded with the command `lnavl -i console_log_json.json` which gets installed into the path `~/.lnav/formats/installed/console_log_json.json`

Filename: `console_log_json.json`
```json
{
    "$schema": "https://lnav.org/schemas/format-v1.schema.json",
    "console_log_json": {
        "description": "Format file generated from regex101 entry -- https://regex101.com/r/6DSpFh/1",
        "regex": {
            "base": {
                "pattern": "^{((\\\"level\\\"\\:\\\")(?<level>.*?)(?<!\\\\)\").?(?:(\\\"message\\\"\\:\\\")(?<message>.*?)(?<!\\\\)\")?.?(?:(\\\"\\@filename\\\"\\:\\\")(?<filename>.*?)(?<!\\\\)\")?.?(?:(\\\"\\@logCallStack\\\"\\:\\\")(?<logCallStack>.*?)(?<!\\\\)\")?.?(?:(\\\"errCallStack\\\"\\:\\\")(?<errCallStack>.*?)(?<!\\\\)\")?.?((\\\"\\@timestamp\\\"\\:\\\")(?<timestamp>.*?)(?<!\\\\)\")}$"
            }
        },
        "body-field": "message",
        "level-field": "level",
        "timestamp-field": "timestamp",
        "level": {
            "error": "error",
            "warning": "warn",
            "info": "info"
        },
        "value": {
            "level": {
                "kind": "string",
                "identifier": true
            },
            "message": {
                "kind": "string"
            },
            "filename": {
                "kind": "string"
            }
        },
        "highlights" : {
            "message": {
               "pattern": "((?<=\"message\":\")(?<message>.*?)(?=(?<!\\\\)\"))",
               "color" : "#000000",
               "background-color": "#ffff00"
            },
           "filename" : {
               "pattern" : "((?<=\"@filename\":\")(?<filename>.*?)(?=(?<!\\\\)\"))",
               "color" : "#0000d7"
           }
        },
        "sample": [
            {
                "line": "{\"level\":\"info\",\"message\":\"Error running main:   - connect ECONNREFUS\\\"ED ::1:27017\",\"@errorObjectName\":\"MongoServerSelectionError\",\"@filename\":\"/data-scraper/dist/src/main.js\",\"@logCallStack\":\" /data-scraper/src/main.ts:20:13\",\"@packageName\":\"starter-project\",\"errCallStack\":\"Error: connect ECONNREFUSED ::1:27017\\n    at /data-scraper/src/main.ts:20:13Caused By: MongoServerSelectionError: connect ECONNREFUSED ::1:27017\\n    at Timeout._onTimeout (/data-scraper/node_modules/mongodb/src/sdam/topology.ts:591:30)\\n    at listOnTimeout (node:internal/timers:564:17)\\n    at processTimers (node:internal/timers:507:7)\",\"@timestamp\":\"2023-01-16T14:52:31.874Z\"}",
                "error": "{\"level\":\"error\",\"message\":\"Error running main:   - connect ECONNREFUSED ::1:27017\",\"@errorObjectName\":\"MongoServerSelectionError\",\"@filename\":\"/data-scraper/dist/src/main.js\",\"@logCallStack\":\" /data-scraper/src/main.ts:20:13\",\"@packageName\":\"starter-project\",\"errCallStack\":\"Error: connect ECONNREFUSED ::1:27017\\n    at /data-scraper/src/main.ts:20:13Caused By: MongoServerSelectionError: connect ECONNREFUSED ::1:27017\\n    at Timeout._onTimeout (/data-scraper/node_modules/mongodb/src/sdam/topology.ts:591:30)\\n    at listOnTimeout (node:internal/timers:564:17)\\n    at processTimers (node:internal/timers:507:7)\",\"@timestamp\":\"2023-01-16T14:52:31.874Z\"}"
            }
        ]
    }
}
```

### Helper commands for lnav

To push a config named `console_log_json` to regex101 for editing:
`lnav -m format console_log_json regex base regex101 push`

### lnav format documentation
https://docs.lnav.org/en/latest/formats.html#defining-a-new-format


### Experimental

To match only certain requried fields and not everything
```regexp
^{((\"level\"\:\")(?<level>.*?)(?<!\\)")|(?:(\"message\"\:\")(?<message>.*?)(?<!\\)")|(?:(\"\@filename\"\:\")(?<filename>.*?)(?<!\\)")|(?:(\"\@logCallStack\"\:\")(?<logCallStack>.*?)(?<!\\)")|(?:(\"errCallStack\"\:\")(?<errCallStack>.*?)(?<!\\)")|((\"\@timestamp\"\:\")(?<timestamp>.*?)(?<!\\)")}$
```
