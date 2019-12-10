/* tslint:disable:object-literal-sort-keys */
import {expect} from 'chai';
import {
    ErrorWithContext,
    FormatErrorObject, GetLogLevel,
    LOG_LEVEL,
    LoggerAdaptToConsole,
    LoggerRestoreConsole, NativeConsoleLog, overrideStdOut, restoreStdOut, SetLogLevel
} from '../src';

describe('logger', () => {
    it('logs error in correct shape', () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();
        try {
            // action
            NativeConsoleLog('testing native log');
            console.error('some string', new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}));
        } finally {
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        // assert
        console.log(outputText[1]);
        expect(outputText[0]).equal('testing native log\n');

        const testObj = JSON.parse(stripTimeStamp(outputText[1]));
        delete testObj["@filename"];
        delete testObj.errCallStack;
        delete testObj["@logCallStack"];

        expect(testObj).eql({"level":"error","@errorObjectName": "Error","message":"some string - error object","extra-context":"extra-context"});

        expect(JSON.parse(outputText[1]).errCallStack.startsWith("Error: error object\n    at ")).eql(true, "starts with specific text");
    });

    it('logs error in correct shape using console.log', () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();
        try {
            // action
            console.log('some string', new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}));
        } finally {
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }
        // assert
        console.log(outputText[0]);

        expect(JSON.parse(outputText[0]).errCallStack.startsWith("Error: error object\n    at ")).eql(true, "starts with specific text");

        const testObj = JSON.parse(stripTimeStamp(outputText[0]));
        delete testObj["@filename"];
        delete testObj.errCallStack;
        delete testObj["@logCallStack"];

        expect(testObj).eql({"level":"error","@errorObjectName": "Error","message":"some string - error object","extra-context":"extra-context"});

    });

    it('console.log is correctly adapted when using a combination of types', () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();
        try {
            // action
            console.log(
                'some string1',
                123,
                'some string2',
                {property1: 'proptery1'},
                {property2: 'property2'},
                new ErrorWithContext('error \r\nobject', {'extra-context': 'extra-context'}),
            );
        } finally {
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }
        // assert
        console.log(outputText[0]);
        const testObj = JSON.parse(stripTimeStamp(outputText[0]));
        delete testObj["@filename"];
        delete testObj.errCallStack;
        delete testObj["@logCallStack"];

        expect(testObj).eql({"level":"error","@errorObjectName": "Error","message":"some string1 - 123 - some string2 - error object","extra-context":"extra-context","property1":"proptery1","property2":"property2"});

        expect(JSON.parse(outputText[0]).errCallStack.startsWith("Error: error object\n    at")).eql(true,"starts with specific string")
    });


    it('console.error logs the inner error', () => {
        // arrange
        const innerError = new ErrorWithContext('this is the inner error 1234', {extraContextInner: 'blah inner context'});
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        try {
            // action
            console.error('some outer error', new ErrorWithContext(innerError, {'extra-context': 'extra-context'}));
        } finally {
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        // assert
        expect(outputText[0]).contains('some outer error - this is the inner error 1234');
    });

    it('FormatErrorObject works as expected', () => {
        // arrange
        const innerError = new ErrorWithContext('inner error 1234', {contextInner: 'dataInner'});
        const sut = new ErrorWithContext(innerError, {contextForOuterError: 'dataOuter'});

        // action
        const formatted = FormatErrorObject(sut);

        // assert
        expect(formatted).contains('"contextInner":"dataInner"');
        expect(formatted).contains('"contextForOuterError":"dataOuter"');
        expect(formatted).contains('inner error 1234');
    });

    it('console.error has timestamp', () => {
        // arrange
        const innerError = new ErrorWithContext('this is the inner error 1234', {extraContextInner: 'blah inner context'});
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        try {
            // action
            console.error('some outer error', new ErrorWithContext(innerError, {'extra-context': 'extra-context'}));
        } finally {
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        // assert
        expect(outputText[0]).contains('"@timestamp"');
    });

    it('console.debug works', () => {
        const backupLevel = GetLogLevel();
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({logLevel:LOG_LEVEL.debug});

        try {
            console.debug('this is a message', {'extra-context': 'hello'});
        } finally {
            SetLogLevel(backupLevel);
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("debug");
        expect(testObj.message).eql("this is a message");
        expect(testObj["extra-context"]).eql("hello");
        expect(testObj["@filename"]).contain("/test/logger.test");
    });

    it('console.silly works', () => {
        const backupLevel = GetLogLevel();
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({logLevel:LOG_LEVEL.silly});

        try {
            console.silly('this is a message', {'extra-context': 'hello'});
        } finally {
            SetLogLevel(backupLevel);
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        console.log(outputText[0]);
        expect(JSON.parse(outputText[0]).level).eql("silly");
    });


    it('console.warn works with log level info', () => {
        const backupLevel = GetLogLevel();
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({logLevel:LOG_LEVEL.info});

        try {
            console.warn('this is a message', {'extra-context': 'hello'});
        } finally {
            SetLogLevel(backupLevel);
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        console.log(outputText[0]);
        expect(JSON.parse(outputText[0]).level).eql("warn");
    });


    it('console.warn is not shown with log level error', () => {
        const backupLevel = GetLogLevel();
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({logLevel:LOG_LEVEL.error});

        try {
            console.warn('this is a message', {'extra-context': 'hello'});
        } finally {
            SetLogLevel(backupLevel);
            restoreStdOut(originalWrite);
            LoggerRestoreConsole();
        }

        console.log(outputText[0]);
        expect(outputText[0]).equals(undefined);
    });

    it('logs error properly when extra context is a string', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        const extraContext = 'this is a test string';
        try {
            // noinspection ExceptionCaughtLocallyJS
            throw new ErrorWithContext(`error message 1`, extraContext as any);
        } catch (err) {
            console.log(err);
        }
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
        expect(testObj.message).eql("error message 1 - this is a test string");
        expect(testObj.errCallStack.startsWith("Error: error message 1 - this is a test string\n    at")).eql(true, "stack starts with specific message");
    });

    it('logs error properly when extra context is a string and main error is an error object', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        const extraContext = 'this is a test string';
        const mainError = new Error('error message 2');
        try {
            // noinspection ExceptionCaughtLocallyJS
            throw new ErrorWithContext(mainError, extraContext as any);
        } catch (err) {
            console.log(err);
        }
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj1 = JSON.parse(stripTimeStamp(outputText[0]));
        delete testObj1["@filename"];
        delete testObj1.errCallStack;
        delete testObj1["@logCallStack"];
        expect(testObj1).eql({"level":"error","@errorObjectName": "Error","message":"error message 2 - this is a test string"});

        const testObj2 = JSON.parse(outputText[0]);
        expect(testObj2["@filename"]).include("/test/logger.test");
        expect(testObj2.errCallStack.startsWith("Error: error message 2 - this is a test string\n    at")).eql(true,"stack starts with specific text")
    });

    it('console.info works', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.info('this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);

        outputText[0] = stripProperty(outputText[0],"@logCallStack");
        outputText[0] = stripTimeStamp(outputText[0]);

        expect(JSON.parse(outputText[0])).eql({
            "level": "info",
            "message": "this is a test - more messages",
            "@filename": "/test/logger.test.ts",
            "a": "stuff-a",
            "b": "stuff-b",
            "c": "stuff-c"
        });
    });


    it('console.log logs as info when explicitly provided with level:info parameter', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({level: "info"}, 'this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        expect(JSON.parse(outputText[0]).level).eql("info");
    });

    it('console.log logs as error when explicitly provided with level:error parameter', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({level: "error"}, 'this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
    });

    it('console.log logs as error when explicitly provided with level:err parameter', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({level: "err"}, 'this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
    });


    it('console.log logs as warn when explicitly provided with level:warning parameter', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({level: "warning"}, 'this is a test', {
            a: 'stuff-a',
            b: 'stuff-b'
        }, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("warn");
    });

    it('handle empty object', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({}, 'this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(stripTimeStamp(outputText[0]));
        delete testObj["@filename"];
        delete testObj["@logCallStack"];
        expect(testObj).eql({"level":"info","message":"this is a test - more messages","a":"stuff-a","b":"stuff-b","c":"stuff-c"});
    });

    it('ignore null parameters among other parameters', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log(null, 'this is a test', null, {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("info");
        expect(testObj.message).eql("this is a test - more messages");
        expect(testObj.a).eql("stuff-a");
        expect(testObj.b).eql("stuff-b");
        expect(testObj.c).eql("stuff-c");
        expect(testObj["@filename"]).include("/test/logger.test");
    });

    it('handle when only null parameter is provided', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log(null);

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("info");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("<value-passed-to-console-log-json-was-null>");
    });

    it('handle when nothing is provided', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log();

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("info");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("<nothing-was-passed-to-console-log>");
    });

    it('no error message was passed, it displays informative message in log', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.error({durationInSeconds: 1,totalErrored:2, totalFlaggedAsSent: 4, totalPickedUp:5, totalSent: 3});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("<no-error-message-was-passed-to-console-log>");
    });


    it('handle single error object with message', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log(new Error('error-message'));

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("error-message");
    });

    it('handle scenario where non traditional error object is passed', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.error("Encountered Fatal Error on startup of public-api",
            {
                "name": "MongoTimeoutError",
                "stack": "MongoTimeoutError: Server selection timed out after 30000 ms\n    at Timeout._onTimeout (/Users/roberto/dev/cnp/web/public-api/node_modules/mongodb/lib/core/sdam/server_selection.js:308:9)\n    at listOnTimeout (internal/timers.js:531:17)\n    at processTimers (internal/timers.js:475:7)",
                "message": "Server selection timed out after 30000 ms"
            }
            );

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("Encountered Fatal Error on startup of public-api - Server selection timed out after 30000 ms");
        expect(testObj["@errorObjectName"]).eql("MongoTimeoutError");
    });

    it('log with debug shows debug line', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({debugString:true});

        console.log(new Error('error-message'), 'test string');

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("error");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("test string - error-message");
        expect(testObj._loggerDebug).contains("\"test string\"");
        expect(testObj._loggerDebug[0]).contains("\"stack\":\"Error: error-message");
    });

    it('error during processing of debug line shows the error', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole({debugString:true});
        (console as any).debugStringException = () => {
            throw new Error('error while building debugString')
        };
        console.log('testing');

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();
        delete (console as any).debugStringException;

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("info");
        expect(testObj["@filename"]).include("/test/logger.test");
        expect(testObj.message).eql("testing");
        expect(testObj._loggerDebug).eql("err error while building debugString");
    });

    it('console.log logs as info when explicitly provided with level parameter that is not recognized', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log({level: "somethingElse"}, 'this is a test', {
            a: 'stuff-a',
            b: 'stuff-b'
        }, 'more messages', {c: 'stuff-c'});

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        console.log(outputText[0]);
        const testObj = JSON.parse(outputText[0]);
        expect(testObj.level).eql("info");
        expect(testObj.message).eql("this is a test - more messages");
        expect(testObj.a).eql("stuff-a");
        expect(testObj.b).eql("stuff-b");
        expect(testObj.c).eql("stuff-c");
        expect(testObj["@filename"]).include("/test/logger.test")
    });

    it('logging in a different order produces same result', async () => {
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        const extraInfo1 = {firstName: 'homer', lastName: 'simpson'};
        const extraInfo2 = {age: 25, location: 'mars'};
        console.log(extraInfo1, 'hello world', extraInfo2);
        console.log('hello world', extraInfo2, extraInfo1);

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        outputText[0] = stripTimeStamp(outputText[0]);
        outputText[0] = stripProperty(outputText[0], "@logCallStack");
        outputText[1] = stripTimeStamp(outputText[1]);
        outputText[1] = stripProperty(outputText[1], "@logCallStack");

        console.log(outputText[0]);
        console.log(outputText[1]);
        expect(outputText[0]).equal(outputText[1])
    });


    it('console.log exception but is handled without crashing out', async () => {
        // arrange
        const {originalWrite} = overrideStdOut();
        LoggerAdaptToConsole();
        console.exception = () => {
            throw new Error('this is a test')
        };
        let caughtErr = null;

        // action
        try {
            console.log('this is a test', {a: 'stuff-a', b: 'stuff-b'}, 'more messages', {c: 'stuff-c'});
        } catch (err) {
            caughtErr = err;
        }

        // reset
        delete console.exception;
        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        // assert
        expect(caughtErr).equal(null);
    });

    it('filters colors', () => {
        const messageWithColors = "\u001b[90m================================\u001b[39m\n \u001b[33mMissing\u001b[39m environment variables:\n    \u001b[34mCCE_MONGO_CONNECTION\u001b[39m: undefined\n\u001b[33m\u001b[39m\n\u001b[33m Exiting with error code 1\u001b[39m\n\u001b[90m================================\u001b[39m";
        const {originalWrite, outputText} = overrideStdOut();
        LoggerAdaptToConsole();

        console.log(messageWithColors);

        restoreStdOut(originalWrite);
        LoggerRestoreConsole();

        expect((outputText[0] as string).indexOf('\\u001b[90m') === 27).equals(false, 'the color string should not be in the output');
        expect(outputText[0]).contain('"================================\\n Missing environment variables:\\n    CCE_MONGO_CONNECTION: undefined\\n\\n Exiting with error code 1\\n================================"');
    });

    it('throws an error with additional context', () => {
        const baseErr = Error('a random error');
        const errWithContext = new ErrorWithContext(baseErr, {additional: 'context'});

        expect(errWithContext.message).to.eql('a random error');
        expect((errWithContext as any).extraContext.additional).to.eql('context');
    });

    // Todo: test multiple nested ErrorWithContext objects to ensure proper stacktrace and error messages
});

const stripTimeStamp = (input: string): string => {
    const obj = JSON.parse(input);
    delete obj["@timestamp"];
    return JSON.stringify(obj);
};

const stripProperty = (input: string, propertyName: string): string => {
    const obj = JSON.parse(input);
    delete obj[propertyName];
    return JSON.stringify(obj);
};