/*
 This class was created with some code that was copied from https://github.com/mdlavin/nested-error-stacks

 The original license of nested-error-stacks follows:

 Copyright (c) 2014 Matt Lavin <matt.lavin@gmail.com>

 Permission is hereby granted, free of charge, to any person
 obtaining a copy of this software and associated documentation
 files (the "Software"), to deal in the Software without
 restriction, including without limitation the rights to use,
 copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following
 conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
 */
import { NewLineCharacter } from './new-line-character';

export class CaptureNestedStackTrace {
  private static buildCombinedStacks(stack: any, nested: Error) {
    if (nested != null) {
      stack += `${NewLineCharacter()}Caused By: ` + nested.stack;
    }
    return stack;
  }

  public capture(err: Error, nestedError: Error) {
    Error.captureStackTrace(err, err.constructor);
    const oldStackDescriptor = Object.getOwnPropertyDescriptor(err, 'stack');
    const stackDescriptor = this.buildStackDescriptor(oldStackDescriptor!, err, nestedError);
    Object.defineProperty(err, 'stack', stackDescriptor);
  }

  private buildStackDescriptor(oldStackDescriptor: PropertyDescriptor, err: Error, nested: Error) {
    if (oldStackDescriptor.get != null) {
      return {
        get: () => {
          const stack = oldStackDescriptor.get!.call(err);
          return CaptureNestedStackTrace.buildCombinedStacks(stack, nested);
        },
      };
    } else {
      const stack = oldStackDescriptor.value;
      return {
        value: CaptureNestedStackTrace.buildCombinedStacks(stack, nested),
      };
    }
  }
}
