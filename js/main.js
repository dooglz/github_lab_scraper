(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
arguments[4][1][0].apply(exports,arguments)
},{"dup":1}],3:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('Invalid typed array length')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (isArrayBuffer(value)) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  return fromObject(value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj) {
    if (isArrayBufferView(obj) || 'length' in obj) {
      if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
        return createBuffer(0)
      }
      return fromArrayLike(obj)
    }

    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return fromArrayLike(obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (isArrayBufferView(string) || isArrayBuffer(string)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : new Buffer(val, encoding)
    var len = bytes.length
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffers from another context (i.e. an iframe) do not pass the `instanceof` check
// but they should be treated as valid. See: https://github.com/feross/buffer/issues/166
function isArrayBuffer (obj) {
  return obj instanceof ArrayBuffer ||
    (obj != null && obj.constructor != null && obj.constructor.name === 'ArrayBuffer' &&
      typeof obj.byteLength === 'number')
}

// Node 0.10 supports `ArrayBuffer` but lacks `ArrayBuffer.isView`
function isArrayBufferView (obj) {
  return (typeof ArrayBuffer.isView === 'function') && ArrayBuffer.isView(obj)
}

function numberIsNaN (obj) {
  return obj !== obj // eslint-disable-line no-self-compare
}

},{"base64-js":4,"ieee754":5}],4:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function placeHoldersCount (b64) {
  var len = b64.length
  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  return b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0
}

function byteLength (b64) {
  // base64 is 4/3 + up to two characters of the original data
  return (b64.length * 3 / 4) - placeHoldersCount(b64)
}

function toByteArray (b64) {
  var i, l, tmp, placeHolders, arr
  var len = b64.length
  placeHolders = placeHoldersCount(b64)

  arr = new Arr((len * 3 / 4) - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0; i < l; i += 4) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],5:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],7:[function(require,module,exports){
var http = require('http')
var url = require('url')

var https = module.exports

for (var key in http) {
  if (http.hasOwnProperty(key)) https[key] = http[key]
}

https.request = function (params, cb) {
  params = validateParams(params)
  return http.request.call(this, params, cb)
}

https.get = function (params, cb) {
  params = validateParams(params)
  return http.get.call(this, params, cb)
}

function validateParams (params) {
  if (typeof params === 'string') {
    params = url.parse(params)
  }
  if (!params.protocol) {
    params.protocol = 'https:'
  }
  if (params.protocol !== 'https:') {
    throw new Error('Protocol "' + params.protocol + '" not supported. Expected "https:"')
  }
  return params
}

},{"http":35,"url":43}],8:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],9:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],10:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],11:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],12:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],13:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],14:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":12,"./encode":13}],15:[function(require,module,exports){
module.exports = require('./lib/_stream_duplex.js');

},{"./lib/_stream_duplex.js":16}],16:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/

var processNextTick = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

var keys = objectKeys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  processNextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }
    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

Duplex.prototype._destroy = function (err, cb) {
  this.push(null);
  this.end();

  processNextTick(cb, err);
};

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}
},{"./_stream_readable":18,"./_stream_writable":20,"core-util-is":24,"inherits":8,"process-nextick-args":26}],17:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":19,"core-util-is":24,"inherits":8}],18:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var processNextTick = require('process-nextick-args');
/*</replacement>*/

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;

/*<replacement>*/
var EE = require('events').EventEmitter;

var EElistenerCount = function (emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

// TODO(bmeurer): Change this back to const once hole checks are
// properly optimized away early in Ignition+TurboFan.
/*<replacement>*/
var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}
/*</replacement>*/

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var debugUtil = require('util');
var debug = void 0;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var BufferList = require('./internal/streams/BufferList');
var destroyImpl = require('./internal/streams/destroy');
var StringDecoder;

util.inherits(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') {
    return emitter.prependListener(event, fn);
  } else {
    // This is a hack to make sure that our error handler is attached before any
    // userland ones.  NEVER DO THIS. This is here only because this code needs
    // to continue to work with older versions of Node.js that do not include
    // the prependListener() method. The goal is to eventually remove this hack.
    if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
  }
}

function ReadableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // has it been destroyed
  this.destroyed = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined) {
      return false;
    }
    return this._readableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
  }
});

Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;
Readable.prototype._destroy = function (err, cb) {
  this.push(null);
  cb(err);
};

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }
      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  var state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);
    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new Error('stream.unshift() after end event'));else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new Error('stream.push() after EOF'));
      } else {
        state.reading = false;
        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
    }
  }

  return needMoreData(state);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    stream.emit('data', chunk);
    stream.read(0);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;
  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) processNextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    processNextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('_read() is not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) processNextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');
    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = { hasUnpiped: false };

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, unpipeInfo);
    }return this;
  }

  // try to find the right one.
  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;

  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this, unpipeInfo);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        processNextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    processNextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], self.emit.bind(self, kProxyEvents[n]));
  }

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    processNextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./_stream_duplex":16,"./internal/streams/BufferList":21,"./internal/streams/destroy":22,"./internal/streams/stream":23,"_process":10,"core-util-is":24,"events":6,"inherits":8,"isarray":25,"process-nextick-args":26,"safe-buffer":27,"string_decoder/":41,"util":2}],19:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

'use strict';

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);

function TransformState(stream) {
  this.afterTransform = function (er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
  this.writeencoding = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) {
    return stream.emit('error', new Error('write callback called multiple times'));
  }

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined) stream.push(data);

  cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(this);

  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  this.once('prefinish', function () {
    if (typeof this._flush === 'function') this._flush(function (er, data) {
      done(stream, er, data);
    });else done(stream);
  });
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('_transform() is not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  var _this = this;

  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
    _this.emit('close');
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);

  if (data !== null && data !== undefined) stream.push(data);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length) throw new Error('Calling transform done when ws.length != 0');

  if (ts.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}
},{"./_stream_duplex":16,"core-util-is":24,"inherits":8}],20:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

/*<replacement>*/

var processNextTick = require('process-nextick-args');
/*</replacement>*/

module.exports = Writable;

/* <replacement> */
function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;
  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : processNextTick;
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/
var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}
/*</replacement>*/

var destroyImpl = require('./internal/streams/destroy');

util.inherits(Writable, Stream);

function nop() {}

function WritableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // if _final has been called
  this.finalCalled = false;

  // drain event flag.
  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // has it been destroyed
  this.destroyed = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})();

// Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.
var realHasInstance;
if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function (object) {
      if (realHasInstance.call(this, object)) return true;

      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function (object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.

  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
    return new Writable(options);
  }

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;

    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  processNextTick(cb, er);
}

// Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;

  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    processNextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;
  var isBuf = _isUint8Array(chunk) && !state.objectMode;

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);
    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    processNextTick(cb, er);
    // this can emit finish, and it will always happen
    // after error
    processNextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
    // this can emit finish, but finish must
    // always follow error
    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    var allBuffers = true;
    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }
    buffer.allBuffers = allBuffers;

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequestCount = 0;
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('_write() is not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}
function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;
    if (err) {
      stream.emit('error', err);
    }
    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}
function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function') {
      state.pendingcb++;
      state.finalCalled = true;
      processNextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) processNextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;
  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  }
  if (state.corkedRequestsFree) {
    state.corkedRequestsFree.next = corkReq;
  } else {
    state.corkedRequestsFree = corkReq;
  }
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  get: function () {
    if (this._writableState === undefined) {
      return false;
    }
    return this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._writableState.destroyed = value;
  }
});

Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;
Writable.prototype._destroy = function (err, cb) {
  this.end();
  cb(err);
};
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./_stream_duplex":16,"./internal/streams/destroy":22,"./internal/streams/stream":23,"_process":10,"core-util-is":24,"inherits":8,"process-nextick-args":26,"safe-buffer":27,"util-deprecate":28}],21:[function(require,module,exports){
'use strict';

/*<replacement>*/

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

function copyBuffer(src, target, offset) {
  src.copy(target, offset);
}

module.exports = function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  BufferList.prototype.push = function push(v) {
    var entry = { data: v, next: null };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  BufferList.prototype.unshift = function unshift(v) {
    var entry = { data: v, next: this.head };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  BufferList.prototype.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  BufferList.prototype.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  BufferList.prototype.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;
    while (p = p.next) {
      ret += s + p.data;
    }return ret;
  };

  BufferList.prototype.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    if (this.length === 1) return this.head.data;
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;
    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }
    return ret;
  };

  return BufferList;
}();
},{"safe-buffer":27}],22:[function(require,module,exports){
'use strict';

/*<replacement>*/

var processNextTick = require('process-nextick-args');
/*</replacement>*/

// undocumented cb() API, needed for core, not for public API
function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err && (!this._writableState || !this._writableState.errorEmitted)) {
      processNextTick(emitErrorNT, this, err);
    }
    return;
  }

  // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks

  if (this._readableState) {
    this._readableState.destroyed = true;
  }

  // if this is a duplex stream mark the writable part as destroyed as well
  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      processNextTick(emitErrorNT, _this, err);
      if (_this._writableState) {
        _this._writableState.errorEmitted = true;
      }
    } else if (cb) {
      cb(err);
    }
  });
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};
},{"process-nextick-args":26}],23:[function(require,module,exports){
module.exports = require('events').EventEmitter;

},{"events":6}],24:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../../../insert-module-globals/node_modules/is-buffer/index.js")})
},{"../../../../insert-module-globals/node_modules/is-buffer/index.js":9}],25:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],26:[function(require,module,exports){
(function (process){
'use strict';

if (!process.version ||
    process.version.indexOf('v0.') === 0 ||
    process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = nextTick;
} else {
  module.exports = process.nextTick;
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
  case 0:
  case 1:
    return process.nextTick(fn);
  case 2:
    return process.nextTick(function afterTickOne() {
      fn.call(null, arg1);
    });
  case 3:
    return process.nextTick(function afterTickTwo() {
      fn.call(null, arg1, arg2);
    });
  case 4:
    return process.nextTick(function afterTickThree() {
      fn.call(null, arg1, arg2, arg3);
    });
  default:
    args = new Array(len - 1);
    i = 0;
    while (i < args.length) {
      args[i++] = arguments[i];
    }
    return process.nextTick(function afterTick() {
      fn.apply(null, args);
    });
  }
}

}).call(this,require('_process'))
},{"_process":10}],27:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":3}],28:[function(require,module,exports){
(function (global){

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate (fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config (name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],29:[function(require,module,exports){
module.exports = require('./readable').PassThrough

},{"./readable":30}],30:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":16,"./lib/_stream_passthrough.js":17,"./lib/_stream_readable.js":18,"./lib/_stream_transform.js":19,"./lib/_stream_writable.js":20}],31:[function(require,module,exports){
(function (process){
var Stream = require('stream');
if (process.env.READABLE_STREAM === 'disable' && Stream) {
  module.exports = Stream;
  exports = module.exports = Stream.Readable;
  exports.Readable = Stream.Readable;
  exports.Writable = Stream.Writable;
  exports.Duplex = Stream.Duplex;
  exports.Transform = Stream.Transform;
  exports.PassThrough = Stream.PassThrough;
  exports.Stream = Stream;
} else {
  exports = module.exports = require('./lib/_stream_readable.js');
  exports.Stream = Stream || exports;
  exports.Readable = exports;
  exports.Writable = require('./lib/_stream_writable.js');
  exports.Duplex = require('./lib/_stream_duplex.js');
  exports.Transform = require('./lib/_stream_transform.js');
  exports.PassThrough = require('./lib/_stream_passthrough.js');
}

}).call(this,require('_process'))
},{"./lib/_stream_duplex.js":16,"./lib/_stream_passthrough.js":17,"./lib/_stream_readable.js":18,"./lib/_stream_transform.js":19,"./lib/_stream_writable.js":20,"_process":10,"stream":34}],32:[function(require,module,exports){
module.exports = require('./readable').Transform

},{"./readable":30}],33:[function(require,module,exports){
module.exports = require('./lib/_stream_writable.js');

},{"./lib/_stream_writable.js":20}],34:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":6,"inherits":8,"readable-stream/duplex.js":15,"readable-stream/passthrough.js":29,"readable-stream/readable.js":30,"readable-stream/transform.js":32,"readable-stream/writable.js":33}],35:[function(require,module,exports){
(function (global){
var ClientRequest = require('./lib/request')
var IncomingMessage = require('./lib/response')
var extend = require('xtend')
var statusCodes = require('builtin-status-codes')
var url = require('url')

var http = exports

http.request = function (opts, cb) {
	if (typeof opts === 'string')
		opts = url.parse(opts)
	else
		opts = extend(opts)

	// Normally, the page is loaded from http or https, so not specifying a protocol
	// will result in a (valid) protocol-relative url. However, this won't work if
	// the protocol is something else, like 'file:'
	var defaultProtocol = global.location.protocol.search(/^https?:$/) === -1 ? 'http:' : ''

	var protocol = opts.protocol || defaultProtocol
	var host = opts.hostname || opts.host
	var port = opts.port
	var path = opts.path || '/'

	// Necessary for IPv6 addresses
	if (host && host.indexOf(':') !== -1)
		host = '[' + host + ']'

	// This may be a relative url. The browser should always be able to interpret it correctly.
	opts.url = (host ? (protocol + '//' + host) : '') + (port ? ':' + port : '') + path
	opts.method = (opts.method || 'GET').toUpperCase()
	opts.headers = opts.headers || {}

	// Also valid opts.auth, opts.mode

	var req = new ClientRequest(opts)
	if (cb)
		req.on('response', cb)
	return req
}

http.get = function get (opts, cb) {
	var req = http.request(opts, cb)
	req.end()
	return req
}

http.ClientRequest = ClientRequest
http.IncomingMessage = IncomingMessage

http.Agent = function () {}
http.Agent.defaultMaxSockets = 4

http.STATUS_CODES = statusCodes

http.METHODS = [
	'CHECKOUT',
	'CONNECT',
	'COPY',
	'DELETE',
	'GET',
	'HEAD',
	'LOCK',
	'M-SEARCH',
	'MERGE',
	'MKACTIVITY',
	'MKCOL',
	'MOVE',
	'NOTIFY',
	'OPTIONS',
	'PATCH',
	'POST',
	'PROPFIND',
	'PROPPATCH',
	'PURGE',
	'PUT',
	'REPORT',
	'SEARCH',
	'SUBSCRIBE',
	'TRACE',
	'UNLOCK',
	'UNSUBSCRIBE'
]
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./lib/request":37,"./lib/response":38,"builtin-status-codes":39,"url":43,"xtend":48}],36:[function(require,module,exports){
(function (global){
exports.fetch = isFunction(global.fetch) && isFunction(global.ReadableStream)

exports.writableStream = isFunction(global.WritableStream)

exports.abortController = isFunction(global.AbortController)

exports.blobConstructor = false
try {
	new Blob([new ArrayBuffer(1)])
	exports.blobConstructor = true
} catch (e) {}

// The xhr request to example.com may violate some restrictive CSP configurations,
// so if we're running in a browser that supports `fetch`, avoid calling getXHR()
// and assume support for certain features below.
var xhr
function getXHR () {
	// Cache the xhr value
	if (xhr !== undefined) return xhr

	if (global.XMLHttpRequest) {
		xhr = new global.XMLHttpRequest()
		// If XDomainRequest is available (ie only, where xhr might not work
		// cross domain), use the page location. Otherwise use example.com
		// Note: this doesn't actually make an http request.
		try {
			xhr.open('GET', global.XDomainRequest ? '/' : 'https://example.com')
		} catch(e) {
			xhr = null
		}
	} else {
		// Service workers don't have XHR
		xhr = null
	}
	return xhr
}

function checkTypeSupport (type) {
	var xhr = getXHR()
	if (!xhr) return false
	try {
		xhr.responseType = type
		return xhr.responseType === type
	} catch (e) {}
	return false
}

// For some strange reason, Safari 7.0 reports typeof global.ArrayBuffer === 'object'.
// Safari 7.1 appears to have fixed this bug.
var haveArrayBuffer = typeof global.ArrayBuffer !== 'undefined'
var haveSlice = haveArrayBuffer && isFunction(global.ArrayBuffer.prototype.slice)

// If fetch is supported, then arraybuffer will be supported too. Skip calling
// checkTypeSupport(), since that calls getXHR().
exports.arraybuffer = exports.fetch || (haveArrayBuffer && checkTypeSupport('arraybuffer'))

// These next two tests unavoidably show warnings in Chrome. Since fetch will always
// be used if it's available, just return false for these to avoid the warnings.
exports.msstream = !exports.fetch && haveSlice && checkTypeSupport('ms-stream')
exports.mozchunkedarraybuffer = !exports.fetch && haveArrayBuffer &&
	checkTypeSupport('moz-chunked-arraybuffer')

// If fetch is supported, then overrideMimeType will be supported too. Skip calling
// getXHR().
exports.overrideMimeType = exports.fetch || (getXHR() ? isFunction(getXHR().overrideMimeType) : false)

exports.vbArray = isFunction(global.VBArray)

function isFunction (value) {
	return typeof value === 'function'
}

xhr = null // Help gc

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],37:[function(require,module,exports){
(function (process,global,Buffer){
var capability = require('./capability')
var inherits = require('inherits')
var response = require('./response')
var stream = require('readable-stream')
var toArrayBuffer = require('to-arraybuffer')

var IncomingMessage = response.IncomingMessage
var rStates = response.readyStates

function decideMode (preferBinary, useFetch) {
	if (capability.fetch && useFetch) {
		return 'fetch'
	} else if (capability.mozchunkedarraybuffer) {
		return 'moz-chunked-arraybuffer'
	} else if (capability.msstream) {
		return 'ms-stream'
	} else if (capability.arraybuffer && preferBinary) {
		return 'arraybuffer'
	} else if (capability.vbArray && preferBinary) {
		return 'text:vbarray'
	} else {
		return 'text'
	}
}

var ClientRequest = module.exports = function (opts) {
	var self = this
	stream.Writable.call(self)

	self._opts = opts
	self._body = []
	self._headers = {}
	if (opts.auth)
		self.setHeader('Authorization', 'Basic ' + new Buffer(opts.auth).toString('base64'))
	Object.keys(opts.headers).forEach(function (name) {
		self.setHeader(name, opts.headers[name])
	})

	var preferBinary
	var useFetch = true
	if (opts.mode === 'disable-fetch' || ('requestTimeout' in opts && !capability.abortController)) {
		// If the use of XHR should be preferred. Not typically needed.
		useFetch = false
		preferBinary = true
	} else if (opts.mode === 'prefer-streaming') {
		// If streaming is a high priority but binary compatibility and
		// the accuracy of the 'content-type' header aren't
		preferBinary = false
	} else if (opts.mode === 'allow-wrong-content-type') {
		// If streaming is more important than preserving the 'content-type' header
		preferBinary = !capability.overrideMimeType
	} else if (!opts.mode || opts.mode === 'default' || opts.mode === 'prefer-fast') {
		// Use binary if text streaming may corrupt data or the content-type header, or for speed
		preferBinary = true
	} else {
		throw new Error('Invalid value for opts.mode')
	}
	self._mode = decideMode(preferBinary, useFetch)

	self.on('finish', function () {
		self._onFinish()
	})
}

inherits(ClientRequest, stream.Writable)

ClientRequest.prototype.setHeader = function (name, value) {
	var self = this
	var lowerName = name.toLowerCase()
	// This check is not necessary, but it prevents warnings from browsers about setting unsafe
	// headers. To be honest I'm not entirely sure hiding these warnings is a good thing, but
	// http-browserify did it, so I will too.
	if (unsafeHeaders.indexOf(lowerName) !== -1)
		return

	self._headers[lowerName] = {
		name: name,
		value: value
	}
}

ClientRequest.prototype.getHeader = function (name) {
	var header = this._headers[name.toLowerCase()]
	if (header)
		return header.value
	return null
}

ClientRequest.prototype.removeHeader = function (name) {
	var self = this
	delete self._headers[name.toLowerCase()]
}

ClientRequest.prototype._onFinish = function () {
	var self = this

	if (self._destroyed)
		return
	var opts = self._opts

	var headersObj = self._headers
	var body = null
	if (opts.method !== 'GET' && opts.method !== 'HEAD') {
		if (capability.arraybuffer) {
			body = toArrayBuffer(Buffer.concat(self._body))
		} else if (capability.blobConstructor) {
			body = new global.Blob(self._body.map(function (buffer) {
				return toArrayBuffer(buffer)
			}), {
				type: (headersObj['content-type'] || {}).value || ''
			})
		} else {
			// get utf8 string
			body = Buffer.concat(self._body).toString()
		}
	}

	// create flattened list of headers
	var headersList = []
	Object.keys(headersObj).forEach(function (keyName) {
		var name = headersObj[keyName].name
		var value = headersObj[keyName].value
		if (Array.isArray(value)) {
			value.forEach(function (v) {
				headersList.push([name, v])
			})
		} else {
			headersList.push([name, value])
		}
	})

	if (self._mode === 'fetch') {
		var signal = null
		if (capability.abortController) {
			var controller = new AbortController()
			signal = controller.signal
			self._fetchAbortController = controller

			if ('requestTimeout' in opts && opts.requestTimeout !== 0) {
				global.setTimeout(function () {
					self.emit('requestTimeout')
					if (self._fetchAbortController)
						self._fetchAbortController.abort()
				}, opts.requestTimeout)
			}
		}

		global.fetch(self._opts.url, {
			method: self._opts.method,
			headers: headersList,
			body: body || undefined,
			mode: 'cors',
			credentials: opts.withCredentials ? 'include' : 'same-origin',
			signal: signal
		}).then(function (response) {
			self._fetchResponse = response
			self._connect()
		}, function (reason) {
			self.emit('error', reason)
		})
	} else {
		var xhr = self._xhr = new global.XMLHttpRequest()
		try {
			xhr.open(self._opts.method, self._opts.url, true)
		} catch (err) {
			process.nextTick(function () {
				self.emit('error', err)
			})
			return
		}

		// Can't set responseType on really old browsers
		if ('responseType' in xhr)
			xhr.responseType = self._mode.split(':')[0]

		if ('withCredentials' in xhr)
			xhr.withCredentials = !!opts.withCredentials

		if (self._mode === 'text' && 'overrideMimeType' in xhr)
			xhr.overrideMimeType('text/plain; charset=x-user-defined')

		if ('requestTimeout' in opts) {
			xhr.timeout = opts.requestTimeout
			xhr.ontimeout = function () {
				self.emit('requestTimeout')
			}
		}

		headersList.forEach(function (header) {
			xhr.setRequestHeader(header[0], header[1])
		})

		self._response = null
		xhr.onreadystatechange = function () {
			switch (xhr.readyState) {
				case rStates.LOADING:
				case rStates.DONE:
					self._onXHRProgress()
					break
			}
		}
		// Necessary for streaming in Firefox, since xhr.response is ONLY defined
		// in onprogress, not in onreadystatechange with xhr.readyState = 3
		if (self._mode === 'moz-chunked-arraybuffer') {
			xhr.onprogress = function () {
				self._onXHRProgress()
			}
		}

		xhr.onerror = function () {
			if (self._destroyed)
				return
			self.emit('error', new Error('XHR error'))
		}

		try {
			xhr.send(body)
		} catch (err) {
			process.nextTick(function () {
				self.emit('error', err)
			})
			return
		}
	}
}

/**
 * Checks if xhr.status is readable and non-zero, indicating no error.
 * Even though the spec says it should be available in readyState 3,
 * accessing it throws an exception in IE8
 */
function statusValid (xhr) {
	try {
		var status = xhr.status
		return (status !== null && status !== 0)
	} catch (e) {
		return false
	}
}

ClientRequest.prototype._onXHRProgress = function () {
	var self = this

	if (!statusValid(self._xhr) || self._destroyed)
		return

	if (!self._response)
		self._connect()

	self._response._onXHRProgress()
}

ClientRequest.prototype._connect = function () {
	var self = this

	if (self._destroyed)
		return

	self._response = new IncomingMessage(self._xhr, self._fetchResponse, self._mode)
	self._response.on('error', function(err) {
		self.emit('error', err)
	})

	self.emit('response', self._response)
}

ClientRequest.prototype._write = function (chunk, encoding, cb) {
	var self = this

	self._body.push(chunk)
	cb()
}

ClientRequest.prototype.abort = ClientRequest.prototype.destroy = function () {
	var self = this
	self._destroyed = true
	if (self._response)
		self._response._destroyed = true
	if (self._xhr)
		self._xhr.abort()
	else if (self._fetchAbortController)
		self._fetchAbortController.abort()
}

ClientRequest.prototype.end = function (data, encoding, cb) {
	var self = this
	if (typeof data === 'function') {
		cb = data
		data = undefined
	}

	stream.Writable.prototype.end.call(self, data, encoding, cb)
}

ClientRequest.prototype.flushHeaders = function () {}
ClientRequest.prototype.setTimeout = function () {}
ClientRequest.prototype.setNoDelay = function () {}
ClientRequest.prototype.setSocketKeepAlive = function () {}

// Taken from http://www.w3.org/TR/XMLHttpRequest/#the-setrequestheader%28%29-method
var unsafeHeaders = [
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'cookie',
	'cookie2',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'user-agent',
	'via'
]

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"./capability":36,"./response":38,"_process":10,"buffer":3,"inherits":8,"readable-stream":30,"to-arraybuffer":40}],38:[function(require,module,exports){
(function (process,global,Buffer){
var capability = require('./capability')
var inherits = require('inherits')
var stream = require('readable-stream')

var rStates = exports.readyStates = {
	UNSENT: 0,
	OPENED: 1,
	HEADERS_RECEIVED: 2,
	LOADING: 3,
	DONE: 4
}

var IncomingMessage = exports.IncomingMessage = function (xhr, response, mode) {
	var self = this
	stream.Readable.call(self)

	self._mode = mode
	self.headers = {}
	self.rawHeaders = []
	self.trailers = {}
	self.rawTrailers = []

	// Fake the 'close' event, but only once 'end' fires
	self.on('end', function () {
		// The nextTick is necessary to prevent the 'request' module from causing an infinite loop
		process.nextTick(function () {
			self.emit('close')
		})
	})

	if (mode === 'fetch') {
		self._fetchResponse = response

		self.url = response.url
		self.statusCode = response.status
		self.statusMessage = response.statusText
		
		response.headers.forEach(function (header, key){
			self.headers[key.toLowerCase()] = header
			self.rawHeaders.push(key, header)
		})

		if (capability.writableStream) {
			var writable = new WritableStream({
				write: function (chunk) {
					return new Promise(function (resolve, reject) {
						if (self._destroyed) {
							return
						} else if(self.push(new Buffer(chunk))) {
							resolve()
						} else {
							self._resumeFetch = resolve
						}
					})
				},
				close: function () {
					if (!self._destroyed)
						self.push(null)
				},
				abort: function (err) {
					if (!self._destroyed)
						self.emit('error', err)
				}
			})

			try {
				response.body.pipeTo(writable)
				return
			} catch (e) {} // pipeTo method isn't defined. Can't find a better way to feature test this
		}
		// fallback for when writableStream or pipeTo aren't available
		var reader = response.body.getReader()
		function read () {
			reader.read().then(function (result) {
				if (self._destroyed)
					return
				if (result.done) {
					self.push(null)
					return
				}
				self.push(new Buffer(result.value))
				read()
			}).catch(function(err) {
				if (!self._destroyed)
					self.emit('error', err)
			})
		}
		read()
	} else {
		self._xhr = xhr
		self._pos = 0

		self.url = xhr.responseURL
		self.statusCode = xhr.status
		self.statusMessage = xhr.statusText
		var headers = xhr.getAllResponseHeaders().split(/\r?\n/)
		headers.forEach(function (header) {
			var matches = header.match(/^([^:]+):\s*(.*)/)
			if (matches) {
				var key = matches[1].toLowerCase()
				if (key === 'set-cookie') {
					if (self.headers[key] === undefined) {
						self.headers[key] = []
					}
					self.headers[key].push(matches[2])
				} else if (self.headers[key] !== undefined) {
					self.headers[key] += ', ' + matches[2]
				} else {
					self.headers[key] = matches[2]
				}
				self.rawHeaders.push(matches[1], matches[2])
			}
		})

		self._charset = 'x-user-defined'
		if (!capability.overrideMimeType) {
			var mimeType = self.rawHeaders['mime-type']
			if (mimeType) {
				var charsetMatch = mimeType.match(/;\s*charset=([^;])(;|$)/)
				if (charsetMatch) {
					self._charset = charsetMatch[1].toLowerCase()
				}
			}
			if (!self._charset)
				self._charset = 'utf-8' // best guess
		}
	}
}

inherits(IncomingMessage, stream.Readable)

IncomingMessage.prototype._read = function () {
	var self = this

	var resolve = self._resumeFetch
	if (resolve) {
		self._resumeFetch = null
		resolve()
	}
}

IncomingMessage.prototype._onXHRProgress = function () {
	var self = this

	var xhr = self._xhr

	var response = null
	switch (self._mode) {
		case 'text:vbarray': // For IE9
			if (xhr.readyState !== rStates.DONE)
				break
			try {
				// This fails in IE8
				response = new global.VBArray(xhr.responseBody).toArray()
			} catch (e) {}
			if (response !== null) {
				self.push(new Buffer(response))
				break
			}
			// Falls through in IE8	
		case 'text':
			try { // This will fail when readyState = 3 in IE9. Switch mode and wait for readyState = 4
				response = xhr.responseText
			} catch (e) {
				self._mode = 'text:vbarray'
				break
			}
			if (response.length > self._pos) {
				var newData = response.substr(self._pos)
				if (self._charset === 'x-user-defined') {
					var buffer = new Buffer(newData.length)
					for (var i = 0; i < newData.length; i++)
						buffer[i] = newData.charCodeAt(i) & 0xff

					self.push(buffer)
				} else {
					self.push(newData, self._charset)
				}
				self._pos = response.length
			}
			break
		case 'arraybuffer':
			if (xhr.readyState !== rStates.DONE || !xhr.response)
				break
			response = xhr.response
			self.push(new Buffer(new Uint8Array(response)))
			break
		case 'moz-chunked-arraybuffer': // take whole
			response = xhr.response
			if (xhr.readyState !== rStates.LOADING || !response)
				break
			self.push(new Buffer(new Uint8Array(response)))
			break
		case 'ms-stream':
			response = xhr.response
			if (xhr.readyState !== rStates.LOADING)
				break
			var reader = new global.MSStreamReader()
			reader.onprogress = function () {
				if (reader.result.byteLength > self._pos) {
					self.push(new Buffer(new Uint8Array(reader.result.slice(self._pos))))
					self._pos = reader.result.byteLength
				}
			}
			reader.onload = function () {
				self.push(null)
			}
			// reader.onerror = ??? // TODO: this
			reader.readAsArrayBuffer(response)
			break
	}

	// The ms-stream case handles end separately in reader.onload()
	if (self._xhr.readyState === rStates.DONE && self._mode !== 'ms-stream') {
		self.push(null)
	}
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"./capability":36,"_process":10,"buffer":3,"inherits":8,"readable-stream":30}],39:[function(require,module,exports){
module.exports = {
  "100": "Continue",
  "101": "Switching Protocols",
  "102": "Processing",
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "203": "Non-Authoritative Information",
  "204": "No Content",
  "205": "Reset Content",
  "206": "Partial Content",
  "207": "Multi-Status",
  "208": "Already Reported",
  "226": "IM Used",
  "300": "Multiple Choices",
  "301": "Moved Permanently",
  "302": "Found",
  "303": "See Other",
  "304": "Not Modified",
  "305": "Use Proxy",
  "307": "Temporary Redirect",
  "308": "Permanent Redirect",
  "400": "Bad Request",
  "401": "Unauthorized",
  "402": "Payment Required",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "406": "Not Acceptable",
  "407": "Proxy Authentication Required",
  "408": "Request Timeout",
  "409": "Conflict",
  "410": "Gone",
  "411": "Length Required",
  "412": "Precondition Failed",
  "413": "Payload Too Large",
  "414": "URI Too Long",
  "415": "Unsupported Media Type",
  "416": "Range Not Satisfiable",
  "417": "Expectation Failed",
  "418": "I'm a teapot",
  "421": "Misdirected Request",
  "422": "Unprocessable Entity",
  "423": "Locked",
  "424": "Failed Dependency",
  "425": "Unordered Collection",
  "426": "Upgrade Required",
  "428": "Precondition Required",
  "429": "Too Many Requests",
  "431": "Request Header Fields Too Large",
  "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "505": "HTTP Version Not Supported",
  "506": "Variant Also Negotiates",
  "507": "Insufficient Storage",
  "508": "Loop Detected",
  "509": "Bandwidth Limit Exceeded",
  "510": "Not Extended",
  "511": "Network Authentication Required"
}

},{}],40:[function(require,module,exports){
var Buffer = require('buffer').Buffer

module.exports = function (buf) {
	// If the buffer is backed by a Uint8Array, a faster version will work
	if (buf instanceof Uint8Array) {
		// If the buffer isn't a subarray, return the underlying ArrayBuffer
		if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
			return buf.buffer
		} else if (typeof buf.buffer.slice === 'function') {
			// Otherwise we need to get a proper copy
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
		}
	}

	if (Buffer.isBuffer(buf)) {
		// This is the slow version that will work with any Buffer
		// implementation (even in old browsers)
		var arrayCopy = new Uint8Array(buf.length)
		var len = buf.length
		for (var i = 0; i < len; i++) {
			arrayCopy[i] = buf[i]
		}
		return arrayCopy.buffer
	} else {
		throw new Error('Argument must be a Buffer')
	}
}

},{"buffer":3}],41:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return -1;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// UTF-8 replacement characters ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd'.repeat(p);
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd'.repeat(p + 1);
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd'.repeat(p + 2);
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character for each buffered byte of a (partial)
// character needs to be added to the output.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd'.repeat(this.lastTotal - this.lastNeed);
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":42}],42:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"buffer":3,"dup":27}],43:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":44,"punycode":11,"querystring":14}],44:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],45:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8}],46:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],47:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":46,"_process":10,"inherits":45}],48:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],49:[function(require,module,exports){
var GitHubApi = require('github')
var Cookies = require('js-cookie')
var cool = require('cool-ascii-faces')
var moment = require('moment');
moment().format();
var github = new GitHubApi();
var authenticated = false;;
var u, p;
var repolinks = [];
var lastResponse = new Date();
var callsRemain = 0;
var requestsFired = 0;
//var lennys = ["( ͡° ͜ʖ ͡°)","ヽ༼ຈل͜ຈ༽ﾉ","( ◔ ʖ̯ ◔ )","┌(° ͜ʖ͡°)┘","( ͡° ͜V ͡°)"];


function genericCallback(err, res) {
    if (err) {
        throw err;
    } else {
        metaHandler(res);
        console.log(res);
    }
}

function metaHandler(res) {
    requestsFired++;
    var d = new Date();
    if (d < lastResponse) {
        return;
    }
    lastResponse = d;
    callsRemain = res.meta["x-ratelimit-remaining"];
    $("#reqsremain").text(callsRemain);
    $("#responseDiv").text(requestsFired + " - " + lastResponse.toLocaleTimeString());
}

$(document).ready(function() {
    console.log("Document Ready");
    $("#forkdate").val(moment().format('YYYY-MM-DD'));
    repolinks = Cookies.getJSON('repolinks');
    if (repolinks !== undefined) {
        var s = "";
        for (var value of repolinks) {
            s += value.input_url + "\n";
        }
        $("#repolinks").val(s);
    } else {
        repolinks = [];
    }
    AuthenticateViaCookies();
});

$("#loginForm").submit(function(event) {
    event.preventDefault();
    AuthenticateViaButton();
});



function AuthenticateViaCookies() {
    console.log("Looking at  cookies");
    if (Cookies.get('uid') !== undefined && Cookies.get('apikey') !== undefined) {
        console.log("using cookies");
        u = Cookies.get('uid');
        p = Cookies.get('apikey');
        if (u == "" || p == "") {
            console.log("Invalid cookies ");
            Cookies.remove('uid');
            Cookies.remove('apikey');
            return;
        }
    } else {
        return;
    }
    console.log("Attempting to authenticate user from cookies: " + u);
    github.authenticate({
        type: 'basic',
        username: u,
        password: p
    });
    github.users.get({}, Authenticate_stage2);
}

function AuthenticateViaButton() {
    console.log("Good day");
    u = $("#emailbox").val();
    p = $("#apibox").val();
    if (u == "" || p == "") {
        console.log("Invalid entry");
        return;
    }
    console.log("Attempting to authenticate user: ", u);
    github.authenticate({
        type: 'basic',
        username: u,
        password: p
    });
    github.users.get({}, Authenticate_stage2);
}

function Authenticate_stage2(e, r) {
    if (e) {
        console.error("Authetication failed");
        authenticated = false;
    } else {
        metaHandler(r);
        console.info("Autheticated");
        if (true) {
            //if remeber me
            Cookies.set('uid', u);
            Cookies.set('apikey', p);
        }
        authenticated = true;
        console.log("Authenticated user data", r);
        $("#loginForm").hide();
        $('#avatar').attr("src", r.data.avatar_url);
        $('#username').html(r.data.name);
        $('#userStats').removeAttr('hidden');
    }
    u = p = "";
}

$("#repoform").submit(function(event) {
    event.preventDefault();
    ParseRepoLinks();
});


function ParseRepoLinks() {
    var matcher = /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/;

    var txt = $("#repolinks").val().replace(/;|,/g, " ").split(/\r?\n/);
    repolinks = [];
    for (var value of txt) {
        value = value.trim();
        if (matcher.test(value)) {
            if (value[value.length - 1] === '/') {
                value = value.slice(0, -1);
            }
            if (value.lastIndexOf(".git") !== -1) {
                value = value.substr(0, value.lastIndexOf(".git"));
            }
            var split = value.split('/');
            var repo = split[split.length - 1];
            var owner = split[split.length - 2];
            repolinks.push({
                input_url: value,
                owner: owner,
                repo: repo
            });
            repolinks = repolinks.sort((a, b) => a.owner.localeCompare(b.owner));
            //remove duplicates (needs to be sorted for this to worl)
            repolinks = repolinks.filter((current, index, array) =>
                index === 0 || current.owner !== array[index - 1].owner)
            Cookies.set('repolinks', repolinks);
        }
    }
    console.log("repolinks parsed", repolinks);
    BuildTable();
    SyncTable(true);
}


$("#gobtn").click(function(event) {
    event.preventDefault();
    SyncTable();
});

$("#dumpBtn").click(function(event) {
    event.preventDefault();
    console.log("dump", repolinks);
});

var table_rules = [{
        t: "user",
        h: true,
        func: function(v) {
            var n = v.owner;
            if (data_user(v, true) && v.data_user.name !== null && v.data_user.name !== v.owner) {
                n = v.data_user.name + " (" + v.owner + ")";
            }
            return '<a href="' + v.input_url + '">' + n + '</a>';
        }
    },
    {
        t: "Last Commit date",
        need: [data_commits],
        func: function(v) {
            if (v.data_commits.length > 0) {
                var d = new Date(v.data_commits[0].commit.author.date);
                var n = moment(d).fromNow() + " -- " + d.toLocaleString();
                return '<a href="' + v.data_commits[0].html_url + '">' + n + '</a>';
            } else {
                return "no Commits";
            }
        }
    },
    {
        t: "Clean Repo",
        need: [data_commits, data_tree],
        func: cleanRepo
    },
    {
        t: "Lab",
        need: [data_commits, data_commit_data],
        func: getLab
    }
];



var table_objects = {};

function BuildTable() {
    if (table_objects.hasOwnProperty('table')) {
        table_objects.table.remove();
    }
    table_objects = {
        headers: {},
        rows: {}
    };

    var table = $('<table></table>').addClass('table');
    table_objects.table = table;
    var headerThead = $("<thead><tr></tr></thead>");
    for (var col of table_rules) {
        var o = $("<th scope=\"col\">" + col.t + "</th>");
        table_objects.headers[col.t] = o;
        headerThead.append(o);
    }
    table.append(headerThead);
    tbody = $('<tbody></tbody>');


    for (var value of repolinks) {
        var row = $('<tr></tr>');
        table_objects.rows[value.owner] = {};
        for (var col of table_rules) {
            var txt = "-";
            if (col.offline) {
                txt = col.d(value);
            };
            var o = (col.h ? $('<th scope="row"></th>') : $('<td></td>')).text(txt);
            table_objects.rows[value.owner][col.t] = o;
            row.append(o);
        }
        tbody.append(row);
    }

    $('#tablezone').append(table.append(tbody));
}

function UpdateTable(r, offline) {
    let repo = r;
    const row = table_objects.rows[repo.owner];
    for (let rule of table_rules) {
        let cell = row[rule.t];
        if (rule.need && (offline || !rule.need.every(function(e) {
                return e(repo);
            }))) {
            cell.html("pending");
        } else {
            cell.html(rule.func(repo));
        }
    }
}

function SyncTable(offline) {
    for (var value of repolinks) {
        UpdateTable(value, offline);
    }
}


//----- Rule Parsers -----

function getLab(r) {
    let repo = r;
    if (repo.data_commit_data.files) {
        let regex = /labs\/practicals\/(\d+)_/g;
        let f = repo.data_commit_data.files;
        let practicals = [];
        for (let file of f) {
            let m = regex.exec(file.filename);
            if (m != null) {
                practicals.push(m[1]);
            }
            regex.lastIndex = 0;
        }
        var highest = 0;
        //console.log(repo.owner, practicals);
        for (let prac of practicals) {
            highest = Math.max(highest, parseInt(prac));
        }
        return highest;
    }
    return "Unknown";
}

function cleanRepo(r) {
    let repo = r;
    if (repo.data_tree.tree) {
        let regex = /\S*(\.user|\.filters|\.vcxproj|\.exe|\.dll|\.lib)/g;
        let f = repo.data_tree.tree;
        for (let file of f) {
            let m = regex.exec(file.path);
            if (m != null) {
                return '<a href="' + repo.input_url + "/blob/" + repo.data_tree.sha + "/" + file.path + '">' + "NO- " + m[1]; + '</a>';
            }
        }
        return "Yes";
    }
    return "Unknown";
}

//----- Data Grabbers -----

function data_commits(repo, o) {
    let name = "data_commits"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        per_page: 2,
        page: 1
    };
    let call = github.repos.getCommits;
    return data_man(name, repo, param, call, o);
}

function data_user(repo, o) {
    let name = "data_user"
    let param = {
        username: repo.owner,
    };
    let call = github.users.getForUser;
    return data_man(name, repo, param, call, o);
}

function data_commit_data(repo, o) {
    let name = "data_commit_data"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        sha: repo.data_commits[0].sha
    };
    let call = github.repos.getCommit;
    return data_man(name, repo, param, call, o);
}

function data_tree(repo, o) {
    let name = "data_tree"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        sha: repo.data_commits[0].sha,
        recursive: true
    };
    let call = github.gitdata.getTree;
    return data_man(name, repo, param, call, o);
}

function data_man(n, r, p, c, o) {
    let repo = r;
    if (repo[n] && repo[n].status === 2) {
        return true;
    } else if (repo[n] && repo[n].status === 1) {
        return false;
    } else {
        repo[n] = {
            status: 1
        };
        c(p,
            function(err, res) {
                if (err) {
                    throw err;
                }
                metaHandler(res);
                repo[n] = res.data;
                repo[n].status = 2;
                if (!o) {
                    UpdateTable(repo)
                };
            });
    }
}

//--------------------------
$("#findforkbtn").click(function(event) {
    event.preventDefault();
    findrepos();
});

function findrepos() {
    u = $("#basic-url").val();
    $("#forklinks").val("");
    var split = u.split('/');
    var repo = split[split.length - 1];
    var owner = split[split.length - 2];

    github.repos.getForks({
            owner: owner,
            repo: repo,
            per_page: 100,
            page: 1
        },
        function(err, res) {
            if (err) {
                throw err;
            } else {
                metaHandler(res);
                console.log(res.data);
                var s = "";
                var d = new Date($("#forkdate").val());
                for (r of res.data) {
                    if (new Date(r.created_at) >= d) {
                        s += r.html_url + "\n";
                    }
                }
                $("#forklinks").val(s);
            }

        }

    );
}
},{"cool-ascii-faces":50,"github":55,"js-cookie":100,"moment":101}],50:[function(require,module,exports){
var spigot = require("stream-spigot")

var faces = [
  "( .-. )",
  "( .o.)",
  "( `·´ )",
  "( ° ͜ ʖ °)",
  "( ͡° ͜ʖ ͡°)",
  "( ⚆ _ ⚆ )",
  "( ︶︿︶)",
  "( ﾟヮﾟ)",
  "(\\/)(°,,,°)(\\/)",
  "(¬_¬)",
  "(¬º-°)¬",
  "(¬‿¬)",
  "(°ロ°)☝",
  "(´・ω・)っ",
  "(ó ì_í)",
  "(ʘᗩʘ')",
  "(ʘ‿ʘ)",
  "(̿▀̿ ̿Ĺ̯̿̿▀̿ ̿)̄",
  "(͡° ͜ʖ ͡°)",
  "ᕦ( ͡° ͜ʖ ͡°)ᕤ",
  "(ಠ_ಠ)",
  "(ಠ‿ಠ)",
  "(ಠ⌣ಠ)",
  "(ಥ_ಥ)",
  "(ಥ﹏ಥ)",
  "(ง ͠° ͟ل͜ ͡°)ง",
  "(ง ͡ʘ ͜ʖ ͡ʘ)ง",
  "(ง •̀_•́)ง",
  "(ง'̀-'́)ง",
  "(ง°ل͜°)ง",
  "(ง⌐□ل͜□)ง",
  "(ღ˘⌣˘ღ)",
  "(ᵔᴥᵔ)",
  "(•ω•)",
  "(•◡•)/",
  "(⊙ω⊙)",
  "(⌐■_■)",
  "(─‿‿─)",
  "(╯°□°）╯",
  "(◕‿◕)",
  "(☞ﾟ∀ﾟ)☞",
  "(❍ᴥ❍ʋ)",
  "(っ◕‿◕)っ",
  "(づ｡◕‿‿◕｡)づ",
  "(ノಠ益ಠ)ノ",
  "(ノ・∀・)ノ",
  "(；一_一)",
  "(｀◔ ω ◔´)",
  "(｡◕‿‿◕｡)",
  "(ﾉ◕ヮ◕)ﾉ",
  "*<{:¬{D}}}",
  "=^.^=",
  "t(-.-t)",
  "| (• ◡•)|",
  "~(˘▾˘~)",
  "¬_¬",
  "¯(°_o)/¯",
  "¯\\_(ツ)_/¯",
  "°Д°",
  "ɳ༼ຈل͜ຈ༽ɲ",
  "ʅʕ•ᴥ•ʔʃ",
  "ʕ´•ᴥ•`ʔ",
  "ʕ•ᴥ•ʔ",
  "ʕ◉.◉ʔ",
  "ʕㅇ호ㅇʔ",
  "ʕ；•`ᴥ•´ʔ",
  "ʘ‿ʘ",
  "͡° ͜ʖ ͡°",
  "ζ༼Ɵ͆ل͜Ɵ͆༽ᶘ",
  "Ѱζ༼ᴼل͜ᴼ༽ᶘѰ",
  "ب_ب",
  "٩◔̯◔۶",
  "ಠ_ಠ",
  "ಠoಠ",
  "ಠ~ಠ",
  "ಠ‿ಠ",
  "ಠ⌣ಠ",
  "ಠ╭╮ಠ",
  "ರ_ರ",
  "ง ͠° ل͜ °)ง",
  "๏̯͡๏﴿",
  "༼ ºººººل͟ººººº ༽",
  "༼ ºل͟º ༽",
  "༼ ºل͟º༼",
  "༼ ºل͟º༽",
  "༼ ͡■ل͜ ͡■༽",
  "༼ つ ◕_◕ ༽つ",
  "༼ʘ̚ل͜ʘ̚༽",
  "ლ(´ڡ`ლ)",
  "ლ(́◉◞౪◟◉‵ლ)",
  "ლ(ಠ益ಠლ)",
  "ᄽὁȍ ̪őὀᄿ",
  "ᔑ•ﺪ͟͠•ᔐ",
  "ᕕ( ᐛ )ᕗ",
  "ᕙ(⇀‸↼‶)ᕗ",
  "ᕙ༼ຈل͜ຈ༽ᕗ",
  "ᶘ ᵒᴥᵒᶅ",
  "(ﾉಥ益ಥ）ﾉ",
  "≧☉_☉≦",
  "⊙▃⊙",
  "⊙﹏⊙",
  "┌( ಠ_ಠ)┘",
  "╚(ಠ_ಠ)=┐",
  "◉_◉",
  "◔ ⌣ ◔",
  "◔̯◔",
  "◕‿↼",
  "◕‿◕",
  "☉_☉",
  "☜(⌒▽⌒)☞",
  "☼.☼",
  "♥‿♥",
  "⚆ _ ⚆",
  "✌(-‿-)✌",
  "〆(・∀・＠)",
  "ノ( º _ ºノ)",
  "ノ( ゜-゜ノ)",
  "ヽ( ͝° ͜ʖ͡°)ﾉ",
  "ヽ(`Д´)ﾉ",
  "ヽ༼° ͟ل͜ ͡°༽ﾉ",
  "ヽ༼ʘ̚ل͜ʘ̚༽ﾉ",
  "ヽ༼ຈل͜ຈ༽ง",
  "ヽ༼ຈل͜ຈ༽ﾉ",
  "ヽ༼Ὸل͜ຈ༽ﾉ",
  "ヾ(⌐■_■)ノ",
  "꒰･◡･๑꒱",
  "﴾͡๏̯͡๏﴿",
  "｡◕‿◕｡",
  "ʕノ◔ϖ◔ʔノ",
  "(ノಠ益ಠ)ノ彡┻━┻",
  "(╯°□°）╯︵ ┻━┻",
  "꒰•̥̥̥̥̥̥̥ ﹏ •̥̥̥̥̥̥̥̥๑꒱",
  "ಠ_ರೃ",
  "(ू˃̣̣̣̣̣̣︿˂̣̣̣̣̣̣ ू)",
  "(ꈨຶꎁꈨຶ)۶”",
  "(ꐦ°᷄д°᷅)",
  "(۶ૈ ۜ ᵒ̌▱๋ᵒ̌ )۶ૈ=͟͟͞͞ ⌨",
  "₍˄·͈༝·͈˄₎◞ ̑̑ෆ⃛",
  "(*ﾟ⚙͠ ∀ ⚙͠)ﾉ❣",
  "٩꒰･ัε･ั ꒱۶",
  "ヘ（。□°）ヘ",
  "˓˓(ृ　 ु ॑꒳’)ु(ृ’꒳ ॑ ृ　)ु˒˒˒",
  "꒰✘Д✘◍꒱",
  "૮( ᵒ̌ૢཪᵒ̌ૢ )ა",
  "“ψ(｀∇´)ψ",
  "ಠﭛಠ",
  "(๑>ᴗ<๑)",
  "(۶ꈨຶꎁꈨຶ )۶ʸᵉᵃʰᵎ",
  "٩(•̤̀ᵕ•̤́๑)ᵒᵏᵎᵎᵎᵎ",
  "(oT-T)尸",
  "(✌ﾟ∀ﾟ)☞",
  "ಥ‿ಥ",
  "ॱ॰⋆(˶ॢ‾᷄﹃‾᷅˵ॢ)",
  "┬┴┬┴┤  (ಠ├┬┴┬┴",
  "( ˘ ³˘)♥",
  "Σ (੭ु ຶਊ ຶ)੭ु⁾⁾",
  "(⑅ ॣ•͈ᴗ•͈ ॣ)",
  "ヾ(´￢｀)ﾉ",
  "(•̀o•́)ง",
  "(๑•॒̀ ູ॒•́๑)",
  "⚈้̤͡ ˌ̫̮ ⚈้̤͡",
  "=͟͟͞͞ =͟͟͞͞ ﾍ( ´Д`)ﾉ",
  "(((╹д╹;)))",
  "•̀.̫•́✧",
  "(ᵒ̤̑ ₀̑ ᵒ̤̑)",
  "\\_(ʘ_ʘ)_/",
  "乙(ツ)乙",
  "乙(のっの)乙",
  "ヾ(¯∇￣๑)",
  "\\_(ʘ_ʘ)_/",
  "༼;´༎ຶ ۝ ༎ຶ༽",
  "(▀̿Ĺ̯▀̿ ̿)",
  "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
  "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ ✧ﾟ･: *ヽ(◕ヮ◕ヽ)",
  "┬┴┬┴┤ ͜ʖ ͡°) ├┬┴┬┴",
  "┬┴┬┴┤(･_├┬┴┬┴",
  "(͡ ͡° ͜ つ ͡͡°)",
  "( ͡°╭͜ʖ╮͡° )",
  "(• ε •)",
  "[̲̅$̲̅(̲̅ ͡° ͜ʖ ͡°̲̅)̲̅$̲̅]",
  "| (• ◡•)| (❍ᴥ❍ʋ)",
  "(◕‿◕✿)",
  "(╯°□°)╯︵ ʞooqǝɔɐɟ",
  "(☞ﾟヮﾟ)☞ ☜(ﾟヮﾟ☜)",
  "(づ￣ ³￣)づ",
  "(;´༎ຶД༎ຶ`)",
  "♪~ ᕕ(ᐛ)ᕗ",
  "༼ つ  ͡° ͜ʖ ͡° ༽つ",
  "༼ つ ಥ_ಥ ༽つ",
  "ಥ_ಥ",
  "( ͡ᵔ ͜ʖ ͡ᵔ )",
  "ヾ(⌐■_■)ノ♪",
  "~(˘▾˘~)",
  "\\ (•◡•) /",
  "(~˘▾˘)~",
  "(._.) ( l: ) ( .-. ) ( :l ) (._.)",
  "༼ ºل͟º ༼ ºل͟º ༼ ºل͟º ༽ ºل͟º ༽ ºل͟º ༽",
  "┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻",
  "ᕦ(ò_óˇ)ᕤ",
  "(•_•) ( •_•)>⌐■-■ (⌐■_■)",
  "(☞ຈل͜ຈ)☞",
  "˙ ͜ʟ˙",
  "☜(˚▽˚)☞",
  "(｡◕‿◕｡)",
  "（╯°□°）╯︵( .o.)",
  "(っ˘ڡ˘ς)",
  "┬──┬ ノ( ゜-゜ノ)",
  "ಠ⌣ಠ",
  "( ಠ ͜ʖರೃ)",
  "ƪ(˘⌣˘)ʃ",
  "¯\\(°_o)/¯",
  "ლ,ᔑ•ﺪ͟͠•ᔐ.ლ",
  "(´・ω・`)",
  "(´・ω・)っ由",
  "(° ͡ ͜ ͡ʖ ͡ °)",
  "Ƹ̵̡Ӝ̵̨̄Ʒ",
  "ಠ_ಥ",
  "ಠ‿↼",
  "(>ლ)",
  "(▰˘◡˘▰)",
  "(✿´‿`)",
  "◔ ⌣ ◔",
  "｡゜(｀Д´)゜｡",
  "┬─┬ノ( º _ ºノ)",
  "(ó ì_í)=óò=(ì_í ò)",
  "(/) (°,,°) (/)",
  "┬─┬ ︵ /(.□. ）",
  "^̮^",
  "(>人<)",
  "(~_^)",
  "(･.◤)",
  ">_>",
  "(^̮^)",
  "=U",
  "(｡╹ω╹｡)",
  "ლ(╹◡╹ლ)",
  "(●´⌓`●)",
  "（[∂]ω[∂]）",
  "U^ｴ^U",
  "(〒ó〒)",
  "(T^T)",
  "(íoì)",
  "(#•v•#)",
  "(•^u^•)",
  "!(^3^)!",
  "\\(°°\\”)",
  "(°o°:)",
  "(° o°)!",
  "(oﾛo)!!",
  "(òロó)",
  "(ò皿ó)",
  "(￣･_______･￣)",
  "ヾ(๑╹◡╹)ﾉ'",
  "(ლ╹◡╹)ლ",
  "（◞‸◟）",
  "(✿◖◡◗)",
  "(　´･‿･｀)",
  "(*｀益´*)がう",
  "(ヾﾉ'д'o)ﾅｨﾅｨ",
  "❤(◕‿◕✿)",
  "(◡‿◡*)❤",
  "(o'ω'o)",
  "(｡･ˇ_ˇ･｡)ﾑｩ…",
  "♬♩♫♪☻(●´∀｀●）☺♪♫♩♬",
  "(✿ฺ◕ฺ‿◕ฺ）ｳﾌｯ♥",
  "(つД⊂)ｴｰﾝ",
  "(つД・)ﾁﾗ",
  "(*´ω｀*)",
  "(✪‿✪)ノ",
  "╲(｡◕‿◕｡)╱",
  "ლ(^o^ლ)"
]

module.exports = function() {
  return faces[Math.floor(Math.random() * faces.length)]
}

module.exports.faces = faces

module.exports.faceStream = function() {
  return spigot(faces)
}

},{"stream-spigot":51}],51:[function(require,module,exports){
(function (process,global){
module.exports = make
module.exports.ctor = ctor

module.exports.array = array
module.exports.sync = sync

const Readable = require("readable-stream/readable")
    , inherits = require("util").inherits
    , xtend    = require("xtend")
    , setImmediate = global.setImmediate || process.nextTick

function ctor (options, _read) {
  if (_read == null) {
    _read    = options
    options   = {}
  }

  if (Array.isArray(_read))
    _read = _shifter(_read)

  if (typeof _read != "function")
    throw new Error("You must implement an _read function for Spigot")

  function Spigot (override) {
    if (!(this instanceof Spigot))
      return new Spigot(override)

    this.options = xtend(options, override)
    Readable.call(this, this.options)
  }

  inherits(Spigot, Readable)

  Spigot.prototype._read = _read

  return Spigot
}

function make(options, _read) {
  return ctor(options, _read)()
}

function _shifter(array) {
  var copy = array.slice(0)
  return function _shift() {
    var self = this
    setImmediate(function later() {
      var val = copy.shift()
      if (val === undefined) {
        val = null
      }
      self.push(val)
    })
  }
}

function array(options, array) {
  if (Array.isArray(options)) {
    array = options
    options = {}
  }

  return make(options, _shifter(array))
}

function sync(options, fn) {
  if (typeof options == "function") {
    fn = options
    options = {}
  }
  var toAsync = function toAsync() {
    var self = this
    setImmediate(function later() {
      var val = fn()
      if (val === undefined) {
        val = null
      }
      self.push(val)
    })
  }
  return make(options, toAsync)
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":10,"readable-stream/readable":31,"util":47,"xtend":52}],52:[function(require,module,exports){
arguments[4][48][0].apply(exports,arguments)
},{"dup":48}],53:[function(require,module,exports){
module.exports={
    "constants": {
        "name": "Github",
        "description": "A Node.JS module, which provides an object oriented wrapper for the GitHub v3 API.",
        "protocol": "https",
        "host": "api.github.com",
        "port": 443,
        "documentation": "https://developer.github.com/v3",
        "dateFormat": "YYYY-MM-DDTHH:MM:SSZ",
        "requestFormat": "json",
        "requestMedia": "application/vnd.github.v3+json"
    },
    "response-headers": [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "X-Oauth-Scopes",
        "X-Poll-Interval",
        "X-GitHub-Request-Id",
        "X-GitHub-Media-Type",
        "X-GitHub-SSO",
        "Retry-After",
        "Link",
        "Location",
        "Last-Modified",
        "Etag",
        "Status"
    ],
    "request-headers": [
        "Authorization",
        "If-Modified-Since",
        "If-None-Match",
        "Cookie",
        "User-Agent",
        "Accept",
        "X-GitHub-OTP"
    ],
    "params": {
        "files": {
            "type": "Json",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Files that make up this gist. The key of which should be a required string filename and the value another required hash with parameters: 'content'"
        },
        "owner": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "username": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "org": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "repo": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "branch": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "sha": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "description": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "gist_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Id (SHA1 hash) of the gist."
        },
        "installation_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "repository_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "commit_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "Sha of the commit to comment on.",
            "description": "Sha of the commit to comment on."
        },
        "client_id": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "The 20 character OAuth app client key for which to create the token."
        },
        "column_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "project_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "repo_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "invitation_id": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "ref": {
            "type": "String",
            "required": true,
            "allow-empty": true,
            "validation": "",
            "invalidmsg": "",
            "description": "String of the name of the fully qualified reference (ie: heads/master). If it doesn’t have at least one slash, it will be rejected."
        },
        "number": {
            "type": "Number",
            "required": true,
            "validation": "^[0-9]+$",
            "invalidmsg": "",
            "description": ""
        },
        "issue_number": {
            "type": "Number",
            "required": true,
            "validation": "^[0-9]+$",
            "invalidmsg": "",
            "description": ""
        },
        "name": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "direction": {
            "type": "String",
            "required": false,
            "validation": "^(asc|desc)$",
            "invalidmsg": "asc or desc, default: desc.",
            "description": "",
            "enum": [
                "asc",
                "desc"
            ],
            "default": "desc"
        },
        "since": {
            "type": "Date",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ"
        },
        "until": {
            "type": "Date",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ"
        },
        "state": {
            "type": "String",
            "required": false,
            "validation": "^(open|closed|all)$",
            "invalidmsg": "open, closed, all, default: open",
            "description": "",
            "enum": [
                "open",
                "closed",
                "all"
            ],
            "default": "open"
        },
        "color": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "6 character hex code, without a leading #.",
            "description": "6 character hex code, without a leading #."
        },
        "base": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "The branch (or git ref) you want your changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repo that requests a merge to a base of another repo."
        },
        "head": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "The branch (or git ref) where your changes are implemented."
        },
        "path": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "Relative path of the file to comment on.",
            "description": "Relative path of the file to comment on."
        },
        "position": {
            "type": "Number",
            "required": true,
            "validation": "",
            "invalidmsg": "Column index in the diff to comment on.",
            "description": "Column index in the diff to comment on."
        },
        "body": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "homepage": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "private": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to create a private repository, false to create a public one. Creating private repositories requires a paid GitHub account. Default is false.",
            "default": "false"
        },
        "has_issues": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to enable issues for this repository, false to disable them. Default is true.",
            "default": "true"
        },
        "has_projects": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to enable projects for this repository, false to disable them. Default is true.",
            "default": "true"
        },
        "has_wiki": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to enable the wiki for this repository, false to disable it. Default is true.",
            "default": "true"
        },
        "has_downloads": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to enable downloads for this repository, false to disable them. Default is true.",
            "default": "true"
        },
        "default_branch": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Updates the default branch for this repository."
        },
        "title": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "key": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": ""
        },
        "page": {
            "type": "Number",
            "required": false,
            "validation": "^[0-9]+$",
            "invalidmsg": "",
            "description": "Page number of the results to fetch."
        },
        "per_page": {
            "type": "Number",
            "required": false,
            "validation": "^[0-9]+$",
            "invalidmsg": "",
            "description": "A custom page size up to 100. Default is 30.",
            "default": "30"
        },
        "scopes": {
            "type": "Array",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "A list of scopes that this authorization is in."
        },
        "note": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "A note to remind you what the OAuth token is for."
        },
        "note_url": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "A URL to remind you what app the OAuth token is for."
        },
        "auto_init": {
            "type": "Boolean",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "True to create an initial commit with empty README. Default is false",
            "default": "false"
        },
        "gitignore_template": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Desired language or platform .gitignore template to apply. Ignored if auto_init parameter is not provided."
        },
        "license_template": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Desired LICENSE template to apply. Use the name of the template without the extension. For example, \"mit\" or \"mozilla\"."
        },
        "order": {
            "type": "String",
            "required": false,
            "validation": "^(asc|desc)$",
            "invalidmsg": "The sort order if sort parameter is provided. One of asc or desc. Default: desc",
            "description": "asc or desc",
            "enum": [
                "asc",
                "desc"
            ],
            "default": "desc"
        },
        "q": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Search Term",
            "combined": true
        },
        "data": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Raw data to send as the body of the request"
        },
        "privacy": {
            "type": "String",
            "required": false,
            "validation": "^(secret|closed)$",
            "invalidmsg": "secret, closed, default: secret",
            "description": "The level of privacy this team should have.",
            "enum": [
                "secret",
                "closed"
            ],
            "default": "secret"
        },
        "fingerprint": {
            "type": "String",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "A unique string to distinguish an authorization from others created for the same client ID and user."
        },
        "access_token": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "OAuth token"
        },
        "assignees": {
            "type": "Array",
            "required": false,
            "validation": "",
            "invalidmsg": "",
            "description": "Logins for Users to assign to this issue. NOTE: Only users with push access can set assignees for new issues. Assignees are silently dropped otherwise."
        },
        "url": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Dynamic URL for release asset uploads returned by the release’s API response."
        },
        "contentType": {
            "type": "String",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "The content type of a release asset upload."
        },
        "contentLength": {
            "type": "Number",
            "required": true,
            "validation": "",
            "invalidmsg": "",
            "description": "Size of release asset upload in bytes."
        }
    },
    "acceptTree": {
        "application/vnd.github.giant-sentry-fist-preview+json": [
            "/orgs/:org/blocks",
            "/orgs/:org/blocks/:username",
            "/user/blocks",
            "/user/blocks/:username"
        ],
        "application/vnd.github.scarlet-witch-preview+json": [
            "/codes_of_conduct",
            "/codes_of_conduct/:key",
            "/repos/:owner/:repo",
            "/repos/:owner/:repo/community/code_of_conduct"
        ],
        "application/vnd.github.cloak-preview+json": [
            "/search/commits"
        ],
        "application/vnd.github.black-panther-preview+json": [
            "/repos/:owner/:name/community/profile"
        ],
        "application/vnd.github.ant-man-preview+json": [
            "/repos/:owner/:repo/deployments",
            "/repos/:owner/:repo/deployments/:id/statuses"
        ],
        "application/vnd.github.cryptographer-preview": [
            "/users/:username/gpg_keys",
            "/user/gpg_keys",
            "/user/gpg_keys/:id",
            "/repos/:owner/:repo/commits/:sha"
        ],
        "application/vnd.github.barred-rock-preview": [
            "/repos/:owner/:repo/import/authors",
            "/repos/:owner/:repo/import/authors/:author_id",
            "/:owner/:name/import/lfs",
            "/:owner/:name/import/large_files",
            "/repos/:owner/:repo/import"
        ],
        "application/vnd.github.machine-man-preview": [
            "/app/installations",
            "/installations/:installation_id/access_tokens",
            "/installation/repositories",
            "/installations/:installation_id/repositories/:repository_id",
            "/apps/:app_slug",
            "/app/installations/:installation_id",
            "/user/installations",
            "/user/installations/:installation_id/repositories/:repository_id"
        ],
        "application/vnd.github.drax-preview+json": [
            "/licenses",
            "/licenses/:license",
            "/repos/:owner/:repo",
            "/repos/:owner/:repo/license"
        ],
        "application/vnd.github.valkyrie-preview+json": [
            "/marketplace_listing/plans",
            "/marketplace_listing/stubbed/plans",
            "/marketplace_listing/plans/:id/accounts",
            "/marketplace_listing/stubbed/plans/:id/accounts",
            "/marketplace_listing/accounts/:id",
            "/marketplace_listing/stubbed/accounts/:id",
            "/user/marketplace_purchases",
            "/user/marketplace_purchases/stubbed"
        ],
        "application/vnd.github.wyandotte-preview+json": [
            "/orgs/:org/migrations",
            "/orgs/:org/migrations/:id",
            "/orgs/:org/migrations/:id/archive",
            "/orgs/:org/migrations/:id/repos/:repo_name/lock"
        ],
        "application/vnd.github.hellcat-preview+json": [
            "/orgs/:org/teams",
            "/teams/:id",
            "/teams/:id/teams",
            "/teams/:id/members",
            "/teams/:id/memberships/:username",
            "/teams/:id/repos",
            "/teams/:id/repos/:owner/:repo",
            "/teams/:id/repos/:org/:repo",
            "/user/teams"
        ],
        "application/vnd.github.mister-fantastic-preview+json": [
            "/repos/:owner/:repo/pages",
            "/repos/:owner/:repo/pages/builds",
            "/repos/:owner/:repo/pages/builds/latest",
            "/repos/:owner/:repo/pages/builds/:id"
        ],
        "application/vnd.github.eye-scream-preview": [
            "/admin/pre-receive-environments/:id",
            "/admin/pre_receive_environments",
            "/admin/pre-receive-environments/:id/downloads/latest",
            "/admin/pre_receive_environments/:id/downloads",
            "/admin/pre-receive-hooks/:id",
            "/admin/pre-receive-hooks"
        ],
        "application/vnd.github.inertia-preview+json": [
            "/repos/:owner/:repo/projects",
            "/orgs/:org/projects",
            "/projects/:id",
            "/projects/columns/:column_id/cards",
            "/projects/columns/cards/:id",
            "/projects/columns/cards/:id/moves",
            "/projects/:project_id/columns",
            "/projects/columns/:id",
            "/projects/columns/:id/moves"
        ],
        "application/vnd.github.polaris-preview": [
            "/repos/:owner/:repo/pulls/:number/merge"
        ],
        "application/vnd.github.squirrel-girl-preview": [
            "/issues",
            "/user/issues",
            "/orgs/:org/issues",
            "/repos/:owner/:repo/issues",
            "/repos/:owner/:repo/issues/:number",
            "/repos/:owner/:repo/comments/:id/reactions",
            "/repos/:owner/:repo/issues/comments",
            "/repos/:owner/:repo/issues/comments/:id",
            "/repos/:owner/:repo/issues/:number/comments",
            "/repos/:owner/:repo/issues/:number/reactions",
            "/repos/:owner/:repo/issues/comments/:id/reactions",
            "/repos/:owner/:repo/pulls/comments/:id/reactions",
            "/reactions/:id",
            "/repos/:owner/:repo/pulls/:number/comments",
            "/repos/:owner/:repo/pulls/comments",
            "/repos/:owner/:repo/pulls/comments/:id"
        ],
        "application/vnd.github.thor-preview+json": [
            "/repos/:owner/:repo/pulls/:number/requested_reviewers"
        ],
        "application/vnd.github.v3.star+json": [
            "/repos/:owner/:repo/stargazers",
            "/users/:username/starred",
            "/user/starred"
        ],
        "application/vnd.github.mockingbird-preview": [
            "/repos/:owner/:repo/issues/:issue_number/timeline"
        ],
        "application/vnd.github.mercy-preview+json": [
            "/repos/:owner/:repo/topics",
            "/search/repositories"
        ]
    }
}

},{}],54:[function(require,module,exports){
/** section: github
 * class HttpError
 *
 *  Copyright 2012 Cloud9 IDE, Inc.
 *
 *  This product includes software developed by
 *  Cloud9 IDE, Inc (http://c9.io).
 *
 *  Author: Mike de Boer <mike@c9.io>
 **/

var Util = require('util')

exports.HttpError = function (message, code, headers) {
  Error.call(this, message)
  this.message = message
  this.code = code
  this.status = statusCodes[code]
  this.headers = headers
}
Util.inherits(exports.HttpError, Error);

(function () {
    /**
     *  HttpError#toString() -> String
     *
     *  Returns the stringified version of the error (i.e. the message).
     **/
  this.toString = function () {
    return this.message
  }

    /**
     *  HttpError#toJSON() -> Object
     *
     *  Returns a JSON object representation of the error.
     **/
  this.toJSON = function () {
    return {
      code: this.code,
      status: this.status,
      message: this.message
    }
  }
}).call(exports.HttpError.prototype)

var statusCodes = {
  304: 'Not Modified', // See PR #673 (https://github.com/octokit/node-github/pull/673)
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Request Entity Too Large',
  414: 'Request-URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Requested Range Not Satisfiable',
  417: 'Expectation Failed',
  420: 'Enhance Your Calm',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Unordered Collection',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  444: 'No Response',
  449: 'Retry With',
  499: 'Client Closed Request',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',
  511: 'Network Authentication Required'
}

for (var status in statusCodes) {
  var defaultMsg = statusCodes[status]

  var error = (function (defaultMsg, status) {
    return function (msg) {
      this.defaultMessage = defaultMsg
      exports.HttpError.call(this, msg, status)

      if (status >= 500) { Error.captureStackTrace(this, arguments.callee) } // eslint-disable-line
    }
  })(defaultMsg, status)

  Util.inherits(error, exports.HttpError)

  var className = defaultMsg.replace(/\s/g, '')
  exports[className] = error
  exports[status] = error
}

},{"util":47}],55:[function(require,module,exports){
(function (Buffer){
'use strict'

var HttpsProxyAgent = require('https-proxy-agent')
var getProxyForUrl = require('proxy-from-env').getProxyForUrl
var isStream = require('is-stream')
var toCamelCase = require('lodash/camelCase')
var urlTemplate = require('url-template')

var error = require('./error')
var Url = require('url')

var debug = require('debug')('node-github')

var ROUTES = require('./routes.json')
var DEFINITIONS = require('./definitions.json')

/** section: github
 * class Client
 *
 *  Copyright 2012 Cloud9 IDE, Inc.
 *
 *  This product includes software developed by
 *  Cloud9 IDE, Inc (http://c9.io).
 *
 *  Author: Mike de Boer <mike@c9.io>
 *
 *  Upon instantiation of the [[Client]] class, the routes.json file is loaded
 *  and parsed for the API HTTP endpoints. For each HTTP endpoint to the
 *  HTTP server, a method is generated which accepts a Javascript Object
 *  with parameters and an optional callback to be invoked when the API request
 *  returns from the server or when the parameters could not be validated.
 *
 *  When an HTTP endpoint is processed and a method is generated as described
 *  above, [[Client]] also sets up parameter validation with the rules as
 *  defined in the routes.json.
 *
 *  These definitions are parsed and methods are created that the client can call
 *  to make an HTTP request to the server.
 *
 *  For example, the endpoint `gists/get-from-user` will be exposed as a member
 *  on the [[Client]] object and may be invoked with
 *
 *      client.getFromUser({
 *          "user": "bob"
 *      }, function(err, ret) {
 *          // do something with the result here.
 *      });
 *
 *      // or to fetch a specfic page:
 *      client.getFromUser({
 *          "user": "bob",
 *          "page": 2,
 *          "per_page": 100
 *      }, function(err, ret) {
 *          // do something with the result here.
 *      });
 *
 *  All the parameters as specified in the Object that is passed to the function
 *  as first argument, will be validated according to the rules in the `params`
 *  block of the route definition.
 *  Thus, in the case of the `user` parameter, according to the definition in
 *  the `params` block, it's a variable that first needs to be looked up in the
 *  `params` block of `definitions.json`. Params
 *  that start with a `$` sign will be substituted with the param with the same
 *  name from the `params` section of `definitions.json`.
 *  There we see that it is a required parameter (needs to hold a value). In other
 *  words, if the validation requirements are not met, an HTTP error is passed as
 *  first argument of the callback.
 *
 *  Implementation Notes: the `method` is NOT case sensitive, whereas `url` is.
 *  The `url` parameter also supports denoting parameters inside it as follows:
 *
 *      "get-from-user": {
 *          "url": "/users/:owner/gists",
 *          "method": "GET"
 *          ...
 *      }
 **/
var Client = module.exports = function (config) {
  if (!(this instanceof Client)) {
    return new Client(config)
  }

  config = config || {}
  config.headers = config.headers || {}
  this.config = config

  if ('followRedirects' in config) {
    console.warn('DEPRECATED: followRedirects option is no longer supported. All redirects are followed correctly')
  }

  if ('Promise' in config) {
    console.warn('DEPRECATED: Promise option is no longer supported. The native Promise API is used')
  }

  var pathPrefix = ''
    // Check if a prefix is passed in the config and strip any leading or trailing slashes from it.
  if (typeof config.pathPrefix === 'string') {
    pathPrefix = '/' + config.pathPrefix.replace(/(^[/]+|[/]+$)/g, '')
    this.config.pathPrefix = pathPrefix
  }

    // store mapping of accept header to preview api endpoints
  var mediaHash = DEFINITIONS.acceptTree
  var mediaTypes = {}

  for (var accept in mediaHash) {
    for (var route in mediaHash[accept]) {
      mediaTypes[mediaHash[accept][route]] = accept
    }
  }

  this.acceptUrls = mediaTypes

  this.setupRoutes()
};

(function () {
    /**
     *  Client#setupRoutes() -> null
     *
     *  Configures the routes as defined in routes.json.
     *
     *  [[Client#setupRoutes]] is invoked by the constructor, takes the
     *  contents of the JSON document that contains the definitions of all the
     *  available API routes and iterates over them.
     *
     *  It first recurses through each definition block until it reaches an API
     *  endpoint. It knows that an endpoint is found when the `url` and `param`
     *  definitions are found as a direct member of a definition block.
     *  Then the availability of an implementation by the API is checked; if it's
     *  not present, this means that a portion of the API as defined in the routes.json
     *  file is not implemented properly, thus an exception is thrown.
     *  After this check, a method is attached to the [[Client]] instance
     *  and becomes available for use. Inside this method, the parameter validation
     *  and typecasting is done, according to the definition of the parameters in
     *  the `params` block, upon invocation.
     *
     *  This mechanism ensures that the handlers ALWAYS receive normalized data
     *  that is of the correct format and type. JSON parameters are parsed, Strings
     *  are trimmed, Numbers and Floats are casted and checked for NaN after that.
     *
     *  Note: Query escaping for usage with SQL products is something that can be
     *  implemented additionally by adding an additional parameter type.
     **/
  this.setupRoutes = function () {
    var self = this
    this.requestHeaders = DEFINITIONS['request-headers'].map(function (header) {
      return header.toLowerCase()
    })
    this.responseHeaders = DEFINITIONS['response-headers'].map(function (header) {
      return header.toLowerCase()
    })

    function parseParams (msg, paramsStruct) {
      var params = Object.keys(paramsStruct)
      var paramName, def, value, type
      for (var i = 0, l = params.length; i < l; ++i) {
        paramName = params[i]
        if (paramName.charAt(0) === '$') {
          paramName = paramName.substr(1)
          if (!DEFINITIONS.params[paramName]) {
            throw new error.BadRequest("Invalid variable parameter name substitution; param '" +
                            paramName + "' not found in definitions.json")
          } else {
            def = paramsStruct[paramName] = DEFINITIONS.params[paramName]
            delete paramsStruct['$' + paramName]
          }
        } else {
          def = paramsStruct[paramName]
        }

        value = msg[paramName]
        if (typeof value !== 'boolean' && !value) {
                    // we don't need validation for undefined parameter values
                    // that are not required.
          if (!def.required ||
                        (def['allow-empty'] && value === '') ||
                        (def['allow-null'] && value === null)) {
            continue
          }
          throw new error.BadRequest("Empty value for parameter '" +
                        paramName + "': " + value)
        }

                // validate the value and type of parameter:
        if (def.validation) {
          if (!new RegExp(def.validation).test(value)) {
            throw new error.BadRequest("Invalid value for parameter '" +
                            paramName + "': " + value)
          }
        }

        type = def.type.toLowerCase()

        if (type === 'number') {
          value = parseInt(value, 10)

          if (isNaN(value)) {
            throw new error.BadRequest("Invalid value for parameter '" +
                              paramName + "': " + msg[paramName] + ' is NaN')
          }
        } else if (type === 'json') {
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value)
            } catch (ex) {
              throw new error.BadRequest("JSON parse error of value for parameter '" +
                                  paramName + "': " + value)
            }
          }
        } else if (type === 'date') {
          value = new Date(value)
        }

        msg[paramName] = value
      }
    }

    function prepareApi (struct, baseType) {
      if (!baseType) {
        baseType = ''
      }
      Object.keys(struct).forEach(function (routePart) {
        var block = struct[routePart]
        var messageType = baseType + '/' + routePart
        if (block.url && block.params) {
                    // we ended up at an API definition part!
          var parts = messageType.split('/')
          var section = toCamelCase(parts[1].toLowerCase())
          parts.splice(0, 2)
          var funcName = toCamelCase(parts.join('-'))

          if (!self[section]) {
            self[section] = {}
          }

          self[section][funcName] = function (msg, callback) {
            if (block.deprecated) {
              const caller = (new Error()).stack.split('\n')[2]
              console.warn('DEPRECATED: ' + block.deprecated)
              console.warn(caller)
            }

            try {
              parseParams(msg, block.params)
            } catch (ex) {
                            // when the message was sent to the client, we can
                            // reply with the error directly.
              self.sendError(ex, block, msg, callback)
              debug('fatal:', ex.message)

              if (typeof callback !== 'function') {
                return Promise.reject(ex)
              }

                            // on error, there's no need to continue.
              return
            }

            if (callback) {
              return self.handler(msg, JSON.parse(JSON.stringify(block)), callback)
            }

            return new Promise(function (resolve, reject) {
              var cb = function (err, obj) {
                if (err) {
                  reject(err)
                } else {
                  resolve(obj)
                }
              }
              self.handler(msg, JSON.parse(JSON.stringify(block)), cb)
            })
          }
        } else {
                    // recurse into this block next:
          prepareApi(block, messageType)
        }
      })
    }

    prepareApi(ROUTES)
  }

    /**
     *  Client#authenticate(options) -> null
     *      - options (Object): Object containing the authentication type and credentials
     *          - type (String): One of the following: `basic`, `oauth`, `token`, or `integration`
     *          - username (String): Github username
     *          - password (String): Password to your account
     *          - token (String): oauth/jwt token
     *
     *  Set an authentication method to have access to protected resources.
     *
     *  ##### Example
     *
     *      // basic
     *      github.authenticate({
     *          type: "basic",
     *          username: "mikedeboertest",
     *          password: "test1324"
     *      });
     *
     *      // oauth
     *      github.authenticate({
     *          type: "oauth",
     *          token: "e5a4a27487c26e571892846366de023349321a73"
     *      });
     *
     *      // oauth key/secret
     *      github.authenticate({
     *          type: "oauth",
     *          key: "clientID",
     *          secret: "clientSecret"
     *      });
     *
     *      // user token
     *      github.authenticate({
     *          type: "token",
     *          token: "userToken",
     *      });
     *
     *      // integration (jwt)
     *      github.authenticate({
     *          type: "integration",
     *          token: "jwt",
     *      });
     **/
  this.authenticate = function (options) {
    if (!options) {
      this.auth = false
      return
    }
    if (!options.type || 'basic|oauth|client|token|integration'.indexOf(options.type) === -1) {
      throw new Error("Invalid authentication type, must be 'basic', 'integration', 'oauth', or 'client'")
    }
    if (options.type === 'basic' && (!options.username || !options.password)) {
      throw new Error('Basic authentication requires both a username and password to be set')
    }
    if (options.type === 'oauth') {
      if (!options.token && !(options.key && options.secret)) {
        throw new Error('OAuth2 authentication requires a token or key & secret to be set')
      }
    }
    if ((options.type === 'token' || options.type === 'integration') && !options.token) {
      throw new Error('Token authentication requires a token to be set')
    }

    this.auth = options
  }

  function getPageLinks (link) {
    link = link.link || link.meta.link || ''

    var links = {}

        // link format:
        // '<https://api.github.com/users/aseemk/followers?page=2>; rel="next", <https://api.github.com/users/aseemk/followers?page=2>; rel="last"'
    link.replace(/<([^>]*)>;\s*rel="([\w]*)"/g, function (m, uri, type) {
      links[type] = uri
    })

    return links
  }

    /**
     *  Client#hasNextPage(link) -> null
     *      - link (Object): response of a request
     *
     *  Check if a request result contains a link to the next page
     **/
  this.hasNextPage = function (link) {
    return getPageLinks(link).next
  }

    /**
     *  Client#hasPreviousPage(link) -> null
     *      - link (Object): response of a request
     *
     *  Check if a request result contains a link to the previous page
     **/
  this.hasPreviousPage = function (link) {
    return getPageLinks(link).prev
  }

    /**
     *  Client#hasLastPage(link) -> null
     *      - link (Object): response of a request
     *
     *  Check if a request result contains a link to the last page
     **/
  this.hasLastPage = function (link) {
    return getPageLinks(link).last
  }

    /**
     *  Client#hasFirstPage(link) -> null
     *      - link (Object): response of a request
     *
     *  Check if a request result contains a link to the first page
     **/
  this.hasFirstPage = function (link) {
    return getPageLinks(link).first
  }

  function getPage (link, which, headers, callback) {
    if (typeof headers === 'function') {
      callback = headers
      headers = null
    }
    headers = applyAcceptHeader(link, headers)

    var self = this
    var url = getPageLinks(link)[which]
    if (!url) {
      var urlErr = new error.NotFound('No ' + which + ' page found')
      if (callback) {
        return callback(urlErr)
      }
      return Promise.reject(urlErr)
    }

    var parsedUrl = Url.parse(url, true)

    var msg = Object.create(parsedUrl.query)
    msg.headers = headers

    var block = {
      url: parsedUrl.pathname,
      method: 'GET',
      params: parsedUrl.query
    }

    if (callback) {
      return self.handler(msg, JSON.parse(JSON.stringify(block)), callback)
    }

    return new Promise(function (resolve, reject) {
      var cb = function (err, obj) {
        if (err) {
          reject(err)
        } else {
          resolve(obj)
        }
      }
      self.handler(msg, JSON.parse(JSON.stringify(block)), cb)
    })
  }

    /**
     *  Client#getNextPage(link, callback) -> null
     *      - link (Object): response of a request
     *      - headers (Object): Optional. Key/ value pair of request headers to pass along with the HTTP request.
     *      - callback (Function): function to call when the request is finished with an error as first argument and result data as second argument.
     *
     *  Get the next page, based on the contents of the `Link` header
     **/
  this.getNextPage = function (link, headers, callback) {
    return getPage.call(this, link, 'next', headers, callback)
  }

    /**
     *  Client#getPreviousPage(link, callback) -> null
     *      - link (Object): response of a request
     *      - headers (Object): Optional. Key/ value pair of request headers to pass along with the HTTP request.
     *      - callback (Function): function to call when the request is finished with an error as first argument and result data as second argument.
     *
     *  Get the previous page, based on the contents of the `Link` header
     **/
  this.getPreviousPage = function (link, headers, callback) {
    return getPage.call(this, link, 'prev', headers, callback)
  }

    /**
     *  Client#getLastPage(link, callback) -> null
     *      - link (Object): response of a request
     *      - headers (Object): Optional. Key/ value pair of request headers to pass along with the HTTP request.
     *      - callback (Function): function to call when the request is finished with an error as first argument and result data as second argument.
     *
     *  Get the last page, based on the contents of the `Link` header
     **/
  this.getLastPage = function (link, headers, callback) {
    return getPage.call(this, link, 'last', headers, callback)
  }

    /**
     *  Client#getFirstPage(link, callback) -> null
     *      - link (Object): response of a request
     *      - headers (Object): Optional. Key/ value pair of request headers to pass along with the HTTP request.
     *      - callback (Function): function to call when the request is finished with an error as first argument and result data as second argument.
     *
     *  Get the first page, based on the contents of the `Link` header
     **/
  this.getFirstPage = function (link, headers, callback) {
    return getPage.call(this, link, 'first', headers, callback)
  }

  function applyAcceptHeader (res, headers) {
    var previous = res.meta && res.meta['x-github-media-type']
    if (!previous || (headers && headers.accept)) {
      return headers
    }
    headers = headers || {}
    headers.accept = 'application/vnd.' + previous.replace('; format=', '+')
    return headers
  }

  function getRequestFormat (hasBody, block) {
    if (hasBody) {
      return block.requestFormat || DEFINITIONS.constants.requestFormat
    }
    return 'query'
  }

  function getQueryAndUrl (msg, def, format, config) {
    var url = def.url

    if (msg.url) {
      url = Url.parse(urlTemplate.parse(msg.url).expand(msg), true)

      return {
        url: url.path,
        host: url.host
      }
    }

    if (config.pathPrefix && url.indexOf(config.pathPrefix) !== 0) {
      url = config.pathPrefix + def.url
    }

    var ret = {}

    Object.keys(def.params).forEach(function (paramName) {
      paramName = paramName.replace(/^[$]+/, '')
      if (!(paramName in msg)) {
        return
      }

      var isUrlParam = url.indexOf(':' + paramName) !== -1
      var valFormat = isUrlParam || format !== 'json' ? 'query' : format
      var val
      if (valFormat === 'json') {
        val = msg[paramName]
      } else {
        if (def.params[paramName] && def.params[paramName].combined) {
          // Check if this is a combined (search) string.
          val = msg[paramName].split(/[\s\t\r\n]*\+[\s\t\r\n]*/)
            .map(function (part) {
              return encodeURIComponent(part)
            })
            .join('+')
        } else {
          // the ref param is a path so we don't want to [fully] encode it but we do want to encode the # if there is one
          // (see https://github.com/mikedeboer/node-github/issues/499#issuecomment-280093040)
          if (paramName === 'ref') {
            val = msg[paramName].replace(/#/g, '%23')
          } else {
            val = encodeURIComponent(msg[paramName])
          }
        }
      }

      if (isUrlParam) {
        url = url.replace(':' + paramName, val)
      } else {
        if (format === 'json' && def.params[paramName].sendValueAsBody) {
          ret.query = val
        } else if (format === 'json') {
          if (!ret.query) {
            ret.query = {}
          }
          ret.query[paramName] = val
        } else if (format !== 'raw') {
          if (!ret.query) {
            ret.query = []
          }
          ret.query.push(paramName + '=' + val)
        }
      }
    })
    ret.url = url

    return ret
  }

    /**
     *  Client#httpSend(msg, block, callback) -> null
     *      - msg (Object): parameters to send as the request body
     *      - block (Object): parameter definition from the `routes.json` file that
     *          contains validation rules
     *      - callback (Function): function to be called when the request returns.
     *          If the the request returns with an error, the error is passed to
     *          the callback as its first argument (NodeJS-style).
     *
     *  Send an HTTP request to the server and pass the result to a callback.
     **/
  this.httpSend = function (msg, block, callback) {
    var self = this
    var method = block.method.toLowerCase()
    var hasFileBody = block.hasFileBody
    var hasBody = typeof (msg.body) !== 'undefined' || 'head|get|delete'.indexOf(method) === -1
    var format = getRequestFormat.call(this, hasBody, block)
    var protocol = this.config.protocol || DEFINITIONS.constants.protocol
    var port = this.config.port || (protocol === 'https' ? 443 : 80)
    var host = this.config.host || DEFINITIONS.constants.host

    var queryAndUrl = getQueryAndUrl(msg, block, format, self.config)
    var query = queryAndUrl.query
    var url = queryAndUrl.url
    var path = url
    if (!hasBody && query && query.length) {
      path += '?' + query.join('&')
    }

    var proxyUrl
    var agent

    // proxy options will be removed: https://github.com/octokit/node-github/issues/656
    /* istanbul ignore if */
    if (this.config.proxy !== undefined) {
      proxyUrl = this.config.proxy
    } else {
      proxyUrl = getProxyForUrl(url)
    }

    // proxy options will be removed: https://github.com/octokit/node-github/issues/656
    /* istanbul ignore if */
    if (proxyUrl) {
      agent = new HttpsProxyAgent(proxyUrl)
    }

    var ca = this.config.ca

    var headers = {}

    if (hasFileBody) {
      headers['content-length'] = msg.contentLength
      headers['content-type'] = msg.contentType
      delete msg.contentLength
      delete msg.contentType
    } else if (hasBody) {
      if (format === 'raw') {
        query = msg.data
      } else {
        query = JSON.stringify(query)
      }
      headers['content-length'] = Buffer.byteLength(query || '', 'utf8')
      headers['content-type'] = format === 'raw'
                ? 'text/plain; charset=utf-8'
                : 'application/json; charset=utf-8'
    }

    if (this.auth) {
      var basic
      switch (this.auth.type) {
        case 'oauth':
          if (this.auth.token) {
            path += (path.indexOf('?') === -1 ? '?' : '&') +
                            'access_token=' + encodeURIComponent(this.auth.token)
          } else {
            path += (path.indexOf('?') === -1 ? '?' : '&') +
                            'client_id=' + encodeURIComponent(this.auth.key) +
                            '&client_secret=' + encodeURIComponent(this.auth.secret)
          }
          break
        case 'token':
          headers['Authorization'] = 'token ' + this.auth.token
          break
        case 'integration':
          headers['Authorization'] = 'Bearer ' + this.auth.token
          headers['accept'] = 'application/vnd.github.machine-man-preview+json'
          break
        case 'basic':
          basic = Buffer.from(this.auth.username + ':' + this.auth.password, 'ascii').toString('base64')
          headers['Authorization'] = 'Basic ' + basic
          break
      }
    }

    function callCallback (err, result) {
      if (callback) {
        var cb = callback
        callback = undefined
        cb(err, result)
      }
    }

    function addCustomHeaders (customHeaders) {
      Object.keys(customHeaders).forEach(function (header) {
        var headerLC = header.toLowerCase()
        if (self.requestHeaders.indexOf(headerLC) === -1) {
          return
        }
        headers[headerLC] = customHeaders[header]
      })
    }

    addCustomHeaders(Object.assign(msg.headers || {}, this.config.headers))

    if (!headers['user-agent']) {
      headers['user-agent'] = 'NodeJS HTTP Client'
    }

    if (!('accept' in headers)) {
      headers['accept'] = this.acceptUrls[block.url] || this.config.requestMedia || DEFINITIONS.constants.requestMedia
    }

    headers.host = queryAndUrl.host || host

    var options = {
      agent: agent,
      host: headers.host,
      port: port,
      path: path,
      method: method,
      headers: headers,
      ca: ca,
      family: this.config.family,
      rejectUnauthorized: this.config.rejectUnauthorized
    }

    debug('REQUEST:', options)

    function httpSendRequest () {
      var reqModule = protocol === 'http' ? require('http') : require('https')

      var req = reqModule.request(options, function (res) {
        debug('STATUS: ' + res.statusCode)
        debug('HEADERS: ' + JSON.stringify(res.headers))

        res.setEncoding('utf8')
        var data = ''
        res.on('data', function (chunk) {
          data += chunk
        })
        /* istanbul ignore next */
        res.on('error', function (err) {
          callCallback(err)
        })
        res.on('end', function () {
          if (res.statusCode !== 304 && res.statusCode >= 301 && res.statusCode <= 307) {
            options.path = Url.parse(res.headers.location, true).path
            httpSendRequest()
            return
          }

          if (res.statusCode === 304 || res.statusCode >= 400 || res.statusCode < 10) {
            callCallback(new error.HttpError(data, res.statusCode, res.headers))
          } else {
            res.data = data
            callCallback(null, res)
          }
        })
      })

      var timeout = (block.timeout !== undefined) ? block.timeout : self.config.timeout

      if (timeout) {
        req.setTimeout(timeout)
      }

      req.on('error', function (e) {
        debug('problem with request: ' + e.message)
        callCallback(e.message)
      })

      req.on('timeout', function () {
        debug('problem with request: timed out')
        req.abort()
        callCallback(new error.GatewayTimeout('Request timeout'))
      })

            // write data to request body
      if (hasBody && query && query.length) {
        debug('REQUEST BODY: ' + query + '\n')
        req.write(query + '\n')
      }

      if (hasFileBody) {
        if (isStream(msg.file)) {
          return msg.file.pipe(req)
        }

        req.write(Buffer.from(msg.file))
      }

      req.end()
    };

    httpSendRequest()
  }

  this.sendError = function (err, block, msg, callback) {
    debug('error:', err, block, msg)

    if (typeof err === 'string') {
      err = new error.InternalServerError(err)
    }
    if (callback && typeof (callback) === 'function') {
      callback(err)
    }
  }

  this.handler = function (msg, block, callback) {
    var self = this
    this.httpSend(msg, block, function (err, res) {
      if (err) {
        return self.sendError(err, msg, null, callback)
      }

      var data = res.data

      var contentType = res.headers['content-type']
      if (contentType && contentType.indexOf('application/json') !== -1) {
        data = res.data && JSON.parse(res.data)
      }
      var ret = {
        data: data,
        meta: {}
      }

      self.responseHeaders.forEach(function (header) {
        if (res.headers[header]) {
          ret.meta[header] = res.headers[header]
        }
      })

      callback(null, ret)
    })
  }
}).call(Client.prototype)

}).call(this,require("buffer").Buffer)
},{"./definitions.json":53,"./error":54,"./routes.json":56,"buffer":3,"debug":58,"http":35,"https":7,"https-proxy-agent":60,"is-stream":66,"lodash/camelCase":89,"proxy-from-env":98,"url":43,"url-template":99}],56:[function(require,module,exports){
module.exports={
    "authorization": {
        "get-grants": {
            "url": "/applications/grants",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List your grants."
        },
        "get-grant": {
            "url": "/applications/grants/:id",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get a single grant."
        },
        "delete-grant": {
            "url": "/applications/grants/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a grant."
        },
        "get-all": {
            "url": "/authorizations",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List your authorizations."
        },
        "get": {
            "url": "/authorizations/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single authorization."
        },
        "create": {
            "url": "/authorizations",
            "method": "POST",
            "params": {
                "$scopes": null,
                "$note": null,
                "$note_url": null,
                "$client_id": null,
                "client_secret": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The 40 character OAuth app client secret for which to create the token."
                },
                "$fingerprint": null
            },
            "description": "Create a new authorization."
        },
        "get-or-create-authorization-for-app": {
            "url": "/authorizations/clients/:client_id",
            "method": "PUT",
            "params": {
                "$client_id": null,
                "client_secret": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The 40 character OAuth app client secret associated with the client ID specified in the URL."
                },
                "$scopes": null,
                "$note": null,
                "$note_url": null,
                "$fingerprint": null
            },
            "description": "Get or create an authorization for a specific app."
        },
        "get-or-create-authorization-for-app-and-fingerprint": {
            "url": "/authorizations/clients/:client_id/:fingerprint",
            "method": "PUT",
            "params": {
                "$client_id": null,
                "$fingerprint": null,
                "client_secret": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The 40 character OAuth app client secret associated with the client ID specified in the URL."
                },
                "$scopes": null,
                "$note": null,
                "$note_url": null
            },
            "description": "Get or create an authorization for a specific app and fingerprint."
        },
        "update": {
            "url": "/authorizations/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "$scopes": null,
                "add_scopes": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A list of scopes to add to this authorization."
                },
                "remove_scopes": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A list of scopes to remove from this authorization."
                },
                "$note": null,
                "$note_url": null,
                "$fingerprint": null
            },
            "description": "Update an existing authorization."
        },
        "delete": {
            "url": "/authorizations/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete an authorization."
        },
        "check": {
            "url": "/applications/:client_id/tokens/:access_token",
            "method": "GET",
            "params": {
                "$client_id": null,
                "$access_token": null
            },
            "description": "Check an authorization"
        },
        "reset": {
            "url": "/applications/:client_id/tokens/:access_token",
            "method": "POST",
            "params": {
                "$client_id": null,
                "$access_token": null
            },
            "description": "Reset an authorization"
        },
        "revoke": {
            "url": "/applications/:client_id/tokens/:access_token",
            "method": "DELETE",
            "params": {
                "$client_id": null,
                "$access_token": null
            },
            "description": "Revoke an authorization for an application"
        },
        "revoke-grant": {
            "url": "/applications/:client_id/grants/:access_token",
            "method": "DELETE",
            "params": {
                "$client_id": null,
                "$access_token": null
            },
            "description": "Revoke a grant for an application"
        }
    },
    "activity": {
        "get-events": {
            "url": "/events",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List public events"
        },
        "get-events-for-repo": {
            "url": "/repos/:owner/:repo/events",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List repository events"
        },
        "get-events-for-repo-issues": {
            "url": "/repos/:owner/:repo/issues/events",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List issue events for a repository"
        },
        "get-events-for-repo-network": {
            "url": "/networks/:owner/:repo/events",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public events for a network of repositories"
        },
        "get-events-for-org": {
            "url": "/orgs/:org/events",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public events for an organization"
        },
        "get-events-received": {
            "url": "/users/:username/received_events",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events that a user has received"
        },
        "get-events-received-public": {
            "url": "/users/:username/received_events/public",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public events that a user has received"
        },
        "get-events-for-user": {
            "url": "/users/:username/events",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events performed by a user"
        },
        "get-events-for-user-public": {
            "url": "/users/:username/events/public",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public events performed by a user"
        },
        "get-events-for-user-org": {
            "url": "/users/:username/events/orgs/:org",
            "method": "GET",
            "params": {
                "$username": null,
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events for a user's organization"
        },
        "get-feeds": {
            "url": "/feeds",
            "method": "GET",
            "params": {},
            "description": "Get all feeds available for the authenticated user."
        },
        "get-notifications": {
            "url": "/notifications",
            "method": "GET",
            "params": {
                "all": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If true, show notifications marked as read. Default: false",
                    "default": "false"
                },
                "participating": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If true, only shows notifications in which the user is directly participating or mentioned. Default: false",
                    "default": "false"
                },
                "$since": null,
                "before": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Only show notifications updated before the given time. This is a timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ."
                }
            },
            "description": "Get all notifications for the current user, grouped by repository."
        },
        "get-notifications-for-user": {
            "url": "/repos/:owner/:repo/notifications",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "all": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If true, show notifications marked as read. Default: false",
                    "default": "false"
                },
                "participating": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If true, only shows notifications in which the user is directly participating or mentioned. Default: false",
                    "default": "false"
                },
                "$since": null,
                "before": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Only show notifications updated before the given time. This is a timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ."
                }
            },
            "description": "Get all notifications for the given user."
        },
        "mark-notifications-as-read": {
            "url": "/notifications",
            "method": "PUT",
            "params": {
                "last_read_at": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Describes the last point that notifications were checked. Anything updated since this time will not be updated. This is a timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ. Default: Time.now",
                    "default": "Time.now"
                }
            },
            "description": "Mark notifications as read for authenticated user."
        },
        "mark-notifications-as-read-for-repo": {
            "url": "/repos/:owner/:repo/notifications",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "last_read_at": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Describes the last point that notifications were checked. Anything updated since this time will not be updated. This is a timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ. Default: Time.now",
                    "default": "Time.now"
                }
            },
            "description": "Mark notifications in a repo as read."
        },
        "get-notification-thread": {
            "url": "/notifications/threads/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "View a single notification thread."
        },
        "mark-notification-thread-as-read": {
            "url": "/notifications/threads/:id",
            "method": "PATCH",
            "params": {
                "$id": null
            },
            "description": "Mark a notification thread as read."
        },
        "check-notification-thread-subscription": {
            "url": "/notifications/threads/:id/subscription",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Check to see if the current user is subscribed to a thread."
        },
        "set-notification-thread-subscription": {
            "url": "/notifications/threads/:id/subscription",
            "method": "PUT",
            "params": {
                "$id": null,
                "subscribed": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines if notifications should be received from this thread"
                },
                "ignored": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines if all notifications should be blocked from this thread"
                }
            },
            "description": "This lets you subscribe or unsubscribe from a conversation. Unsubscribing from a conversation mutes all future notifications (until you comment or get @mentioned once more)."
        },
        "delete-notification-thread-subscription": {
            "url": "/notifications/threads/:id/subscription",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a notification thread subscription."
        },
        "get-stargazers-for-repo": {
            "url": "/repos/:owner/:repo/stargazers",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List Stargazers"
        },
        "get-starred-repos-for-user": {
            "url": "/users/:username/starred",
            "method": "GET",
            "params": {
                "$username": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated)$",
                    "invalidmsg": "created or updated (when it was last pushed to); default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories being starred by a user"
        },
        "get-starred-repos": {
            "url": "/user/starred",
            "method": "GET",
            "params": {
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated)$",
                    "invalidmsg": "created or updated (when it was last pushed to); default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories being starred by the authenticated user"
        },
        "check-starring-repo": {
            "url": "/user/starred/:owner/:repo",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Check if you are starring a repository"
        },
        "star-repo": {
            "url": "/user/starred/:owner/:repo",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Star a repository"
        },
        "unstar-repo": {
            "url": "/user/starred/:owner/:repo",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Unstar a repository"
        },
        "get-watchers-for-repo": {
            "url": "/repos/:owner/:repo/subscribers",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get watchers for repository."
        },
        "get-watched-repos-for-user": {
            "url": "/users/:username/subscriptions",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories being watched by a user."
        },
        "get-watched-repos": {
            "url": "/user/subscriptions",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories being watched by the authenticated user."
        },
        "get-repo-subscription": {
            "url": "/repos/:owner/:repo/subscription",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get a Repository Subscription."
        },
        "set-repo-subscription": {
            "url": "/repos/:owner/:repo/subscription",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "subscribed": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines if notifications should be received from this repository."
                },
                "ignored": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines if all notifications should be blocked from this repository."
                }
            },
            "description": "Set a Repository Subscription"
        },
        "unwatch-repo": {
            "url": "/repos/:owner/:repo/subscription",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Unwatch a repository."
        }
    },
    "gists": {
        "get-for-user": {
            "url": "/users/:username/gists",
            "method": "GET",
            "params": {
                "$username": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List a user's gists"
        },
        "get-all": {
            "url": "/gists",
            "method": "GET",
            "params": {
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List the authenticated user's gists or if called anonymously, this will return all public gists"
        },
        "get-public": {
            "url": "/gists/public",
            "method": "GET",
            "params": {
                "$since": null
            },
            "description": "List all public gists"
        },
        "get-starred": {
            "url": "/gists/starred",
            "method": "GET",
            "params": {
                "$since": null
            },
            "description": "List the authenticated user's starred gists"
        },
        "get": {
            "url": "/gists/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single gist"
        },
        "get-revision": {
            "url": "/gists/:id/:sha",
            "method": "GET",
            "params": {
                "$id": null,
                "$sha": null
            },
            "description": "Get a specific revision of a gist"
        },
        "create": {
            "url": "/gists",
            "method": "POST",
            "params": {
                "$files": null,
                "$description": null,
                "public": {
                    "type": "Boolean",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create a gist"
        },
        "edit": {
            "url": "/gists/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "$description": null,
                "$files": null,
                "content": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Updated file contents."
                },
                "filename": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "New name for this file."
                }
            },
            "description": "Edit a gist"
        },
        "get-commits": {
            "url": "/gists/:id/commits",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "List gist commits"
        },
        "star": {
            "url": "/gists/:id/star",
            "method": "PUT",
            "params": {
                "$id": null
            },
            "description": "Star a gist"
        },
        "unstar": {
            "url": "/gists/:id/star",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Unstar a gist"
        },
        "check-star": {
            "url": "/gists/:id/star",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Check if a gist is starred"
        },
        "fork": {
            "url": "/gists/:id/forks",
            "method": "POST",
            "params": {
                "$id": null
            },
            "description": "Fork a gist"
        },
        "get-forks": {
            "url": "/gists/:id/forks",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List gist forks"
        },
        "delete": {
            "url": "/gists/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a gist"
        },
        "get-comments": {
            "url": "/gists/:gist_id/comments",
            "method": "GET",
            "params": {
                "$gist_id": null
            },
            "description": "List comments on a gist"
        },
        "get-comment": {
            "url": "/gists/:gist_id/comments/:id",
            "method": "GET",
            "params": {
                "$gist_id": null,
                "$id": null
            },
            "description": "Get a single comment"
        },
        "create-comment": {
            "url": "/gists/:gist_id/comments",
            "method": "POST",
            "params": {
                "$gist_id": null,
                "$body": null
            },
            "description": "Create a comment"
        },
        "edit-comment": {
            "url": "/gists/:gist_id/comments/:id",
            "method": "PATCH",
            "params": {
                "$gist_id": null,
                "$id": null,
                "$body": null
            },
            "description": "Edit a comment"
        },
        "delete-comment": {
            "url": "/gists/:gist_id/comments/:id",
            "method": "DELETE",
            "params": {
                "$gist_id": null,
                "$id": null
            },
            "description": "Delete a comment"
        }
    },
    "gitdata": {
        "get-blob": {
            "url": "/repos/:owner/:repo/git/blobs/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get a Blob"
        },
        "create-blob": {
            "url": "/repos/:owner/:repo/git/blobs",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "content": {
                    "type": "String",
                    "required": true,
                    "allow-empty": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "encoding": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create a Blob"
        },
        "get-commit": {
            "url": "/repos/:owner/:repo/git/commits/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null
            },
            "description": "Get a Commit"
        },
        "create-commit": {
            "url": "/repos/:owner/:repo/git/commits",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "message": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the commit message"
                },
                "tree": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the SHA of the tree object this commit points to"
                },
                "parents": {
                    "type": "Array",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Array of the SHAs of the commits that were the parents of this commit. If omitted or empty, the commit will be written as a root commit. For a single parent, an array of one SHA should be provided, for a merge commit, an array of more than one should be provided."
                },
                "author": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "committer": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create a Commit"
        },
        "get-commit-signature-verification": {
            "url": "/repos/:owner/:repo/git/commits/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null
            },
            "description": "Get a Commit Signature Verification. (In preview period. See README.)"
        },
        "get-reference": {
            "url": "/repos/:owner/:repo/git/refs/:ref",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$ref": null
            },
            "description": "Get a Reference"
        },
        "get-references": {
            "url": "/repos/:owner/:repo/git/refs",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get all References"
        },
        "get-tags": {
            "url": "/repos/:owner/:repo/git/refs/tags",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get all tag References"
        },
        "create-reference": {
            "url": "/repos/:owner/:repo/git/refs",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the fully qualified reference (ie: refs/heads/master). If it doesn't start with 'refs' and have at least two slashes, it will be rejected. NOTE: After creating the reference, on calling (get|update|delete)Reference, drop the leading 'refs/' when providing the 'ref' param."
                },
                "$sha": null
            },
            "description": "Create a Reference"
        },
        "update-reference": {
            "url": "/repos/:owner/:repo/git/refs/:ref",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$ref": null,
                "$sha": null,
                "force": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Boolean indicating whether to force the update or to make sure the update is a fast-forward update. The default is false, so leaving this out or setting it to false will make sure you’re not overwriting work.",
                    "default": "false"
                }
            },
            "description": "Update a Reference"
        },
        "delete-reference": {
            "url": "/repos/:owner/:repo/git/refs/:ref",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$ref": null
            },
            "description": "Delete a Reference"
        },
        "get-tag": {
            "url": "/repos/:owner/:repo/git/tags/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null
            },
            "description": "Get a Tag"
        },
        "create-tag": {
            "url": "/repos/:owner/:repo/git/tags",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "tag": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the tag"
                },
                "message": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the tag message"
                },
                "object": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the SHA of the git object this is tagging"
                },
                "type": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the type of the object we’re tagging. Normally this is a commit but it can also be a tree or a blob."
                },
                "tagger": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `name` - String of the name of the author of the tag, `email` - String of the email of the author of the tag, `date` - Timestamp of when this object was tagged"
                }
            },
            "description": "Create a Tag Object"
        },
        "get-tag-signature-verification": {
            "url": "/repos/:owner/:repo/git/tags/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null
            },
            "description": "Get a Tag Signature Verification. (In preview period. See README.)"
        },
        "get-tree": {
            "url": "/repos/:owner/:repo/git/trees/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null,
                "recursive": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Get a Tree"
        },
        "create-tree": {
            "url": "/repos/:owner/:repo/git/trees",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "tree": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Array of Hash objects (of path, mode, type and sha) specifying a tree structure"
                },
                "base_tree": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the SHA1 of the tree you want to update with new data"
                }
            },
            "description": "Create a Tree"
        }
    },
    "integrations": {
        "get-installations": {
            "url": "/app/installations",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "deprecated": "`integrations` has been renamed to `apps`",
            "description": "List the app's installations. (In preview period. See README.)"
        },
        "create-installation-token": {
            "url": "/installations/:installation_id/access_tokens",
            "method": "POST",
            "params": {
                "$installation_id": null,
                "user_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The id of the user for whom the app is acting on behalf of."
                }
            },
            "deprecated": "`integrations` has been renamed to `apps`",
            "description": "Create a new installation token. (In preview period. See README.)"
        },
        "get-installation-repositories": {
            "url": "/installation/repositories",
            "method": "GET",
            "params": {
                "user_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The integer ID of a user, to filter results to repositories that are visible to both the installation and the given user."
                }
            },
            "deprecated": "`integrations` has been renamed to `apps`",
            "description": "List repositories that are accessible to the authenticated installation. (In preview period. See README.)"
        },
        "add-repo-to-installation": {
            "url": "/installations/:installation_id/repositories/:repository_id",
            "method": "PUT",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "deprecated": "`integrations` has been renamed to `apps`",
            "description": "Add a single repository to an installation. (In preview period. See README.)"
        },
        "remove-repo-from-installation": {
            "url": "/installations/:installation_id/repositories/:repository_id",
            "method": "DELETE",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "deprecated": "`integrations` has been renamed to `apps`",
            "description": "Remove a single repository from an installation. (In preview period. See README.)"
        }
    },
    "apps": {
        "get-for-slug": {
            "url": "/apps/:app_slug",
            "method": "GET",
            "params": {
                "app_slug": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The URL-friendly name of your GitHub App. You can find this on the settings page for your GitHub App (e.g., https://github.com/settings/apps/:app_slug)."
                }
            },
            "description": "Get a single GitHub App. (In preview period. See README.)"
        },
        "get": {
            "url": "/app",
            "method": "GET",
            "params": {
            },
            "description": "Get the authenticated GitHub App. (In preview period. See README.)"
        },
        "get-installations": {
            "url": "/app/installations",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List the app's installations. (In preview period. See README.)"
        },
        "get-installation": {
            "url": "/app/installations/:installation_id",
            "method": "GET",
            "params": {
                "$installation_id": null
            },
            "description": "Get a single installation. (In preview period. See README.)"
        },
        "create-installation-token": {
            "url": "/installations/:installation_id/access_tokens",
            "method": "POST",
            "params": {
                "$installation_id": null,
                "user_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The id of the user for whom the app is acting on behalf of."
                }
            },
            "description": "Create a new installation token. (In preview period. See README.)"
        },
        "get-installation-repositories": {
            "url": "/installation/repositories",
            "method": "GET",
            "params": {
                "user_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The integer ID of a user, to filter results to repositories that are visible to both the installation and the given user."
                }
            },
            "description": "List repositories that are accessible to the authenticated installation. (In preview period. See README.)"
        },
        "add-repo-to-installation": {
            "url": "/installations/:installation_id/repositories/:repository_id",
            "method": "PUT",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "description": "Add a single repository to an installation. (In preview period. See README.)"
        },
        "remove-repo-from-installation": {
            "url": "/installations/:installation_id/repositories/:repository_id",
            "method": "DELETE",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "description": "Remove a single repository from an installation. (In preview period. See README.)"
        },
        "get-marketplace-listing-plans": {
            "url": "/marketplace_listing/plans",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List all plans for your Marketplace listing. (In preview period. See README.)"
        },
        "get-marketplace-listing-stubbed-plans": {
            "url": "/marketplace_listing/stubbed/plans",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List all stubbed plans for your Marketplace listing. (In preview period. See README.)"
        },
        "get-marketplace-listing-plan-accounts": {
            "url": "/marketplace_listing/plans/:id/accounts",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all GitHub accounts (user or organization) on a specific plan. (In preview period. See README.)"
        },
        "get-marketplace-listing-stubbed-plan-accounts": {
            "url": "/marketplace_listing/stubbed/plans/:id/accounts",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all GitHub accounts (user or organization) on a specific stubbed plan. (In preview period. See README.)"
        },
        "check-marketplace-listing-account": {
            "url": "/marketplace_listing/accounts/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Check if a GitHub account is associated with any Marketplace listing. (In preview period. See README.)"
        },
        "check-marketplace-listing-stubbed-account": {
            "url": "/marketplace_listing/stubbed/accounts/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Check if a stubbed GitHub account is associated with any Marketplace listing. (In preview period. See README.)"
        }
    },
    "issues": {
        "get-all": {
            "url": "/issues",
            "method": "GET",
            "params": {
                "filter": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|assigned|created|mentioned|subscribed)$",
                    "invalidmsg": "",
                    "description": "",
                    "enum": [
                        "all",
                        "assigned",
                        "created",
                        "mentioned",
                        "subscribed"
                    ]
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed|all)$",
                    "invalidmsg": "open, closed, all, default: open",
                    "description": "open, closed, or all",
                    "enum": [
                        "open",
                        "closed",
                        "all"
                    ],
                    "default": "open"
                },
                "labels": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String list of comma separated Label names. Example: bug,ui,@high"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|comments)$",
                    "invalidmsg": "created, updated, comments, default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated",
                        "comments"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all issues across all the authenticated user's visible repositories including owned repositories, member repositories, and organization repositories"
        },
        "get-for-user": {
            "url": "/user/issues",
            "method": "GET",
            "params": {
                "filter": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|assigned|created|mentioned|subscribed)$",
                    "invalidmsg": "",
                    "description": "",
                    "enum": [
                        "all",
                        "assigned",
                        "created",
                        "mentioned",
                        "subscribed"
                    ]
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed|all)$",
                    "invalidmsg": "open, closed, all, default: open",
                    "description": "open, closed, or all",
                    "enum": [
                        "open",
                        "closed",
                        "all"
                    ],
                    "default": "open"
                },
                "labels": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String list of comma separated Label names. Example: bug,ui,@high"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|comments)$",
                    "invalidmsg": "created, updated, comments, default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated",
                        "comments"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all issues across owned and member repositories for the authenticated user"
        },
        "get-for-org": {
            "url": "/orgs/:org/issues",
            "method": "GET",
            "params": {
                "$org": null,
                "filter": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|assigned|created|mentioned|subscribed)$",
                    "invalidmsg": "",
                    "description": "",
                    "enum": [
                        "all",
                        "assigned",
                        "created",
                        "mentioned",
                        "subscribed"
                    ]
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed|all)$",
                    "invalidmsg": "open, closed, all, default: open",
                    "description": "open, closed, or all",
                    "enum": [
                        "open",
                        "closed",
                        "all"
                    ],
                    "default": "open"
                },
                "labels": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String list of comma separated Label names. Example: bug,ui,@high"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|comments)$",
                    "invalidmsg": "created, updated, comments, default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated",
                        "comments"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all issues for a given organization for the authenticated user"
        },
        "get-for-repo": {
            "url": "/repos/:owner/:repo/issues",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "milestone": {
                    "type": "String",
                    "required": false,
                    "validation": "^([0-9]+|none|\\*)$",
                    "invalidmsg": "",
                    "description": ""
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed|all)$",
                    "invalidmsg": "open, closed, all, default: open",
                    "description": "open, closed, or all",
                    "enum": [
                        "open",
                        "closed",
                        "all"
                    ],
                    "default": "open"
                },
                "assignee": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String User login, `none` for Issues with no assigned User. `*` for Issues with any assigned User."
                },
                "creator": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The user that created the issue."
                },
                "mentioned": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String User login."
                },
                "labels": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String list of comma separated Label names. Example: bug,ui,@high"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|comments)$",
                    "invalidmsg": "created, updated, comments, default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated",
                        "comments"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List issues for a repository"
        },
        "get": {
            "url": "/repos/:owner/:repo/issues/:number",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Get a single issue"
        },
        "create": {
            "url": "/repos/:owner/:repo/issues",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "title": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "assignee": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Login for the user that this issue should be assigned to."
                },
                "milestone": {
                    "type": "Number",
                    "required": false,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": "Milestone to associate this issue with."
                },
                "labels": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Array of strings - Labels to associate with this issue."
                },
                "$assignees": null
            },
            "description": "Create an issue"
        },
        "edit": {
            "url": "/repos/:owner/:repo/issues/:number",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "title": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "assignee": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Login for the user that this issue should be assigned to."
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed)$",
                    "invalidmsg": "open, closed, default: open",
                    "description": "open or closed",
                    "enum": [
                        "open",
                        "closed"
                    ],
                    "default": "open"
                },
                "milestone": {
                    "type": "Number",
                    "required": false,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": "Milestone to associate this issue with."
                },
                "labels": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Array of strings - Labels to associate with this issue."
                },
                "$assignees": null
            },
            "description": "Edit an issue"
        },
        "lock": {
            "url": "/repos/:owner/:repo/issues/:number/lock",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Users with push access can lock an issue's conversation."
        },
        "unlock": {
            "url": "/repos/:owner/:repo/issues/:number/lock",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Users with push access can unlock an issue's conversation."
        },
        "get-assignees": {
            "url": "/repos/:owner/:repo/assignees",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "List assignees"
        },
        "check-assignee": {
            "url": "/repos/:owner/:repo/assignees/:assignee",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "assignee": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Login for the user that this issue should be assigned to."
                }
            },
            "description": "Check assignee"
        },
        "add-assignees-to-issue": {
            "url": "/repos/:owner/:repo/issues/:number/assignees",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "assignees": {
                    "type": "Array",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Logins for the users that should be added to the issue."
                }
            },
            "description": "Add assignees to an issue."
        },
        "remove-assignees-from-issue": {
            "url": "/repos/:owner/:repo/issues/:number/assignees",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "body": {
                    "type": "Json",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Remove assignees from an issue."
        },
        "get-comments": {
            "url": "/repos/:owner/:repo/issues/:number/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List comments on an issue"
        },
        "get-comments-for-repo": {
            "url": "/repos/:owner/:repo/issues/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated)$",
                    "invalidmsg": "created, updated, default: created.",
                    "description": "",
                    "enum": [
                        "created",
                        "updated"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List comments in a repository"
        },
        "get-comment": {
            "url": "/repos/:owner/:repo/issues/comments/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single comment"
        },
        "create-comment": {
            "url": "/repos/:owner/:repo/issues/:number/comments",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$body": null
            },
            "description": "Create a comment"
        },
        "edit-comment": {
            "url": "/repos/:owner/:repo/issues/comments/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "$body": null
            },
            "description": "Edit a comment"
        },
        "delete-comment": {
            "url": "/repos/:owner/:repo/issues/comments/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a comment"
        },
        "get-events": {
            "url": "/repos/:owner/:repo/issues/:issue_number/events",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$issue_number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events for an issue"
        },
        "get-events-for-repo": {
            "url": "/repos/:owner/:repo/issues/events",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events for a repository"
        },
        "get-event": {
            "url": "/repos/:owner/:repo/issues/events/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single event"
        },
        "get-labels": {
            "url": "/repos/:owner/:repo/labels",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all labels for this repository"
        },
        "get-label": {
            "url": "/repos/:owner/:repo/labels/:name",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null
            },
            "description": "Get a single label"
        },
        "create-label": {
            "url": "/repos/:owner/:repo/labels",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null,
                "$color": null
            },
            "description": "Create a label"
        },
        "update-label": {
            "url": "/repos/:owner/:repo/labels/:oldname",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "oldname": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The old name of the label."
                },
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new name of the label."
                },
                "$color": null
            },
            "description": "Update a label"
        },
        "delete-label": {
            "url": "/repos/:owner/:repo/labels/:name",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null
            },
            "description": "Delete a label"
        },
        "get-issue-labels": {
            "url": "/repos/:owner/:repo/issues/:number/labels",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "List labels on an issue"
        },
        "add-labels": {
            "url": "/repos/:owner/:repo/issues/:number/labels",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "labels": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Add labels to an issue"
        },
        "remove-label": {
            "url": "/repos/:owner/:repo/issues/:number/labels/:name",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Remove a label from an issue"
        },
        "replace-all-labels": {
            "url": "/repos/:owner/:repo/issues/:number/labels",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "labels": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Sending an empty array ([]) will remove all Labels from the Issue."
                }
            },
            "description": "Replace all labels for an issue"
        },
        "remove-all-labels": {
            "url": "/repos/:owner/:repo/issues/:number/labels",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Remove all labels from an issue"
        },
        "get-milestone-labels": {
            "url": "/repos/:owner/:repo/milestones/:number/labels",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Get labels for every issue in a milestone"
        },
        "get-milestones": {
            "url": "/repos/:owner/:repo/milestones",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$state": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(due_on|completeness)$",
                    "invalidmsg": "due_on, completeness, default: due_on",
                    "description": "due_on, completeness, default: due_on",
                    "enum": [
                        "due_on",
                        "completeness"
                    ],
                    "default": "due_on"
                },
                "direction": {
                    "type": "String",
                    "required": false,
                    "validation": "^(asc|desc)$",
                    "invalidmsg": "asc or desc, default: asc.",
                    "description": "",
                    "enum": [
                        "asc",
                        "desc"
                    ],
                    "default": "asc"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List milestones for a repository"
        },
        "get-milestone": {
            "url": "/repos/:owner/:repo/milestones/:number",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Get a single milestone"
        },
        "create-milestone": {
            "url": "/repos/:owner/:repo/milestones",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "title": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "$state": null,
                "$description": null,
                "due_on": {
                    "type": "Date",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ",
                    "description": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ"
                }
            },
            "description": "Create a milestone"
        },
        "update-milestone": {
            "url": "/repos/:owner/:repo/milestones/:number",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "title": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "$state": null,
                "$description": null,
                "due_on": {
                    "type": "Date",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ",
                    "description": "Timestamp in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ"
                }
            },
            "description": "Update a milestone"
        },
        "delete-milestone": {
            "url": "/repos/:owner/:repo/milestones/:number",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Delete a milestone"
        },
        "get-events-timeline": {
            "url": "/repos/:owner/:repo/issues/:issue_number/timeline",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$issue_number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List events for an issue. (In preview period. See README.)"
        }
    },
    "migrations": {
        "start-migration": {
            "url": "/orgs/:org/migrations",
            "method": "POST",
            "params": {
                "$org": null,
                "repositories": {
                    "type": "Array",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A list of arrays indicating which repositories should be migrated."
                },
                "lock_repositories": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Indicates whether repositories should be locked (to prevent manipulation) while migrating data. Default: false.",
                    "default": "false"
                },
                "exclude_attachments": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Indicates whether attachments should be excluded from the migration (to reduce migration archive file size). Default: false.",
                    "default": "false"
                }
            },
            "description": "Start a migration. (In preview period. See README.)"
        },
        "get-migrations": {
            "url": "/orgs/:org/migrations",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get a list of migrations. (In preview period. See README.)"
        },
        "get-migration-status": {
            "url": "/orgs/:org/migrations/:id",
            "method": "GET",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Get the status of a migration. (In preview period. See README.)"
        },
        "get-migration-archive-link": {
            "url": "/orgs/:org/migrations/:id/archive",
            "method": "GET",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Get the URL to a migration archive. (In preview period. See README.)"
        },
        "delete-migration-archive": {
            "url": "/orgs/:org/migrations/:id/archive",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Delete a migration archive. (In preview period. See README.)"
        },
        "unlock-repo-locked-for-migration": {
            "url": "/orgs/:org/migrations/:id/repos/:repo_name/lock",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$id": null,
                "repo_name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Unlock a repository that was locked for migration. (In preview period. See README.)"
        },
        "start-import": {
            "url": "/repos/:owner/:repo/import",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "vcs_url": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The URL of the originating repository."
                },
                "vcs": {
                    "type": "String",
                    "required": false,
                    "validation": "^(subversion|git|mercurial|tfvc)$",
                    "invalidmsg": "subversion, git, mercurial, tfvc",
                    "description": "The originating VCS type. Please be aware that without this parameter, the import job will take additional time to detect the VCS type before beginning the import. This detection step will be reflected in the response.",
                    "enum": [
                        "subversion",
                        "git",
                        "mercurial",
                        "tfvc"
                    ]
                },
                "vcs_username": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If authentication is required, the username to provide to vcs_url."
                },
                "vcs_password": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If authentication is required, the password to provide to vcs_url."
                },
                "tfvc_project": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "For a tfvc import, the name of the project that is being imported."
                }
            },
            "description": "Start an import. (In preview period. See README.)"
        },
        "get-import-progress": {
            "url": "/repos/:owner/:repo/import",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get import progress. (In preview period. See README.)"
        },
        "update-import": {
            "url": "/repos/:owner/:repo/import",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "vcs_username": {
                "type": "String",
                "required": false,
                "validation": "",
                "invalidmsg": "",
                "description": "The username to provide to the originating repository."
            },
            "vcs_password": {
                "type": "String",
                "required": false,
                "validation": "",
                "invalidmsg": "",
                "description": "The password to provide to the originating repository."
            },
            "description": "Update existing import. (In preview period. See README.)"
        },
        "get-import-commit-authors": {
            "url": "/repos/:owner/:repo/import/authors",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "since": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Only authors found after this id are returned. Provide the highest author ID you've seen so far. New authors may be added to the list at any point while the importer is performing the raw step."
                }
            },
            "description": "Get import commit authors. (In preview period. See README.)"
        },
        "map-import-commit-author": {
            "url": "/repos/:owner/:repo/import/authors/:author_id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "author_id": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The commit author id."
                },
                "email": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new Git author email."
                },
                "name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new Git author name."
                }
            },
            "description": "Map a commit author. (In preview period. See README.)"
        },
        "set-import-lfs-preference": {
            "url": "/:owner/:name/import/lfs",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$name": null,
                "use_lfs": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Can be one of `opt_in` (large files will be stored using Git LFS) or `opt_out` (large files will be removed during the import)."
                }
            },
            "description": "Set import LFS preference. (In preview period. See README.)"
        },
        "get-large-import-files": {
            "url": "/:owner/:name/import/large_files",
            "method": "GET",
            "params": {
                "$owner": null,
                "$name": null
            },
            "description": "List files larger than 100MB found during the import. (In preview period. See README.)"
        },
        "cancel-import": {
            "url": "/repos/:owner/:repo/import",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Cancel an import. (In preview period. See README.)"
        }
    },
    "misc": {
        "get-codes-of-conduct": {
            "url": "/codes_of_conduct",
            "method": "GET",
            "params": {},
            "description": "List all codes of conduct. (In preview period. See README.)"
        },
        "get-code-of-conduct": {
            "url": "/codes_of_conduct/:key",
            "method": "GET",
            "params": {
                "key": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Ex: contributor_covenant"
                }
            },
            "description": "Get an code of conduct. (In preview period. See README.)"
        },
        "get-repo-code-of-conduct": {
            "url": "/repos/:owner/:repo/community/code_of_conduct",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the contents of a repository's code of conduct. (In preview period. See README.)"
        },
        "get-emojis": {
            "url": "/emojis",
            "method": "GET",
            "params": {},
            "description": "Lists all the emojis available to use on GitHub."
        },
        "get-gitignore-templates": {
            "url": "/gitignore/templates",
            "method": "GET",
            "params": {},
            "description": "Lists available gitignore templates"
        },
        "get-gitignore-template": {
            "url": "/gitignore/templates/:name",
            "method": "GET",
            "params": {
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the .gitignore template to get e.g. 'C'"
                }
            },
            "description": "Get a single gitignore template"
        },
        "get-licenses": {
            "url": "/licenses",
            "method": "GET",
            "params": {},
            "description": "List all licenses. (In preview period. See README.)"
        },
        "get-license": {
            "url": "/licenses/:license",
            "method": "GET",
            "params": {
                "license": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Ex: /licenses/mit"
                }
            },
            "description": "Get an individual license. (In preview period. See README.)"
        },
        "get-repo-license": {
            "url": "/repos/:owner/:repo/license",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the contents of a repository's license. (In preview period. See README.)"
        },
        "render-markdown": {
            "url": "/markdown",
            "method": "POST",
            "params": {
                "text": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The Markdown text to render"
                },
                "mode": {
                    "type": "String",
                    "required": false,
                    "validation": "^(markdown|gfm)$",
                    "invalidmsg": "",
                    "description": "The rendering mode, `markdown` to render a document as plain Markdown, just like README files are rendered. `gfm` to render a document as user-content, e.g. like user comments or issues are rendered. In GFM mode, hard line breaks are always taken into account, and issue and user mentions are linked accordingly.",
                    "enum": [
                        "markdown",
                        "gfm"
                    ],
                    "default": "markdown"
                },
                "context": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The repository context. Only taken into account when rendering as `gfm`"
                }
            },
            "description": "Render an arbitrary Markdown document"
        },
        "render-markdown-raw": {
            "url": "/markdown/raw",
            "method": "POST",
            "requestFormat": "raw",
            "params": {
                "$data": null
            },
            "description": "Render a Markdown document in raw mode"
        },
        "get-meta": {
            "url": "/meta",
            "method": "GET",
            "params": {},
            "description": "This endpoint provides information about GitHub.com, the service. Or, if you access this endpoint on your organization's GitHub Enterprise installation, this endpoint provides information about that installation."
        },
        "get-rate-limit": {
            "url": "/rate_limit",
            "method": "GET",
            "params": {},
            "description": "Get your current rate limit status"
        }
    },
    "orgs": {
        "get-all": {
            "url": "/organizations",
            "method": "GET",
            "params": {
                "since": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The integer ID of the last Organization that you've seen."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List all organizations"
        },
        "get-for-user": {
            "url": "/users/:username/orgs",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public organization memberships for the specified user."
        },
        "get": {
            "url": "/orgs/:org",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get an organization"
        },
        "update": {
            "url": "/orgs/:org",
            "method": "PATCH",
            "params": {
                "$org": null,
                "billing_email": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Billing email address. This address is not publicized."
                },
                "company": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The company name."
                },
                "email": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The publicly visible email address."
                },
                "location": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The location."
                },
                "name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The shorthand name of the company."
                },
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The description of the company."
                },
                "default_repository_permission": {
                    "type": "String",
                    "required": false,
                    "validation": "^(read|write|admin|none)$",
                    "invalidmsg": "read, write, admin, none, default: read",
                    "description": "Default permission level members have for organization repositories.",
                    "enum": [
                        "read",
                        "write",
                        "admin",
                        "none"
                    ],
                    "default": "read"
                },
                "members_can_create_repositories": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Toggles ability of non-admin organization members to create repositories.",
                    "default": true
                }
            },
            "description": "Edit an organization"
        },
        "get-members": {
            "url": "/orgs/:org/members",
            "method": "GET",
            "params": {
                "$org": null,
                "filter": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|2fa_disabled)$",
                    "invalidmsg": "all, 2fa_disabled, default: all",
                    "description": "Filter members returned in the list.",
                    "enum": [
                        "all",
                        "2fa_disabled"
                    ],
                    "default": "all"
                },
                "role": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|admin|member)$",
                    "invalidmsg": "all, admin, member, default: all",
                    "description": "Filter members returned by their role.",
                    "enum": [
                        "all",
                        "admin",
                        "member"
                    ],
                    "default": "all"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "Members list"
        },
        "check-membership": {
            "url": "/orgs/:org/members/:username",
            "method": "GET",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Check membership"
        },
        "remove-member": {
            "url": "/orgs/:org/members/:username",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Remove a member"
        },
        "get-public-members": {
            "url": "/orgs/:org/public_members",
            "method": "GET",
            "params": {
                "$org": null
            },
            "description": "Public members list"
        },
        "check-public-membership": {
            "url": "/orgs/:org/public_members/:username",
            "method": "GET",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Check public membership"
        },
        "publicize-membership": {
            "url": "/orgs/:org/public_members/:username",
            "method": "PUT",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Publicize a user's membership"
        },
        "conceal-membership": {
            "url": "/orgs/:org/public_members/:username",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Conceal a user's membership"
        },
        "get-org-membership": {
            "url": "/orgs/:org/memberships/:username",
            "method": "GET",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Get organization membership"
        },
        "add-org-membership": {
            "url": "/orgs/:org/memberships/:username",
            "method": "PUT",
            "params": {
                "$org": null,
                "$username": null,
                "role": {
                    "type": "String",
                    "required": true,
                    "validation": "^(admin|member)$",
                    "invalidmsg": "admin, member",
                    "description": "The role to give the user in the organization.",
                    "enum": [
                        "admin",
                        "member"
                    ],
                    "default": "member"
                }
            },
            "description": "Add or update organization membership"
        },
        "remove-org-membership": {
            "url": "/orgs/:org/memberships/:username",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Remove organization membership"
        },
        "get-pending-org-invites": {
            "url": "/orgs/:org/invitations",
            "method": "GET",
            "params": {
                "$org": null
            },
            "description": "List pending organization invites."
        },
        "get-outside-collaborators": {
            "url": "/orgs/:org/outside_collaborators",
            "method": "GET",
            "params": {
                "$org": null,
                "filter": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|2fa_disabled)$",
                    "invalidmsg": "all, 2fa_disabled, default: all",
                    "description": "Filter the list of outside collaborators.",
                    "enum": [
                        "all",
                        "2fa_disabled"
                    ],
                    "default": "all"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List all users who are outside collaborators of an organization."
        },
        "remove-outside-collaborator": {
            "url": "/orgs/:org/outside_collaborators/:username",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Remove outside collaborator."
        },
        "convert-member-to-outside-collaborator": {
            "url": "/orgs/:org/outside_collaborators/:username",
            "method": "PUT",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Convert member to outside collaborator."
        },
        "get-teams": {
            "url": "/orgs/:org/teams",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List teams"
        },
        "get-team": {
            "url": "/teams/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get team"
        },
        "create-team": {
            "url": "/orgs/:org/teams",
            "method": "POST",
            "params": {
                "$org": null,
                "$name": null,
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The description of the team."
                },
                "maintainers": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The logins of organization members to add as maintainers of the team."
                },
                "repo_names": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The full name (e.g., \"organization-name/repository-name\") of repositories to add the team to."
                },
                "$privacy": null,
                "parent_team_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The ID of a team to set as the parent team."
                }
            },
            "description": "Create team"
        },
        "edit-team": {
            "url": "/teams/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "$name": null,
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The description of the team."
                },
                "$privacy": null,
                "parent_team_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The ID of a team to set as the parent team."
                }
            },
            "description": "Edit team"
        },
        "delete-team": {
            "url": "/teams/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete team"
        },
        "get-team-members": {
            "url": "/teams/:id/members",
            "method": "GET",
            "params": {
                "$id": null,
                "role": {
                    "type": "String",
                    "required": false,
                    "validation": "^(member|maintainer|all)$",
                    "invalidmsg": "member, maintainer, all, default: all",
                    "description": "Filters members returned by their role in the team.",
                    "enum": [
                        "member",
                        "maintainer",
                        "all"
                    ],
                    "default": "all"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List team members"
        },
        "get-child-teams": {
            "url": "/teams/:id/teams",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List child teams"
        },
        "get-team-membership": {
            "url": "/teams/:id/memberships/:username",
            "method": "GET",
            "params": {
                "$id": null,
                "$username": null
            },
            "description": "Get team membership"
        },
        "add-team-membership": {
            "url": "/teams/:id/memberships/:username",
            "method": "PUT",
            "params": {
                "$id": null,
                "$username": null,
                "role": {
                    "type": "String",
                    "required": false,
                    "validation": "^(member|maintainer)$",
                    "invalidmsg": "member, maintainer, default: member",
                    "description": "The role that this user should have in the team.",
                    "enum": [
                        "member",
                        "maintainer"
                    ],
                    "default": "member"
                }
            },
            "description": "Add team membership"
        },
        "remove-team-membership": {
            "url": "/teams/:id/memberships/:username",
            "method": "DELETE",
            "params": {
                "$id": null,
                "$username": null
            },
            "description": "Remove team membership"
        },
        "get-team-repos": {
            "url": "/teams/:id/repos",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get team repos"
        },
        "get-pending-team-invites": {
            "url": "/teams/:id/invitations",
            "method": "GET",
            "params": {
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List pending team invitations."
        },
        "check-team-repo": {
            "url": "/teams/:id/repos/:owner/:repo",
            "method": "GET",
            "params": {
                "$id": null,
                "$owner": null,
                "$repo": null
            },
            "description": "Check if a team manages a repository"
        },
        "add-team-repo": {
            "url": "/teams/:id/repos/:org/:repo",
            "method": "PUT",
            "params": {
                "$id": null,
                "$org": null,
                "$repo": null,
                "permission": {
                    "type": "String",
                    "required": false,
                    "validation": "^(pull|push|admin)$",
                    "invalidmsg": "",
                    "description": "`pull` - team members can pull, but not push or administer this repository, `push` - team members can pull and push, but not administer this repository, `admin` - team members can pull, push and administer this repository.",
                    "enum": [
                        "pull",
                        "push",
                        "admin"
                    ]
                }
            },
            "description": "Add team repository"
        },
        "delete-team-repo": {
            "url": "/teams/:id/repos/:owner/:repo",
            "method": "DELETE",
            "params": {
                "$id": null,
                "$owner": null,
                "$repo": null
            },
            "description": "Remove team repository"
        },
        "get-hooks": {
            "url": "/orgs/:org/hooks",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List hooks"
        },
        "get-hook": {
            "url": "/orgs/:org/hooks/:id",
            "method": "GET",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Get single hook"
        },
        "create-hook": {
            "url": "/orgs/:org/hooks",
            "method": "POST",
            "params": {
                "$org": null,
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Must be passed as \"web\"."
                },
                "config": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Key/value pairs to provide settings for this webhook"
                },
                "events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines what events the hook is triggered for. Default: [\"push\"].",
                    "default": "[\"push\"]"
                },
                "active": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines whether the hook is actually triggered on pushes."
                }
            },
            "description": "Create a hook"
        },
        "edit-hook": {
            "url": "/orgs/:org/hooks/:id",
            "method": "PATCH",
            "params": {
                "$org": null,
                "$id": null,
                "config": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Key/value pairs to provide settings for this webhook"
                },
                "events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines what events the hook is triggered for. Default: [\"push\"].",
                    "default": "[\"push\"]"
                },
                "active": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines whether the hook is actually triggered on pushes."
                }
            },
            "description": "Edit a hook"
        },
        "ping-hook": {
            "url": "/orgs/:org/hooks/:id/pings",
            "method": "POST",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Ping a hook"
        },
        "delete-hook": {
            "url": "/orgs/:org/hooks/:id",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$id": null
            },
            "description": "Delete a hook"
        },
        "get-blocked-users": {
            "url": "/orgs/:org/blocks",
            "method": "GET",
            "params": {
                "$org": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List blocked users. (In preview period. See README.)"
        },
        "check-blocked-user": {
            "url": "/orgs/:org/blocks/:username",
            "method": "GET",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Check whether you've blocked a user. (In preview period. See README.)"
        },
        "block-user": {
            "url": "/orgs/:org/blocks/:username",
            "method": "PUT",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Block a user. (In preview period. See README.)"
        },
        "unblock-user": {
            "url": "/orgs/:org/blocks/:username",
            "method": "DELETE",
            "params": {
                "$org": null,
                "$username": null
            },
            "description": "Unblock a user. (In preview period. See README.)"
        }
    },
    "projects": {
        "get-repo-projects": {
            "url": "/repos/:owner/:repo/projects",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$state": null
            },
            "description": "List repository projects. (In preview period. See README.)"
        },
        "get-org-projects": {
            "url": "/orgs/:org/projects",
            "method": "GET",
            "params": {
                "$org": null,
                "$state": null
            },
            "description": "List organization projects. (In preview period. See README.)"
        },
        "get-project": {
            "url": "/projects/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a project. (In preview period. See README.)"
        },
        "create-repo-project": {
            "url": "/repos/:owner/:repo/projects",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null,
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create a repository project. (In preview period. See README.)"
        },
        "create-org-project": {
            "url": "/orgs/:org/projects",
            "method": "POST",
            "params": {
                "$org": null,
                "$name": null,
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create an organization project. (In preview period. See README.)"
        },
        "update-project": {
            "url": "/projects/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "$name": null,
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "$state": null
            },
            "description": "Update a project. (In preview period. See README.)"
        },
        "delete-project": {
            "url": "/projects/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a project. (In preview period. See README.)"
        },
        "get-project-cards": {
            "url": "/projects/columns/:column_id/cards",
            "method": "GET",
            "params": {
                "$column_id": null
            },
            "description": "List project cards. (In preview period. See README.)"
        },
        "get-project-card": {
            "url": "/projects/columns/cards/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get project card. (In preview period. See README.)"
        },
        "create-project-card": {
            "url": "/projects/columns/:column_id/cards",
            "method": "POST",
            "params": {
                "$column_id": null,
                "note": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The note of the card."
                },
                "content_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The id of the Issue or Pull Request to associate with this card."
                },
                "content_type": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The type of content to associate with this card. Can be either 'Issue' or 'PullRequest'."
                }
            },
            "description": "Create a project card. (In preview period. See README.)"
        },
        "update-project-card": {
            "url": "/projects/columns/cards/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "note": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The note of the card."
                }
            },
            "description": "Update a project card. (In preview period. See README.)"
        },
        "delete-project-card": {
            "url": "/projects/columns/cards/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a project card. (In preview period. See README.)"
        },
        "move-project-card": {
            "url": "/projects/columns/cards/:id/moves",
            "method": "POST",
            "params": {
                "$id": null,
                "position": {
                    "type": "String",
                    "required": true,
                    "validation": "^(top|bottom|after:\\d+)$",
                    "invalidmsg": "",
                    "description": "Can be one of top, bottom, or after:<card-id>, where <card-id> is the id value of a card in the same project."
                },
                "column_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The id value of a column in the same project."
                }
            },
            "description": "Move a project card. (In preview period. See README.)"
        },
        "get-project-columns": {
            "url": "/projects/:project_id/columns",
            "method": "GET",
            "params": {
                "$project_id": null
            },
            "description": "List project columns. (In preview period. See README.)"
        },
        "get-project-column": {
            "url": "/projects/columns/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a project column. (In preview period. See README.)"
        },
        "create-project-column": {
            "url": "/projects/:project_id/columns",
            "method": "POST",
            "params": {
                "$project_id": null,
                "$name": null
            },
            "description": "Create a project column. (In preview period. See README.)"
        },
        "update-project-column": {
            "url": "/projects/columns/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "$name": null
            },
            "description": "Update a project column. (In preview period. See README.)"
        },
        "delete-project-column": {
            "url": "/projects/columns/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a project column. (In preview period. See README.)"
        },
        "move-project-column": {
            "url": "/projects/columns/:id/moves",
            "method": "POST",
            "params": {
                "$id": null,
                "position": {
                    "type": "String",
                    "required": true,
                    "validation": "^(first|last|after:\\d+)$",
                    "invalidmsg": "",
                    "description": "Can be one of first, last, or after:<column-id>, where <column-id> is the id value of a column in the same project."
                }
            },
            "description": "Move a project column. (In preview period. See README.)"
        }
    },
    "pull-requests": {
        "get-all": {
            "url": "/repos/:owner/:repo/pulls",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$state": null,
                "head": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Filter pulls by head user and branch name in the format of user:ref-name. Example: github:new-script-format."
                },
                "base": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Filter pulls by base branch name. Example: gh-pages."
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|popularity|long-running)$",
                    "invalidmsg": "Possible values are: `created`, `updated`, `popularity`, `long-running`, Default: `created`",
                    "description": "Possible values are: `created`, `updated`, `popularity`, `long-running`, Default: `created`",
                    "enum": [
                        "created",
                        "updated",
                        "popularity",
                        "long-running"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List pull requests"
        },
        "get": {
            "url": "/repos/:owner/:repo/pulls/:number",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null
            },
            "description": "Get a single pull request"
        },
        "create": {
            "url": "/repos/:owner/:repo/pulls",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "title": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The title of the pull request."
                },
                "$head": null,
                "$base": null,
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The contents of the pull request."
                },
                "maintainer_can_modify": {
                    "type": "Boolean",
                    "required": false,
                    "default": "true",
                    "description": "Indicates whether maintainers can modify the pull request."
                }
            },
            "description": "Create a pull request"
        },
        "create-from-issue": {
            "url": "/repos/:owner/:repo/pulls",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "issue": {
                    "type": "Number",
                    "required": true,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": "The issue number in this repository to turn into a Pull Request."
                },
                "$head": null,
                "$base": null
            },
            "description": "Create a pull request from an existing issue"
        },
        "update": {
            "url": "/repos/:owner/:repo/pulls/:number",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "title": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The title of the pull request."
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The contents of the pull request."
                },
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(open|closed)$",
                    "invalidmsg": "open, closed",
                    "description": "open or closed",
                    "enum": [
                        "open",
                        "closed"
                    ]
                },
                "base": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The branch (or git ref) you want your changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repo that requests a merge to a base of another repo."
                },
                "maintainer_can_modify": {
                    "type": "Boolean",
                    "required": false,
                    "default": "true",
                    "description": "Indicates whether maintainers can modify the pull request."
                }
            },
            "description": "Update a pull request"
        },
        "get-commits": {
            "url": "/repos/:owner/:repo/pulls/:number/commits",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List commits on a pull request"
        },
        "get-files": {
            "url": "/repos/:owner/:repo/pulls/:number/files",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List pull requests files"
        },
        "check-merged": {
            "url": "/repos/:owner/:repo/pulls/:number/merge",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get if a pull request has been merged"
        },
        "merge": {
            "url": "/repos/:owner/:repo/pulls/:number/merge",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "commit_title": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Title for the automatic commit message. (In preview period. See README.)"
                },
                "commit_message": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Extra detail to append to automatic commit message."
                },
                "sha": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "SHA that pull request head must match to allow merge"
                },
                "merge_method": {
                    "type": "String",
                    "required": false,
                    "validation": "^(merge|squash|rebase)$",
                    "invalidmsg": "Possible values are: `merge`, `squash`, `rebase` Default: `merge`",
                    "description": "Merge method to use. Possible values are `merge`, `squash`, or `rebase`. (In preview period. See README.)",
                    "enum": [
                        "merge",
                        "squash",
                        "rebase"
                    ],
                    "default": "merge"
                }
            },
            "description": "Merge a pull request (Merge Button)"
        },
        "get-reviews": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List reviews on a pull request."
        },
        "get-review": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$id": null
            },
            "description": "Get a single pull request review."
        },
        "delete-pending-review": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$id": null
            },
            "description": "Delete a pending pull request review."
        },
        "get-review-comments": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews/:id/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get comments for a pull request review."
        },
        "create-review": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "commit_id": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "Sha of the commit to comment on.",
                    "description": "Sha of the commit to comment on."
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The body text of the pull request review."
                },
                "event": {
                    "type": "String",
                    "required": false,
                    "validation": "^(APPROVE|REQUEST_CHANGES|COMMENT|PENDING)$",
                    "invalidmsg": "Possible values are: `APPROVE`, `REQUEST_CHANGES`, `COMMENT`, `PENDING`. Default: `PENDING`",
                    "description": "The event to perform on the review upon submission, can be one of APPROVE, REQUEST_CHANGES, or COMMENT. If left blank, the review will be in the PENDING state.",
                    "enum": [
                        "APPROVE",
                        "REQUEST_CHANGES",
                        "COMMENT",
                        "PENDING"
                    ],
                    "default": "PENDING"
                },
                "comments": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of draft review comment objects. Draft review comments must include a `path`, `position`, and `body`."
                }
            },
            "description": "Create a pull request review."
        },
        "submit-review": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews/:id/events",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$id": null,
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The body text of the pull request review."
                },
                "event": {
                    "type": "String",
                    "required": false,
                    "validation": "^(APPROVE|REQUEST_CHANGES|COMMENT|PENDING)$",
                    "invalidmsg": "Possible values are: `APPROVE`, `REQUEST_CHANGES`, `COMMENT`, `PENDING`. Default: `PENDING`",
                    "description": "The event to perform on the review upon submission, can be one of APPROVE, REQUEST_CHANGES, or COMMENT. If left blank, the review will be in the PENDING state.",
                    "enum": [
                        "APPROVE",
                        "REQUEST_CHANGES",
                        "COMMENT",
                        "PENDING"
                    ],
                    "default": "PENDING"
                }
            },
            "description": "Submit a pull request review."
        },
        "dismiss-review": {
            "url": "/repos/:owner/:repo/pulls/:number/reviews/:id/dismissals",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$id": null,
                "message": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The message for the pull request review dismissal."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "Dismiss a pull request review."
        },
        "get-comments": {
            "url": "/repos/:owner/:repo/pulls/:number/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List comments on a pull request"
        },
        "get-comments-for-repo": {
            "url": "/repos/:owner/:repo/pulls/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated)$",
                    "invalidmsg": "Possible values are: `created`, `updated`, Default: `created`",
                    "description": "Possible values are: `created`, `updated`, Default: `created`",
                    "enum": [
                        "created",
                        "updated"
                    ],
                    "default": "created"
                },
                "$direction": null,
                "$since": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List comments in a repository"
        },
        "get-comment": {
            "url": "/repos/:owner/:repo/pulls/comments/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single comment"
        },
        "create-comment": {
            "url": "/repos/:owner/:repo/pulls/:number/comments",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$body": null,
                "$commit_id": null,
                "$path": null,
                "$position": null
            },
            "description": "Create a comment"
        },
        "create-comment-reply": {
            "url": "/repos/:owner/:repo/pulls/:number/comments",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$body": null,
                "in_reply_to": {
                    "type": "Number",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The comment id to reply to."
                }
            },
            "description": "Reply to existing pull request comment"
        },
        "edit-comment": {
            "url": "/repos/:owner/:repo/pulls/comments/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "$body": null
            },
            "description": "Edit a comment"
        },
        "delete-comment": {
            "url": "/repos/:owner/:repo/pulls/comments/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a comment"
        },
        "get-review-requests": {
            "url": "/repos/:owner/:repo/pulls/:number/requested_reviewers",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List review requests. (In preview period. See README.)"
        },
        "create-review-request": {
            "url": "/repos/:owner/:repo/pulls/:number/requested_reviewers",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "reviewers": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of user logins that will be requested."
                },
                "team_reviewers": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs that will be requested."
                }
            },
            "description": "Create a review request. (In preview period. See README.)"
        },
        "delete-review-request": {
            "url": "/repos/:owner/:repo/pulls/:number/requested_reviewers",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "reviewers": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of user logins that will be requested."
                },
                "team_reviewers": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs that will be requested."
                }
            },
            "description": "Delete a review request. (In preview period. See README.)"
        }
    },
    "reactions": {
        "get-for-commit-comment": {
            "url": "/repos/:owner/:repo/comments/:id/reactions",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": false,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "Indicates which type of reaction to return.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "List reactions for a commit comment. (In preview period. See README.)"
        },
        "create-for-commit-comment": {
            "url": "/repos/:owner/:repo/comments/:id/reactions",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "The reaction type.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "Create reaction for a commit comment. (In preview period. See README.)"
        },
        "get-for-issue": {
            "url": "/repos/:owner/:repo/issues/:number/reactions",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "content": {
                    "type": "String",
                    "required": false,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "Indicates which type of reaction to return.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "List reactions for an issue. (In preview period. See README.)"
        },
        "create-for-issue": {
            "url": "/repos/:owner/:repo/issues/:number/reactions",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$number": null,
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "The reaction type.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "Create reaction for an issue. (In preview period. See README.)"
        },
        "get-for-issue-comment": {
            "url": "/repos/:owner/:repo/issues/comments/:id/reactions",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": false,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "Indicates which type of reaction to return.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "List reactions for an issue comment. (In preview period. See README.)"
        },
        "create-for-issue-comment": {
            "url": "/repos/:owner/:repo/issues/comments/:id/reactions",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "The reaction type.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "Create reaction for an issue comment. (In preview period. See README.)"
        },
        "get-for-pull-request-review-comment": {
            "url": "/repos/:owner/:repo/pulls/comments/:id/reactions",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": false,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "Indicates which type of reaction to return.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "List reactions for a pull request review comment. (In preview period. See README.)"
        },
        "create-for-pull-request-review-comment": {
            "url": "/repos/:owner/:repo/pulls/comments/:id/reactions",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "^(\\+1|-1|laugh|confused|heart|hooray)$",
                    "invalidmsg": "Possible values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`.",
                    "description": "The reaction type.",
                    "enum": [
                        "+1",
                        "-1",
                        "laugh",
                        "confused",
                        "heart",
                        "hooray"
                    ]
                }
            },
            "description": "Create reaction for a pull request review comment. (In preview period. See README.)"
        },
        "delete": {
            "url": "/reactions/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a reaction. (In preview period. See README.)"
        }
    },
    "repos": {
        "get-all": {
            "url": "/user/repos",
            "method": "GET",
            "params": {
                "visibility": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|public|private)$",
                    "invalidmsg": "Possible values: `all`, `public`, `private`, Default: `all`.",
                    "description": "Can be one of `all`, `public`, or `private`. Default: `all`.",
                    "enum": [
                        "all",
                        "public",
                        "private"
                    ],
                    "default": "all"
                },
                "affiliation": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "Possible values: `owner`, `collaborator`, `organization_member`, Default: `owner,collaborator,organization_member`.",
                    "description": "Comma-separated list of values. Can include: `owner`, `collaborator`, `organization_member`.",
                    "default": "owner,collaborator,organization_member"
                },
                "type": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|owner|public|private|member)$",
                    "invalidmsg": "Possible values: `all`, `owner`, `public`, `private`, `member`. Default: `all`.",
                    "description": "Possible values: `all`, `owner`, `public`, `private`, `member`. Default: `all`.",
                    "enum": [
                        "all",
                        "owner",
                        "public",
                        "private",
                        "member"
                    ],
                    "default": "all"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|pushed|full_name)$",
                    "invalidmsg": "Possible values: `created`, `updated`, `pushed`, `full_name`. Default: `full_name`.",
                    "description": "Possible values: `created`, `updated`, `pushed`, `full_name`. Default: `full_name`.",
                    "enum": [
                        "created",
                        "updated",
                        "pushed",
                        "full_name"
                    ],
                    "default": "full_name"
                },
                "$direction": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List your repositories"
        },
        "get-for-user": {
            "url": "/users/:username/repos",
            "method": "GET",
            "params": {
                "$username": null,
                "type": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|owner|member)$",
                    "invalidmsg": "Possible values: `all`, `owner`, `member`. Default: `owner`.",
                    "description": "Possible values: `all`, `owner`, `member`. Default: `owner`.",
                    "enum": [
                        "all",
                        "owner",
                        "member"
                    ],
                    "default": "owner"
                },
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(created|updated|pushed|full_name)$",
                    "invalidmsg": "Possible values: `created`, `updated`, `pushed`, `full_name`. Default: `full_name`.",
                    "description": "Possible values: `created`, `updated`, `pushed`, `full_name`. Default: `full_name`.",
                    "enum": [
                        "created",
                        "updated",
                        "pushed",
                        "full_name"
                    ],
                    "default": "full_name"
                },
                "$direction": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public repositories for the specified user."
        },
        "get-for-org": {
            "url": "/orgs/:org/repos",
            "method": "GET",
            "params": {
                "$org": null,
                "type": {
                    "type": "String",
                    "required": false,
                    "validation": "^(all|public|private|forks|sources|member)$",
                    "invalidmsg": "Possible values: `all`, `public`, `private`, `forks`, `sources`, `member`. Default: `all`.",
                    "description": "Possible values: `all`, `public`, `private`, `forks`, `sources`, `member`. Default: `all`.",
                    "enum": [
                        "all",
                        "public",
                        "private",
                        "forks",
                        "sources",
                        "member"
                    ],
                    "default": "all"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories for the specified org."
        },
        "get-public": {
            "url": "/repositories",
            "method": "GET",
            "params": {
                "since": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The integer ID of the last Repository that you've seen."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List all public repositories"
        },
        "create": {
            "url": "/user/repos",
            "method": "POST",
            "params": {
                "$name": null,
                "$description": null,
                "$homepage": null,
                "$private": null,
                "$has_issues": null,
                "$has_projects": null,
                "$has_wiki": null,
                "team_id": {
                    "type": "Number",
                    "required": false,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": "The id of the team that will be granted access to this repository. This is only valid when creating a repository in an organization."
                },
                "$auto_init": null,
                "$gitignore_template": null,
                "$license_template": null,
                "allow_squash_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow squash-merging pull requests, or false to prevent squash-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_merge_commit": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow merging pull requests with a merge commit, or false to prevent merging pull requests with merge commits. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_rebase_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow rebase-merging pull requests, or false to prevent rebase-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                }
            },
            "description": "Create a new repository for the authenticated user."
        },
        "create-for-org": {
            "url": "/orgs/:org/repos",
            "method": "POST",
            "params": {
                "$org": null,
                "$name": null,
                "$description": null,
                "$homepage": null,
                "$private": null,
                "$has_issues": null,
                "$has_projects": null,
                "$has_wiki": null,
                "team_id": {
                    "type": "Number",
                    "required": false,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": "The id of the team that will be granted access to this repository. This is only valid when creating a repository in an organization."
                },
                "$auto_init": null,
                "$gitignore_template": null,
                "$license_template": null,
                "allow_squash_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow squash-merging pull requests, or false to prevent squash-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_merge_commit": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow merging pull requests with a merge commit, or false to prevent merging pull requests with merge commits. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_rebase_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow rebase-merging pull requests, or false to prevent rebase-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                }
            },
            "description": "Create a new repository for an organization."
        },
        "get": {
            "url": "/repos/:owner/:repo",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get a repo for a user."
        },
        "get-by-id": {
            "url": "/repositories/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single repo by id."
        },
        "edit": {
            "url": "/repos/:owner/:repo",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null,
                "$description": null,
                "$homepage": null,
                "$private": null,
                "$has_issues": null,
                "$has_projects": null,
                "$has_wiki": null,
                "$default_branch": null,
                "allow_squash_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow squash-merging pull requests, or false to prevent squash-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_merge_commit": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow merging pull requests with a merge commit, or false to prevent merging pull requests with merge commits. Default: true. (In preview period. See README.)",
                    "default": "true"
                },
                "allow_rebase_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Either true to allow rebase-merging pull requests, or false to prevent rebase-merging. Default: true. (In preview period. See README.)",
                    "default": "true"
                }
            },
            "description": "Update a repo."
        },
        "get-topics": {
            "url": "/repos/:owner/:repo/topics",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List all topics for a repository. (In preview period. See README.)"
        },
        "replace-topics": {
            "url": "/repos/:owner/:repo/topics",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "names": {
                    "type": "Array",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of topics to add to the repository. Pass one or more topics to replace the set of existing topics. Send an empty array ([]) to clear all topics from the repository."
                }
            },
            "description": "Replace all topics for a repository. (In preview period. See README.)"
        },
        "get-contributors": {
            "url": "/repos/:owner/:repo/contributors",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "anon": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Set to 1 or true to include anonymous contributors in results."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "Get contributors for the specified repository."
        },
        "get-languages": {
            "url": "/repos/:owner/:repo/languages",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get languages for the specified repository."
        },
        "get-teams": {
            "url": "/repos/:owner/:repo/teams",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get teams for the specified repository."
        },
        "get-tags": {
            "url": "/repos/:owner/:repo/tags",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get tags for the specified repository."
        },
        "delete": {
            "url": "/repos/:owner/:repo",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Delete a repository."
        },
        "get-branches": {
            "url": "/repos/:owner/:repo/branches",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "protected": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Set to true to only return protected branches"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List branches."
        },
        "get-branch": {
            "url": "/repos/:owner/:repo/branches/:branch",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get branch."
        },
        "get-branch-protection": {
            "url": "/repos/:owner/:repo/branches/:branch/protection",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get branch protection."
        },
        "update-branch-protection": {
            "url": "/repos/:owner/:repo/branches/:branch/protection",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "required_status_checks": {
                    "type": "Json",
                    "required": true,
                    "allow-null": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `include_admins` - Enforce required status checks for repository administrators, `strict` - Require branches to be up to date before merging, `contexts` - The list of status checks to require in order to merge into this branch. This object can have the value of `null` for disabled."
                },
                "required_pull_request_reviews": {
                    "type": "Json",
                    "required": true,
                    "allow-null": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `include_admins` - Enforce required status checks for repository administrators."
                },
                "dismissal_restrictions": {
                    "type": "Json",
                    "required": false,
                    "allow-null": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `users` - The list of user logins with dismissal access, `teams` - The list of team slugs with dismissal access. This object can have the value of `null` for disabled."
                },
                "restrictions": {
                    "type": "Json",
                    "required": true,
                    "allow-null": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `users` - The list of user logins with push access, `teams` - The list of team slugs with push access. This object can have the value of `null` for disabled."
                },
                "enforce_admins": {
                    "type": "Boolean",
                    "required": true,
                    "allow-null": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Enforces required status checks for repository administrators."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "Update branch protection."
        },
        "remove-branch-protection": {
            "url": "/repos/:owner/:repo/branches/:branch/protection",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Remove branch protection."
        },
        "get-protected-branch-required-status-checks": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get required status checks of protected branch."
        },
        "update-protected-branch-required-status-checks": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "strict": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Require branches to be up to date before merging."
                },
                "contexts": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The list of status checks to require in order to merge into this branch."
                }
            },
            "description": "Update required status checks of protected branch."
        },
        "remove-protected-branch-required-status-checks": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null
            },
            "description": "Remove required status checks of protected branch."
        },
        "get-protected-branch-required-status-checks-contexts": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks/contexts",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List required status checks contexts of protected branch."
        },
        "replace-protected-branch-required-status-checks-contexts": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks/contexts",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "contexts": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of protected branch required status checks contexts (e.g. continuous-integration/jenkins)."
                }
            },
            "description": "Replace required status checks contexts of protected branch."
        },
        "add-protected-branch-required-status-checks-contexts": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks/contexts",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "contexts": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of protected branch required status checks contexts (e.g. continuous-integration/jenkins)."
                }
            },
            "description": "Add required status checks contexts of protected branch."
        },
        "remove-protected-branch-required-status-checks-contexts": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_status_checks/contexts",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "contexts": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of protected branch required status checks contexts (e.g. continuous-integration/jenkins)."
                }
            },
            "description": "Remove required status checks contexts of protected branch."
        },
        "get-protected-branch-pull-request-review-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_pull_request_reviews",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get pull request review enforcement of protected branch."
        },
        "update-protected-branch-pull-request-review-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_pull_request_reviews",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "dismissal_restrictions": {
                    "type": "Json",
                    "required": false,
                    "allow-null": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains the following keys: `users` - The list of user logins with dismissal access, `teams` - The list of team slugs with dismissal access. This object can have the value of `null` for disabled."
                },
                "dismiss_stale_reviews": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Dismiss approved reviews automatically when a new commit is pushed."
                },
                "require_code_owner_reviews": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Blocks merge until code owners have reviewed."
                }
            },
            "description": "Update pull request review enforcement of protected branch."
        },
        "remove-protected-branch-pull-request-review-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_pull_request_reviews",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null
            },
            "description": "Remove pull request review enforcement of protected branch."
        },
        "remove-protected-branch-pull-request-review-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/required_pull_request_reviews",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null
            },
            "description": "Remove pull request review enforcement of protected branch."
        },
        "get-protected-branch-admin-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/enforce_admins",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get admin enforcement of protected branch."
        },
        "add-protected-branch-admin-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/enforce_admins",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Add admin enforcement of protected branch."
        },
        "remove-protected-branch-admin-enforcement": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/enforce_admins",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Remove admin enforcement of protected branch."
        },
        "get-protected-branch-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get restrictions of protected branch."
        },
        "remove-protected-branch-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null
            },
            "description": "Remove restrictions of protected branch."
        },
        "get-protected-branch-team-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/teams",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List team restrictions of protected branch."
        },
        "replace-protected-branch-team-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/teams",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "teams": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Replace team restrictions of protected branch."
        },
        "add-protected-branch-team-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/teams",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "teams": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Add team restrictions of protected branch."
        },
        "remove-protected-branch-team-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/teams",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "teams": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Remove team restrictions of protected branch."
        },
        "get-protected-branch-user-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/users",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List user restrictions of protected branch."
        },
        "replace-protected-branch-user-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/users",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "users": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Replace user restrictions of protected branch."
        },
        "add-protected-branch-user-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/users",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "users": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Add user restrictions of protected branch."
        },
        "remove-protected-branch-user-restrictions": {
            "url": "/repos/:owner/:repo/branches/:branch/protection/restrictions/users",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$branch": null,
                "users": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An array of team slugs (e.g. justice-league)."
                }
            },
            "description": "Remove user restrictions of protected branch."
        },
        "get-collaborators": {
            "url": "/repos/:owner/:repo/collaborators",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "affiliation": {
                    "type": "String",
                    "required": false,
                    "validation": "^(outside|all|direct)$",
                    "invalidmsg": "outside, all, direct, default: all",
                    "description": "Filter collaborators returned by their affiliation.",
                    "enum": [
                        "outside",
                        "all",
                        "direct"
                    ],
                    "default": "all"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List collaborators"
        },
        "check-collaborator": {
            "url": "/repos/:owner/:repo/collaborators/:username",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$username": null
            },
            "description": "Check if user is a collaborator."
        },
        "review-user-permission-level": {
            "url": "/repos/:owner/:repo/collaborators/:username/permission",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$username": null
            },
            "description": "Review a user's permission level."
        },
        "add-collaborator": {
            "url": "/repos/:owner/:repo/collaborators/:username",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "$username": null,
                "permission": {
                    "type": "String",
                    "required": false,
                    "validation": "^(pull|push|admin)$",
                    "invalidmsg": "",
                    "description": "`pull` - can pull, but not push to or administer this repository, `push` - can pull and push, but not administer this repository, `admin` - can pull, push and administer this repository.",
                    "enum": [
                        "pull",
                        "push",
                        "admin"
                    ],
                    "default": "push"
                }
            },
            "description": "Add user as a collaborator"
        },
        "remove-collaborator": {
            "url": "/repos/:owner/:repo/collaborators/:username",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$username": null
            },
            "description": "Remove user as a collaborator."
        },
        "get-all-commit-comments": {
            "url": "/repos/:owner/:repo/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List commit comments for a repository."
        },
        "get-commit-comments": {
            "url": "/repos/:owner/:repo/commits/:ref/comments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List comments for a single commit."
        },
        "create-commit-comment": {
            "url": "/repos/:owner/:repo/commits/:sha/comments",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null,
                "$body": null,
                "path": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Relative path of the file to comment on."
                },
                "position": {
                    "type": "Number",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Line index in the diff to comment on."
                }
            },
            "description": "Create a commit comment."
        },
        "get-commit-comment": {
            "url": "/repos/:owner/:repo/comments/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single commit comment."
        },
        "update-commit-comment": {
            "url": "/repos/:owner/:repo/comments/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "$body": null
            },
            "description": "Update a commit comment."
        },
        "delete-commit-comment": {
            "url": "/repos/:owner/:repo/comments/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a commit comment."
        },
        "get-community-profile-metrics": {
            "url": "/repos/:owner/:name/community/profile",
            "method": "GET",
            "params": {
                "$owner": null,
                "$name": null
            },
            "description": "Retrieve community profile metrics."
        },
        "get-commits": {
            "url": "/repos/:owner/:repo/commits",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "sha": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Sha or branch to start listing commits from."
                },
                "path": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Only commits containing this file path will be returned."
                },
                "author": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "GitHub login or email address by which to filter by commit author."
                },
                "$since": null,
                "$until": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List commits on a repository."
        },
        "get-commit": {
            "url": "/repos/:owner/:repo/commits/:sha",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null
            },
            "description": "Get a single commit."
        },
        "get-sha-of-commit-ref": {
            "url": "/repos/:owner/:repo/commits/:ref",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$ref": null
            },
            "description": "Get the SHA-1 of a commit reference."
        },
        "compare-commits": {
            "url": "/repos/:owner/:repo/compare/:base...:head",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$base": null,
                "$head": null
            },
            "description": "Compare two commits."
        },
        "get-readme": {
            "url": "/repos/:owner/:repo/readme",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the commit/branch/tag. Default: the repository’s default branch (usually master)"
                }
            },
            "description": "Get the README for the given repository."
        },
        "get-content": {
            "url": "/repos/:owner/:repo/contents/:path",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "path": {
                    "type": "String",
                    "required": true,
                    "allow-empty": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The content path."
                },
                "ref": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The String name of the Commit/Branch/Tag. Defaults to master."
                }
            },
            "description": "Get the contents of a file or directory in a repository."
        },
        "create-file": {
            "url": "/repos/:owner/:repo/contents/:path",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "path": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The content path."
                },
                "message": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The commit message."
                },
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new file content, Base64 encoded."
                },
                "branch": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The branch name. If not provided, uses the repository’s default branch (usually master)."
                },
                "committer": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "author": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Create a new file in the given repository."
        },
        "update-file": {
            "url": "/repos/:owner/:repo/contents/:path",
            "method": "PUT",
            "params": {
                "$owner": null,
                "$repo": null,
                "path": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The content path."
                },
                "message": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The commit message."
                },
                "content": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The updated file content, Base64 encoded."
                },
                "sha": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The blob SHA of the file being replaced."
                },
                "branch": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The branch name. If not provided, uses the repository’s default branch (usually master)."
                },
                "committer": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "author": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Update a file."
        },
        "delete-file": {
            "url": "/repos/:owner/:repo/contents/:path",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "path": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The content path."
                },
                "message": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The commit message."
                },
                "sha": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The blob SHA of the file being removed."
                },
                "branch": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The branch name. If not provided, uses the repository’s default branch (usually master)."
                },
                "committer": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "author": {
                    "type": "Json",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Delete a file."
        },
        "get-archive-link": {
            "url": "/repos/:owner/:repo/:archive_format/:ref",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "archive_format": {
                    "type": "String",
                    "required": true,
                    "validation": "^(tarball|zipball)$",
                    "invalidmsg": "Either tarball or zipball, Default: tarball.",
                    "description": "Either tarball or zipball, Deafult: tarball.",
                    "enum": [
                        "tarball",
                        "zipball"
                    ],
                    "default": "tarball"
                },
                "ref": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A valid Git reference. Default: the repository’s default branch (usually master)."
                }
            },
            "description": "Get archive link."
        },
        "get-deploy-keys": {
            "url": "/repos/:owner/:repo/keys",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List deploy keys."
        },
        "get-deploy-key": {
            "url": "/repos/:owner/:repo/keys/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a deploy key."
        },
        "add-deploy-key": {
            "url": "/repos/:owner/:repo/keys",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$title": null,
                "$key": null,
                "read_only": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "If true, the key will only be able to read repository contents. Otherwise, the key will be able to read and write."
                }
            },
            "description": "Add a new deploy key."
        },
        "delete-deploy-key": {
            "url": "/repos/:owner/:repo/keys/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Remove a deploy key."
        },
        "get-deployments": {
            "url": "/repos/:owner/:repo/deployments",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "sha": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The short or long sha that was recorded at creation time. Default: none.",
                    "default": "none"
                },
                "ref": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the ref. This can be a branch, tag, or sha. Default: none.",
                    "default": "none"
                },
                "task": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the task for the deployment. e.g. deploy or deploy:migrations. Default: none.",
                    "default": "none"
                },
                "environment": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the environment that was deployed to. e.g. staging or production. Default: none.",
                    "default": "none"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List deployments."
        },
        "get-deployment": {
            "url": "/repos/:owner/:repo/deployments/:deployment_id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "deployment_id": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The deployment id."
                }
            },
            "description": "Get a single Deployment. (In preview period. See README.)"
        },
        "create-deployment": {
            "url": "/repos/:owner/:repo/deployments",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The ref to deploy. This can be a branch, tag, or sha."
                },
                "task": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The named task to execute. e.g. deploy or deploy:migrations. Default: deploy",
                    "default": "deploy"
                },
                "auto_merge": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Optional parameter to merge the default branch into the requested ref if it is behind the default branch. Default: true",
                    "default": "true"
                },
                "required_contexts": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Optional array of status contexts verified against commit status checks. If this parameter is omitted from the parameters then all unique contexts will be verified before a deployment is created. To bypass checking entirely pass an empty array. Defaults to all unique contexts."
                },
                "payload": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Optional JSON payload with extra information about the deployment. Default: \"\"",
                    "default": "\"\""
                },
                "environment": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the environment that was deployed to. e.g. staging or production. Default: none.",
                    "default": "none"
                },
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Optional short description. Default: \"\"",
                    "default": "\"\""
                },
                "transient_environment": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Specifies if the given environment is specific to the deployment and will no longer exist at some point in the future. Default: false. (In preview period. See README.)",
                    "default": false
                },
                "production_environment": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Specifies if the given environment is a one that end-users directly interact with. Default: true when environment is `production` and false otherwise. (In preview period. See README.)"
                }
            },
            "description": "Create a deployment. (In preview period. See README.)"
        },
        "get-deployment-statuses": {
            "url": "/repos/:owner/:repo/deployments/:id/statuses",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "List deployment statuses. (In preview period. See README.)"
        },
        "get-deployment-status": {
            "url": "/repos/:owner/:repo/deployments/:id/statuses/:status_id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "id": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The Deployment ID to list the statuses from."
                },
                "status_id": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The Deployment Status ID."
                }
            },
            "description": "List deployment statuses. (In preview period. See README.)"
        },
        "create-deployment-status": {
            "url": "/repos/:owner/:repo/deployments/:id/statuses",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The state of the status. Can be one of pending, success, error, or failure."
                },
                "target_url": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The target URL to associate with this status. This URL should contain output to keep the user updated while the task is running or serve as historical information for what happened in the deployment. Default: \"\"",
                    "default": "\"\""
                },
                "log_url": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Functionally equivalent to target_url. Default: \"\". (In preview period. See README.)",
                    "default": "\"\""
                },
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A short description of the status. Default: \"\"",
                    "default": "\"\""
                },
                "environment_url": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "URL for accessing the deployment environment. Default: \"\". (In preview period. See README.)",
                    "default": "\"\""
                },
                "auto_inactive": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "When true the new `inactive` status is added to all other non-transient, non-production environment deployments with the same repository and environment name as the created status's deployment. Default: true. (In preview period. See README.)",
                    "default": true
                }
            },
            "description": "Create a deployment status. (In preview period. See README.)"
        },
        "get-downloads": {
            "url": "/repos/:owner/:repo/downloads",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List downloads for a repository."
        },
        "get-download": {
            "url": "/repos/:owner/:repo/downloads/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single download."
        },
        "delete-download": {
            "url": "/repos/:owner/:repo/downloads/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a download."
        },
        "get-forks": {
            "url": "/repos/:owner/:repo/forks",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(newest|oldest|stargazers)$",
                    "invalidmsg": "Possible values: `newest`, `oldest`, `stargazers`, default: `newest`.",
                    "description": "Possible values: `newest`, `oldest`, `stargazers`, default: `newest`.",
                    "enum": [
                        "newest",
                        "oldest",
                        "stargazers"
                    ],
                    "default": "newest"
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List forks."
        },
        "fork": {
            "url": "/repos/:owner/:repo/forks",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "organization": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Optional parameter to specify the organization name if forking into an organization."
                }
            },
            "description": "Create a fork."
        },
        "get-invites": {
            "url": "/repos/:owner/:repo/invitations",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "List invitations for a repository."
        },
        "delete-invite": {
            "url": "/repos/:owner/:repo/invitations/:invitation_id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$invitation_id": null
            },
            "description": "Delete a repository invitation."
        },
        "update-invite": {
            "url": "/repos/:owner/:repo/invitations/:invitation_id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$invitation_id": null,
                "permissions": {
                    "type": "String",
                    "required": false,
                    "validation": "^(read|write|admin)$",
                    "invalidmsg": "Read, write, or admin.",
                    "description": "The permissions that the associated user will have on the repository.",
                    "enum": [
                        "read",
                        "write",
                        "admin"
                    ]
                }
            },
            "description": "Update a repository invitation."
        },
        "merge": {
            "url": "/repos/:owner/:repo/merges",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$base": null,
                "$head": null,
                "commit_message": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Commit message to use for the merge commit. If omitted, a default message will be used."
                }
            },
            "description": "Perform a merge."
        },
        "get-pages": {
            "url": "/repos/:owner/:repo/pages",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get information about a Pages site. (In preview period. See README.)"
        },
        "request-page-build": {
            "url": "/repos/:owner/:repo/pages/builds",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Request a page build. (In preview period. See README.)"
        },
        "get-pages-builds": {
            "url": "/repos/:owner/:repo/pages/builds",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List Pages builds. (In preview period. See README.)"
        },
        "get-latest-pages-build": {
            "url": "/repos/:owner/:repo/pages/builds/latest",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get latest Pages build. (In preview period. See README.)"
        },
        "get-pages-build": {
            "url": "/repos/:owner/:repo/pages/builds/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a specific Pages build. (In preview period. See README.)"
        },
        "get-releases": {
            "url": "/repos/:owner/:repo/releases",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List releases for a repository."
        },
        "get-release": {
            "url": "/repos/:owner/:repo/releases/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single release."
        },
        "get-latest-release": {
            "url": "/repos/:owner/:repo/releases/latest",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the latest release."
        },
        "get-release-by-tag": {
            "url": "/repos/:owner/:repo/releases/tags/:tag",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "tag": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the tag"
                }
            },
            "description": "Get a release by tag name."
        },
        "create-release": {
            "url": "/repos/:owner/:repo/releases",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "tag_name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the tag"
                },
                "target_commitish": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA. Unused if the Git tag already exists. Default: the repository's default branch (usually master)."
                },
                "name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "draft": {
                    "type": "Boolean",
                    "validation": "",
                    "invalidmsg": "",
                    "description": "true to create a draft (unpublished) release, false to create a published one. Default: false",
                    "default": "false"
                },
                "prerelease": {
                    "type": "Boolean",
                    "validation": "",
                    "invalidmsg": "",
                    "description": "true to identify the release as a prerelease. false to identify the release as a full release. Default: false",
                    "default": "false"
                }
            },
            "description": "Create a release."
        },
        "edit-release": {
            "url": "/repos/:owner/:repo/releases/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "tag_name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "String of the tag"
                },
                "target_commitish": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA. Unused if the Git tag already exists. Default: the repository's default branch (usually master)."
                },
                "name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "body": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                },
                "draft": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "true to create a draft (unpublished) release, false to create a published one. Default: false",
                    "default": "false"
                },
                "prerelease": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "true to identify the release as a prerelease. false to identify the release as a full release. Default: false",
                    "default": "false"
                }
            },
            "description": "Edit a release."
        },
        "delete-release": {
            "url": "/repos/:owner/:repo/releases/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a release"
        },
        "get-assets": {
            "url": "/repos/:owner/:repo/releases/:id/assets",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "List assets for a release."
        },
        "upload-asset": {
            "url": "/:url",
            "method": "POST",
            "hasFileBody": true,
            "headers": {
              "Content-Type": ":contentType",
              "Content-Length": ":contentLength"
            },
            "timeout": 0,
            "params": {
                "$url": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "This endpoint makes use of a Hypermedia relation (https://developer.github.com/v3/#hypermedia) to determine which URL to access. This endpoint is provided by a URI template in the release's API response (https://developer.github.com/v3/repos/releases/#get-a-single-release). You need to use an HTTP client which supports SNI (https://en.wikipedia.org/wiki/Server_Name_Indication) to make calls to this endpoint."
                },
                "file": {
                    "type": "Object",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A file read stream, a String or a Buffer."
                },
                "$contentType": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The content type of the asset. This should be set in the Header. Example: 'application/zip'. For a list of acceptable types, refer this list of media types (https://www.iana.org/assignments/media-types/media-types.xhtml)"
                },
                "$contentLength": {
                    "type": "Number",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "File size in bytes."
                },
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The file name of the asset. This should be set in a URI query parameter."
                },
                "label": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An alternate short description of the asset. Used in place of the filename. This should be set in a URI query parameter."
                }
            },
            "description": "Upload a release asset."
        },
        "get-asset": {
            "url": "/repos/:owner/:repo/releases/assets/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get a single release asset."
        },
        "edit-asset": {
            "url": "/repos/:owner/:repo/releases/assets/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "$name": null,
                "label": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "An alternate short description of the asset. Used in place of the filename."
                }
            },
            "description": "Edit a release asset."
        },
        "delete-asset": {
            "url": "/repos/:owner/:repo/releases/assets/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Delete a release asset."
        },
        "get-stats-contributors": {
            "url": "/repos/:owner/:repo/stats/contributors",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get contributors list with additions, deletions, and commit counts."
        },
        "get-stats-commit-activity": {
            "url": "/repos/:owner/:repo/stats/commit_activity",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the last year of commit activity data."
        },
        "get-stats-code-frequency": {
            "url": "/repos/:owner/:repo/stats/code_frequency",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the number of additions and deletions per week."
        },
        "get-stats-participation": {
            "url": "/repos/:owner/:repo/stats/participation",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the weekly commit count for the repository owner and everyone else."
        },
        "get-stats-punch-card": {
            "url": "/repos/:owner/:repo/stats/punch_card",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null
            },
            "description": "Get the number of commits per hour in each day."
        },
        "create-status": {
            "url": "/repos/:owner/:repo/statuses/:sha",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$sha": null,
                "state": {
                    "type": "String",
                    "required": true,
                    "validation": "^(pending|success|error|failure)$",
                    "invalidmsg": "",
                    "description": "State of the status - can be one of pending, success, error, or failure.",
                    "enum": [
                        "pending",
                        "success",
                        "error",
                        "failure"
                    ]
                },
                "target_url": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Target url to associate with this status. This URL will be linked from the GitHub UI to allow users to easily see the ‘source’ of the Status."
                },
                "description": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Short description of the status."
                },
                "context": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A string label to differentiate this status from the status of other systems."
                }
            },
            "description": "Create a status."
        },
        "get-statuses": {
            "url": "/repos/:owner/:repo/commits/:ref/statuses",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Ref to list the statuses from. It can be a SHA, a branch name, or a tag name."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "List statuses for a specfic ref."
        },
        "get-combined-status-for-ref": {
            "url": "/repos/:owner/:repo/commits/:ref/status",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "ref": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Ref to fetch the status for. It can be a SHA, a branch name, or a tag name."
                },
                "$page": null,
                "$per_page": null
            },
            "description": "Get the combined status for a specific ref."
        },
        "get-referrers": {
            "url": "/repos/:owner/:repo/traffic/popular/referrers",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get the top 10 referrers over the last 14 days."
        },
        "get-paths": {
            "url": "/repos/:owner/:repo/traffic/popular/paths",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get the top 10 popular contents over the last 14 days."
        },
        "get-views": {
            "url": "/repos/:owner/:repo/traffic/views",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get the total number of views and breakdown per day or week for the last 14 days."
        },
        "get-clones": {
            "url": "/repos/:owner/:repo/traffic/clones",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Get the total number of clones and breakdown per day or week for the last 14 days."
        },
        "get-hooks": {
            "url": "/repos/:owner/:repo/hooks",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List hooks."
        },
        "get-hook": {
            "url": "/repos/:owner/:repo/hooks/:id",
            "method": "GET",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Get single hook."
        },
        "create-hook": {
            "url": "/repos/:owner/:repo/hooks",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$name": null,
                "config": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A Hash containing key/value pairs to provide settings for this hook. These settings vary between the services and are defined in the github-services repo. Booleans are stored internally as `1` for true, and `0` for false. Any JSON true/false values will be converted automatically."
                },
                "events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines what events the hook is triggered for. Default: `['push']`.",
                    "default": "[\"push\"]"
                },
                "active": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines whether the hook is actually triggered on pushes."
                }
            },
            "description": "Create a hook."
        },
        "edit-hook": {
            "url": "/repos/:owner/:repo/hooks/:id",
            "method": "PATCH",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null,
                "$name": null,
                "config": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A Hash containing key/value pairs to provide settings for this hook. Modifying this will replace the entire config object. These settings vary between the services and are defined in the github-services repo. Booleans are stored internally as `1` for true, and `0` for false. Any JSON true/false values will be converted automatically."
                },
                "events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines what events the hook is triggered for. This replaces the entire array of events. Default: `['push']`.",
                    "default": "[\"push\"]"
                },
                "add_events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines a list of events to be added to the list of events that the Hook triggers for."
                },
                "remove_events": {
                    "type": "Array",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines a list of events to be removed from the list of events that the Hook triggers for."
                },
                "active": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Determines whether the hook is actually triggered on pushes."
                }
            },
            "description": "Edit a hook."
        },
        "test-hook": {
            "url": "/repos/:owner/:repo/hooks/:id/tests",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Test a [push] hook."
        },
        "ping-hook": {
            "url": "/repos/:owner/:repo/hooks/:id/pings",
            "method": "POST",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Ping a hook."
        },
        "delete-hook": {
            "url": "/repos/:owner/:repo/hooks/:id",
            "method": "DELETE",
            "params": {
                "$owner": null,
                "$repo": null,
                "$id": null
            },
            "description": "Deleate a hook."
        }
    },
    "search": {
        "repos": {
            "url": "/search/repositories",
            "method": "GET",
            "params": {
                "$q": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(stars|forks|updated)$",
                    "invalidmsg": "One of stars, forks, or updated. Default: results are sorted by best match.",
                    "description": "stars, forks, or updated",
                    "enum": [
                        "stars",
                        "forks",
                        "updated"
                    ]
                },
                "$order": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Search repositories."
        },
        "code": {
            "url": "/search/code",
            "method": "GET",
            "params": {
                "$q": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^indexed$",
                    "invalidmsg": "indexed only",
                    "description": "The sort field. Can only be indexed, which indicates how recently a file has been indexed by the GitHub search infrastructure. Default: results are sorted by best match.",
                    "enum": [
                        "indexed"
                    ]
                },
                "$order": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Search code."
        },
        "commits": {
            "url": "/search/commits",
            "method": "GET",
            "params": {
                "$q": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(author-date|committer-date)$",
                    "invalidmsg": "author-date or committer-date",
                    "description": "The sort field. Can be author-date or committer-date. Default: best match.",
                    "enum": [
                        "author-date",
                        "committer-date"
                    ]
                },
                "$order": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Search commits. (In preview period. See README.)"
        },
        "issues": {
            "url": "/search/issues",
            "method": "GET",
            "params": {
                "$q": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(comments|created|updated)$",
                    "invalidmsg": "comments, created, or updated",
                    "description": "The sort field. Can be comments, created, or updated. Default: results are sorted by best match.",
                    "enum": [
                        "comments",
                        "created",
                        "updated"
                    ]
                },
                "$order": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Search issues."
        },
        "users": {
            "url": "/search/users",
            "method": "GET",
            "params": {
                "$q": null,
                "sort": {
                    "type": "String",
                    "required": false,
                    "validation": "^(followers|repositories|joined)$",
                    "invalidmsg": "Can be followers, repositories, or joined. Default: results are sorted by best match.",
                    "description": "The sort field. Can be followers, repositories, or joined. Default: results are sorted by best match.",
                    "enum": [
                        "followers",
                        "repositories",
                        "joined"
                    ]
                },
                "$order": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Search users."
        },
        "email": {
            "url": "/legacy/user/email/:email",
            "method": "GET",
            "params": {
                "email": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The email address"
                }
            },
            "description": "Search against public email addresses."
        }
    },
    "users": {
        "get-for-user": {
            "url": "/users/:username",
            "method": "GET",
            "params": {
                "$username": null
            },
            "description": "Get a single user"
        },
        "get-by-id": {
            "url": "/user/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single user by GitHub ID"
        },
        "get": {
            "url": "/user",
            "method": "GET",
            "params": {},
            "description": "Get the authenticated user"
        },
        "update": {
            "url": "/user",
            "method": "PATCH",
            "params": {
                "name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new name of the user"
                },
                "email": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Publicly visible email address."
                },
                "blog": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new blog URL of the user."
                },
                "company": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new company of the user."
                },
                "location": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new location of the user."
                },
                "hireable": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new hiring availability of the user."
                },
                "bio": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new short biography of the user."
                }
            },
            "description": "Update the authenticated user"
        },
        "get-all": {
            "url": "/users",
            "method": "GET",
            "params": {
                "since": {
                    "type": "Number",
                    "required": false,
                    "validation": "",
                    "description": "The integer ID of the last User that you’ve seen."
                }
            },
            "description": "Get all users"
        },
        "get-orgs": {
            "url": "/user/orgs",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List organizations for the authenticated user."
        },
        "get-org-memberships": {
            "url": "/user/memberships/orgs",
            "method": "GET",
            "params": {
                "state": {
                    "type": "String",
                    "required": false,
                    "validation": "^(active|pending)$",
                    "invalidmsg": "active, pending",
                    "description": "Indicates the state of the memberships to return. Can be either active or pending. If not specified, both active and pending memberships are returned.",
                    "enum": [
                        "active",
                        "pending"
                    ]
                }
            },
            "description": "List your organization memberships"
        },
        "get-org-membership": {
            "url": "/user/memberships/orgs/:org",
            "method": "GET",
            "params": {
                "$org": null
            },
            "description": "Get your organization membership"
        },
        "edit-org-membership": {
            "url": "/user/memberships/orgs/:org",
            "method": "PATCH",
            "params": {
                "$org": null,
                "state": {
                    "type": "String",
                    "required": true,
                    "validation": "^(active)$",
                    "invalidmsg": "active",
                    "description": "The state that the membership should be in. Only \"active\" will be accepted.",
                    "enum": [
                        "active"
                    ]
                }
            },
            "description": "Edit your organization membership."
        },
        "get-teams": {
            "url": "/user/teams",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "Get your teams."
        },
        "get-emails": {
            "url": "/user/emails",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List email addresses for a user."
        },
        "get-public-emails": {
            "url": "/user/public_emails",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List public email addresses for a user."
        },
        "add-emails": {
            "url": "/user/emails",
            "method": "POST",
            "params": {
                "emails": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "You can post a single email address or an array of addresses."
                }
            },
            "description": "Add email address(es)."
        },
        "delete-emails": {
            "url": "/user/emails",
            "method": "DELETE",
            "params": {
                "emails": {
                    "type": "Array",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "You can post a single email address or an array of addresses."
                }
            },
            "description": "Delete email address(es)."
        },
        "toggle-primary-email-visibility": {
            "url": "/user/email/visibility",
            "method": "PATCH",
            "params": {
            },
            "description": "Toggle primary email visibility."
        },
        "get-followers-for-user": {
            "url": "/users/:username/followers",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List a user's followers"
        },
        "get-followers": {
            "url": "/user/followers",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List the authenticated user's followers"
        },
        "get-following-for-user": {
            "url": "/users/:username/following",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List who a user is following"
        },
        "get-following": {
            "url": "/user/following",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List who the authenticated user is following"
        },
        "check-following": {
            "url": "/user/following/:username",
            "method": "GET",
            "params": {
                "$username": null
            },
            "description": "Check if you are following a user"
        },
        "check-if-one-followers-other": {
            "url": "/users/:username/following/:target_user",
            "method": "GET",
            "params": {
                "$username": null,
                "target_user": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Check if one user follows another"
        },
        "follow-user": {
            "url": "/user/following/:username",
            "method": "PUT",
            "params": {
                "$username": null
            },
            "description": "Follow a user"
        },
        "unfollow-user": {
            "url": "/user/following/:username",
            "method": "DELETE",
            "params": {
                "$username": null
            },
            "description": "Unfollow a user"
        },
        "get-keys-for-user": {
            "url": "/users/:username/keys",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List public keys for a user"
        },
        "get-keys": {
            "url": "/user/keys",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List your public keys"
        },
        "get-key": {
            "url": "/user/keys/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single public key"
        },
        "create-key": {
            "url": "/user/keys",
            "method": "POST",
            "params": {
                "$title": null,
                "$key": null
            },
            "description": "Create a public key"
        },
        "delete-key": {
            "url": "/user/keys/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a public key"
        },
        "get-gpg-keys-for-user": {
            "url": "/users/:username/gpg_keys",
            "method": "GET",
            "params": {
                "$username": null,
                "$page": null,
                "$per_page": null
            },
            "description": "Lists the GPG keys for a user. This information is accessible by anyone. (In preview period. See README.)"
        },
        "get-gpg-keys": {
            "url": "/user/gpg_keys",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List your GPG keys. (In preview period. See README.)"
        },
        "get-gpg-key": {
            "url": "/user/gpg_keys/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single GPG key. (In preview period. See README.)"
        },
        "create-gpg-key": {
            "url": "/user/gpg_keys",
            "method": "POST",
            "params": {
                "armored_public_key": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "GPG key contents"
                }
            },
            "description": "Create a GPG key. (In preview period. See README.)"
        },
        "delete-gpg-key": {
            "url": "/user/gpg_keys/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a GPG key. (In preview period. See README.)"
        },
        "promote": {
            "url": "/users/:username/site_admin",
            "method": "PUT",
            "params": {
                "$username": null
            },
            "description": "Promote an ordinary user to a site administrator"
        },
        "demote": {
            "url": "/users/:username/site_admin",
            "method": "DELETE",
            "params": {
                "$username": null
            },
            "description": "Demote a site administrator to an ordinary user"
        },
        "suspend": {
            "url": "/users/:username/suspended",
            "method": "PUT",
            "params": {
                "$username": null
            },
            "description": "Suspend a user"
        },
        "unsuspend": {
            "url": "/users/:username/suspended",
            "method": "DELETE",
            "params": {
                "$username": null
            },
            "description": "Unsuspend a user"
        },
        "get-blocked-users": {
            "url": "/user/blocks",
            "method": "GET",
            "params": {},
            "description": "List blocked users. (In preview period. See README.)"
        },
        "check-blocked-user": {
            "url": "/user/blocks/:username",
            "method": "GET",
            "params": {
                "$username": null
            },
            "description": "Check whether you've blocked a user. (In preview period. See README.)"
        },
        "block-user": {
            "url": "/user/blocks/:username",
            "method": "PUT",
            "params": {
                "$username": null
            },
            "description": "Block a user. (In preview period. See README.)"
        },
        "unblock-user": {
            "url": "/user/blocks/:username",
            "method": "DELETE",
            "params": {
                "$username": null
            },
            "description": "Unblock a user. (In preview period. See README.)"
        },
        "get-repo-invites": {
            "url": "/user/repository_invitations",
            "method": "GET",
            "params": {},
            "description": "List a user's repository invitations."
        },
        "accept-repo-invite": {
            "url": "/user/repository_invitations/:invitation_id",
            "method": "PATCH",
            "params": {
                "$invitation_id": null
            },
            "description": "Accept a repository invitation."
        },
        "decline-repo-invite": {
            "url": "/user/repository_invitations/:invitation_id",
            "method": "DELETE",
            "params": {
                "$invitation_id": null
            },
            "description": "Decline a repository invitation."
        },
        "get-installations": {
            "url": "/user/installations",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "List installations. (In preview period. See README.)"
        },
        "get-installation-repos": {
            "url": "/user/installations/:installation_id/repositories",
            "method": "GET",
            "params": {
                "$installation_id": null,
                "$page": null,
                "$per_page": null
            },
            "description": "List repositories accessible to the user for an installation. (In preview period. See README.)"
        },
        "add-repo-to-installation": {
            "url": "/user/installations/:installation_id/repositories/:repository_id",
            "method": "PUT",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "description": "Add a single repository to an installation. (In preview period. See README.)"
        },
        "remove-repo-from-installation": {
            "url": "/user/installations/:installation_id/repositories/:repository_id",
            "method": "DELETE",
            "params": {
                "$installation_id": null,
                "$repository_id": null
            },
            "description": "Remove a single repository from an installation. (In preview period. See README.)"
        },
        "get-marketplace-purchases": {
            "url": "/user/marketplace_purchases",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "Get a user's Marketplace purchases. (In preview period. See README.)"
        },
        "get-marketplace-stubbed-purchases": {
            "url": "/user/marketplace_purchases/stubbed",
            "method": "GET",
            "params": {
                "$page": null,
                "$per_page": null
            },
            "description": "Get a user's stubbed Marketplace purchases. (In preview period. See README.)"
        }
    },
    "enterprise": {
        "stats": {
            "url": "/enterprise/stats/:type",
            "method": "GET",
            "params": {
                "type": {
                    "type": "String",
                    "required": true,
                    "validation": "^(issues|hooks|milestones|orgs|comments|pages|users|gists|pulls|repos|all)$",
                    "invalidmsg": "Possible values: issues, hooks, milestones, orgs, comments, pages, users, gists, pulls, repos, all.",
                    "description": "Possible values: issues, hooks, milestones, orgs, comments, pages, users, gists, pulls, repos, all.",
                    "enum": [
                        "issues",
                        "hooks",
                        "milestones",
                        "orgs",
                        "comments",
                        "pages",
                        "users",
                        "gists",
                        "pulls",
                        "repos",
                        "all"
                    ]
                }
            },
            "description": "Get statistics."
        },
        "update-ldap-for-user": {
            "url": "/admin/ldap/users/:username/mapping",
            "method": "PATCH",
            "params": {
                "$username": null,
                "ldap_dn": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "Invalid DN",
                    "description": "LDAP DN for user"
                }
            },
            "description": "Update LDAP mapping for a user."
        },
        "sync-ldap-for-user": {
            "url": "/admin/ldap/users/:username/sync",
            "method": "POST",
            "params": {
                "$username": null
            },
            "description": "Sync LDAP mapping for a user."
        },
        "update-ldap-for-team": {
            "url": "/admin/ldap/teams/:team_id/mapping",
            "method": "PATCH",
            "params": {
                "team_id": {
                    "type": "Number",
                    "required": true,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": ""
                },
                "ldap_dn": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "Invalid DN",
                    "description": "LDAP DN for user"
                }
            },
            "description": "Update LDAP mapping for a team."
        },
        "sync-ldap-for-team": {
            "url": "/admin/ldap/teams/:team_id/sync",
            "method": "POST",
            "params": {
                "team_id": {
                    "type": "Number",
                    "required": true,
                    "validation": "^[0-9]+$",
                    "invalidmsg": "",
                    "description": ""
                }
            },
            "description": "Sync LDAP mapping for a team."
        },
        "get-license": {
            "url": "/enterprise/settings/license",
            "method": "GET",
            "params": {},
            "description": "Get license information"
        },
        "get-pre-receive-environment": {
            "url": "/admin/pre-receive-environments/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single pre-receive environment. (In preview period. See README.)"
        },
        "get-pre-receive-environments": {
            "url": "/admin/pre_receive_environments",
            "method": "GET",
            "params": {},
            "description": "List pre-receive environments. (In preview period. See README.)"
        },
        "create-pre-receive-environment": {
            "url": "/admin/pre_receive_environments",
            "method": "POST",
            "params": {
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The new pre-receive environment's name."
                },
                "image_url": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "URL from which to download a tarball of this environment."
                }
            },
            "description": "Create a pre-receive environment. (In preview period. See README.)"
        },
        "edit-pre-receive-environment": {
            "url": "/admin/pre_receive_environments/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "This pre-receive environment's new name."
                },
                "image_url": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "URL from which to download a tarball of this environment."
                }
            },
            "description": "Create a pre-receive environment. (In preview period. See README.)"
        },
        "delete-pre-receive-environment": {
            "url": "/admin/pre_receive_environments/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a pre-receive environment. (In preview period. See README.)"
        },
        "get-pre-receive-environment-download-status": {
            "url": "/admin/pre-receive-environments/:id/downloads/latest",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a pre-receive environment's download status. (In preview period. See README.)"
        },
        "trigger-pre-receive-environment-download": {
            "url": "/admin/pre_receive_environments/:id/downloads",
            "method": "POST",
            "params": {
                "$id": null
            },
            "description": "Trigger a pre-receive environment download. (In preview period. See README.)"
        },
        "get-pre-receive-hook": {
            "url": "/admin/pre-receive-hooks/:id",
            "method": "GET",
            "params": {
                "$id": null
            },
            "description": "Get a single pre-receive hook. (In preview period. See README.)"
        },
        "get-pre-receive-hooks": {
            "url": "/admin/pre-receive-hooks",
            "method": "GET",
            "params": {},
            "description": "List pre-receive hooks. (In preview period. See README.)"
        },
        "create-pre-receive-hook": {
            "url": "/admin/pre-receive-hooks",
            "method": "POST",
            "params": {
                "name": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The name of the hook."
                },
                "script": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The script that the hook runs."
                },
                "script_repository": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The GitHub repository where the script is kept."
                },
                "environment": {
                    "type": "Json",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The pre-receive environment where the script is executed."
                },
                "enforcement": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The state of enforcement for this hook. default: disabled",
                    "default": "disabled"
                },
                "allow_downstream_configuration": {
                    "type": "Boolean",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "Whether enforcement can be overridden at the org or repo level. default: false",
                    "default": "false"
                }
            },
            "description": "Create a pre-receive hook. (In preview period. See README.)"
        },
        "edit-pre-receive-hook": {
            "url": "/admin/pre_receive_hooks/:id",
            "method": "PATCH",
            "params": {
                "$id": null,
                "hook": {
                    "type": "Json",
                    "sendValueAsBody": true,
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "JSON object that contains pre-receive hook info."
                }
            },
            "description": "Edit a pre-receive hook. (In preview period. See README.)"
        },
        "delete-pre-receive-hook": {
            "url": "/admin/pre_receive_hooks/:id",
            "method": "DELETE",
            "params": {
                "$id": null
            },
            "description": "Delete a pre-receive hook. (In preview period. See README.)"
        },
        "queue-indexing-job": {
            "url": "/staff/indexing_jobs",
            "method": "POST",
            "params": {
                "target": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "A string representing the item to index."
                }
            },
            "description": "Queue an indexing job"
        },
        "create-org": {
            "url": "/admin/organizations",
            "method": "POST",
            "params": {
                "login": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The organization's username."
                },
                "admin": {
                    "type": "String",
                    "required": true,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The login of the user who will manage this organization."
                },
                "profile_name": {
                    "type": "String",
                    "required": false,
                    "validation": "",
                    "invalidmsg": "",
                    "description": "The organization's display name."
                }
            },
            "description": "Create an organization"
        }
    }
}

},{}],57:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],58:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  '#0000CC', '#0000FF', '#0033CC', '#0033FF', '#0066CC', '#0066FF', '#0099CC',
  '#0099FF', '#00CC00', '#00CC33', '#00CC66', '#00CC99', '#00CCCC', '#00CCFF',
  '#3300CC', '#3300FF', '#3333CC', '#3333FF', '#3366CC', '#3366FF', '#3399CC',
  '#3399FF', '#33CC00', '#33CC33', '#33CC66', '#33CC99', '#33CCCC', '#33CCFF',
  '#6600CC', '#6600FF', '#6633CC', '#6633FF', '#66CC00', '#66CC33', '#9900CC',
  '#9900FF', '#9933CC', '#9933FF', '#99CC00', '#99CC33', '#CC0000', '#CC0033',
  '#CC0066', '#CC0099', '#CC00CC', '#CC00FF', '#CC3300', '#CC3333', '#CC3366',
  '#CC3399', '#CC33CC', '#CC33FF', '#CC6600', '#CC6633', '#CC9900', '#CC9933',
  '#CCCC00', '#CCCC33', '#FF0000', '#FF0033', '#FF0066', '#FF0099', '#FF00CC',
  '#FF00FF', '#FF3300', '#FF3333', '#FF3366', '#FF3399', '#FF33CC', '#FF33FF',
  '#FF6600', '#FF6633', '#FF9900', '#FF9933', '#FFCC00', '#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // Internet Explorer and Edge do not support colors.
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    return false;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))
},{"./debug":59,"_process":10}],59:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * Active `debug` instances.
 */
exports.instances = [];

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  var prevTime;

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);
  debug.destroy = destroy;

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  exports.instances.push(debug);

  return debug;
}

function destroy () {
  var index = exports.instances.indexOf(this);
  if (index !== -1) {
    exports.instances.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var i;
  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }

  for (i = 0; i < exports.instances.length; i++) {
    var instance = exports.instances[i];
    instance.enabled = exports.enabled(instance.namespace);
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  if (name[name.length - 1] === '*') {
    return true;
  }
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":57}],60:[function(require,module,exports){
(function (Buffer){
/**
 * Module dependencies.
 */

var net = require('net');
var tls = require('tls');
var url = require('url');
var Agent = require('agent-base');
var inherits = require('util').inherits;
var debug = require('debug')('https-proxy-agent');

/**
 * Module exports.
 */

module.exports = HttpsProxyAgent;

/**
 * The `HttpsProxyAgent` implements an HTTP Agent subclass that connects to the
 * specified "HTTP(s) proxy server" in order to proxy HTTPS requests.
 *
 * @api public
 */

function HttpsProxyAgent(opts) {
  if (!(this instanceof HttpsProxyAgent)) return new HttpsProxyAgent(opts);
  if ('string' == typeof opts) opts = url.parse(opts);
  if (!opts)
    throw new Error(
      'an HTTP(S) proxy server `host` and `port` must be specified!'
    );
  debug('creating new HttpsProxyAgent instance: %o', opts);
  Agent.call(this, opts);

  var proxy = Object.assign({}, opts);

  // if `true`, then connect to the proxy server over TLS. defaults to `false`.
  this.secureProxy = proxy.protocol ? /^https:?$/i.test(proxy.protocol) : false;

  // prefer `hostname` over `host`, and set the `port` if needed
  proxy.host = proxy.hostname || proxy.host;
  proxy.port = +proxy.port || (this.secureProxy ? 443 : 80);

  // ALPN is supported by Node.js >= v5.
  // attempt to negotiate http/1.1 for proxy servers that support http/2
  if (this.secureProxy && !('ALPNProtocols' in proxy)) {
    proxy.ALPNProtocols = ['http 1.1']
  }

  if (proxy.host && proxy.path) {
    // if both a `host` and `path` are specified then it's most likely the
    // result of a `url.parse()` call... we need to remove the `path` portion so
    // that `net.connect()` doesn't attempt to open that as a unix socket file.
    delete proxy.path;
    delete proxy.pathname;
  }

  this.proxy = proxy;
}
inherits(HttpsProxyAgent, Agent);

/**
 * Called when the node-core HTTP client library is creating a new HTTP request.
 *
 * @api public
 */

HttpsProxyAgent.prototype.callback = function connect(req, opts, fn) {
  var proxy = this.proxy;

  // create a socket connection to the proxy server
  var socket;
  if (this.secureProxy) {
    socket = tls.connect(proxy);
  } else {
    socket = net.connect(proxy);
  }

  // we need to buffer any HTTP traffic that happens with the proxy before we get
  // the CONNECT response, so that if the response is anything other than an "200"
  // response code, then we can re-play the "data" events on the socket once the
  // HTTP parser is hooked up...
  var buffers = [];
  var buffersLength = 0;

  function read() {
    var b = socket.read();
    if (b) ondata(b);
    else socket.once('readable', read);
  }

  function cleanup() {
    socket.removeListener('data', ondata);
    socket.removeListener('end', onend);
    socket.removeListener('error', onerror);
    socket.removeListener('close', onclose);
    socket.removeListener('readable', read);
  }

  function onclose(err) {
    debug('onclose had error %o', err);
  }

  function onend() {
    debug('onend');
  }

  function onerror(err) {
    cleanup();
    fn(err);
  }

  function ondata(b) {
    buffers.push(b);
    buffersLength += b.length;
    var buffered = Buffer.concat(buffers, buffersLength);
    var str = buffered.toString('ascii');

    if (!~str.indexOf('\r\n\r\n')) {
      // keep buffering
      debug('have not received end of HTTP headers yet...');
      if (socket.read) {
        read();
      } else {
        socket.once('data', ondata);
      }
      return;
    }

    var firstLine = str.substring(0, str.indexOf('\r\n'));
    var statusCode = +firstLine.split(' ')[1];
    debug('got proxy server response: %o', firstLine);

    if (200 == statusCode) {
      // 200 Connected status code!
      var sock = socket;

      // nullify the buffered data since we won't be needing it
      buffers = buffered = null;

      if (opts.secureEndpoint) {
        // since the proxy is connecting to an SSL server, we have
        // to upgrade this socket connection to an SSL connection
        debug(
          'upgrading proxy-connected socket to TLS connection: %o',
          opts.host
        );
        opts.socket = socket;
        opts.servername = opts.servername || opts.host;
        opts.host = null;
        opts.hostname = null;
        opts.port = null;
        sock = tls.connect(opts);
      }

      cleanup();
      fn(null, sock);
    } else {
      // some other status code that's not 200... need to re-play the HTTP header
      // "data" events onto the socket once the HTTP machinery is attached so that
      // the user can parse and handle the error status code
      cleanup();

      // save a reference to the concat'd Buffer for the `onsocket` callback
      buffers = buffered;

      // need to wait for the "socket" event to re-play the "data" events
      req.once('socket', onsocket);
      fn(null, socket);
    }
  }

  function onsocket(socket) {
    // replay the "buffers" Buffer onto the `socket`, since at this point
    // the HTTP module machinery has been hooked up for the user
    if ('function' == typeof socket.ondata) {
      // node <= v0.11.3, the `ondata` function is set on the socket
      socket.ondata(buffers, 0, buffers.length);
    } else if (socket.listeners('data').length > 0) {
      // node > v0.11.3, the "data" event is listened for directly
      socket.emit('data', buffers);
    } else {
      // never?
      throw new Error('should not happen...');
    }

    // nullify the cached Buffer instance
    buffers = null;
  }

  socket.on('error', onerror);
  socket.on('close', onclose);
  socket.on('end', onend);

  if (socket.read) {
    read();
  } else {
    socket.once('data', ondata);
  }

  var hostname = opts.host + ':' + opts.port;
  var msg = 'CONNECT ' + hostname + ' HTTP/1.1\r\n';

  var headers = Object.assign({}, proxy.headers);
  if (proxy.auth) {
    headers['Proxy-Authorization'] =
      'Basic ' + new Buffer(proxy.auth).toString('base64');
  }

  // the Host header should only include the port
  // number when it is a non-standard port
  var host = opts.host;
  if (!isDefaultPort(opts.port, opts.secureEndpoint)) {
    host += ':' + opts.port;
  }
  headers['Host'] = host;

  headers['Connection'] = 'close';
  Object.keys(headers).forEach(function(name) {
    msg += name + ': ' + headers[name] + '\r\n';
  });

  socket.write(msg + '\r\n');
};

function isDefaultPort(port, secure) {
  return Boolean((!secure && port === 80) || (secure && port === 443));
}

}).call(this,require("buffer").Buffer)
},{"agent-base":61,"buffer":3,"debug":58,"net":1,"tls":1,"url":43,"util":47}],61:[function(require,module,exports){
'use strict';
require('./patch-core');
const inherits = require('util').inherits;
const promisify = require('es6-promisify');
const EventEmitter = require('events').EventEmitter;

module.exports = Agent;

function isAgent(v) {
  return v && typeof v.addRequest === 'function';
}

/**
 * Base `http.Agent` implementation.
 * No pooling/keep-alive is implemented by default.
 *
 * @param {Function} callback
 * @api public
 */
function Agent(callback, _opts) {
  if (!(this instanceof Agent)) {
    return new Agent(callback, _opts);
  }

  EventEmitter.call(this);

  // The callback gets promisified if it has 3 parameters
  // (i.e. it has a callback function) lazily
  this._promisifiedCallback = false;

  let opts = _opts;
  if ('function' === typeof callback) {
    this.callback = callback;
  } else if (callback) {
    opts = callback;
  }

  // timeout for the socket to be returned from the callback
  this.timeout = (opts && opts.timeout) || null;

  this.options = opts;
}
inherits(Agent, EventEmitter);

/**
 * Override this function in your subclass!
 */
Agent.prototype.callback = function callback(req, opts) {
  throw new Error(
    '"agent-base" has no default implementation, you must subclass and override `callback()`'
  );
};

/**
 * Called by node-core's "_http_client.js" module when creating
 * a new HTTP request with this Agent instance.
 *
 * @api public
 */
Agent.prototype.addRequest = function addRequest(req, _opts) {
  const ownOpts = Object.assign({}, _opts);

  // Set default `host` for HTTP to localhost
  if (null == ownOpts.host) {
    ownOpts.host = 'localhost';
  }

  // Set default `port` for HTTP if none was explicitly specified
  if (null == ownOpts.port) {
    ownOpts.port = ownOpts.secureEndpoint ? 443 : 80;
  }

  const opts = Object.assign({}, this.options, ownOpts);

  if (opts.host && opts.path) {
    // If both a `host` and `path` are specified then it's most likely the
    // result of a `url.parse()` call... we need to remove the `path` portion so
    // that `net.connect()` doesn't attempt to open that as a unix socket file.
    delete opts.path;
  }

  delete opts.agent;
  delete opts.hostname;
  delete opts._defaultAgent;
  delete opts.defaultPort;
  delete opts.createConnection;

  // Hint to use "Connection: close"
  // XXX: non-documented `http` module API :(
  req._last = true;
  req.shouldKeepAlive = false;

  // Create the `stream.Duplex` instance
  let timeout;
  let timedOut = false;
  const timeoutMs = this.timeout;

  function onerror(err) {
    if (req._hadError) return;
    req.emit('error', err);
    // For Safety. Some additional errors might fire later on
    // and we need to make sure we don't double-fire the error event.
    req._hadError = true;
  }

  function ontimeout() {
    timeout = null;
    timedOut = true;
    const err = new Error(
      'A "socket" was not created for HTTP request before ' + timeoutMs + 'ms'
    );
    err.code = 'ETIMEOUT';
    onerror(err);
  }

  function callbackError(err) {
    if (timedOut) return;
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    onerror(err);
  }

  function onsocket(socket) {
    if (timedOut) return;
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (isAgent(socket)) {
      // `socket` is actually an http.Agent instance, so relinquish
      // responsibility for this `req` to the Agent from here on
      socket.addRequest(req, opts);
    } else if (socket) {
      req.onSocket(socket);
    } else {
      const err = new Error(
        `no Duplex stream was returned to agent-base for \`${req.method} ${req.path}\``
      );
      onerror(err);
    }
  }

  if (!this._promisifiedCallback && this.callback.length >= 3) {
    // Legacy callback function - convert to a Promise
    this.callback = promisify(this.callback, this);
    this._promisifiedCallback = true;
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(ontimeout, timeoutMs);
  }

  try {
    Promise.resolve(this.callback(req, opts)).then(onsocket, callbackError);
  } catch (err) {
    Promise.reject(err).catch(callbackError);
  }
};

},{"./patch-core":65,"es6-promisify":63,"events":6,"util":47}],62:[function(require,module,exports){
(function (global){
"use strict";

/* global self, window, module, global, require */
module.exports = function () {

    "use strict";

    var globalObject = void 0;

    function isFunction(x) {
        return typeof x === "function";
    }

    // Seek the global object
    if (global !== undefined) {
        globalObject = global;
    } else if (window !== undefined && window.document) {
        globalObject = window;
    } else {
        globalObject = self;
    }

    // Test for any native promise implementation, and if that
    // implementation appears to conform to the specificaton.
    // This code mostly nicked from the es6-promise module polyfill
    // and then fooled with.
    var hasPromiseSupport = function () {

        // No promise object at all, and it's a non-starter
        if (!globalObject.hasOwnProperty("Promise")) {
            return false;
        }

        // There is a Promise object. Does it conform to the spec?
        var P = globalObject.Promise;

        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        if (!P.hasOwnProperty("resolve") || !P.hasOwnProperty("reject")) {
            return false;
        }

        if (!P.hasOwnProperty("all") || !P.hasOwnProperty("race")) {
            return false;
        }

        // Older version of the spec had a resolver object
        // as the arg rather than a function
        return function () {

            var resolve = void 0;

            var p = new globalObject.Promise(function (r) {
                resolve = r;
            });

            if (p) {
                return isFunction(resolve);
            }

            return false;
        }();
    }();

    // Export the native Promise implementation if it
    // looks like it matches the spec
    if (hasPromiseSupport) {
        return globalObject.Promise;
    }

    //  Otherwise, return the es6-promise polyfill by @jaffathecake.
    return require("es6-promise").Promise;
}();
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"es6-promise":64}],63:[function(require,module,exports){
"use strict";

/* global module, require */
module.exports = function () {

    "use strict";

    // Get a promise object. This may be native, or it may be polyfilled

    var ES6Promise = require("./promise.js");

    /**
     * thatLooksLikeAPromiseToMe()
     *
     * Duck-types a promise.
     *
     * @param {object} o
     * @return {bool} True if this resembles a promise
     */
    function thatLooksLikeAPromiseToMe(o) {
        return o && typeof o.then === "function" && typeof o.catch === "function";
    }

    /**
     * promisify()
     *
     * Transforms callback-based function -- func(arg1, arg2 .. argN, callback) -- into
     * an ES6-compatible Promise. Promisify provides a default callback of the form (error, result)
     * and rejects when `error` is truthy. You can also supply settings object as the second argument.
     *
     * @param {function} original - The function to promisify
     * @param {object} settings - Settings object
     * @param {object} settings.thisArg - A `this` context to use. If not set, assume `settings` _is_ `thisArg`
     * @param {bool} settings.multiArgs - Should multiple arguments be returned as an array?
     * @return {function} A promisified version of `original`
     */
    return function promisify(original, settings) {

        return function () {
            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
            }

            var returnMultipleArguments = settings && settings.multiArgs;

            var target = void 0;
            if (settings && settings.thisArg) {
                target = settings.thisArg;
            } else if (settings) {
                target = settings;
            }

            // Return the promisified function
            return new ES6Promise(function (resolve, reject) {

                // Append the callback bound to the context
                args.push(function callback(err) {

                    if (err) {
                        return reject(err);
                    }

                    for (var _len2 = arguments.length, values = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                        values[_key2 - 1] = arguments[_key2];
                    }

                    if (false === !!returnMultipleArguments) {
                        return resolve(values[0]);
                    }

                    resolve(values);
                });

                // Call the function
                var response = original.apply(target, args);

                // If it looks like original already returns a promise,
                // then just resolve with that promise. Hopefully, the callback function we added will just be ignored.
                if (thatLooksLikeAPromiseToMe(response)) {
                    resolve(response);
                }
            });
        };
    };
}();
},{"./promise.js":62}],64:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/stefanpenner/es6-promise/master/LICENSE
 * @version   v4.2.4+314e4831
 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.ES6Promise = factory());
}(this, (function () { 'use strict';

function objectOrFunction(x) {
  var type = typeof x;
  return x !== null && (type === 'object' || type === 'function');
}

function isFunction(x) {
  return typeof x === 'function';
}



var _isArray = void 0;
if (Array.isArray) {
  _isArray = Array.isArray;
} else {
  _isArray = function (x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  };
}

var isArray = _isArray;

var len = 0;
var vertxNext = void 0;
var customSchedulerFn = void 0;

var asap = function asap(callback, arg) {
  queue[len] = callback;
  queue[len + 1] = arg;
  len += 2;
  if (len === 2) {
    // If len is 2, that means that we need to schedule an async flush.
    // If additional callbacks are queued before the queue is flushed, they
    // will be processed by this flush that we are scheduling.
    if (customSchedulerFn) {
      customSchedulerFn(flush);
    } else {
      scheduleFlush();
    }
  }
};

function setScheduler(scheduleFn) {
  customSchedulerFn = scheduleFn;
}

function setAsap(asapFn) {
  asap = asapFn;
}

var browserWindow = typeof window !== 'undefined' ? window : undefined;
var browserGlobal = browserWindow || {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
var isNode = typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

// test for web worker but not in IE10
var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';

// node
function useNextTick() {
  // node version 0.10.x displays a deprecation warning when nextTick is used recursively
  // see https://github.com/cujojs/when/issues/410 for details
  return function () {
    return process.nextTick(flush);
  };
}

// vertx
function useVertxTimer() {
  if (typeof vertxNext !== 'undefined') {
    return function () {
      vertxNext(flush);
    };
  }

  return useSetTimeout();
}

function useMutationObserver() {
  var iterations = 0;
  var observer = new BrowserMutationObserver(flush);
  var node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return function () {
    node.data = iterations = ++iterations % 2;
  };
}

// web worker
function useMessageChannel() {
  var channel = new MessageChannel();
  channel.port1.onmessage = flush;
  return function () {
    return channel.port2.postMessage(0);
  };
}

function useSetTimeout() {
  // Store setTimeout reference so es6-promise will be unaffected by
  // other code modifying setTimeout (like sinon.useFakeTimers())
  var globalSetTimeout = setTimeout;
  return function () {
    return globalSetTimeout(flush, 1);
  };
}

var queue = new Array(1000);
function flush() {
  for (var i = 0; i < len; i += 2) {
    var callback = queue[i];
    var arg = queue[i + 1];

    callback(arg);

    queue[i] = undefined;
    queue[i + 1] = undefined;
  }

  len = 0;
}

function attemptVertx() {
  try {
    var vertx = Function('return this')().require('vertx');
    vertxNext = vertx.runOnLoop || vertx.runOnContext;
    return useVertxTimer();
  } catch (e) {
    return useSetTimeout();
  }
}

var scheduleFlush = void 0;
// Decide what async method to use to triggering processing of queued callbacks:
if (isNode) {
  scheduleFlush = useNextTick();
} else if (BrowserMutationObserver) {
  scheduleFlush = useMutationObserver();
} else if (isWorker) {
  scheduleFlush = useMessageChannel();
} else if (browserWindow === undefined && typeof require === 'function') {
  scheduleFlush = attemptVertx();
} else {
  scheduleFlush = useSetTimeout();
}

function then(onFulfillment, onRejection) {
  var parent = this;

  var child = new this.constructor(noop);

  if (child[PROMISE_ID] === undefined) {
    makePromise(child);
  }

  var _state = parent._state;


  if (_state) {
    var callback = arguments[_state - 1];
    asap(function () {
      return invokeCallback(_state, child, callback, parent._result);
    });
  } else {
    subscribe(parent, child, onFulfillment, onRejection);
  }

  return child;
}

/**
  `Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {Any} value value that the returned promise will be resolved with
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
function resolve$1(object) {
  /*jshint validthis:true */
  var Constructor = this;

  if (object && typeof object === 'object' && object.constructor === Constructor) {
    return object;
  }

  var promise = new Constructor(noop);
  resolve(promise, object);
  return promise;
}

var PROMISE_ID = Math.random().toString(36).substring(2);

function noop() {}

var PENDING = void 0;
var FULFILLED = 1;
var REJECTED = 2;

var TRY_CATCH_ERROR = { error: null };

function selfFulfillment() {
  return new TypeError("You cannot resolve a promise with itself");
}

function cannotReturnOwn() {
  return new TypeError('A promises callback cannot return that same promise.');
}

function getThen(promise) {
  try {
    return promise.then;
  } catch (error) {
    TRY_CATCH_ERROR.error = error;
    return TRY_CATCH_ERROR;
  }
}

function tryThen(then$$1, value, fulfillmentHandler, rejectionHandler) {
  try {
    then$$1.call(value, fulfillmentHandler, rejectionHandler);
  } catch (e) {
    return e;
  }
}

function handleForeignThenable(promise, thenable, then$$1) {
  asap(function (promise) {
    var sealed = false;
    var error = tryThen(then$$1, thenable, function (value) {
      if (sealed) {
        return;
      }
      sealed = true;
      if (thenable !== value) {
        resolve(promise, value);
      } else {
        fulfill(promise, value);
      }
    }, function (reason) {
      if (sealed) {
        return;
      }
      sealed = true;

      reject(promise, reason);
    }, 'Settle: ' + (promise._label || ' unknown promise'));

    if (!sealed && error) {
      sealed = true;
      reject(promise, error);
    }
  }, promise);
}

function handleOwnThenable(promise, thenable) {
  if (thenable._state === FULFILLED) {
    fulfill(promise, thenable._result);
  } else if (thenable._state === REJECTED) {
    reject(promise, thenable._result);
  } else {
    subscribe(thenable, undefined, function (value) {
      return resolve(promise, value);
    }, function (reason) {
      return reject(promise, reason);
    });
  }
}

function handleMaybeThenable(promise, maybeThenable, then$$1) {
  if (maybeThenable.constructor === promise.constructor && then$$1 === then && maybeThenable.constructor.resolve === resolve$1) {
    handleOwnThenable(promise, maybeThenable);
  } else {
    if (then$$1 === TRY_CATCH_ERROR) {
      reject(promise, TRY_CATCH_ERROR.error);
      TRY_CATCH_ERROR.error = null;
    } else if (then$$1 === undefined) {
      fulfill(promise, maybeThenable);
    } else if (isFunction(then$$1)) {
      handleForeignThenable(promise, maybeThenable, then$$1);
    } else {
      fulfill(promise, maybeThenable);
    }
  }
}

function resolve(promise, value) {
  if (promise === value) {
    reject(promise, selfFulfillment());
  } else if (objectOrFunction(value)) {
    handleMaybeThenable(promise, value, getThen(value));
  } else {
    fulfill(promise, value);
  }
}

function publishRejection(promise) {
  if (promise._onerror) {
    promise._onerror(promise._result);
  }

  publish(promise);
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) {
    return;
  }

  promise._result = value;
  promise._state = FULFILLED;

  if (promise._subscribers.length !== 0) {
    asap(publish, promise);
  }
}

function reject(promise, reason) {
  if (promise._state !== PENDING) {
    return;
  }
  promise._state = REJECTED;
  promise._result = reason;

  asap(publishRejection, promise);
}

function subscribe(parent, child, onFulfillment, onRejection) {
  var _subscribers = parent._subscribers;
  var length = _subscribers.length;


  parent._onerror = null;

  _subscribers[length] = child;
  _subscribers[length + FULFILLED] = onFulfillment;
  _subscribers[length + REJECTED] = onRejection;

  if (length === 0 && parent._state) {
    asap(publish, parent);
  }
}

function publish(promise) {
  var subscribers = promise._subscribers;
  var settled = promise._state;

  if (subscribers.length === 0) {
    return;
  }

  var child = void 0,
      callback = void 0,
      detail = promise._result;

  for (var i = 0; i < subscribers.length; i += 3) {
    child = subscribers[i];
    callback = subscribers[i + settled];

    if (child) {
      invokeCallback(settled, child, callback, detail);
    } else {
      callback(detail);
    }
  }

  promise._subscribers.length = 0;
}

function tryCatch(callback, detail) {
  try {
    return callback(detail);
  } catch (e) {
    TRY_CATCH_ERROR.error = e;
    return TRY_CATCH_ERROR;
  }
}

function invokeCallback(settled, promise, callback, detail) {
  var hasCallback = isFunction(callback),
      value = void 0,
      error = void 0,
      succeeded = void 0,
      failed = void 0;

  if (hasCallback) {
    value = tryCatch(callback, detail);

    if (value === TRY_CATCH_ERROR) {
      failed = true;
      error = value.error;
      value.error = null;
    } else {
      succeeded = true;
    }

    if (promise === value) {
      reject(promise, cannotReturnOwn());
      return;
    }
  } else {
    value = detail;
    succeeded = true;
  }

  if (promise._state !== PENDING) {
    // noop
  } else if (hasCallback && succeeded) {
    resolve(promise, value);
  } else if (failed) {
    reject(promise, error);
  } else if (settled === FULFILLED) {
    fulfill(promise, value);
  } else if (settled === REJECTED) {
    reject(promise, value);
  }
}

function initializePromise(promise, resolver) {
  try {
    resolver(function resolvePromise(value) {
      resolve(promise, value);
    }, function rejectPromise(reason) {
      reject(promise, reason);
    });
  } catch (e) {
    reject(promise, e);
  }
}

var id = 0;
function nextId() {
  return id++;
}

function makePromise(promise) {
  promise[PROMISE_ID] = id++;
  promise._state = undefined;
  promise._result = undefined;
  promise._subscribers = [];
}

function validationError() {
  return new Error('Array Methods must be provided an Array');
}

var Enumerator = function () {
  function Enumerator(Constructor, input) {
    this._instanceConstructor = Constructor;
    this.promise = new Constructor(noop);

    if (!this.promise[PROMISE_ID]) {
      makePromise(this.promise);
    }

    if (isArray(input)) {
      this.length = input.length;
      this._remaining = input.length;

      this._result = new Array(this.length);

      if (this.length === 0) {
        fulfill(this.promise, this._result);
      } else {
        this.length = this.length || 0;
        this._enumerate(input);
        if (this._remaining === 0) {
          fulfill(this.promise, this._result);
        }
      }
    } else {
      reject(this.promise, validationError());
    }
  }

  Enumerator.prototype._enumerate = function _enumerate(input) {
    for (var i = 0; this._state === PENDING && i < input.length; i++) {
      this._eachEntry(input[i], i);
    }
  };

  Enumerator.prototype._eachEntry = function _eachEntry(entry, i) {
    var c = this._instanceConstructor;
    var resolve$$1 = c.resolve;


    if (resolve$$1 === resolve$1) {
      var _then = getThen(entry);

      if (_then === then && entry._state !== PENDING) {
        this._settledAt(entry._state, i, entry._result);
      } else if (typeof _then !== 'function') {
        this._remaining--;
        this._result[i] = entry;
      } else if (c === Promise$1) {
        var promise = new c(noop);
        handleMaybeThenable(promise, entry, _then);
        this._willSettleAt(promise, i);
      } else {
        this._willSettleAt(new c(function (resolve$$1) {
          return resolve$$1(entry);
        }), i);
      }
    } else {
      this._willSettleAt(resolve$$1(entry), i);
    }
  };

  Enumerator.prototype._settledAt = function _settledAt(state, i, value) {
    var promise = this.promise;


    if (promise._state === PENDING) {
      this._remaining--;

      if (state === REJECTED) {
        reject(promise, value);
      } else {
        this._result[i] = value;
      }
    }

    if (this._remaining === 0) {
      fulfill(promise, this._result);
    }
  };

  Enumerator.prototype._willSettleAt = function _willSettleAt(promise, i) {
    var enumerator = this;

    subscribe(promise, undefined, function (value) {
      return enumerator._settledAt(FULFILLED, i, value);
    }, function (reason) {
      return enumerator._settledAt(REJECTED, i, reason);
    });
  };

  return Enumerator;
}();

/**
  `Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = resolve(2);
  let promise3 = resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = reject(new Error("2"));
  let promise3 = reject(new Error("3"));
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
function all(entries) {
  return new Enumerator(this, entries).promise;
}

/**
  `Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 2');
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // result === 'promise 2' because it was resolved before promise1
    // was resolved.
  });
  ```

  `Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error('promise 2'));
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === 'promise 2' because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} promises array of promises to observe
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
function race(entries) {
  /*jshint validthis:true */
  var Constructor = this;

  if (!isArray(entries)) {
    return new Constructor(function (_, reject) {
      return reject(new TypeError('You must pass an array to race.'));
    });
  } else {
    return new Constructor(function (resolve, reject) {
      var length = entries.length;
      for (var i = 0; i < length; i++) {
        Constructor.resolve(entries[i]).then(resolve, reject);
      }
    });
  }
}

/**
  `Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {Any} reason value that the returned promise will be rejected with.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
function reject$1(reason) {
  /*jshint validthis:true */
  var Constructor = this;
  var promise = new Constructor(noop);
  reject(promise, reason);
  return promise;
}

function needsResolver() {
  throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
}

function needsNew() {
  throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
}

/**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise's eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  let promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      let xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class Promise
  @param {Function} resolver
  Useful for tooling.
  @constructor
*/

var Promise$1 = function () {
  function Promise(resolver) {
    this[PROMISE_ID] = nextId();
    this._result = this._state = undefined;
    this._subscribers = [];

    if (noop !== resolver) {
      typeof resolver !== 'function' && needsResolver();
      this instanceof Promise ? initializePromise(this, resolver) : needsNew();
    }
  }

  /**
  The primary way of interacting with a promise is through its `then` method,
  which registers callbacks to receive either a promise's eventual value or the
  reason why the promise cannot be fulfilled.
   ```js
  findUser().then(function(user){
    // user is available
  }, function(reason){
    // user is unavailable, and you are given the reason why
  });
  ```
   Chaining
  --------
   The return value of `then` is itself a promise.  This second, 'downstream'
  promise is resolved with the return value of the first promise's fulfillment
  or rejection handler, or rejected if the handler throws an exception.
   ```js
  findUser().then(function (user) {
    return user.name;
  }, function (reason) {
    return 'default name';
  }).then(function (userName) {
    // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
    // will be `'default name'`
  });
   findUser().then(function (user) {
    throw new Error('Found user, but still unhappy');
  }, function (reason) {
    throw new Error('`findUser` rejected and we're unhappy');
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
    // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
  });
  ```
  If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.
   ```js
  findUser().then(function (user) {
    throw new PedagogicalException('Upstream error');
  }).then(function (value) {
    // never reached
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // The `PedgagocialException` is propagated all the way down to here
  });
  ```
   Assimilation
  ------------
   Sometimes the value you want to propagate to a downstream promise can only be
  retrieved asynchronously. This can be achieved by returning a promise in the
  fulfillment or rejection handler. The downstream promise will then be pending
  until the returned promise is settled. This is called *assimilation*.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // The user's comments are now available
  });
  ```
   If the assimliated promise rejects, then the downstream promise will also reject.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // If `findCommentsByAuthor` fulfills, we'll have the value here
  }, function (reason) {
    // If `findCommentsByAuthor` rejects, we'll have the reason here
  });
  ```
   Simple Example
  --------------
   Synchronous Example
   ```javascript
  let result;
   try {
    result = findResult();
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
  findResult(function(result, err){
    if (err) {
      // failure
    } else {
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findResult().then(function(result){
    // success
  }, function(reason){
    // failure
  });
  ```
   Advanced Example
  --------------
   Synchronous Example
   ```javascript
  let author, books;
   try {
    author = findAuthor();
    books  = findBooksByAuthor(author);
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
   function foundBooks(books) {
   }
   function failure(reason) {
   }
   findAuthor(function(author, err){
    if (err) {
      failure(err);
      // failure
    } else {
      try {
        findBoooksByAuthor(author, function(books, err) {
          if (err) {
            failure(err);
          } else {
            try {
              foundBooks(books);
            } catch(reason) {
              failure(reason);
            }
          }
        });
      } catch(error) {
        failure(err);
      }
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findAuthor().
    then(findBooksByAuthor).
    then(function(books){
      // found books
  }).catch(function(reason){
    // something went wrong
  });
  ```
   @method then
  @param {Function} onFulfilled
  @param {Function} onRejected
  Useful for tooling.
  @return {Promise}
  */

  /**
  `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
  as the catch block of a try/catch statement.
  ```js
  function findAuthor(){
  throw new Error('couldn't find that author');
  }
  // synchronous
  try {
  findAuthor();
  } catch(reason) {
  // something went wrong
  }
  // async with promises
  findAuthor().catch(function(reason){
  // something went wrong
  });
  ```
  @method catch
  @param {Function} onRejection
  Useful for tooling.
  @return {Promise}
  */


  Promise.prototype.catch = function _catch(onRejection) {
    return this.then(null, onRejection);
  };

  /**
    `finally` will be invoked regardless of the promise's fate just as native
    try/catch/finally behaves
  
    Synchronous example:
  
    ```js
    findAuthor() {
      if (Math.random() > 0.5) {
        throw new Error();
      }
      return new Author();
    }
  
    try {
      return findAuthor(); // succeed or fail
    } catch(error) {
      return findOtherAuther();
    } finally {
      // always runs
      // doesn't affect the return value
    }
    ```
  
    Asynchronous example:
  
    ```js
    findAuthor().catch(function(reason){
      return findOtherAuther();
    }).finally(function(){
      // author was either found, or not
    });
    ```
  
    @method finally
    @param {Function} callback
    @return {Promise}
  */


  Promise.prototype.finally = function _finally(callback) {
    var promise = this;
    var constructor = promise.constructor;

    return promise.then(function (value) {
      return constructor.resolve(callback()).then(function () {
        return value;
      });
    }, function (reason) {
      return constructor.resolve(callback()).then(function () {
        throw reason;
      });
    });
  };

  return Promise;
}();

Promise$1.prototype.then = then;
Promise$1.all = all;
Promise$1.race = race;
Promise$1.resolve = resolve$1;
Promise$1.reject = reject$1;
Promise$1._setScheduler = setScheduler;
Promise$1._setAsap = setAsap;
Promise$1._asap = asap;

/*global self*/
function polyfill() {
  var local = void 0;

  if (typeof global !== 'undefined') {
    local = global;
  } else if (typeof self !== 'undefined') {
    local = self;
  } else {
    try {
      local = Function('return this')();
    } catch (e) {
      throw new Error('polyfill failed because global object is unavailable in this environment');
    }
  }

  var P = local.Promise;

  if (P) {
    var promiseToString = null;
    try {
      promiseToString = Object.prototype.toString.call(P.resolve());
    } catch (e) {
      // silently ignored
    }

    if (promiseToString === '[object Promise]' && !P.cast) {
      return;
    }
  }

  local.Promise = Promise$1;
}

// Strange compat..
Promise$1.polyfill = polyfill;
Promise$1.Promise = Promise$1;

return Promise$1;

})));





}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":10}],65:[function(require,module,exports){
'use strict';
const url = require('url');
const https = require('https');

/**
 * This currently needs to be applied to all Node.js versions
 * in order to determine if the `req` is an HTTP or HTTPS request.
 *
 * There is currently no PR attempting to move this property upstream.
 */
https.request = (function(request) {
  return function(_options, cb) {
    let options;
    if (typeof _options === 'string') {
      options = url.parse(_options);
    } else {
      options = Object.assign({}, _options);
    }
    if (null == options.port) {
      options.port = 443;
    }
    options.secureEndpoint = true;
    return request.call(https, options, cb);
  };
})(https.request);

/**
 * This is needed for Node.js >= 9.0.0 to make sure `https.get()` uses the
 * patched `https.request()`.
 *
 * Ref: https://github.com/nodejs/node/commit/5118f31
 */
https.get = function(options, cb) {
  const req = https.request(options, cb);
  req.end();
  return req;
};

},{"https":7,"url":43}],66:[function(require,module,exports){
'use strict';

var isStream = module.exports = function (stream) {
	return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
};

isStream.writable = function (stream) {
	return isStream(stream) && stream.writable !== false && typeof stream._write === 'function' && typeof stream._writableState === 'object';
};

isStream.readable = function (stream) {
	return isStream(stream) && stream.readable !== false && typeof stream._read === 'function' && typeof stream._readableState === 'object';
};

isStream.duplex = function (stream) {
	return isStream.writable(stream) && isStream.readable(stream);
};

isStream.transform = function (stream) {
	return isStream.duplex(stream) && typeof stream._transform === 'function' && typeof stream._transformState === 'object';
};

},{}],67:[function(require,module,exports){
var root = require('./_root');

/** Built-in value references. */
var Symbol = root.Symbol;

module.exports = Symbol;

},{"./_root":85}],68:[function(require,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array == null ? 0 : array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],69:[function(require,module,exports){
/**
 * A specialized version of `_.reduce` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initAccum] Specify using the first element of `array` as
 *  the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initAccum) {
  var index = -1,
      length = array == null ? 0 : array.length;

  if (initAccum && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

module.exports = arrayReduce;

},{}],70:[function(require,module,exports){
/**
 * Converts an ASCII `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function asciiToArray(string) {
  return string.split('');
}

module.exports = asciiToArray;

},{}],71:[function(require,module,exports){
/** Used to match words composed of alphanumeric characters. */
var reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;

/**
 * Splits an ASCII `string` into an array of its words.
 *
 * @private
 * @param {string} The string to inspect.
 * @returns {Array} Returns the words of `string`.
 */
function asciiWords(string) {
  return string.match(reAsciiWord) || [];
}

module.exports = asciiWords;

},{}],72:[function(require,module,exports){
var Symbol = require('./_Symbol'),
    getRawTag = require('./_getRawTag'),
    objectToString = require('./_objectToString');

/** `Object#toString` result references. */
var nullTag = '[object Null]',
    undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

module.exports = baseGetTag;

},{"./_Symbol":67,"./_getRawTag":81,"./_objectToString":84}],73:[function(require,module,exports){
/**
 * The base implementation of `_.propertyOf` without support for deep paths.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Function} Returns the new accessor function.
 */
function basePropertyOf(object) {
  return function(key) {
    return object == null ? undefined : object[key];
  };
}

module.exports = basePropertyOf;

},{}],74:[function(require,module,exports){
/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = end > length ? length : end;
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

module.exports = baseSlice;

},{}],75:[function(require,module,exports){
var Symbol = require('./_Symbol'),
    arrayMap = require('./_arrayMap'),
    isArray = require('./isArray'),
    isSymbol = require('./isSymbol');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isArray(value)) {
    // Recursively convert values (susceptible to call stack limits).
    return arrayMap(value, baseToString) + '';
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

module.exports = baseToString;

},{"./_Symbol":67,"./_arrayMap":68,"./isArray":92,"./isSymbol":94}],76:[function(require,module,exports){
var baseSlice = require('./_baseSlice');

/**
 * Casts `array` to a slice if it's needed.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {number} start The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the cast slice.
 */
function castSlice(array, start, end) {
  var length = array.length;
  end = end === undefined ? length : end;
  return (!start && end >= length) ? array : baseSlice(array, start, end);
}

module.exports = castSlice;

},{"./_baseSlice":74}],77:[function(require,module,exports){
var castSlice = require('./_castSlice'),
    hasUnicode = require('./_hasUnicode'),
    stringToArray = require('./_stringToArray'),
    toString = require('./toString');

/**
 * Creates a function like `_.lowerFirst`.
 *
 * @private
 * @param {string} methodName The name of the `String` case method to use.
 * @returns {Function} Returns the new case function.
 */
function createCaseFirst(methodName) {
  return function(string) {
    string = toString(string);

    var strSymbols = hasUnicode(string)
      ? stringToArray(string)
      : undefined;

    var chr = strSymbols
      ? strSymbols[0]
      : string.charAt(0);

    var trailing = strSymbols
      ? castSlice(strSymbols, 1).join('')
      : string.slice(1);

    return chr[methodName]() + trailing;
  };
}

module.exports = createCaseFirst;

},{"./_castSlice":76,"./_hasUnicode":82,"./_stringToArray":86,"./toString":95}],78:[function(require,module,exports){
var arrayReduce = require('./_arrayReduce'),
    deburr = require('./deburr'),
    words = require('./words');

/** Used to compose unicode capture groups. */
var rsApos = "['\u2019]";

/** Used to match apostrophes. */
var reApos = RegExp(rsApos, 'g');

/**
 * Creates a function like `_.camelCase`.
 *
 * @private
 * @param {Function} callback The function to combine each word.
 * @returns {Function} Returns the new compounder function.
 */
function createCompounder(callback) {
  return function(string) {
    return arrayReduce(words(deburr(string).replace(reApos, '')), callback, '');
  };
}

module.exports = createCompounder;

},{"./_arrayReduce":69,"./deburr":91,"./words":97}],79:[function(require,module,exports){
var basePropertyOf = require('./_basePropertyOf');

/** Used to map Latin Unicode letters to basic Latin letters. */
var deburredLetters = {
  // Latin-1 Supplement block.
  '\xc0': 'A',  '\xc1': 'A', '\xc2': 'A', '\xc3': 'A', '\xc4': 'A', '\xc5': 'A',
  '\xe0': 'a',  '\xe1': 'a', '\xe2': 'a', '\xe3': 'a', '\xe4': 'a', '\xe5': 'a',
  '\xc7': 'C',  '\xe7': 'c',
  '\xd0': 'D',  '\xf0': 'd',
  '\xc8': 'E',  '\xc9': 'E', '\xca': 'E', '\xcb': 'E',
  '\xe8': 'e',  '\xe9': 'e', '\xea': 'e', '\xeb': 'e',
  '\xcc': 'I',  '\xcd': 'I', '\xce': 'I', '\xcf': 'I',
  '\xec': 'i',  '\xed': 'i', '\xee': 'i', '\xef': 'i',
  '\xd1': 'N',  '\xf1': 'n',
  '\xd2': 'O',  '\xd3': 'O', '\xd4': 'O', '\xd5': 'O', '\xd6': 'O', '\xd8': 'O',
  '\xf2': 'o',  '\xf3': 'o', '\xf4': 'o', '\xf5': 'o', '\xf6': 'o', '\xf8': 'o',
  '\xd9': 'U',  '\xda': 'U', '\xdb': 'U', '\xdc': 'U',
  '\xf9': 'u',  '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
  '\xdd': 'Y',  '\xfd': 'y', '\xff': 'y',
  '\xc6': 'Ae', '\xe6': 'ae',
  '\xde': 'Th', '\xfe': 'th',
  '\xdf': 'ss',
  // Latin Extended-A block.
  '\u0100': 'A',  '\u0102': 'A', '\u0104': 'A',
  '\u0101': 'a',  '\u0103': 'a', '\u0105': 'a',
  '\u0106': 'C',  '\u0108': 'C', '\u010a': 'C', '\u010c': 'C',
  '\u0107': 'c',  '\u0109': 'c', '\u010b': 'c', '\u010d': 'c',
  '\u010e': 'D',  '\u0110': 'D', '\u010f': 'd', '\u0111': 'd',
  '\u0112': 'E',  '\u0114': 'E', '\u0116': 'E', '\u0118': 'E', '\u011a': 'E',
  '\u0113': 'e',  '\u0115': 'e', '\u0117': 'e', '\u0119': 'e', '\u011b': 'e',
  '\u011c': 'G',  '\u011e': 'G', '\u0120': 'G', '\u0122': 'G',
  '\u011d': 'g',  '\u011f': 'g', '\u0121': 'g', '\u0123': 'g',
  '\u0124': 'H',  '\u0126': 'H', '\u0125': 'h', '\u0127': 'h',
  '\u0128': 'I',  '\u012a': 'I', '\u012c': 'I', '\u012e': 'I', '\u0130': 'I',
  '\u0129': 'i',  '\u012b': 'i', '\u012d': 'i', '\u012f': 'i', '\u0131': 'i',
  '\u0134': 'J',  '\u0135': 'j',
  '\u0136': 'K',  '\u0137': 'k', '\u0138': 'k',
  '\u0139': 'L',  '\u013b': 'L', '\u013d': 'L', '\u013f': 'L', '\u0141': 'L',
  '\u013a': 'l',  '\u013c': 'l', '\u013e': 'l', '\u0140': 'l', '\u0142': 'l',
  '\u0143': 'N',  '\u0145': 'N', '\u0147': 'N', '\u014a': 'N',
  '\u0144': 'n',  '\u0146': 'n', '\u0148': 'n', '\u014b': 'n',
  '\u014c': 'O',  '\u014e': 'O', '\u0150': 'O',
  '\u014d': 'o',  '\u014f': 'o', '\u0151': 'o',
  '\u0154': 'R',  '\u0156': 'R', '\u0158': 'R',
  '\u0155': 'r',  '\u0157': 'r', '\u0159': 'r',
  '\u015a': 'S',  '\u015c': 'S', '\u015e': 'S', '\u0160': 'S',
  '\u015b': 's',  '\u015d': 's', '\u015f': 's', '\u0161': 's',
  '\u0162': 'T',  '\u0164': 'T', '\u0166': 'T',
  '\u0163': 't',  '\u0165': 't', '\u0167': 't',
  '\u0168': 'U',  '\u016a': 'U', '\u016c': 'U', '\u016e': 'U', '\u0170': 'U', '\u0172': 'U',
  '\u0169': 'u',  '\u016b': 'u', '\u016d': 'u', '\u016f': 'u', '\u0171': 'u', '\u0173': 'u',
  '\u0174': 'W',  '\u0175': 'w',
  '\u0176': 'Y',  '\u0177': 'y', '\u0178': 'Y',
  '\u0179': 'Z',  '\u017b': 'Z', '\u017d': 'Z',
  '\u017a': 'z',  '\u017c': 'z', '\u017e': 'z',
  '\u0132': 'IJ', '\u0133': 'ij',
  '\u0152': 'Oe', '\u0153': 'oe',
  '\u0149': "'n", '\u017f': 's'
};

/**
 * Used by `_.deburr` to convert Latin-1 Supplement and Latin Extended-A
 * letters to basic Latin letters.
 *
 * @private
 * @param {string} letter The matched letter to deburr.
 * @returns {string} Returns the deburred letter.
 */
var deburrLetter = basePropertyOf(deburredLetters);

module.exports = deburrLetter;

},{"./_basePropertyOf":73}],80:[function(require,module,exports){
(function (global){
/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

module.exports = freeGlobal;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],81:[function(require,module,exports){
var Symbol = require('./_Symbol');

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];

  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}

module.exports = getRawTag;

},{"./_Symbol":67}],82:[function(require,module,exports){
/** Used to compose unicode character classes. */
var rsAstralRange = '\\ud800-\\udfff',
    rsComboMarksRange = '\\u0300-\\u036f',
    reComboHalfMarksRange = '\\ufe20-\\ufe2f',
    rsComboSymbolsRange = '\\u20d0-\\u20ff',
    rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
    rsVarRange = '\\ufe0e\\ufe0f';

/** Used to compose unicode capture groups. */
var rsZWJ = '\\u200d';

/** Used to detect strings with [zero-width joiners or code points from the astral planes](http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/). */
var reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange  + rsComboRange + rsVarRange + ']');

/**
 * Checks if `string` contains Unicode symbols.
 *
 * @private
 * @param {string} string The string to inspect.
 * @returns {boolean} Returns `true` if a symbol is found, else `false`.
 */
function hasUnicode(string) {
  return reHasUnicode.test(string);
}

module.exports = hasUnicode;

},{}],83:[function(require,module,exports){
/** Used to detect strings that need a more robust regexp to match words. */
var reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

/**
 * Checks if `string` contains a word composed of Unicode symbols.
 *
 * @private
 * @param {string} string The string to inspect.
 * @returns {boolean} Returns `true` if a word is found, else `false`.
 */
function hasUnicodeWord(string) {
  return reHasUnicodeWord.test(string);
}

module.exports = hasUnicodeWord;

},{}],84:[function(require,module,exports){
/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

module.exports = objectToString;

},{}],85:[function(require,module,exports){
var freeGlobal = require('./_freeGlobal');

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

module.exports = root;

},{"./_freeGlobal":80}],86:[function(require,module,exports){
var asciiToArray = require('./_asciiToArray'),
    hasUnicode = require('./_hasUnicode'),
    unicodeToArray = require('./_unicodeToArray');

/**
 * Converts `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function stringToArray(string) {
  return hasUnicode(string)
    ? unicodeToArray(string)
    : asciiToArray(string);
}

module.exports = stringToArray;

},{"./_asciiToArray":70,"./_hasUnicode":82,"./_unicodeToArray":87}],87:[function(require,module,exports){
/** Used to compose unicode character classes. */
var rsAstralRange = '\\ud800-\\udfff',
    rsComboMarksRange = '\\u0300-\\u036f',
    reComboHalfMarksRange = '\\ufe20-\\ufe2f',
    rsComboSymbolsRange = '\\u20d0-\\u20ff',
    rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
    rsVarRange = '\\ufe0e\\ufe0f';

/** Used to compose unicode capture groups. */
var rsAstral = '[' + rsAstralRange + ']',
    rsCombo = '[' + rsComboRange + ']',
    rsFitz = '\\ud83c[\\udffb-\\udfff]',
    rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
    rsNonAstral = '[^' + rsAstralRange + ']',
    rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    rsZWJ = '\\u200d';

/** Used to compose unicode regexes. */
var reOptMod = rsModifier + '?',
    rsOptVar = '[' + rsVarRange + ']?',
    rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
    rsSeq = rsOptVar + reOptMod + rsOptJoin,
    rsSymbol = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

/** Used to match [string symbols](https://mathiasbynens.be/notes/javascript-unicode). */
var reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

/**
 * Converts a Unicode `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function unicodeToArray(string) {
  return string.match(reUnicode) || [];
}

module.exports = unicodeToArray;

},{}],88:[function(require,module,exports){
/** Used to compose unicode character classes. */
var rsAstralRange = '\\ud800-\\udfff',
    rsComboMarksRange = '\\u0300-\\u036f',
    reComboHalfMarksRange = '\\ufe20-\\ufe2f',
    rsComboSymbolsRange = '\\u20d0-\\u20ff',
    rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
    rsDingbatRange = '\\u2700-\\u27bf',
    rsLowerRange = 'a-z\\xdf-\\xf6\\xf8-\\xff',
    rsMathOpRange = '\\xac\\xb1\\xd7\\xf7',
    rsNonCharRange = '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf',
    rsPunctuationRange = '\\u2000-\\u206f',
    rsSpaceRange = ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000',
    rsUpperRange = 'A-Z\\xc0-\\xd6\\xd8-\\xde',
    rsVarRange = '\\ufe0e\\ufe0f',
    rsBreakRange = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;

/** Used to compose unicode capture groups. */
var rsApos = "['\u2019]",
    rsBreak = '[' + rsBreakRange + ']',
    rsCombo = '[' + rsComboRange + ']',
    rsDigits = '\\d+',
    rsDingbat = '[' + rsDingbatRange + ']',
    rsLower = '[' + rsLowerRange + ']',
    rsMisc = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']',
    rsFitz = '\\ud83c[\\udffb-\\udfff]',
    rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
    rsNonAstral = '[^' + rsAstralRange + ']',
    rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    rsUpper = '[' + rsUpperRange + ']',
    rsZWJ = '\\u200d';

/** Used to compose unicode regexes. */
var rsMiscLower = '(?:' + rsLower + '|' + rsMisc + ')',
    rsMiscUpper = '(?:' + rsUpper + '|' + rsMisc + ')',
    rsOptContrLower = '(?:' + rsApos + '(?:d|ll|m|re|s|t|ve))?',
    rsOptContrUpper = '(?:' + rsApos + '(?:D|LL|M|RE|S|T|VE))?',
    reOptMod = rsModifier + '?',
    rsOptVar = '[' + rsVarRange + ']?',
    rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
    rsOrdLower = '\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])',
    rsOrdUpper = '\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])',
    rsSeq = rsOptVar + reOptMod + rsOptJoin,
    rsEmoji = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

/** Used to match complex or compound words. */
var reUnicodeWord = RegExp([
  rsUpper + '?' + rsLower + '+' + rsOptContrLower + '(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
  rsMiscUpper + '+' + rsOptContrUpper + '(?=' + [rsBreak, rsUpper + rsMiscLower, '$'].join('|') + ')',
  rsUpper + '?' + rsMiscLower + '+' + rsOptContrLower,
  rsUpper + '+' + rsOptContrUpper,
  rsOrdUpper,
  rsOrdLower,
  rsDigits,
  rsEmoji
].join('|'), 'g');

/**
 * Splits a Unicode `string` into an array of its words.
 *
 * @private
 * @param {string} The string to inspect.
 * @returns {Array} Returns the words of `string`.
 */
function unicodeWords(string) {
  return string.match(reUnicodeWord) || [];
}

module.exports = unicodeWords;

},{}],89:[function(require,module,exports){
var capitalize = require('./capitalize'),
    createCompounder = require('./_createCompounder');

/**
 * Converts `string` to [camel case](https://en.wikipedia.org/wiki/CamelCase).
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category String
 * @param {string} [string=''] The string to convert.
 * @returns {string} Returns the camel cased string.
 * @example
 *
 * _.camelCase('Foo Bar');
 * // => 'fooBar'
 *
 * _.camelCase('--foo-bar--');
 * // => 'fooBar'
 *
 * _.camelCase('__FOO_BAR__');
 * // => 'fooBar'
 */
var camelCase = createCompounder(function(result, word, index) {
  word = word.toLowerCase();
  return result + (index ? capitalize(word) : word);
});

module.exports = camelCase;

},{"./_createCompounder":78,"./capitalize":90}],90:[function(require,module,exports){
var toString = require('./toString'),
    upperFirst = require('./upperFirst');

/**
 * Converts the first character of `string` to upper case and the remaining
 * to lower case.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category String
 * @param {string} [string=''] The string to capitalize.
 * @returns {string} Returns the capitalized string.
 * @example
 *
 * _.capitalize('FRED');
 * // => 'Fred'
 */
function capitalize(string) {
  return upperFirst(toString(string).toLowerCase());
}

module.exports = capitalize;

},{"./toString":95,"./upperFirst":96}],91:[function(require,module,exports){
var deburrLetter = require('./_deburrLetter'),
    toString = require('./toString');

/** Used to match Latin Unicode letters (excluding mathematical operators). */
var reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;

/** Used to compose unicode character classes. */
var rsComboMarksRange = '\\u0300-\\u036f',
    reComboHalfMarksRange = '\\ufe20-\\ufe2f',
    rsComboSymbolsRange = '\\u20d0-\\u20ff',
    rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange;

/** Used to compose unicode capture groups. */
var rsCombo = '[' + rsComboRange + ']';

/**
 * Used to match [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks) and
 * [combining diacritical marks for symbols](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks_for_Symbols).
 */
var reComboMark = RegExp(rsCombo, 'g');

/**
 * Deburrs `string` by converting
 * [Latin-1 Supplement](https://en.wikipedia.org/wiki/Latin-1_Supplement_(Unicode_block)#Character_table)
 * and [Latin Extended-A](https://en.wikipedia.org/wiki/Latin_Extended-A)
 * letters to basic Latin letters and removing
 * [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks).
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category String
 * @param {string} [string=''] The string to deburr.
 * @returns {string} Returns the deburred string.
 * @example
 *
 * _.deburr('déjà vu');
 * // => 'deja vu'
 */
function deburr(string) {
  string = toString(string);
  return string && string.replace(reLatin, deburrLetter).replace(reComboMark, '');
}

module.exports = deburr;

},{"./_deburrLetter":79,"./toString":95}],92:[function(require,module,exports){
/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

module.exports = isArray;

},{}],93:[function(require,module,exports){
/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

module.exports = isObjectLike;

},{}],94:[function(require,module,exports){
var baseGetTag = require('./_baseGetTag'),
    isObjectLike = require('./isObjectLike');

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && baseGetTag(value) == symbolTag);
}

module.exports = isSymbol;

},{"./_baseGetTag":72,"./isObjectLike":93}],95:[function(require,module,exports){
var baseToString = require('./_baseToString');

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

module.exports = toString;

},{"./_baseToString":75}],96:[function(require,module,exports){
var createCaseFirst = require('./_createCaseFirst');

/**
 * Converts the first character of `string` to upper case.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category String
 * @param {string} [string=''] The string to convert.
 * @returns {string} Returns the converted string.
 * @example
 *
 * _.upperFirst('fred');
 * // => 'Fred'
 *
 * _.upperFirst('FRED');
 * // => 'FRED'
 */
var upperFirst = createCaseFirst('toUpperCase');

module.exports = upperFirst;

},{"./_createCaseFirst":77}],97:[function(require,module,exports){
var asciiWords = require('./_asciiWords'),
    hasUnicodeWord = require('./_hasUnicodeWord'),
    toString = require('./toString'),
    unicodeWords = require('./_unicodeWords');

/**
 * Splits `string` into an array of its words.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category String
 * @param {string} [string=''] The string to inspect.
 * @param {RegExp|string} [pattern] The pattern to match words.
 * @param- {Object} [guard] Enables use as an iteratee for methods like `_.map`.
 * @returns {Array} Returns the words of `string`.
 * @example
 *
 * _.words('fred, barney, & pebbles');
 * // => ['fred', 'barney', 'pebbles']
 *
 * _.words('fred, barney, & pebbles', /[^, ]+/g);
 * // => ['fred', 'barney', '&', 'pebbles']
 */
function words(string, pattern, guard) {
  string = toString(string);
  pattern = guard ? undefined : pattern;

  if (pattern === undefined) {
    return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
  }
  return string.match(pattern) || [];
}

module.exports = words;

},{"./_asciiWords":71,"./_hasUnicodeWord":83,"./_unicodeWords":88,"./toString":95}],98:[function(require,module,exports){
(function (process){
'use strict';

var parseUrl = require('url').parse;

var DEFAULT_PORTS = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
};

var stringEndsWith = String.prototype.endsWith || function(s) {
  return s.length <= this.length &&
    this.indexOf(s, this.length - s.length) !== -1;
};

/**
 * @param {string|object} url - The URL, or the result from url.parse.
 * @return {string} The URL of the proxy that should handle the request to the
 *  given URL. If no proxy is set, this will be an empty string.
 */
function getProxyForUrl(url) {
  var parsedUrl = typeof url === 'string' ? parseUrl(url) : url || {};
  var proto = parsedUrl.protocol;
  var hostname = parsedUrl.host;
  var port = parsedUrl.port;
  if (typeof hostname !== 'string' || !hostname || typeof proto !== 'string') {
    return '';  // Don't proxy URLs without a valid scheme or host.
  }

  proto = proto.split(':', 1)[0];
  // Stripping ports in this way instead of using parsedUrl.hostname to make
  // sure that the brackets around IPv6 addresses are kept.
  hostname = hostname.replace(/:\d*$/, '');
  port = parseInt(port) || DEFAULT_PORTS[proto] || 0;
  if (!shouldProxy(hostname, port)) {
    return '';  // Don't proxy URLs that match NO_PROXY.
  }

  var proxy = getEnv(proto + '_proxy') || getEnv('all_proxy');
  if (proxy && proxy.indexOf('://') === -1) {
    // Missing scheme in proxy, default to the requested URL's scheme.
    proxy = proto + '://' + proxy;
  }
  return proxy;
}

/**
 * Determines whether a given URL should be proxied.
 *
 * @param {string} hostname - The host name of the URL.
 * @param {number} port - The effective port of the URL.
 * @returns {boolean} Whether the given URL should be proxied.
 * @private
 */
function shouldProxy(hostname, port) {
  var NO_PROXY = getEnv('no_proxy').toLowerCase();
  if (!NO_PROXY) {
    return true;  // Always proxy if NO_PROXY is not set.
  }
  if (NO_PROXY === '*') {
    return false;  // Never proxy if wildcard is set.
  }

  return NO_PROXY.split(/[,\s]/).every(function(proxy) {
    if (!proxy) {
      return true;  // Skip zero-length hosts.
    }
    var parsedProxy = proxy.match(/^(.+):(\d+)$/);
    var parsedProxyHostname = parsedProxy ? parsedProxy[1] : proxy;
    var parsedProxyPort = parsedProxy ? parseInt(parsedProxy[2]) : 0;
    if (parsedProxyPort && parsedProxyPort !== port) {
      return true;  // Skip if ports don't match.
    }

    if (!/^[.*]/.test(parsedProxyHostname)) {
      // No wildcards, so stop proxying if there is an exact match.
      return hostname !== parsedProxyHostname;
    }

    if (parsedProxyHostname.charAt(0) === '*') {
      // Remove leading wildcard.
      parsedProxyHostname = parsedProxyHostname.slice(1);
    }
    // Stop proxying if the hostname ends with the no_proxy host.
    return !stringEndsWith.call(hostname, parsedProxyHostname);
  });
}

/**
 * Get the value for an environment variable.
 *
 * @param {string} key - The name of the environment variable.
 * @return {string} The value of the environment variable.
 * @private
 */
function getEnv(key) {
  return process.env[key.toLowerCase()] || process.env[key.toUpperCase()] || '';
}

exports.getProxyForUrl = getProxyForUrl;

}).call(this,require('_process'))
},{"_process":10,"url":43}],99:[function(require,module,exports){
(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.urltemplate = factory();
    }
}(this, function () {
  /**
   * @constructor
   */
  function UrlTemplate() {
  }

  /**
   * @private
   * @param {string} str
   * @return {string}
   */
  UrlTemplate.prototype.encodeReserved = function (str) {
    return str.split(/(%[0-9A-Fa-f]{2})/g).map(function (part) {
      if (!/%[0-9A-Fa-f]/.test(part)) {
        part = encodeURI(part).replace(/%5B/g, '[').replace(/%5D/g, ']');
      }
      return part;
    }).join('');
  };

  /**
   * @private
   * @param {string} str
   * @return {string}
   */
  UrlTemplate.prototype.encodeUnreserved = function (str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  /**
   * @private
   * @param {string} operator
   * @param {string} value
   * @param {string} key
   * @return {string}
   */
  UrlTemplate.prototype.encodeValue = function (operator, value, key) {
    value = (operator === '+' || operator === '#') ? this.encodeReserved(value) : this.encodeUnreserved(value);

    if (key) {
      return this.encodeUnreserved(key) + '=' + value;
    } else {
      return value;
    }
  };

  /**
   * @private
   * @param {*} value
   * @return {boolean}
   */
  UrlTemplate.prototype.isDefined = function (value) {
    return value !== undefined && value !== null;
  };

  /**
   * @private
   * @param {string}
   * @return {boolean}
   */
  UrlTemplate.prototype.isKeyOperator = function (operator) {
    return operator === ';' || operator === '&' || operator === '?';
  };

  /**
   * @private
   * @param {Object} context
   * @param {string} operator
   * @param {string} key
   * @param {string} modifier
   */
  UrlTemplate.prototype.getValues = function (context, operator, key, modifier) {
    var value = context[key],
        result = [];

    if (this.isDefined(value) && value !== '') {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        value = value.toString();

        if (modifier && modifier !== '*') {
          value = value.substring(0, parseInt(modifier, 10));
        }

        result.push(this.encodeValue(operator, value, this.isKeyOperator(operator) ? key : null));
      } else {
        if (modifier === '*') {
          if (Array.isArray(value)) {
            value.filter(this.isDefined).forEach(function (value) {
              result.push(this.encodeValue(operator, value, this.isKeyOperator(operator) ? key : null));
            }, this);
          } else {
            Object.keys(value).forEach(function (k) {
              if (this.isDefined(value[k])) {
                result.push(this.encodeValue(operator, value[k], k));
              }
            }, this);
          }
        } else {
          var tmp = [];

          if (Array.isArray(value)) {
            value.filter(this.isDefined).forEach(function (value) {
              tmp.push(this.encodeValue(operator, value));
            }, this);
          } else {
            Object.keys(value).forEach(function (k) {
              if (this.isDefined(value[k])) {
                tmp.push(this.encodeUnreserved(k));
                tmp.push(this.encodeValue(operator, value[k].toString()));
              }
            }, this);
          }

          if (this.isKeyOperator(operator)) {
            result.push(this.encodeUnreserved(key) + '=' + tmp.join(','));
          } else if (tmp.length !== 0) {
            result.push(tmp.join(','));
          }
        }
      }
    } else {
      if (operator === ';') {
        if (this.isDefined(value)) {
          result.push(this.encodeUnreserved(key));
        }
      } else if (value === '' && (operator === '&' || operator === '?')) {
        result.push(this.encodeUnreserved(key) + '=');
      } else if (value === '') {
        result.push('');
      }
    }
    return result;
  };

  /**
   * @param {string} template
   * @return {function(Object):string}
   */
  UrlTemplate.prototype.parse = function (template) {
    var that = this;
    var operators = ['+', '#', '.', '/', ';', '?', '&'];

    return {
      expand: function (context) {
        return template.replace(/\{([^\{\}]+)\}|([^\{\}]+)/g, function (_, expression, literal) {
          if (expression) {
            var operator = null,
                values = [];

            if (operators.indexOf(expression.charAt(0)) !== -1) {
              operator = expression.charAt(0);
              expression = expression.substr(1);
            }

            expression.split(/,/g).forEach(function (variable) {
              var tmp = /([^:\*]*)(?::(\d+)|(\*))?/.exec(variable);
              values.push.apply(values, that.getValues(context, operator, tmp[1], tmp[2] || tmp[3]));
            });

            if (operator && operator !== '+') {
              var separator = ',';

              if (operator === '?') {
                separator = '&';
              } else if (operator !== '#') {
                separator = operator;
              }
              return (values.length !== 0 ? operator : '') + values.join(separator);
            } else {
              return values.join(',');
            }
          } else {
            return that.encodeReserved(literal);
          }
        });
      }
    };
  };

  return new UrlTemplate();
}));

},{}],100:[function(require,module,exports){
/*!
 * JavaScript Cookie v2.2.0
 * https://github.com/js-cookie/js-cookie
 *
 * Copyright 2006, 2015 Klaus Hartl & Fagner Brack
 * Released under the MIT license
 */
;(function (factory) {
	var registeredInModuleLoader = false;
	if (typeof define === 'function' && define.amd) {
		define(factory);
		registeredInModuleLoader = true;
	}
	if (typeof exports === 'object') {
		module.exports = factory();
		registeredInModuleLoader = true;
	}
	if (!registeredInModuleLoader) {
		var OldCookies = window.Cookies;
		var api = window.Cookies = factory();
		api.noConflict = function () {
			window.Cookies = OldCookies;
			return api;
		};
	}
}(function () {
	function extend () {
		var i = 0;
		var result = {};
		for (; i < arguments.length; i++) {
			var attributes = arguments[ i ];
			for (var key in attributes) {
				result[key] = attributes[key];
			}
		}
		return result;
	}

	function init (converter) {
		function api (key, value, attributes) {
			var result;
			if (typeof document === 'undefined') {
				return;
			}

			// Write

			if (arguments.length > 1) {
				attributes = extend({
					path: '/'
				}, api.defaults, attributes);

				if (typeof attributes.expires === 'number') {
					var expires = new Date();
					expires.setMilliseconds(expires.getMilliseconds() + attributes.expires * 864e+5);
					attributes.expires = expires;
				}

				// We're using "expires" because "max-age" is not supported by IE
				attributes.expires = attributes.expires ? attributes.expires.toUTCString() : '';

				try {
					result = JSON.stringify(value);
					if (/^[\{\[]/.test(result)) {
						value = result;
					}
				} catch (e) {}

				if (!converter.write) {
					value = encodeURIComponent(String(value))
						.replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g, decodeURIComponent);
				} else {
					value = converter.write(value, key);
				}

				key = encodeURIComponent(String(key));
				key = key.replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent);
				key = key.replace(/[\(\)]/g, escape);

				var stringifiedAttributes = '';

				for (var attributeName in attributes) {
					if (!attributes[attributeName]) {
						continue;
					}
					stringifiedAttributes += '; ' + attributeName;
					if (attributes[attributeName] === true) {
						continue;
					}
					stringifiedAttributes += '=' + attributes[attributeName];
				}
				return (document.cookie = key + '=' + value + stringifiedAttributes);
			}

			// Read

			if (!key) {
				result = {};
			}

			// To prevent the for loop in the first place assign an empty array
			// in case there are no cookies at all. Also prevents odd result when
			// calling "get()"
			var cookies = document.cookie ? document.cookie.split('; ') : [];
			var rdecode = /(%[0-9A-Z]{2})+/g;
			var i = 0;

			for (; i < cookies.length; i++) {
				var parts = cookies[i].split('=');
				var cookie = parts.slice(1).join('=');

				if (!this.json && cookie.charAt(0) === '"') {
					cookie = cookie.slice(1, -1);
				}

				try {
					var name = parts[0].replace(rdecode, decodeURIComponent);
					cookie = converter.read ?
						converter.read(cookie, name) : converter(cookie, name) ||
						cookie.replace(rdecode, decodeURIComponent);

					if (this.json) {
						try {
							cookie = JSON.parse(cookie);
						} catch (e) {}
					}

					if (key === name) {
						result = cookie;
						break;
					}

					if (!key) {
						result[name] = cookie;
					}
				} catch (e) {}
			}

			return result;
		}

		api.set = api;
		api.get = function (key) {
			return api.call(api, key);
		};
		api.getJSON = function () {
			return api.apply({
				json: true
			}, [].slice.call(arguments));
		};
		api.defaults = {};

		api.remove = function (key, attributes) {
			api(key, '', extend(attributes, {
				expires: -1
			}));
		};

		api.withConverter = init;

		return api;
	}

	return init(function () {});
}));

},{}],101:[function(require,module,exports){
//! moment.js
//! version : 2.20.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, (function () { 'use strict';

var hookCallback;

function hooks () {
    return hookCallback.apply(null, arguments);
}

// This is done to register the method called with moment()
// without creating circular dependencies.
function setHookCallback (callback) {
    hookCallback = callback;
}

function isArray(input) {
    return input instanceof Array || Object.prototype.toString.call(input) === '[object Array]';
}

function isObject(input) {
    // IE8 will treat undefined and null as object if it wasn't for
    // input != null
    return input != null && Object.prototype.toString.call(input) === '[object Object]';
}

function isObjectEmpty(obj) {
    if (Object.getOwnPropertyNames) {
        return (Object.getOwnPropertyNames(obj).length === 0);
    } else {
        var k;
        for (k in obj) {
            if (obj.hasOwnProperty(k)) {
                return false;
            }
        }
        return true;
    }
}

function isUndefined(input) {
    return input === void 0;
}

function isNumber(input) {
    return typeof input === 'number' || Object.prototype.toString.call(input) === '[object Number]';
}

function isDate(input) {
    return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
}

function map(arr, fn) {
    var res = [], i;
    for (i = 0; i < arr.length; ++i) {
        res.push(fn(arr[i], i));
    }
    return res;
}

function hasOwnProp(a, b) {
    return Object.prototype.hasOwnProperty.call(a, b);
}

function extend(a, b) {
    for (var i in b) {
        if (hasOwnProp(b, i)) {
            a[i] = b[i];
        }
    }

    if (hasOwnProp(b, 'toString')) {
        a.toString = b.toString;
    }

    if (hasOwnProp(b, 'valueOf')) {
        a.valueOf = b.valueOf;
    }

    return a;
}

function createUTC (input, format, locale, strict) {
    return createLocalOrUTC(input, format, locale, strict, true).utc();
}

function defaultParsingFlags() {
    // We need to deep clone this object.
    return {
        empty           : false,
        unusedTokens    : [],
        unusedInput     : [],
        overflow        : -2,
        charsLeftOver   : 0,
        nullInput       : false,
        invalidMonth    : null,
        invalidFormat   : false,
        userInvalidated : false,
        iso             : false,
        parsedDateParts : [],
        meridiem        : null,
        rfc2822         : false,
        weekdayMismatch : false
    };
}

function getParsingFlags(m) {
    if (m._pf == null) {
        m._pf = defaultParsingFlags();
    }
    return m._pf;
}

var some;
if (Array.prototype.some) {
    some = Array.prototype.some;
} else {
    some = function (fun) {
        var t = Object(this);
        var len = t.length >>> 0;

        for (var i = 0; i < len; i++) {
            if (i in t && fun.call(this, t[i], i, t)) {
                return true;
            }
        }

        return false;
    };
}

function isValid(m) {
    if (m._isValid == null) {
        var flags = getParsingFlags(m);
        var parsedParts = some.call(flags.parsedDateParts, function (i) {
            return i != null;
        });
        var isNowValid = !isNaN(m._d.getTime()) &&
            flags.overflow < 0 &&
            !flags.empty &&
            !flags.invalidMonth &&
            !flags.invalidWeekday &&
            !flags.weekdayMismatch &&
            !flags.nullInput &&
            !flags.invalidFormat &&
            !flags.userInvalidated &&
            (!flags.meridiem || (flags.meridiem && parsedParts));

        if (m._strict) {
            isNowValid = isNowValid &&
                flags.charsLeftOver === 0 &&
                flags.unusedTokens.length === 0 &&
                flags.bigHour === undefined;
        }

        if (Object.isFrozen == null || !Object.isFrozen(m)) {
            m._isValid = isNowValid;
        }
        else {
            return isNowValid;
        }
    }
    return m._isValid;
}

function createInvalid (flags) {
    var m = createUTC(NaN);
    if (flags != null) {
        extend(getParsingFlags(m), flags);
    }
    else {
        getParsingFlags(m).userInvalidated = true;
    }

    return m;
}

// Plugins that add properties should also add the key here (null value),
// so we can properly clone ourselves.
var momentProperties = hooks.momentProperties = [];

function copyConfig(to, from) {
    var i, prop, val;

    if (!isUndefined(from._isAMomentObject)) {
        to._isAMomentObject = from._isAMomentObject;
    }
    if (!isUndefined(from._i)) {
        to._i = from._i;
    }
    if (!isUndefined(from._f)) {
        to._f = from._f;
    }
    if (!isUndefined(from._l)) {
        to._l = from._l;
    }
    if (!isUndefined(from._strict)) {
        to._strict = from._strict;
    }
    if (!isUndefined(from._tzm)) {
        to._tzm = from._tzm;
    }
    if (!isUndefined(from._isUTC)) {
        to._isUTC = from._isUTC;
    }
    if (!isUndefined(from._offset)) {
        to._offset = from._offset;
    }
    if (!isUndefined(from._pf)) {
        to._pf = getParsingFlags(from);
    }
    if (!isUndefined(from._locale)) {
        to._locale = from._locale;
    }

    if (momentProperties.length > 0) {
        for (i = 0; i < momentProperties.length; i++) {
            prop = momentProperties[i];
            val = from[prop];
            if (!isUndefined(val)) {
                to[prop] = val;
            }
        }
    }

    return to;
}

var updateInProgress = false;

// Moment prototype object
function Moment(config) {
    copyConfig(this, config);
    this._d = new Date(config._d != null ? config._d.getTime() : NaN);
    if (!this.isValid()) {
        this._d = new Date(NaN);
    }
    // Prevent infinite loop in case updateOffset creates new moment
    // objects.
    if (updateInProgress === false) {
        updateInProgress = true;
        hooks.updateOffset(this);
        updateInProgress = false;
    }
}

function isMoment (obj) {
    return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
}

function absFloor (number) {
    if (number < 0) {
        // -0 -> 0
        return Math.ceil(number) || 0;
    } else {
        return Math.floor(number);
    }
}

function toInt(argumentForCoercion) {
    var coercedNumber = +argumentForCoercion,
        value = 0;

    if (coercedNumber !== 0 && isFinite(coercedNumber)) {
        value = absFloor(coercedNumber);
    }

    return value;
}

// compare two arrays, return the number of differences
function compareArrays(array1, array2, dontConvert) {
    var len = Math.min(array1.length, array2.length),
        lengthDiff = Math.abs(array1.length - array2.length),
        diffs = 0,
        i;
    for (i = 0; i < len; i++) {
        if ((dontConvert && array1[i] !== array2[i]) ||
            (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
            diffs++;
        }
    }
    return diffs + lengthDiff;
}

function warn(msg) {
    if (hooks.suppressDeprecationWarnings === false &&
            (typeof console !==  'undefined') && console.warn) {
        console.warn('Deprecation warning: ' + msg);
    }
}

function deprecate(msg, fn) {
    var firstTime = true;

    return extend(function () {
        if (hooks.deprecationHandler != null) {
            hooks.deprecationHandler(null, msg);
        }
        if (firstTime) {
            var args = [];
            var arg;
            for (var i = 0; i < arguments.length; i++) {
                arg = '';
                if (typeof arguments[i] === 'object') {
                    arg += '\n[' + i + '] ';
                    for (var key in arguments[0]) {
                        arg += key + ': ' + arguments[0][key] + ', ';
                    }
                    arg = arg.slice(0, -2); // Remove trailing comma and space
                } else {
                    arg = arguments[i];
                }
                args.push(arg);
            }
            warn(msg + '\nArguments: ' + Array.prototype.slice.call(args).join('') + '\n' + (new Error()).stack);
            firstTime = false;
        }
        return fn.apply(this, arguments);
    }, fn);
}

var deprecations = {};

function deprecateSimple(name, msg) {
    if (hooks.deprecationHandler != null) {
        hooks.deprecationHandler(name, msg);
    }
    if (!deprecations[name]) {
        warn(msg);
        deprecations[name] = true;
    }
}

hooks.suppressDeprecationWarnings = false;
hooks.deprecationHandler = null;

function isFunction(input) {
    return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
}

function set (config) {
    var prop, i;
    for (i in config) {
        prop = config[i];
        if (isFunction(prop)) {
            this[i] = prop;
        } else {
            this['_' + i] = prop;
        }
    }
    this._config = config;
    // Lenient ordinal parsing accepts just a number in addition to
    // number + (possibly) stuff coming from _dayOfMonthOrdinalParse.
    // TODO: Remove "ordinalParse" fallback in next major release.
    this._dayOfMonthOrdinalParseLenient = new RegExp(
        (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
            '|' + (/\d{1,2}/).source);
}

function mergeConfigs(parentConfig, childConfig) {
    var res = extend({}, parentConfig), prop;
    for (prop in childConfig) {
        if (hasOwnProp(childConfig, prop)) {
            if (isObject(parentConfig[prop]) && isObject(childConfig[prop])) {
                res[prop] = {};
                extend(res[prop], parentConfig[prop]);
                extend(res[prop], childConfig[prop]);
            } else if (childConfig[prop] != null) {
                res[prop] = childConfig[prop];
            } else {
                delete res[prop];
            }
        }
    }
    for (prop in parentConfig) {
        if (hasOwnProp(parentConfig, prop) &&
                !hasOwnProp(childConfig, prop) &&
                isObject(parentConfig[prop])) {
            // make sure changes to properties don't modify parent config
            res[prop] = extend({}, res[prop]);
        }
    }
    return res;
}

function Locale(config) {
    if (config != null) {
        this.set(config);
    }
}

var keys;

if (Object.keys) {
    keys = Object.keys;
} else {
    keys = function (obj) {
        var i, res = [];
        for (i in obj) {
            if (hasOwnProp(obj, i)) {
                res.push(i);
            }
        }
        return res;
    };
}

var defaultCalendar = {
    sameDay : '[Today at] LT',
    nextDay : '[Tomorrow at] LT',
    nextWeek : 'dddd [at] LT',
    lastDay : '[Yesterday at] LT',
    lastWeek : '[Last] dddd [at] LT',
    sameElse : 'L'
};

function calendar (key, mom, now) {
    var output = this._calendar[key] || this._calendar['sameElse'];
    return isFunction(output) ? output.call(mom, now) : output;
}

var defaultLongDateFormat = {
    LTS  : 'h:mm:ss A',
    LT   : 'h:mm A',
    L    : 'MM/DD/YYYY',
    LL   : 'MMMM D, YYYY',
    LLL  : 'MMMM D, YYYY h:mm A',
    LLLL : 'dddd, MMMM D, YYYY h:mm A'
};

function longDateFormat (key) {
    var format = this._longDateFormat[key],
        formatUpper = this._longDateFormat[key.toUpperCase()];

    if (format || !formatUpper) {
        return format;
    }

    this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
        return val.slice(1);
    });

    return this._longDateFormat[key];
}

var defaultInvalidDate = 'Invalid date';

function invalidDate () {
    return this._invalidDate;
}

var defaultOrdinal = '%d';
var defaultDayOfMonthOrdinalParse = /\d{1,2}/;

function ordinal (number) {
    return this._ordinal.replace('%d', number);
}

var defaultRelativeTime = {
    future : 'in %s',
    past   : '%s ago',
    s  : 'a few seconds',
    ss : '%d seconds',
    m  : 'a minute',
    mm : '%d minutes',
    h  : 'an hour',
    hh : '%d hours',
    d  : 'a day',
    dd : '%d days',
    M  : 'a month',
    MM : '%d months',
    y  : 'a year',
    yy : '%d years'
};

function relativeTime (number, withoutSuffix, string, isFuture) {
    var output = this._relativeTime[string];
    return (isFunction(output)) ?
        output(number, withoutSuffix, string, isFuture) :
        output.replace(/%d/i, number);
}

function pastFuture (diff, output) {
    var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
    return isFunction(format) ? format(output) : format.replace(/%s/i, output);
}

var aliases = {};

function addUnitAlias (unit, shorthand) {
    var lowerCase = unit.toLowerCase();
    aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
}

function normalizeUnits(units) {
    return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
}

function normalizeObjectUnits(inputObject) {
    var normalizedInput = {},
        normalizedProp,
        prop;

    for (prop in inputObject) {
        if (hasOwnProp(inputObject, prop)) {
            normalizedProp = normalizeUnits(prop);
            if (normalizedProp) {
                normalizedInput[normalizedProp] = inputObject[prop];
            }
        }
    }

    return normalizedInput;
}

var priorities = {};

function addUnitPriority(unit, priority) {
    priorities[unit] = priority;
}

function getPrioritizedUnits(unitsObj) {
    var units = [];
    for (var u in unitsObj) {
        units.push({unit: u, priority: priorities[u]});
    }
    units.sort(function (a, b) {
        return a.priority - b.priority;
    });
    return units;
}

function zeroFill(number, targetLength, forceSign) {
    var absNumber = '' + Math.abs(number),
        zerosToFill = targetLength - absNumber.length,
        sign = number >= 0;
    return (sign ? (forceSign ? '+' : '') : '-') +
        Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
}

var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

var formatFunctions = {};

var formatTokenFunctions = {};

// token:    'M'
// padded:   ['MM', 2]
// ordinal:  'Mo'
// callback: function () { this.month() + 1 }
function addFormatToken (token, padded, ordinal, callback) {
    var func = callback;
    if (typeof callback === 'string') {
        func = function () {
            return this[callback]();
        };
    }
    if (token) {
        formatTokenFunctions[token] = func;
    }
    if (padded) {
        formatTokenFunctions[padded[0]] = function () {
            return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
        };
    }
    if (ordinal) {
        formatTokenFunctions[ordinal] = function () {
            return this.localeData().ordinal(func.apply(this, arguments), token);
        };
    }
}

function removeFormattingTokens(input) {
    if (input.match(/\[[\s\S]/)) {
        return input.replace(/^\[|\]$/g, '');
    }
    return input.replace(/\\/g, '');
}

function makeFormatFunction(format) {
    var array = format.match(formattingTokens), i, length;

    for (i = 0, length = array.length; i < length; i++) {
        if (formatTokenFunctions[array[i]]) {
            array[i] = formatTokenFunctions[array[i]];
        } else {
            array[i] = removeFormattingTokens(array[i]);
        }
    }

    return function (mom) {
        var output = '', i;
        for (i = 0; i < length; i++) {
            output += isFunction(array[i]) ? array[i].call(mom, format) : array[i];
        }
        return output;
    };
}

// format date using native date object
function formatMoment(m, format) {
    if (!m.isValid()) {
        return m.localeData().invalidDate();
    }

    format = expandFormat(format, m.localeData());
    formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

    return formatFunctions[format](m);
}

function expandFormat(format, locale) {
    var i = 5;

    function replaceLongDateFormatTokens(input) {
        return locale.longDateFormat(input) || input;
    }

    localFormattingTokens.lastIndex = 0;
    while (i >= 0 && localFormattingTokens.test(format)) {
        format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        localFormattingTokens.lastIndex = 0;
        i -= 1;
    }

    return format;
}

var match1         = /\d/;            //       0 - 9
var match2         = /\d\d/;          //      00 - 99
var match3         = /\d{3}/;         //     000 - 999
var match4         = /\d{4}/;         //    0000 - 9999
var match6         = /[+-]?\d{6}/;    // -999999 - 999999
var match1to2      = /\d\d?/;         //       0 - 99
var match3to4      = /\d\d\d\d?/;     //     999 - 9999
var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
var match1to3      = /\d{1,3}/;       //       0 - 999
var match1to4      = /\d{1,4}/;       //       0 - 9999
var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

var matchUnsigned  = /\d+/;           //       0 - inf
var matchSigned    = /[+-]?\d+/;      //    -inf - inf

var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

// any word (or two) characters or numbers including two/three word month in arabic.
// includes scottish gaelic two word and hyphenated months
var matchWord = /[0-9]{0,256}['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFF07\uFF10-\uFFEF]{1,256}|[\u0600-\u06FF\/]{1,256}(\s*?[\u0600-\u06FF]{1,256}){1,2}/i;


var regexes = {};

function addRegexToken (token, regex, strictRegex) {
    regexes[token] = isFunction(regex) ? regex : function (isStrict, localeData) {
        return (isStrict && strictRegex) ? strictRegex : regex;
    };
}

function getParseRegexForToken (token, config) {
    if (!hasOwnProp(regexes, token)) {
        return new RegExp(unescapeFormat(token));
    }

    return regexes[token](config._strict, config._locale);
}

// Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
function unescapeFormat(s) {
    return regexEscape(s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
        return p1 || p2 || p3 || p4;
    }));
}

function regexEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var tokens = {};

function addParseToken (token, callback) {
    var i, func = callback;
    if (typeof token === 'string') {
        token = [token];
    }
    if (isNumber(callback)) {
        func = function (input, array) {
            array[callback] = toInt(input);
        };
    }
    for (i = 0; i < token.length; i++) {
        tokens[token[i]] = func;
    }
}

function addWeekParseToken (token, callback) {
    addParseToken(token, function (input, array, config, token) {
        config._w = config._w || {};
        callback(input, config._w, config, token);
    });
}

function addTimeToArrayFromToken(token, input, config) {
    if (input != null && hasOwnProp(tokens, token)) {
        tokens[token](input, config._a, config, token);
    }
}

var YEAR = 0;
var MONTH = 1;
var DATE = 2;
var HOUR = 3;
var MINUTE = 4;
var SECOND = 5;
var MILLISECOND = 6;
var WEEK = 7;
var WEEKDAY = 8;

// FORMATTING

addFormatToken('Y', 0, 0, function () {
    var y = this.year();
    return y <= 9999 ? '' + y : '+' + y;
});

addFormatToken(0, ['YY', 2], 0, function () {
    return this.year() % 100;
});

addFormatToken(0, ['YYYY',   4],       0, 'year');
addFormatToken(0, ['YYYYY',  5],       0, 'year');
addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

// ALIASES

addUnitAlias('year', 'y');

// PRIORITIES

addUnitPriority('year', 1);

// PARSING

addRegexToken('Y',      matchSigned);
addRegexToken('YY',     match1to2, match2);
addRegexToken('YYYY',   match1to4, match4);
addRegexToken('YYYYY',  match1to6, match6);
addRegexToken('YYYYYY', match1to6, match6);

addParseToken(['YYYYY', 'YYYYYY'], YEAR);
addParseToken('YYYY', function (input, array) {
    array[YEAR] = input.length === 2 ? hooks.parseTwoDigitYear(input) : toInt(input);
});
addParseToken('YY', function (input, array) {
    array[YEAR] = hooks.parseTwoDigitYear(input);
});
addParseToken('Y', function (input, array) {
    array[YEAR] = parseInt(input, 10);
});

// HELPERS

function daysInYear(year) {
    return isLeapYear(year) ? 366 : 365;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// HOOKS

hooks.parseTwoDigitYear = function (input) {
    return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
};

// MOMENTS

var getSetYear = makeGetSet('FullYear', true);

function getIsLeapYear () {
    return isLeapYear(this.year());
}

function makeGetSet (unit, keepTime) {
    return function (value) {
        if (value != null) {
            set$1(this, unit, value);
            hooks.updateOffset(this, keepTime);
            return this;
        } else {
            return get(this, unit);
        }
    };
}

function get (mom, unit) {
    return mom.isValid() ?
        mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
}

function set$1 (mom, unit, value) {
    if (mom.isValid() && !isNaN(value)) {
        if (unit === 'FullYear' && isLeapYear(mom.year()) && mom.month() === 1 && mom.date() === 29) {
            mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value, mom.month(), daysInMonth(value, mom.month()));
        }
        else {
            mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }
}

// MOMENTS

function stringGet (units) {
    units = normalizeUnits(units);
    if (isFunction(this[units])) {
        return this[units]();
    }
    return this;
}


function stringSet (units, value) {
    if (typeof units === 'object') {
        units = normalizeObjectUnits(units);
        var prioritized = getPrioritizedUnits(units);
        for (var i = 0; i < prioritized.length; i++) {
            this[prioritized[i].unit](units[prioritized[i].unit]);
        }
    } else {
        units = normalizeUnits(units);
        if (isFunction(this[units])) {
            return this[units](value);
        }
    }
    return this;
}

function mod(n, x) {
    return ((n % x) + x) % x;
}

var indexOf;

if (Array.prototype.indexOf) {
    indexOf = Array.prototype.indexOf;
} else {
    indexOf = function (o) {
        // I know
        var i;
        for (i = 0; i < this.length; ++i) {
            if (this[i] === o) {
                return i;
            }
        }
        return -1;
    };
}

function daysInMonth(year, month) {
    if (isNaN(year) || isNaN(month)) {
        return NaN;
    }
    var modMonth = mod(month, 12);
    year += (month - modMonth) / 12;
    return modMonth === 1 ? (isLeapYear(year) ? 29 : 28) : (31 - modMonth % 7 % 2);
}

// FORMATTING

addFormatToken('M', ['MM', 2], 'Mo', function () {
    return this.month() + 1;
});

addFormatToken('MMM', 0, 0, function (format) {
    return this.localeData().monthsShort(this, format);
});

addFormatToken('MMMM', 0, 0, function (format) {
    return this.localeData().months(this, format);
});

// ALIASES

addUnitAlias('month', 'M');

// PRIORITY

addUnitPriority('month', 8);

// PARSING

addRegexToken('M',    match1to2);
addRegexToken('MM',   match1to2, match2);
addRegexToken('MMM',  function (isStrict, locale) {
    return locale.monthsShortRegex(isStrict);
});
addRegexToken('MMMM', function (isStrict, locale) {
    return locale.monthsRegex(isStrict);
});

addParseToken(['M', 'MM'], function (input, array) {
    array[MONTH] = toInt(input) - 1;
});

addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
    var month = config._locale.monthsParse(input, token, config._strict);
    // if we didn't find a month name, mark the date as invalid.
    if (month != null) {
        array[MONTH] = month;
    } else {
        getParsingFlags(config).invalidMonth = input;
    }
});

// LOCALES

var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/;
var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
function localeMonths (m, format) {
    if (!m) {
        return isArray(this._months) ? this._months :
            this._months['standalone'];
    }
    return isArray(this._months) ? this._months[m.month()] :
        this._months[(this._months.isFormat || MONTHS_IN_FORMAT).test(format) ? 'format' : 'standalone'][m.month()];
}

var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
function localeMonthsShort (m, format) {
    if (!m) {
        return isArray(this._monthsShort) ? this._monthsShort :
            this._monthsShort['standalone'];
    }
    return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
        this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
}

function handleStrictParse(monthName, format, strict) {
    var i, ii, mom, llc = monthName.toLocaleLowerCase();
    if (!this._monthsParse) {
        // this is not used
        this._monthsParse = [];
        this._longMonthsParse = [];
        this._shortMonthsParse = [];
        for (i = 0; i < 12; ++i) {
            mom = createUTC([2000, i]);
            this._shortMonthsParse[i] = this.monthsShort(mom, '').toLocaleLowerCase();
            this._longMonthsParse[i] = this.months(mom, '').toLocaleLowerCase();
        }
    }

    if (strict) {
        if (format === 'MMM') {
            ii = indexOf.call(this._shortMonthsParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf.call(this._longMonthsParse, llc);
            return ii !== -1 ? ii : null;
        }
    } else {
        if (format === 'MMM') {
            ii = indexOf.call(this._shortMonthsParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._longMonthsParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf.call(this._longMonthsParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._shortMonthsParse, llc);
            return ii !== -1 ? ii : null;
        }
    }
}

function localeMonthsParse (monthName, format, strict) {
    var i, mom, regex;

    if (this._monthsParseExact) {
        return handleStrictParse.call(this, monthName, format, strict);
    }

    if (!this._monthsParse) {
        this._monthsParse = [];
        this._longMonthsParse = [];
        this._shortMonthsParse = [];
    }

    // TODO: add sorting
    // Sorting makes sure if one month (or abbr) is a prefix of another
    // see sorting in computeMonthsParse
    for (i = 0; i < 12; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, i]);
        if (strict && !this._longMonthsParse[i]) {
            this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
            this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
        }
        if (!strict && !this._monthsParse[i]) {
            regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
            this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
        }
        // test the regex
        if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
            return i;
        } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
            return i;
        } else if (!strict && this._monthsParse[i].test(monthName)) {
            return i;
        }
    }
}

// MOMENTS

function setMonth (mom, value) {
    var dayOfMonth;

    if (!mom.isValid()) {
        // No op
        return mom;
    }

    if (typeof value === 'string') {
        if (/^\d+$/.test(value)) {
            value = toInt(value);
        } else {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (!isNumber(value)) {
                return mom;
            }
        }
    }

    dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
    mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
    return mom;
}

function getSetMonth (value) {
    if (value != null) {
        setMonth(this, value);
        hooks.updateOffset(this, true);
        return this;
    } else {
        return get(this, 'Month');
    }
}

function getDaysInMonth () {
    return daysInMonth(this.year(), this.month());
}

var defaultMonthsShortRegex = matchWord;
function monthsShortRegex (isStrict) {
    if (this._monthsParseExact) {
        if (!hasOwnProp(this, '_monthsRegex')) {
            computeMonthsParse.call(this);
        }
        if (isStrict) {
            return this._monthsShortStrictRegex;
        } else {
            return this._monthsShortRegex;
        }
    } else {
        if (!hasOwnProp(this, '_monthsShortRegex')) {
            this._monthsShortRegex = defaultMonthsShortRegex;
        }
        return this._monthsShortStrictRegex && isStrict ?
            this._monthsShortStrictRegex : this._monthsShortRegex;
    }
}

var defaultMonthsRegex = matchWord;
function monthsRegex (isStrict) {
    if (this._monthsParseExact) {
        if (!hasOwnProp(this, '_monthsRegex')) {
            computeMonthsParse.call(this);
        }
        if (isStrict) {
            return this._monthsStrictRegex;
        } else {
            return this._monthsRegex;
        }
    } else {
        if (!hasOwnProp(this, '_monthsRegex')) {
            this._monthsRegex = defaultMonthsRegex;
        }
        return this._monthsStrictRegex && isStrict ?
            this._monthsStrictRegex : this._monthsRegex;
    }
}

function computeMonthsParse () {
    function cmpLenRev(a, b) {
        return b.length - a.length;
    }

    var shortPieces = [], longPieces = [], mixedPieces = [],
        i, mom;
    for (i = 0; i < 12; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, i]);
        shortPieces.push(this.monthsShort(mom, ''));
        longPieces.push(this.months(mom, ''));
        mixedPieces.push(this.months(mom, ''));
        mixedPieces.push(this.monthsShort(mom, ''));
    }
    // Sorting makes sure if one month (or abbr) is a prefix of another it
    // will match the longer piece.
    shortPieces.sort(cmpLenRev);
    longPieces.sort(cmpLenRev);
    mixedPieces.sort(cmpLenRev);
    for (i = 0; i < 12; i++) {
        shortPieces[i] = regexEscape(shortPieces[i]);
        longPieces[i] = regexEscape(longPieces[i]);
    }
    for (i = 0; i < 24; i++) {
        mixedPieces[i] = regexEscape(mixedPieces[i]);
    }

    this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
    this._monthsShortRegex = this._monthsRegex;
    this._monthsStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
    this._monthsShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
}

function createDate (y, m, d, h, M, s, ms) {
    // can't just apply() to create a date:
    // https://stackoverflow.com/q/181348
    var date = new Date(y, m, d, h, M, s, ms);

    // the date constructor remaps years 0-99 to 1900-1999
    if (y < 100 && y >= 0 && isFinite(date.getFullYear())) {
        date.setFullYear(y);
    }
    return date;
}

function createUTCDate (y) {
    var date = new Date(Date.UTC.apply(null, arguments));

    // the Date.UTC function remaps years 0-99 to 1900-1999
    if (y < 100 && y >= 0 && isFinite(date.getUTCFullYear())) {
        date.setUTCFullYear(y);
    }
    return date;
}

// start-of-first-week - start-of-year
function firstWeekOffset(year, dow, doy) {
    var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
        fwd = 7 + dow - doy,
        // first-week day local weekday -- which local weekday is fwd
        fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

    return -fwdlw + fwd - 1;
}

// https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
    var localWeekday = (7 + weekday - dow) % 7,
        weekOffset = firstWeekOffset(year, dow, doy),
        dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
        resYear, resDayOfYear;

    if (dayOfYear <= 0) {
        resYear = year - 1;
        resDayOfYear = daysInYear(resYear) + dayOfYear;
    } else if (dayOfYear > daysInYear(year)) {
        resYear = year + 1;
        resDayOfYear = dayOfYear - daysInYear(year);
    } else {
        resYear = year;
        resDayOfYear = dayOfYear;
    }

    return {
        year: resYear,
        dayOfYear: resDayOfYear
    };
}

function weekOfYear(mom, dow, doy) {
    var weekOffset = firstWeekOffset(mom.year(), dow, doy),
        week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
        resWeek, resYear;

    if (week < 1) {
        resYear = mom.year() - 1;
        resWeek = week + weeksInYear(resYear, dow, doy);
    } else if (week > weeksInYear(mom.year(), dow, doy)) {
        resWeek = week - weeksInYear(mom.year(), dow, doy);
        resYear = mom.year() + 1;
    } else {
        resYear = mom.year();
        resWeek = week;
    }

    return {
        week: resWeek,
        year: resYear
    };
}

function weeksInYear(year, dow, doy) {
    var weekOffset = firstWeekOffset(year, dow, doy),
        weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
    return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
}

// FORMATTING

addFormatToken('w', ['ww', 2], 'wo', 'week');
addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

// ALIASES

addUnitAlias('week', 'w');
addUnitAlias('isoWeek', 'W');

// PRIORITIES

addUnitPriority('week', 5);
addUnitPriority('isoWeek', 5);

// PARSING

addRegexToken('w',  match1to2);
addRegexToken('ww', match1to2, match2);
addRegexToken('W',  match1to2);
addRegexToken('WW', match1to2, match2);

addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
    week[token.substr(0, 1)] = toInt(input);
});

// HELPERS

// LOCALES

function localeWeek (mom) {
    return weekOfYear(mom, this._week.dow, this._week.doy).week;
}

var defaultLocaleWeek = {
    dow : 0, // Sunday is the first day of the week.
    doy : 6  // The week that contains Jan 1st is the first week of the year.
};

function localeFirstDayOfWeek () {
    return this._week.dow;
}

function localeFirstDayOfYear () {
    return this._week.doy;
}

// MOMENTS

function getSetWeek (input) {
    var week = this.localeData().week(this);
    return input == null ? week : this.add((input - week) * 7, 'd');
}

function getSetISOWeek (input) {
    var week = weekOfYear(this, 1, 4).week;
    return input == null ? week : this.add((input - week) * 7, 'd');
}

// FORMATTING

addFormatToken('d', 0, 'do', 'day');

addFormatToken('dd', 0, 0, function (format) {
    return this.localeData().weekdaysMin(this, format);
});

addFormatToken('ddd', 0, 0, function (format) {
    return this.localeData().weekdaysShort(this, format);
});

addFormatToken('dddd', 0, 0, function (format) {
    return this.localeData().weekdays(this, format);
});

addFormatToken('e', 0, 0, 'weekday');
addFormatToken('E', 0, 0, 'isoWeekday');

// ALIASES

addUnitAlias('day', 'd');
addUnitAlias('weekday', 'e');
addUnitAlias('isoWeekday', 'E');

// PRIORITY
addUnitPriority('day', 11);
addUnitPriority('weekday', 11);
addUnitPriority('isoWeekday', 11);

// PARSING

addRegexToken('d',    match1to2);
addRegexToken('e',    match1to2);
addRegexToken('E',    match1to2);
addRegexToken('dd',   function (isStrict, locale) {
    return locale.weekdaysMinRegex(isStrict);
});
addRegexToken('ddd',   function (isStrict, locale) {
    return locale.weekdaysShortRegex(isStrict);
});
addRegexToken('dddd',   function (isStrict, locale) {
    return locale.weekdaysRegex(isStrict);
});

addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
    var weekday = config._locale.weekdaysParse(input, token, config._strict);
    // if we didn't get a weekday name, mark the date as invalid
    if (weekday != null) {
        week.d = weekday;
    } else {
        getParsingFlags(config).invalidWeekday = input;
    }
});

addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
    week[token] = toInt(input);
});

// HELPERS

function parseWeekday(input, locale) {
    if (typeof input !== 'string') {
        return input;
    }

    if (!isNaN(input)) {
        return parseInt(input, 10);
    }

    input = locale.weekdaysParse(input);
    if (typeof input === 'number') {
        return input;
    }

    return null;
}

function parseIsoWeekday(input, locale) {
    if (typeof input === 'string') {
        return locale.weekdaysParse(input) % 7 || 7;
    }
    return isNaN(input) ? null : input;
}

// LOCALES

var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
function localeWeekdays (m, format) {
    if (!m) {
        return isArray(this._weekdays) ? this._weekdays :
            this._weekdays['standalone'];
    }
    return isArray(this._weekdays) ? this._weekdays[m.day()] :
        this._weekdays[this._weekdays.isFormat.test(format) ? 'format' : 'standalone'][m.day()];
}

var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
function localeWeekdaysShort (m) {
    return (m) ? this._weekdaysShort[m.day()] : this._weekdaysShort;
}

var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
function localeWeekdaysMin (m) {
    return (m) ? this._weekdaysMin[m.day()] : this._weekdaysMin;
}

function handleStrictParse$1(weekdayName, format, strict) {
    var i, ii, mom, llc = weekdayName.toLocaleLowerCase();
    if (!this._weekdaysParse) {
        this._weekdaysParse = [];
        this._shortWeekdaysParse = [];
        this._minWeekdaysParse = [];

        for (i = 0; i < 7; ++i) {
            mom = createUTC([2000, 1]).day(i);
            this._minWeekdaysParse[i] = this.weekdaysMin(mom, '').toLocaleLowerCase();
            this._shortWeekdaysParse[i] = this.weekdaysShort(mom, '').toLocaleLowerCase();
            this._weekdaysParse[i] = this.weekdays(mom, '').toLocaleLowerCase();
        }
    }

    if (strict) {
        if (format === 'dddd') {
            ii = indexOf.call(this._weekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else if (format === 'ddd') {
            ii = indexOf.call(this._shortWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        }
    } else {
        if (format === 'dddd') {
            ii = indexOf.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._shortWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else if (format === 'ddd') {
            ii = indexOf.call(this._shortWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf.call(this._minWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf.call(this._shortWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        }
    }
}

function localeWeekdaysParse (weekdayName, format, strict) {
    var i, mom, regex;

    if (this._weekdaysParseExact) {
        return handleStrictParse$1.call(this, weekdayName, format, strict);
    }

    if (!this._weekdaysParse) {
        this._weekdaysParse = [];
        this._minWeekdaysParse = [];
        this._shortWeekdaysParse = [];
        this._fullWeekdaysParse = [];
    }

    for (i = 0; i < 7; i++) {
        // make the regex if we don't have it already

        mom = createUTC([2000, 1]).day(i);
        if (strict && !this._fullWeekdaysParse[i]) {
            this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\.?') + '$', 'i');
            this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\.?') + '$', 'i');
            this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\.?') + '$', 'i');
        }
        if (!this._weekdaysParse[i]) {
            regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
            this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
        }
        // test the regex
        if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
            return i;
        }
    }
}

// MOMENTS

function getSetDayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
    if (input != null) {
        input = parseWeekday(input, this.localeData());
        return this.add(input - day, 'd');
    } else {
        return day;
    }
}

function getSetLocaleDayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
    return input == null ? weekday : this.add(input - weekday, 'd');
}

function getSetISODayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }

    // behaves the same as moment#day except
    // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
    // as a setter, sunday should belong to the previous week.

    if (input != null) {
        var weekday = parseIsoWeekday(input, this.localeData());
        return this.day(this.day() % 7 ? weekday : weekday - 7);
    } else {
        return this.day() || 7;
    }
}

var defaultWeekdaysRegex = matchWord;
function weekdaysRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysStrictRegex;
        } else {
            return this._weekdaysRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            this._weekdaysRegex = defaultWeekdaysRegex;
        }
        return this._weekdaysStrictRegex && isStrict ?
            this._weekdaysStrictRegex : this._weekdaysRegex;
    }
}

var defaultWeekdaysShortRegex = matchWord;
function weekdaysShortRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysShortStrictRegex;
        } else {
            return this._weekdaysShortRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysShortRegex')) {
            this._weekdaysShortRegex = defaultWeekdaysShortRegex;
        }
        return this._weekdaysShortStrictRegex && isStrict ?
            this._weekdaysShortStrictRegex : this._weekdaysShortRegex;
    }
}

var defaultWeekdaysMinRegex = matchWord;
function weekdaysMinRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysMinStrictRegex;
        } else {
            return this._weekdaysMinRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysMinRegex')) {
            this._weekdaysMinRegex = defaultWeekdaysMinRegex;
        }
        return this._weekdaysMinStrictRegex && isStrict ?
            this._weekdaysMinStrictRegex : this._weekdaysMinRegex;
    }
}


function computeWeekdaysParse () {
    function cmpLenRev(a, b) {
        return b.length - a.length;
    }

    var minPieces = [], shortPieces = [], longPieces = [], mixedPieces = [],
        i, mom, minp, shortp, longp;
    for (i = 0; i < 7; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, 1]).day(i);
        minp = this.weekdaysMin(mom, '');
        shortp = this.weekdaysShort(mom, '');
        longp = this.weekdays(mom, '');
        minPieces.push(minp);
        shortPieces.push(shortp);
        longPieces.push(longp);
        mixedPieces.push(minp);
        mixedPieces.push(shortp);
        mixedPieces.push(longp);
    }
    // Sorting makes sure if one weekday (or abbr) is a prefix of another it
    // will match the longer piece.
    minPieces.sort(cmpLenRev);
    shortPieces.sort(cmpLenRev);
    longPieces.sort(cmpLenRev);
    mixedPieces.sort(cmpLenRev);
    for (i = 0; i < 7; i++) {
        shortPieces[i] = regexEscape(shortPieces[i]);
        longPieces[i] = regexEscape(longPieces[i]);
        mixedPieces[i] = regexEscape(mixedPieces[i]);
    }

    this._weekdaysRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
    this._weekdaysShortRegex = this._weekdaysRegex;
    this._weekdaysMinRegex = this._weekdaysRegex;

    this._weekdaysStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
    this._weekdaysShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
    this._weekdaysMinStrictRegex = new RegExp('^(' + minPieces.join('|') + ')', 'i');
}

// FORMATTING

function hFormat() {
    return this.hours() % 12 || 12;
}

function kFormat() {
    return this.hours() || 24;
}

addFormatToken('H', ['HH', 2], 0, 'hour');
addFormatToken('h', ['hh', 2], 0, hFormat);
addFormatToken('k', ['kk', 2], 0, kFormat);

addFormatToken('hmm', 0, 0, function () {
    return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
});

addFormatToken('hmmss', 0, 0, function () {
    return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
        zeroFill(this.seconds(), 2);
});

addFormatToken('Hmm', 0, 0, function () {
    return '' + this.hours() + zeroFill(this.minutes(), 2);
});

addFormatToken('Hmmss', 0, 0, function () {
    return '' + this.hours() + zeroFill(this.minutes(), 2) +
        zeroFill(this.seconds(), 2);
});

function meridiem (token, lowercase) {
    addFormatToken(token, 0, 0, function () {
        return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
    });
}

meridiem('a', true);
meridiem('A', false);

// ALIASES

addUnitAlias('hour', 'h');

// PRIORITY
addUnitPriority('hour', 13);

// PARSING

function matchMeridiem (isStrict, locale) {
    return locale._meridiemParse;
}

addRegexToken('a',  matchMeridiem);
addRegexToken('A',  matchMeridiem);
addRegexToken('H',  match1to2);
addRegexToken('h',  match1to2);
addRegexToken('k',  match1to2);
addRegexToken('HH', match1to2, match2);
addRegexToken('hh', match1to2, match2);
addRegexToken('kk', match1to2, match2);

addRegexToken('hmm', match3to4);
addRegexToken('hmmss', match5to6);
addRegexToken('Hmm', match3to4);
addRegexToken('Hmmss', match5to6);

addParseToken(['H', 'HH'], HOUR);
addParseToken(['k', 'kk'], function (input, array, config) {
    var kInput = toInt(input);
    array[HOUR] = kInput === 24 ? 0 : kInput;
});
addParseToken(['a', 'A'], function (input, array, config) {
    config._isPm = config._locale.isPM(input);
    config._meridiem = input;
});
addParseToken(['h', 'hh'], function (input, array, config) {
    array[HOUR] = toInt(input);
    getParsingFlags(config).bigHour = true;
});
addParseToken('hmm', function (input, array, config) {
    var pos = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos));
    array[MINUTE] = toInt(input.substr(pos));
    getParsingFlags(config).bigHour = true;
});
addParseToken('hmmss', function (input, array, config) {
    var pos1 = input.length - 4;
    var pos2 = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos1));
    array[MINUTE] = toInt(input.substr(pos1, 2));
    array[SECOND] = toInt(input.substr(pos2));
    getParsingFlags(config).bigHour = true;
});
addParseToken('Hmm', function (input, array, config) {
    var pos = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos));
    array[MINUTE] = toInt(input.substr(pos));
});
addParseToken('Hmmss', function (input, array, config) {
    var pos1 = input.length - 4;
    var pos2 = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos1));
    array[MINUTE] = toInt(input.substr(pos1, 2));
    array[SECOND] = toInt(input.substr(pos2));
});

// LOCALES

function localeIsPM (input) {
    // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
    // Using charAt should be more compatible.
    return ((input + '').toLowerCase().charAt(0) === 'p');
}

var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
function localeMeridiem (hours, minutes, isLower) {
    if (hours > 11) {
        return isLower ? 'pm' : 'PM';
    } else {
        return isLower ? 'am' : 'AM';
    }
}


// MOMENTS

// Setting the hour should keep the time, because the user explicitly
// specified which hour he wants. So trying to maintain the same hour (in
// a new timezone) makes sense. Adding/subtracting hours does not follow
// this rule.
var getSetHour = makeGetSet('Hours', true);

// months
// week
// weekdays
// meridiem
var baseConfig = {
    calendar: defaultCalendar,
    longDateFormat: defaultLongDateFormat,
    invalidDate: defaultInvalidDate,
    ordinal: defaultOrdinal,
    dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
    relativeTime: defaultRelativeTime,

    months: defaultLocaleMonths,
    monthsShort: defaultLocaleMonthsShort,

    week: defaultLocaleWeek,

    weekdays: defaultLocaleWeekdays,
    weekdaysMin: defaultLocaleWeekdaysMin,
    weekdaysShort: defaultLocaleWeekdaysShort,

    meridiemParse: defaultLocaleMeridiemParse
};

// internal storage for locale config files
var locales = {};
var localeFamilies = {};
var globalLocale;

function normalizeLocale(key) {
    return key ? key.toLowerCase().replace('_', '-') : key;
}

// pick the locale from the array
// try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
// substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
function chooseLocale(names) {
    var i = 0, j, next, locale, split;

    while (i < names.length) {
        split = normalizeLocale(names[i]).split('-');
        j = split.length;
        next = normalizeLocale(names[i + 1]);
        next = next ? next.split('-') : null;
        while (j > 0) {
            locale = loadLocale(split.slice(0, j).join('-'));
            if (locale) {
                return locale;
            }
            if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                //the next array item is better than a shallower substring of this one
                break;
            }
            j--;
        }
        i++;
    }
    return null;
}

function loadLocale(name) {
    var oldLocale = null;
    // TODO: Find a better way to register and load all the locales in Node
    if (!locales[name] && (typeof module !== 'undefined') &&
            module && module.exports) {
        try {
            oldLocale = globalLocale._abbr;
            var aliasedRequire = require;
            aliasedRequire('./locale/' + name);
            getSetGlobalLocale(oldLocale);
        } catch (e) {}
    }
    return locales[name];
}

// This function will load locale and then set the global locale.  If
// no arguments are passed in, it will simply return the current global
// locale key.
function getSetGlobalLocale (key, values) {
    var data;
    if (key) {
        if (isUndefined(values)) {
            data = getLocale(key);
        }
        else {
            data = defineLocale(key, values);
        }

        if (data) {
            // moment.duration._locale = moment._locale = data;
            globalLocale = data;
        }
    }

    return globalLocale._abbr;
}

function defineLocale (name, config) {
    if (config !== null) {
        var parentConfig = baseConfig;
        config.abbr = name;
        if (locales[name] != null) {
            deprecateSimple('defineLocaleOverride',
                    'use moment.updateLocale(localeName, config) to change ' +
                    'an existing locale. moment.defineLocale(localeName, ' +
                    'config) should only be used for creating a new locale ' +
                    'See http://momentjs.com/guides/#/warnings/define-locale/ for more info.');
            parentConfig = locales[name]._config;
        } else if (config.parentLocale != null) {
            if (locales[config.parentLocale] != null) {
                parentConfig = locales[config.parentLocale]._config;
            } else {
                if (!localeFamilies[config.parentLocale]) {
                    localeFamilies[config.parentLocale] = [];
                }
                localeFamilies[config.parentLocale].push({
                    name: name,
                    config: config
                });
                return null;
            }
        }
        locales[name] = new Locale(mergeConfigs(parentConfig, config));

        if (localeFamilies[name]) {
            localeFamilies[name].forEach(function (x) {
                defineLocale(x.name, x.config);
            });
        }

        // backwards compat for now: also set the locale
        // make sure we set the locale AFTER all child locales have been
        // created, so we won't end up with the child locale set.
        getSetGlobalLocale(name);


        return locales[name];
    } else {
        // useful for testing
        delete locales[name];
        return null;
    }
}

function updateLocale(name, config) {
    if (config != null) {
        var locale, tmpLocale, parentConfig = baseConfig;
        // MERGE
        tmpLocale = loadLocale(name);
        if (tmpLocale != null) {
            parentConfig = tmpLocale._config;
        }
        config = mergeConfigs(parentConfig, config);
        locale = new Locale(config);
        locale.parentLocale = locales[name];
        locales[name] = locale;

        // backwards compat for now: also set the locale
        getSetGlobalLocale(name);
    } else {
        // pass null for config to unupdate, useful for tests
        if (locales[name] != null) {
            if (locales[name].parentLocale != null) {
                locales[name] = locales[name].parentLocale;
            } else if (locales[name] != null) {
                delete locales[name];
            }
        }
    }
    return locales[name];
}

// returns locale data
function getLocale (key) {
    var locale;

    if (key && key._locale && key._locale._abbr) {
        key = key._locale._abbr;
    }

    if (!key) {
        return globalLocale;
    }

    if (!isArray(key)) {
        //short-circuit everything else
        locale = loadLocale(key);
        if (locale) {
            return locale;
        }
        key = [key];
    }

    return chooseLocale(key);
}

function listLocales() {
    return keys(locales);
}

function checkOverflow (m) {
    var overflow;
    var a = m._a;

    if (a && getParsingFlags(m).overflow === -2) {
        overflow =
            a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
            a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
            a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
            a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
            a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
            a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
            -1;

        if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
            overflow = DATE;
        }
        if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
            overflow = WEEK;
        }
        if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
            overflow = WEEKDAY;
        }

        getParsingFlags(m).overflow = overflow;
    }

    return m;
}

// Pick the first defined of two or three arguments.
function defaults(a, b, c) {
    if (a != null) {
        return a;
    }
    if (b != null) {
        return b;
    }
    return c;
}

function currentDateArray(config) {
    // hooks is actually the exported moment object
    var nowValue = new Date(hooks.now());
    if (config._useUTC) {
        return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
    }
    return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
}

// convert an array to a date.
// the array should mirror the parameters below
// note: all values past the year are optional and will default to the lowest possible value.
// [year, month, day , hour, minute, second, millisecond]
function configFromArray (config) {
    var i, date, input = [], currentDate, expectedWeekday, yearToUse;

    if (config._d) {
        return;
    }

    currentDate = currentDateArray(config);

    //compute day of the year from weeks and weekdays
    if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
        dayOfYearFromWeekInfo(config);
    }

    //if the day of the year is set, figure out what it is
    if (config._dayOfYear != null) {
        yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

        if (config._dayOfYear > daysInYear(yearToUse) || config._dayOfYear === 0) {
            getParsingFlags(config)._overflowDayOfYear = true;
        }

        date = createUTCDate(yearToUse, 0, config._dayOfYear);
        config._a[MONTH] = date.getUTCMonth();
        config._a[DATE] = date.getUTCDate();
    }

    // Default to current date.
    // * if no year, month, day of month are given, default to today
    // * if day of month is given, default month and year
    // * if month is given, default only year
    // * if year is given, don't default anything
    for (i = 0; i < 3 && config._a[i] == null; ++i) {
        config._a[i] = input[i] = currentDate[i];
    }

    // Zero out whatever was not defaulted, including time
    for (; i < 7; i++) {
        config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
    }

    // Check for 24:00:00.000
    if (config._a[HOUR] === 24 &&
            config._a[MINUTE] === 0 &&
            config._a[SECOND] === 0 &&
            config._a[MILLISECOND] === 0) {
        config._nextDay = true;
        config._a[HOUR] = 0;
    }

    config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
    expectedWeekday = config._useUTC ? config._d.getUTCDay() : config._d.getDay();

    // Apply timezone offset from input. The actual utcOffset can be changed
    // with parseZone.
    if (config._tzm != null) {
        config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
    }

    if (config._nextDay) {
        config._a[HOUR] = 24;
    }

    // check for mismatching day of week
    if (config._w && typeof config._w.d !== 'undefined' && config._w.d !== expectedWeekday) {
        getParsingFlags(config).weekdayMismatch = true;
    }
}

function dayOfYearFromWeekInfo(config) {
    var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

    w = config._w;
    if (w.GG != null || w.W != null || w.E != null) {
        dow = 1;
        doy = 4;

        // TODO: We need to take the current isoWeekYear, but that depends on
        // how we interpret now (local, utc, fixed offset). So create
        // a now version of current config (take local/utc/offset flags, and
        // create now).
        weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(createLocal(), 1, 4).year);
        week = defaults(w.W, 1);
        weekday = defaults(w.E, 1);
        if (weekday < 1 || weekday > 7) {
            weekdayOverflow = true;
        }
    } else {
        dow = config._locale._week.dow;
        doy = config._locale._week.doy;

        var curWeek = weekOfYear(createLocal(), dow, doy);

        weekYear = defaults(w.gg, config._a[YEAR], curWeek.year);

        // Default to current week.
        week = defaults(w.w, curWeek.week);

        if (w.d != null) {
            // weekday -- low day numbers are considered next week
            weekday = w.d;
            if (weekday < 0 || weekday > 6) {
                weekdayOverflow = true;
            }
        } else if (w.e != null) {
            // local weekday -- counting starts from begining of week
            weekday = w.e + dow;
            if (w.e < 0 || w.e > 6) {
                weekdayOverflow = true;
            }
        } else {
            // default to begining of week
            weekday = dow;
        }
    }
    if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
        getParsingFlags(config)._overflowWeeks = true;
    } else if (weekdayOverflow != null) {
        getParsingFlags(config)._overflowWeekday = true;
    } else {
        temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }
}

// iso 8601 regex
// 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;
var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;

var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

var isoDates = [
    ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
    ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
    ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
    ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
    ['YYYY-DDD', /\d{4}-\d{3}/],
    ['YYYY-MM', /\d{4}-\d\d/, false],
    ['YYYYYYMMDD', /[+-]\d{10}/],
    ['YYYYMMDD', /\d{8}/],
    // YYYYMM is NOT allowed by the standard
    ['GGGG[W]WWE', /\d{4}W\d{3}/],
    ['GGGG[W]WW', /\d{4}W\d{2}/, false],
    ['YYYYDDD', /\d{7}/]
];

// iso time formats and regexes
var isoTimes = [
    ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
    ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
    ['HH:mm:ss', /\d\d:\d\d:\d\d/],
    ['HH:mm', /\d\d:\d\d/],
    ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
    ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
    ['HHmmss', /\d\d\d\d\d\d/],
    ['HHmm', /\d\d\d\d/],
    ['HH', /\d\d/]
];

var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

// date from iso format
function configFromISO(config) {
    var i, l,
        string = config._i,
        match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
        allowTime, dateFormat, timeFormat, tzFormat;

    if (match) {
        getParsingFlags(config).iso = true;

        for (i = 0, l = isoDates.length; i < l; i++) {
            if (isoDates[i][1].exec(match[1])) {
                dateFormat = isoDates[i][0];
                allowTime = isoDates[i][2] !== false;
                break;
            }
        }
        if (dateFormat == null) {
            config._isValid = false;
            return;
        }
        if (match[3]) {
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(match[3])) {
                    // match[2] should be 'T' or space
                    timeFormat = (match[2] || ' ') + isoTimes[i][0];
                    break;
                }
            }
            if (timeFormat == null) {
                config._isValid = false;
                return;
            }
        }
        if (!allowTime && timeFormat != null) {
            config._isValid = false;
            return;
        }
        if (match[4]) {
            if (tzRegex.exec(match[4])) {
                tzFormat = 'Z';
            } else {
                config._isValid = false;
                return;
            }
        }
        config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
        configFromStringAndFormat(config);
    } else {
        config._isValid = false;
    }
}

// RFC 2822 regex: For details see https://tools.ietf.org/html/rfc2822#section-3.3
var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|([+-]\d{4}))$/;

function extractFromRFC2822Strings(yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
    var result = [
        untruncateYear(yearStr),
        defaultLocaleMonthsShort.indexOf(monthStr),
        parseInt(dayStr, 10),
        parseInt(hourStr, 10),
        parseInt(minuteStr, 10)
    ];

    if (secondStr) {
        result.push(parseInt(secondStr, 10));
    }

    return result;
}

function untruncateYear(yearStr) {
    var year = parseInt(yearStr, 10);
    if (year <= 49) {
        return 2000 + year;
    } else if (year <= 999) {
        return 1900 + year;
    }
    return year;
}

function preprocessRFC2822(s) {
    // Remove comments and folding whitespace and replace multiple-spaces with a single space
    return s.replace(/\([^)]*\)|[\n\t]/g, ' ').replace(/(\s\s+)/g, ' ').trim();
}

function checkWeekday(weekdayStr, parsedInput, config) {
    if (weekdayStr) {
        // TODO: Replace the vanilla JS Date object with an indepentent day-of-week check.
        var weekdayProvided = defaultLocaleWeekdaysShort.indexOf(weekdayStr),
            weekdayActual = new Date(parsedInput[0], parsedInput[1], parsedInput[2]).getDay();
        if (weekdayProvided !== weekdayActual) {
            getParsingFlags(config).weekdayMismatch = true;
            config._isValid = false;
            return false;
        }
    }
    return true;
}

var obsOffsets = {
    UT: 0,
    GMT: 0,
    EDT: -4 * 60,
    EST: -5 * 60,
    CDT: -5 * 60,
    CST: -6 * 60,
    MDT: -6 * 60,
    MST: -7 * 60,
    PDT: -7 * 60,
    PST: -8 * 60
};

function calculateOffset(obsOffset, militaryOffset, numOffset) {
    if (obsOffset) {
        return obsOffsets[obsOffset];
    } else if (militaryOffset) {
        // the only allowed military tz is Z
        return 0;
    } else {
        var hm = parseInt(numOffset, 10);
        var m = hm % 100, h = (hm - m) / 100;
        return h * 60 + m;
    }
}

// date and time from ref 2822 format
function configFromRFC2822(config) {
    var match = rfc2822.exec(preprocessRFC2822(config._i));
    if (match) {
        var parsedArray = extractFromRFC2822Strings(match[4], match[3], match[2], match[5], match[6], match[7]);
        if (!checkWeekday(match[1], parsedArray, config)) {
            return;
        }

        config._a = parsedArray;
        config._tzm = calculateOffset(match[8], match[9], match[10]);

        config._d = createUTCDate.apply(null, config._a);
        config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);

        getParsingFlags(config).rfc2822 = true;
    } else {
        config._isValid = false;
    }
}

// date from iso format or fallback
function configFromString(config) {
    var matched = aspNetJsonRegex.exec(config._i);

    if (matched !== null) {
        config._d = new Date(+matched[1]);
        return;
    }

    configFromISO(config);
    if (config._isValid === false) {
        delete config._isValid;
    } else {
        return;
    }

    configFromRFC2822(config);
    if (config._isValid === false) {
        delete config._isValid;
    } else {
        return;
    }

    // Final attempt, use Input Fallback
    hooks.createFromInputFallback(config);
}

hooks.createFromInputFallback = deprecate(
    'value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), ' +
    'which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are ' +
    'discouraged and will be removed in an upcoming major release. Please refer to ' +
    'http://momentjs.com/guides/#/warnings/js-date/ for more info.',
    function (config) {
        config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
    }
);

// constant that refers to the ISO standard
hooks.ISO_8601 = function () {};

// constant that refers to the RFC 2822 form
hooks.RFC_2822 = function () {};

// date from string and format string
function configFromStringAndFormat(config) {
    // TODO: Move this to another part of the creation flow to prevent circular deps
    if (config._f === hooks.ISO_8601) {
        configFromISO(config);
        return;
    }
    if (config._f === hooks.RFC_2822) {
        configFromRFC2822(config);
        return;
    }
    config._a = [];
    getParsingFlags(config).empty = true;

    // This array is used to make a Date, either with `new Date` or `Date.UTC`
    var string = '' + config._i,
        i, parsedInput, tokens, token, skipped,
        stringLength = string.length,
        totalParsedInputLength = 0;

    tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

    for (i = 0; i < tokens.length; i++) {
        token = tokens[i];
        parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
        // console.log('token', token, 'parsedInput', parsedInput,
        //         'regex', getParseRegexForToken(token, config));
        if (parsedInput) {
            skipped = string.substr(0, string.indexOf(parsedInput));
            if (skipped.length > 0) {
                getParsingFlags(config).unusedInput.push(skipped);
            }
            string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            totalParsedInputLength += parsedInput.length;
        }
        // don't parse if it's not a known token
        if (formatTokenFunctions[token]) {
            if (parsedInput) {
                getParsingFlags(config).empty = false;
            }
            else {
                getParsingFlags(config).unusedTokens.push(token);
            }
            addTimeToArrayFromToken(token, parsedInput, config);
        }
        else if (config._strict && !parsedInput) {
            getParsingFlags(config).unusedTokens.push(token);
        }
    }

    // add remaining unparsed input length to the string
    getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
    if (string.length > 0) {
        getParsingFlags(config).unusedInput.push(string);
    }

    // clear _12h flag if hour is <= 12
    if (config._a[HOUR] <= 12 &&
        getParsingFlags(config).bigHour === true &&
        config._a[HOUR] > 0) {
        getParsingFlags(config).bigHour = undefined;
    }

    getParsingFlags(config).parsedDateParts = config._a.slice(0);
    getParsingFlags(config).meridiem = config._meridiem;
    // handle meridiem
    config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

    configFromArray(config);
    checkOverflow(config);
}


function meridiemFixWrap (locale, hour, meridiem) {
    var isPm;

    if (meridiem == null) {
        // nothing to do
        return hour;
    }
    if (locale.meridiemHour != null) {
        return locale.meridiemHour(hour, meridiem);
    } else if (locale.isPM != null) {
        // Fallback
        isPm = locale.isPM(meridiem);
        if (isPm && hour < 12) {
            hour += 12;
        }
        if (!isPm && hour === 12) {
            hour = 0;
        }
        return hour;
    } else {
        // this is not supposed to happen
        return hour;
    }
}

// date from string and array of format strings
function configFromStringAndArray(config) {
    var tempConfig,
        bestMoment,

        scoreToBeat,
        i,
        currentScore;

    if (config._f.length === 0) {
        getParsingFlags(config).invalidFormat = true;
        config._d = new Date(NaN);
        return;
    }

    for (i = 0; i < config._f.length; i++) {
        currentScore = 0;
        tempConfig = copyConfig({}, config);
        if (config._useUTC != null) {
            tempConfig._useUTC = config._useUTC;
        }
        tempConfig._f = config._f[i];
        configFromStringAndFormat(tempConfig);

        if (!isValid(tempConfig)) {
            continue;
        }

        // if there is any input that was not parsed add a penalty for that format
        currentScore += getParsingFlags(tempConfig).charsLeftOver;

        //or tokens
        currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

        getParsingFlags(tempConfig).score = currentScore;

        if (scoreToBeat == null || currentScore < scoreToBeat) {
            scoreToBeat = currentScore;
            bestMoment = tempConfig;
        }
    }

    extend(config, bestMoment || tempConfig);
}

function configFromObject(config) {
    if (config._d) {
        return;
    }

    var i = normalizeObjectUnits(config._i);
    config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
        return obj && parseInt(obj, 10);
    });

    configFromArray(config);
}

function createFromConfig (config) {
    var res = new Moment(checkOverflow(prepareConfig(config)));
    if (res._nextDay) {
        // Adding is smart enough around DST
        res.add(1, 'd');
        res._nextDay = undefined;
    }

    return res;
}

function prepareConfig (config) {
    var input = config._i,
        format = config._f;

    config._locale = config._locale || getLocale(config._l);

    if (input === null || (format === undefined && input === '')) {
        return createInvalid({nullInput: true});
    }

    if (typeof input === 'string') {
        config._i = input = config._locale.preparse(input);
    }

    if (isMoment(input)) {
        return new Moment(checkOverflow(input));
    } else if (isDate(input)) {
        config._d = input;
    } else if (isArray(format)) {
        configFromStringAndArray(config);
    } else if (format) {
        configFromStringAndFormat(config);
    }  else {
        configFromInput(config);
    }

    if (!isValid(config)) {
        config._d = null;
    }

    return config;
}

function configFromInput(config) {
    var input = config._i;
    if (isUndefined(input)) {
        config._d = new Date(hooks.now());
    } else if (isDate(input)) {
        config._d = new Date(input.valueOf());
    } else if (typeof input === 'string') {
        configFromString(config);
    } else if (isArray(input)) {
        config._a = map(input.slice(0), function (obj) {
            return parseInt(obj, 10);
        });
        configFromArray(config);
    } else if (isObject(input)) {
        configFromObject(config);
    } else if (isNumber(input)) {
        // from milliseconds
        config._d = new Date(input);
    } else {
        hooks.createFromInputFallback(config);
    }
}

function createLocalOrUTC (input, format, locale, strict, isUTC) {
    var c = {};

    if (locale === true || locale === false) {
        strict = locale;
        locale = undefined;
    }

    if ((isObject(input) && isObjectEmpty(input)) ||
            (isArray(input) && input.length === 0)) {
        input = undefined;
    }
    // object construction must be done this way.
    // https://github.com/moment/moment/issues/1423
    c._isAMomentObject = true;
    c._useUTC = c._isUTC = isUTC;
    c._l = locale;
    c._i = input;
    c._f = format;
    c._strict = strict;

    return createFromConfig(c);
}

function createLocal (input, format, locale, strict) {
    return createLocalOrUTC(input, format, locale, strict, false);
}

var prototypeMin = deprecate(
    'moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/',
    function () {
        var other = createLocal.apply(null, arguments);
        if (this.isValid() && other.isValid()) {
            return other < this ? this : other;
        } else {
            return createInvalid();
        }
    }
);

var prototypeMax = deprecate(
    'moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/',
    function () {
        var other = createLocal.apply(null, arguments);
        if (this.isValid() && other.isValid()) {
            return other > this ? this : other;
        } else {
            return createInvalid();
        }
    }
);

// Pick a moment m from moments so that m[fn](other) is true for all
// other. This relies on the function fn to be transitive.
//
// moments should either be an array of moment objects or an array, whose
// first element is an array of moment objects.
function pickBy(fn, moments) {
    var res, i;
    if (moments.length === 1 && isArray(moments[0])) {
        moments = moments[0];
    }
    if (!moments.length) {
        return createLocal();
    }
    res = moments[0];
    for (i = 1; i < moments.length; ++i) {
        if (!moments[i].isValid() || moments[i][fn](res)) {
            res = moments[i];
        }
    }
    return res;
}

// TODO: Use [].sort instead?
function min () {
    var args = [].slice.call(arguments, 0);

    return pickBy('isBefore', args);
}

function max () {
    var args = [].slice.call(arguments, 0);

    return pickBy('isAfter', args);
}

var now = function () {
    return Date.now ? Date.now() : +(new Date());
};

var ordering = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

function isDurationValid(m) {
    for (var key in m) {
        if (!(indexOf.call(ordering, key) !== -1 && (m[key] == null || !isNaN(m[key])))) {
            return false;
        }
    }

    var unitHasDecimal = false;
    for (var i = 0; i < ordering.length; ++i) {
        if (m[ordering[i]]) {
            if (unitHasDecimal) {
                return false; // only allow non-integers for smallest unit
            }
            if (parseFloat(m[ordering[i]]) !== toInt(m[ordering[i]])) {
                unitHasDecimal = true;
            }
        }
    }

    return true;
}

function isValid$1() {
    return this._isValid;
}

function createInvalid$1() {
    return createDuration(NaN);
}

function Duration (duration) {
    var normalizedInput = normalizeObjectUnits(duration),
        years = normalizedInput.year || 0,
        quarters = normalizedInput.quarter || 0,
        months = normalizedInput.month || 0,
        weeks = normalizedInput.week || 0,
        days = normalizedInput.day || 0,
        hours = normalizedInput.hour || 0,
        minutes = normalizedInput.minute || 0,
        seconds = normalizedInput.second || 0,
        milliseconds = normalizedInput.millisecond || 0;

    this._isValid = isDurationValid(normalizedInput);

    // representation for dateAddRemove
    this._milliseconds = +milliseconds +
        seconds * 1e3 + // 1000
        minutes * 6e4 + // 1000 * 60
        hours * 1000 * 60 * 60; //using 1000 * 60 * 60 instead of 36e5 to avoid floating point rounding errors https://github.com/moment/moment/issues/2978
    // Because of dateAddRemove treats 24 hours as different from a
    // day when working around DST, we need to store them separately
    this._days = +days +
        weeks * 7;
    // It is impossible to translate months into days without knowing
    // which months you are are talking about, so we have to store
    // it separately.
    this._months = +months +
        quarters * 3 +
        years * 12;

    this._data = {};

    this._locale = getLocale();

    this._bubble();
}

function isDuration (obj) {
    return obj instanceof Duration;
}

function absRound (number) {
    if (number < 0) {
        return Math.round(-1 * number) * -1;
    } else {
        return Math.round(number);
    }
}

// FORMATTING

function offset (token, separator) {
    addFormatToken(token, 0, 0, function () {
        var offset = this.utcOffset();
        var sign = '+';
        if (offset < 0) {
            offset = -offset;
            sign = '-';
        }
        return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
    });
}

offset('Z', ':');
offset('ZZ', '');

// PARSING

addRegexToken('Z',  matchShortOffset);
addRegexToken('ZZ', matchShortOffset);
addParseToken(['Z', 'ZZ'], function (input, array, config) {
    config._useUTC = true;
    config._tzm = offsetFromString(matchShortOffset, input);
});

// HELPERS

// timezone chunker
// '+10:00' > ['10',  '00']
// '-1530'  > ['-15', '30']
var chunkOffset = /([\+\-]|\d\d)/gi;

function offsetFromString(matcher, string) {
    var matches = (string || '').match(matcher);

    if (matches === null) {
        return null;
    }

    var chunk   = matches[matches.length - 1] || [];
    var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
    var minutes = +(parts[1] * 60) + toInt(parts[2]);

    return minutes === 0 ?
      0 :
      parts[0] === '+' ? minutes : -minutes;
}

// Return a moment from input, that is local/utc/zone equivalent to model.
function cloneWithOffset(input, model) {
    var res, diff;
    if (model._isUTC) {
        res = model.clone();
        diff = (isMoment(input) || isDate(input) ? input.valueOf() : createLocal(input).valueOf()) - res.valueOf();
        // Use low-level api, because this fn is low-level api.
        res._d.setTime(res._d.valueOf() + diff);
        hooks.updateOffset(res, false);
        return res;
    } else {
        return createLocal(input).local();
    }
}

function getDateOffset (m) {
    // On Firefox.24 Date#getTimezoneOffset returns a floating point.
    // https://github.com/moment/moment/pull/1871
    return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
}

// HOOKS

// This function will be called whenever a moment is mutated.
// It is intended to keep the offset in sync with the timezone.
hooks.updateOffset = function () {};

// MOMENTS

// keepLocalTime = true means only change the timezone, without
// affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
// 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
// +0200, so we adjust the time as needed, to be valid.
//
// Keeping the time actually adds/subtracts (one hour)
// from the actual represented time. That is why we call updateOffset
// a second time. In case it wants us to change the offset again
// _changeInProgress == true case, then we have to adjust, because
// there is no such time in the given timezone.
function getSetOffset (input, keepLocalTime, keepMinutes) {
    var offset = this._offset || 0,
        localAdjust;
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    if (input != null) {
        if (typeof input === 'string') {
            input = offsetFromString(matchShortOffset, input);
            if (input === null) {
                return this;
            }
        } else if (Math.abs(input) < 16 && !keepMinutes) {
            input = input * 60;
        }
        if (!this._isUTC && keepLocalTime) {
            localAdjust = getDateOffset(this);
        }
        this._offset = input;
        this._isUTC = true;
        if (localAdjust != null) {
            this.add(localAdjust, 'm');
        }
        if (offset !== input) {
            if (!keepLocalTime || this._changeInProgress) {
                addSubtract(this, createDuration(input - offset, 'm'), 1, false);
            } else if (!this._changeInProgress) {
                this._changeInProgress = true;
                hooks.updateOffset(this, true);
                this._changeInProgress = null;
            }
        }
        return this;
    } else {
        return this._isUTC ? offset : getDateOffset(this);
    }
}

function getSetZone (input, keepLocalTime) {
    if (input != null) {
        if (typeof input !== 'string') {
            input = -input;
        }

        this.utcOffset(input, keepLocalTime);

        return this;
    } else {
        return -this.utcOffset();
    }
}

function setOffsetToUTC (keepLocalTime) {
    return this.utcOffset(0, keepLocalTime);
}

function setOffsetToLocal (keepLocalTime) {
    if (this._isUTC) {
        this.utcOffset(0, keepLocalTime);
        this._isUTC = false;

        if (keepLocalTime) {
            this.subtract(getDateOffset(this), 'm');
        }
    }
    return this;
}

function setOffsetToParsedOffset () {
    if (this._tzm != null) {
        this.utcOffset(this._tzm, false, true);
    } else if (typeof this._i === 'string') {
        var tZone = offsetFromString(matchOffset, this._i);
        if (tZone != null) {
            this.utcOffset(tZone);
        }
        else {
            this.utcOffset(0, true);
        }
    }
    return this;
}

function hasAlignedHourOffset (input) {
    if (!this.isValid()) {
        return false;
    }
    input = input ? createLocal(input).utcOffset() : 0;

    return (this.utcOffset() - input) % 60 === 0;
}

function isDaylightSavingTime () {
    return (
        this.utcOffset() > this.clone().month(0).utcOffset() ||
        this.utcOffset() > this.clone().month(5).utcOffset()
    );
}

function isDaylightSavingTimeShifted () {
    if (!isUndefined(this._isDSTShifted)) {
        return this._isDSTShifted;
    }

    var c = {};

    copyConfig(c, this);
    c = prepareConfig(c);

    if (c._a) {
        var other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
        this._isDSTShifted = this.isValid() &&
            compareArrays(c._a, other.toArray()) > 0;
    } else {
        this._isDSTShifted = false;
    }

    return this._isDSTShifted;
}

function isLocal () {
    return this.isValid() ? !this._isUTC : false;
}

function isUtcOffset () {
    return this.isValid() ? this._isUTC : false;
}

function isUtc () {
    return this.isValid() ? this._isUTC && this._offset === 0 : false;
}

// ASP.NET json date format regex
var aspNetRegex = /^(\-|\+)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)(\.\d*)?)?$/;

// from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
// somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
// and further modified to allow for strings containing both week and day
var isoRegex = /^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/;

function createDuration (input, key) {
    var duration = input,
        // matching against regexp is expensive, do it on demand
        match = null,
        sign,
        ret,
        diffRes;

    if (isDuration(input)) {
        duration = {
            ms : input._milliseconds,
            d  : input._days,
            M  : input._months
        };
    } else if (isNumber(input)) {
        duration = {};
        if (key) {
            duration[key] = input;
        } else {
            duration.milliseconds = input;
        }
    } else if (!!(match = aspNetRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : 1;
        duration = {
            y  : 0,
            d  : toInt(match[DATE])                         * sign,
            h  : toInt(match[HOUR])                         * sign,
            m  : toInt(match[MINUTE])                       * sign,
            s  : toInt(match[SECOND])                       * sign,
            ms : toInt(absRound(match[MILLISECOND] * 1000)) * sign // the millisecond decimal point is included in the match
        };
    } else if (!!(match = isoRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : (match[1] === '+') ? 1 : 1;
        duration = {
            y : parseIso(match[2], sign),
            M : parseIso(match[3], sign),
            w : parseIso(match[4], sign),
            d : parseIso(match[5], sign),
            h : parseIso(match[6], sign),
            m : parseIso(match[7], sign),
            s : parseIso(match[8], sign)
        };
    } else if (duration == null) {// checks for null or undefined
        duration = {};
    } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
        diffRes = momentsDifference(createLocal(duration.from), createLocal(duration.to));

        duration = {};
        duration.ms = diffRes.milliseconds;
        duration.M = diffRes.months;
    }

    ret = new Duration(duration);

    if (isDuration(input) && hasOwnProp(input, '_locale')) {
        ret._locale = input._locale;
    }

    return ret;
}

createDuration.fn = Duration.prototype;
createDuration.invalid = createInvalid$1;

function parseIso (inp, sign) {
    // We'd normally use ~~inp for this, but unfortunately it also
    // converts floats to ints.
    // inp may be undefined, so careful calling replace on it.
    var res = inp && parseFloat(inp.replace(',', '.'));
    // apply sign while we're at it
    return (isNaN(res) ? 0 : res) * sign;
}

function positiveMomentsDifference(base, other) {
    var res = {milliseconds: 0, months: 0};

    res.months = other.month() - base.month() +
        (other.year() - base.year()) * 12;
    if (base.clone().add(res.months, 'M').isAfter(other)) {
        --res.months;
    }

    res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

    return res;
}

function momentsDifference(base, other) {
    var res;
    if (!(base.isValid() && other.isValid())) {
        return {milliseconds: 0, months: 0};
    }

    other = cloneWithOffset(other, base);
    if (base.isBefore(other)) {
        res = positiveMomentsDifference(base, other);
    } else {
        res = positiveMomentsDifference(other, base);
        res.milliseconds = -res.milliseconds;
        res.months = -res.months;
    }

    return res;
}

// TODO: remove 'name' arg after deprecation is removed
function createAdder(direction, name) {
    return function (val, period) {
        var dur, tmp;
        //invert the arguments, but complain about it
        if (period !== null && !isNaN(+period)) {
            deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period). ' +
            'See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info.');
            tmp = val; val = period; period = tmp;
        }

        val = typeof val === 'string' ? +val : val;
        dur = createDuration(val, period);
        addSubtract(this, dur, direction);
        return this;
    };
}

function addSubtract (mom, duration, isAdding, updateOffset) {
    var milliseconds = duration._milliseconds,
        days = absRound(duration._days),
        months = absRound(duration._months);

    if (!mom.isValid()) {
        // No op
        return;
    }

    updateOffset = updateOffset == null ? true : updateOffset;

    if (months) {
        setMonth(mom, get(mom, 'Month') + months * isAdding);
    }
    if (days) {
        set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
    }
    if (milliseconds) {
        mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
    }
    if (updateOffset) {
        hooks.updateOffset(mom, days || months);
    }
}

var add      = createAdder(1, 'add');
var subtract = createAdder(-1, 'subtract');

function getCalendarFormat(myMoment, now) {
    var diff = myMoment.diff(now, 'days', true);
    return diff < -6 ? 'sameElse' :
            diff < -1 ? 'lastWeek' :
            diff < 0 ? 'lastDay' :
            diff < 1 ? 'sameDay' :
            diff < 2 ? 'nextDay' :
            diff < 7 ? 'nextWeek' : 'sameElse';
}

function calendar$1 (time, formats) {
    // We want to compare the start of today, vs this.
    // Getting start-of-today depends on whether we're local/utc/offset or not.
    var now = time || createLocal(),
        sod = cloneWithOffset(now, this).startOf('day'),
        format = hooks.calendarFormat(this, sod) || 'sameElse';

    var output = formats && (isFunction(formats[format]) ? formats[format].call(this, now) : formats[format]);

    return this.format(output || this.localeData().calendar(format, this, createLocal(now)));
}

function clone () {
    return new Moment(this);
}

function isAfter (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input);
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() > localInput.valueOf();
    } else {
        return localInput.valueOf() < this.clone().startOf(units).valueOf();
    }
}

function isBefore (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input);
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() < localInput.valueOf();
    } else {
        return this.clone().endOf(units).valueOf() < localInput.valueOf();
    }
}

function isBetween (from, to, units, inclusivity) {
    inclusivity = inclusivity || '()';
    return (inclusivity[0] === '(' ? this.isAfter(from, units) : !this.isBefore(from, units)) &&
        (inclusivity[1] === ')' ? this.isBefore(to, units) : !this.isAfter(to, units));
}

function isSame (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input),
        inputMs;
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(units || 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() === localInput.valueOf();
    } else {
        inputMs = localInput.valueOf();
        return this.clone().startOf(units).valueOf() <= inputMs && inputMs <= this.clone().endOf(units).valueOf();
    }
}

function isSameOrAfter (input, units) {
    return this.isSame(input, units) || this.isAfter(input,units);
}

function isSameOrBefore (input, units) {
    return this.isSame(input, units) || this.isBefore(input,units);
}

function diff (input, units, asFloat) {
    var that,
        zoneDelta,
        delta, output;

    if (!this.isValid()) {
        return NaN;
    }

    that = cloneWithOffset(input, this);

    if (!that.isValid()) {
        return NaN;
    }

    zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

    units = normalizeUnits(units);

    switch (units) {
        case 'year': output = monthDiff(this, that) / 12; break;
        case 'month': output = monthDiff(this, that); break;
        case 'quarter': output = monthDiff(this, that) / 3; break;
        case 'second': output = (this - that) / 1e3; break; // 1000
        case 'minute': output = (this - that) / 6e4; break; // 1000 * 60
        case 'hour': output = (this - that) / 36e5; break; // 1000 * 60 * 60
        case 'day': output = (this - that - zoneDelta) / 864e5; break; // 1000 * 60 * 60 * 24, negate dst
        case 'week': output = (this - that - zoneDelta) / 6048e5; break; // 1000 * 60 * 60 * 24 * 7, negate dst
        default: output = this - that;
    }

    return asFloat ? output : absFloor(output);
}

function monthDiff (a, b) {
    // difference in months
    var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
        // b is in (anchor - 1 month, anchor + 1 month)
        anchor = a.clone().add(wholeMonthDiff, 'months'),
        anchor2, adjust;

    if (b - anchor < 0) {
        anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
        // linear across the month
        adjust = (b - anchor) / (anchor - anchor2);
    } else {
        anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
        // linear across the month
        adjust = (b - anchor) / (anchor2 - anchor);
    }

    //check for negative zero, return zero if negative zero
    return -(wholeMonthDiff + adjust) || 0;
}

hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';
hooks.defaultFormatUtc = 'YYYY-MM-DDTHH:mm:ss[Z]';

function toString () {
    return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
}

function toISOString(keepOffset) {
    if (!this.isValid()) {
        return null;
    }
    var utc = keepOffset !== true;
    var m = utc ? this.clone().utc() : this;
    if (m.year() < 0 || m.year() > 9999) {
        return formatMoment(m, utc ? 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYYYY-MM-DD[T]HH:mm:ss.SSSZ');
    }
    if (isFunction(Date.prototype.toISOString)) {
        // native implementation is ~50x faster, use it when we can
        if (utc) {
            return this.toDate().toISOString();
        } else {
            return new Date(this._d.valueOf()).toISOString().replace('Z', formatMoment(m, 'Z'));
        }
    }
    return formatMoment(m, utc ? 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYY-MM-DD[T]HH:mm:ss.SSSZ');
}

/**
 * Return a human readable representation of a moment that can
 * also be evaluated to get a new moment which is the same
 *
 * @link https://nodejs.org/dist/latest/docs/api/util.html#util_custom_inspect_function_on_objects
 */
function inspect () {
    if (!this.isValid()) {
        return 'moment.invalid(/* ' + this._i + ' */)';
    }
    var func = 'moment';
    var zone = '';
    if (!this.isLocal()) {
        func = this.utcOffset() === 0 ? 'moment.utc' : 'moment.parseZone';
        zone = 'Z';
    }
    var prefix = '[' + func + '("]';
    var year = (0 <= this.year() && this.year() <= 9999) ? 'YYYY' : 'YYYYYY';
    var datetime = '-MM-DD[T]HH:mm:ss.SSS';
    var suffix = zone + '[")]';

    return this.format(prefix + year + datetime + suffix);
}

function format (inputString) {
    if (!inputString) {
        inputString = this.isUtc() ? hooks.defaultFormatUtc : hooks.defaultFormat;
    }
    var output = formatMoment(this, inputString);
    return this.localeData().postformat(output);
}

function from (time, withoutSuffix) {
    if (this.isValid() &&
            ((isMoment(time) && time.isValid()) ||
             createLocal(time).isValid())) {
        return createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
    } else {
        return this.localeData().invalidDate();
    }
}

function fromNow (withoutSuffix) {
    return this.from(createLocal(), withoutSuffix);
}

function to (time, withoutSuffix) {
    if (this.isValid() &&
            ((isMoment(time) && time.isValid()) ||
             createLocal(time).isValid())) {
        return createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
    } else {
        return this.localeData().invalidDate();
    }
}

function toNow (withoutSuffix) {
    return this.to(createLocal(), withoutSuffix);
}

// If passed a locale key, it will set the locale for this
// instance.  Otherwise, it will return the locale configuration
// variables for this instance.
function locale (key) {
    var newLocaleData;

    if (key === undefined) {
        return this._locale._abbr;
    } else {
        newLocaleData = getLocale(key);
        if (newLocaleData != null) {
            this._locale = newLocaleData;
        }
        return this;
    }
}

var lang = deprecate(
    'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
    function (key) {
        if (key === undefined) {
            return this.localeData();
        } else {
            return this.locale(key);
        }
    }
);

function localeData () {
    return this._locale;
}

function startOf (units) {
    units = normalizeUnits(units);
    // the following switch intentionally omits break keywords
    // to utilize falling through the cases.
    switch (units) {
        case 'year':
            this.month(0);
            /* falls through */
        case 'quarter':
        case 'month':
            this.date(1);
            /* falls through */
        case 'week':
        case 'isoWeek':
        case 'day':
        case 'date':
            this.hours(0);
            /* falls through */
        case 'hour':
            this.minutes(0);
            /* falls through */
        case 'minute':
            this.seconds(0);
            /* falls through */
        case 'second':
            this.milliseconds(0);
    }

    // weeks are a special case
    if (units === 'week') {
        this.weekday(0);
    }
    if (units === 'isoWeek') {
        this.isoWeekday(1);
    }

    // quarters are also special
    if (units === 'quarter') {
        this.month(Math.floor(this.month() / 3) * 3);
    }

    return this;
}

function endOf (units) {
    units = normalizeUnits(units);
    if (units === undefined || units === 'millisecond') {
        return this;
    }

    // 'date' is an alias for 'day', so it should be considered as such.
    if (units === 'date') {
        units = 'day';
    }

    return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
}

function valueOf () {
    return this._d.valueOf() - ((this._offset || 0) * 60000);
}

function unix () {
    return Math.floor(this.valueOf() / 1000);
}

function toDate () {
    return new Date(this.valueOf());
}

function toArray () {
    var m = this;
    return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
}

function toObject () {
    var m = this;
    return {
        years: m.year(),
        months: m.month(),
        date: m.date(),
        hours: m.hours(),
        minutes: m.minutes(),
        seconds: m.seconds(),
        milliseconds: m.milliseconds()
    };
}

function toJSON () {
    // new Date(NaN).toJSON() === null
    return this.isValid() ? this.toISOString() : null;
}

function isValid$2 () {
    return isValid(this);
}

function parsingFlags () {
    return extend({}, getParsingFlags(this));
}

function invalidAt () {
    return getParsingFlags(this).overflow;
}

function creationData() {
    return {
        input: this._i,
        format: this._f,
        locale: this._locale,
        isUTC: this._isUTC,
        strict: this._strict
    };
}

// FORMATTING

addFormatToken(0, ['gg', 2], 0, function () {
    return this.weekYear() % 100;
});

addFormatToken(0, ['GG', 2], 0, function () {
    return this.isoWeekYear() % 100;
});

function addWeekYearFormatToken (token, getter) {
    addFormatToken(0, [token, token.length], 0, getter);
}

addWeekYearFormatToken('gggg',     'weekYear');
addWeekYearFormatToken('ggggg',    'weekYear');
addWeekYearFormatToken('GGGG',  'isoWeekYear');
addWeekYearFormatToken('GGGGG', 'isoWeekYear');

// ALIASES

addUnitAlias('weekYear', 'gg');
addUnitAlias('isoWeekYear', 'GG');

// PRIORITY

addUnitPriority('weekYear', 1);
addUnitPriority('isoWeekYear', 1);


// PARSING

addRegexToken('G',      matchSigned);
addRegexToken('g',      matchSigned);
addRegexToken('GG',     match1to2, match2);
addRegexToken('gg',     match1to2, match2);
addRegexToken('GGGG',   match1to4, match4);
addRegexToken('gggg',   match1to4, match4);
addRegexToken('GGGGG',  match1to6, match6);
addRegexToken('ggggg',  match1to6, match6);

addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
    week[token.substr(0, 2)] = toInt(input);
});

addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
    week[token] = hooks.parseTwoDigitYear(input);
});

// MOMENTS

function getSetWeekYear (input) {
    return getSetWeekYearHelper.call(this,
            input,
            this.week(),
            this.weekday(),
            this.localeData()._week.dow,
            this.localeData()._week.doy);
}

function getSetISOWeekYear (input) {
    return getSetWeekYearHelper.call(this,
            input, this.isoWeek(), this.isoWeekday(), 1, 4);
}

function getISOWeeksInYear () {
    return weeksInYear(this.year(), 1, 4);
}

function getWeeksInYear () {
    var weekInfo = this.localeData()._week;
    return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
}

function getSetWeekYearHelper(input, week, weekday, dow, doy) {
    var weeksTarget;
    if (input == null) {
        return weekOfYear(this, dow, doy).year;
    } else {
        weeksTarget = weeksInYear(input, dow, doy);
        if (week > weeksTarget) {
            week = weeksTarget;
        }
        return setWeekAll.call(this, input, week, weekday, dow, doy);
    }
}

function setWeekAll(weekYear, week, weekday, dow, doy) {
    var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
        date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

    this.year(date.getUTCFullYear());
    this.month(date.getUTCMonth());
    this.date(date.getUTCDate());
    return this;
}

// FORMATTING

addFormatToken('Q', 0, 'Qo', 'quarter');

// ALIASES

addUnitAlias('quarter', 'Q');

// PRIORITY

addUnitPriority('quarter', 7);

// PARSING

addRegexToken('Q', match1);
addParseToken('Q', function (input, array) {
    array[MONTH] = (toInt(input) - 1) * 3;
});

// MOMENTS

function getSetQuarter (input) {
    return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
}

// FORMATTING

addFormatToken('D', ['DD', 2], 'Do', 'date');

// ALIASES

addUnitAlias('date', 'D');

// PRIOROITY
addUnitPriority('date', 9);

// PARSING

addRegexToken('D',  match1to2);
addRegexToken('DD', match1to2, match2);
addRegexToken('Do', function (isStrict, locale) {
    // TODO: Remove "ordinalParse" fallback in next major release.
    return isStrict ?
      (locale._dayOfMonthOrdinalParse || locale._ordinalParse) :
      locale._dayOfMonthOrdinalParseLenient;
});

addParseToken(['D', 'DD'], DATE);
addParseToken('Do', function (input, array) {
    array[DATE] = toInt(input.match(match1to2)[0]);
});

// MOMENTS

var getSetDayOfMonth = makeGetSet('Date', true);

// FORMATTING

addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

// ALIASES

addUnitAlias('dayOfYear', 'DDD');

// PRIORITY
addUnitPriority('dayOfYear', 4);

// PARSING

addRegexToken('DDD',  match1to3);
addRegexToken('DDDD', match3);
addParseToken(['DDD', 'DDDD'], function (input, array, config) {
    config._dayOfYear = toInt(input);
});

// HELPERS

// MOMENTS

function getSetDayOfYear (input) {
    var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
    return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
}

// FORMATTING

addFormatToken('m', ['mm', 2], 0, 'minute');

// ALIASES

addUnitAlias('minute', 'm');

// PRIORITY

addUnitPriority('minute', 14);

// PARSING

addRegexToken('m',  match1to2);
addRegexToken('mm', match1to2, match2);
addParseToken(['m', 'mm'], MINUTE);

// MOMENTS

var getSetMinute = makeGetSet('Minutes', false);

// FORMATTING

addFormatToken('s', ['ss', 2], 0, 'second');

// ALIASES

addUnitAlias('second', 's');

// PRIORITY

addUnitPriority('second', 15);

// PARSING

addRegexToken('s',  match1to2);
addRegexToken('ss', match1to2, match2);
addParseToken(['s', 'ss'], SECOND);

// MOMENTS

var getSetSecond = makeGetSet('Seconds', false);

// FORMATTING

addFormatToken('S', 0, 0, function () {
    return ~~(this.millisecond() / 100);
});

addFormatToken(0, ['SS', 2], 0, function () {
    return ~~(this.millisecond() / 10);
});

addFormatToken(0, ['SSS', 3], 0, 'millisecond');
addFormatToken(0, ['SSSS', 4], 0, function () {
    return this.millisecond() * 10;
});
addFormatToken(0, ['SSSSS', 5], 0, function () {
    return this.millisecond() * 100;
});
addFormatToken(0, ['SSSSSS', 6], 0, function () {
    return this.millisecond() * 1000;
});
addFormatToken(0, ['SSSSSSS', 7], 0, function () {
    return this.millisecond() * 10000;
});
addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
    return this.millisecond() * 100000;
});
addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
    return this.millisecond() * 1000000;
});


// ALIASES

addUnitAlias('millisecond', 'ms');

// PRIORITY

addUnitPriority('millisecond', 16);

// PARSING

addRegexToken('S',    match1to3, match1);
addRegexToken('SS',   match1to3, match2);
addRegexToken('SSS',  match1to3, match3);

var token;
for (token = 'SSSS'; token.length <= 9; token += 'S') {
    addRegexToken(token, matchUnsigned);
}

function parseMs(input, array) {
    array[MILLISECOND] = toInt(('0.' + input) * 1000);
}

for (token = 'S'; token.length <= 9; token += 'S') {
    addParseToken(token, parseMs);
}
// MOMENTS

var getSetMillisecond = makeGetSet('Milliseconds', false);

// FORMATTING

addFormatToken('z',  0, 0, 'zoneAbbr');
addFormatToken('zz', 0, 0, 'zoneName');

// MOMENTS

function getZoneAbbr () {
    return this._isUTC ? 'UTC' : '';
}

function getZoneName () {
    return this._isUTC ? 'Coordinated Universal Time' : '';
}

var proto = Moment.prototype;

proto.add               = add;
proto.calendar          = calendar$1;
proto.clone             = clone;
proto.diff              = diff;
proto.endOf             = endOf;
proto.format            = format;
proto.from              = from;
proto.fromNow           = fromNow;
proto.to                = to;
proto.toNow             = toNow;
proto.get               = stringGet;
proto.invalidAt         = invalidAt;
proto.isAfter           = isAfter;
proto.isBefore          = isBefore;
proto.isBetween         = isBetween;
proto.isSame            = isSame;
proto.isSameOrAfter     = isSameOrAfter;
proto.isSameOrBefore    = isSameOrBefore;
proto.isValid           = isValid$2;
proto.lang              = lang;
proto.locale            = locale;
proto.localeData        = localeData;
proto.max               = prototypeMax;
proto.min               = prototypeMin;
proto.parsingFlags      = parsingFlags;
proto.set               = stringSet;
proto.startOf           = startOf;
proto.subtract          = subtract;
proto.toArray           = toArray;
proto.toObject          = toObject;
proto.toDate            = toDate;
proto.toISOString       = toISOString;
proto.inspect           = inspect;
proto.toJSON            = toJSON;
proto.toString          = toString;
proto.unix              = unix;
proto.valueOf           = valueOf;
proto.creationData      = creationData;

// Year
proto.year       = getSetYear;
proto.isLeapYear = getIsLeapYear;

// Week Year
proto.weekYear    = getSetWeekYear;
proto.isoWeekYear = getSetISOWeekYear;

// Quarter
proto.quarter = proto.quarters = getSetQuarter;

// Month
proto.month       = getSetMonth;
proto.daysInMonth = getDaysInMonth;

// Week
proto.week           = proto.weeks        = getSetWeek;
proto.isoWeek        = proto.isoWeeks     = getSetISOWeek;
proto.weeksInYear    = getWeeksInYear;
proto.isoWeeksInYear = getISOWeeksInYear;

// Day
proto.date       = getSetDayOfMonth;
proto.day        = proto.days             = getSetDayOfWeek;
proto.weekday    = getSetLocaleDayOfWeek;
proto.isoWeekday = getSetISODayOfWeek;
proto.dayOfYear  = getSetDayOfYear;

// Hour
proto.hour = proto.hours = getSetHour;

// Minute
proto.minute = proto.minutes = getSetMinute;

// Second
proto.second = proto.seconds = getSetSecond;

// Millisecond
proto.millisecond = proto.milliseconds = getSetMillisecond;

// Offset
proto.utcOffset            = getSetOffset;
proto.utc                  = setOffsetToUTC;
proto.local                = setOffsetToLocal;
proto.parseZone            = setOffsetToParsedOffset;
proto.hasAlignedHourOffset = hasAlignedHourOffset;
proto.isDST                = isDaylightSavingTime;
proto.isLocal              = isLocal;
proto.isUtcOffset          = isUtcOffset;
proto.isUtc                = isUtc;
proto.isUTC                = isUtc;

// Timezone
proto.zoneAbbr = getZoneAbbr;
proto.zoneName = getZoneName;

// Deprecations
proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/', getSetZone);
proto.isDSTShifted = deprecate('isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information', isDaylightSavingTimeShifted);

function createUnix (input) {
    return createLocal(input * 1000);
}

function createInZone () {
    return createLocal.apply(null, arguments).parseZone();
}

function preParsePostFormat (string) {
    return string;
}

var proto$1 = Locale.prototype;

proto$1.calendar        = calendar;
proto$1.longDateFormat  = longDateFormat;
proto$1.invalidDate     = invalidDate;
proto$1.ordinal         = ordinal;
proto$1.preparse        = preParsePostFormat;
proto$1.postformat      = preParsePostFormat;
proto$1.relativeTime    = relativeTime;
proto$1.pastFuture      = pastFuture;
proto$1.set             = set;

// Month
proto$1.months            =        localeMonths;
proto$1.monthsShort       =        localeMonthsShort;
proto$1.monthsParse       =        localeMonthsParse;
proto$1.monthsRegex       = monthsRegex;
proto$1.monthsShortRegex  = monthsShortRegex;

// Week
proto$1.week = localeWeek;
proto$1.firstDayOfYear = localeFirstDayOfYear;
proto$1.firstDayOfWeek = localeFirstDayOfWeek;

// Day of Week
proto$1.weekdays       =        localeWeekdays;
proto$1.weekdaysMin    =        localeWeekdaysMin;
proto$1.weekdaysShort  =        localeWeekdaysShort;
proto$1.weekdaysParse  =        localeWeekdaysParse;

proto$1.weekdaysRegex       =        weekdaysRegex;
proto$1.weekdaysShortRegex  =        weekdaysShortRegex;
proto$1.weekdaysMinRegex    =        weekdaysMinRegex;

// Hours
proto$1.isPM = localeIsPM;
proto$1.meridiem = localeMeridiem;

function get$1 (format, index, field, setter) {
    var locale = getLocale();
    var utc = createUTC().set(setter, index);
    return locale[field](utc, format);
}

function listMonthsImpl (format, index, field) {
    if (isNumber(format)) {
        index = format;
        format = undefined;
    }

    format = format || '';

    if (index != null) {
        return get$1(format, index, field, 'month');
    }

    var i;
    var out = [];
    for (i = 0; i < 12; i++) {
        out[i] = get$1(format, i, field, 'month');
    }
    return out;
}

// ()
// (5)
// (fmt, 5)
// (fmt)
// (true)
// (true, 5)
// (true, fmt, 5)
// (true, fmt)
function listWeekdaysImpl (localeSorted, format, index, field) {
    if (typeof localeSorted === 'boolean') {
        if (isNumber(format)) {
            index = format;
            format = undefined;
        }

        format = format || '';
    } else {
        format = localeSorted;
        index = format;
        localeSorted = false;

        if (isNumber(format)) {
            index = format;
            format = undefined;
        }

        format = format || '';
    }

    var locale = getLocale(),
        shift = localeSorted ? locale._week.dow : 0;

    if (index != null) {
        return get$1(format, (index + shift) % 7, field, 'day');
    }

    var i;
    var out = [];
    for (i = 0; i < 7; i++) {
        out[i] = get$1(format, (i + shift) % 7, field, 'day');
    }
    return out;
}

function listMonths (format, index) {
    return listMonthsImpl(format, index, 'months');
}

function listMonthsShort (format, index) {
    return listMonthsImpl(format, index, 'monthsShort');
}

function listWeekdays (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdays');
}

function listWeekdaysShort (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdaysShort');
}

function listWeekdaysMin (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdaysMin');
}

getSetGlobalLocale('en', {
    dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
    ordinal : function (number) {
        var b = number % 10,
            output = (toInt(number % 100 / 10) === 1) ? 'th' :
            (b === 1) ? 'st' :
            (b === 2) ? 'nd' :
            (b === 3) ? 'rd' : 'th';
        return number + output;
    }
});

// Side effect imports
hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', getSetGlobalLocale);
hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', getLocale);

var mathAbs = Math.abs;

function abs () {
    var data           = this._data;

    this._milliseconds = mathAbs(this._milliseconds);
    this._days         = mathAbs(this._days);
    this._months       = mathAbs(this._months);

    data.milliseconds  = mathAbs(data.milliseconds);
    data.seconds       = mathAbs(data.seconds);
    data.minutes       = mathAbs(data.minutes);
    data.hours         = mathAbs(data.hours);
    data.months        = mathAbs(data.months);
    data.years         = mathAbs(data.years);

    return this;
}

function addSubtract$1 (duration, input, value, direction) {
    var other = createDuration(input, value);

    duration._milliseconds += direction * other._milliseconds;
    duration._days         += direction * other._days;
    duration._months       += direction * other._months;

    return duration._bubble();
}

// supports only 2.0-style add(1, 's') or add(duration)
function add$1 (input, value) {
    return addSubtract$1(this, input, value, 1);
}

// supports only 2.0-style subtract(1, 's') or subtract(duration)
function subtract$1 (input, value) {
    return addSubtract$1(this, input, value, -1);
}

function absCeil (number) {
    if (number < 0) {
        return Math.floor(number);
    } else {
        return Math.ceil(number);
    }
}

function bubble () {
    var milliseconds = this._milliseconds;
    var days         = this._days;
    var months       = this._months;
    var data         = this._data;
    var seconds, minutes, hours, years, monthsFromDays;

    // if we have a mix of positive and negative values, bubble down first
    // check: https://github.com/moment/moment/issues/2166
    if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
            (milliseconds <= 0 && days <= 0 && months <= 0))) {
        milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
        days = 0;
        months = 0;
    }

    // The following code bubbles up values, see the tests for
    // examples of what that means.
    data.milliseconds = milliseconds % 1000;

    seconds           = absFloor(milliseconds / 1000);
    data.seconds      = seconds % 60;

    minutes           = absFloor(seconds / 60);
    data.minutes      = minutes % 60;

    hours             = absFloor(minutes / 60);
    data.hours        = hours % 24;

    days += absFloor(hours / 24);

    // convert days to months
    monthsFromDays = absFloor(daysToMonths(days));
    months += monthsFromDays;
    days -= absCeil(monthsToDays(monthsFromDays));

    // 12 months -> 1 year
    years = absFloor(months / 12);
    months %= 12;

    data.days   = days;
    data.months = months;
    data.years  = years;

    return this;
}

function daysToMonths (days) {
    // 400 years have 146097 days (taking into account leap year rules)
    // 400 years have 12 months === 4800
    return days * 4800 / 146097;
}

function monthsToDays (months) {
    // the reverse of daysToMonths
    return months * 146097 / 4800;
}

function as (units) {
    if (!this.isValid()) {
        return NaN;
    }
    var days;
    var months;
    var milliseconds = this._milliseconds;

    units = normalizeUnits(units);

    if (units === 'month' || units === 'year') {
        days   = this._days   + milliseconds / 864e5;
        months = this._months + daysToMonths(days);
        return units === 'month' ? months : months / 12;
    } else {
        // handle milliseconds separately because of floating point math errors (issue #1867)
        days = this._days + Math.round(monthsToDays(this._months));
        switch (units) {
            case 'week'   : return days / 7     + milliseconds / 6048e5;
            case 'day'    : return days         + milliseconds / 864e5;
            case 'hour'   : return days * 24    + milliseconds / 36e5;
            case 'minute' : return days * 1440  + milliseconds / 6e4;
            case 'second' : return days * 86400 + milliseconds / 1000;
            // Math.floor prevents floating point math errors here
            case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
            default: throw new Error('Unknown unit ' + units);
        }
    }
}

// TODO: Use this.as('ms')?
function valueOf$1 () {
    if (!this.isValid()) {
        return NaN;
    }
    return (
        this._milliseconds +
        this._days * 864e5 +
        (this._months % 12) * 2592e6 +
        toInt(this._months / 12) * 31536e6
    );
}

function makeAs (alias) {
    return function () {
        return this.as(alias);
    };
}

var asMilliseconds = makeAs('ms');
var asSeconds      = makeAs('s');
var asMinutes      = makeAs('m');
var asHours        = makeAs('h');
var asDays         = makeAs('d');
var asWeeks        = makeAs('w');
var asMonths       = makeAs('M');
var asYears        = makeAs('y');

function clone$1 () {
    return createDuration(this);
}

function get$2 (units) {
    units = normalizeUnits(units);
    return this.isValid() ? this[units + 's']() : NaN;
}

function makeGetter(name) {
    return function () {
        return this.isValid() ? this._data[name] : NaN;
    };
}

var milliseconds = makeGetter('milliseconds');
var seconds      = makeGetter('seconds');
var minutes      = makeGetter('minutes');
var hours        = makeGetter('hours');
var days         = makeGetter('days');
var months       = makeGetter('months');
var years        = makeGetter('years');

function weeks () {
    return absFloor(this.days() / 7);
}

var round = Math.round;
var thresholds = {
    ss: 44,         // a few seconds to seconds
    s : 45,         // seconds to minute
    m : 45,         // minutes to hour
    h : 22,         // hours to day
    d : 26,         // days to month
    M : 11          // months to year
};

// helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
    return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
}

function relativeTime$1 (posNegDuration, withoutSuffix, locale) {
    var duration = createDuration(posNegDuration).abs();
    var seconds  = round(duration.as('s'));
    var minutes  = round(duration.as('m'));
    var hours    = round(duration.as('h'));
    var days     = round(duration.as('d'));
    var months   = round(duration.as('M'));
    var years    = round(duration.as('y'));

    var a = seconds <= thresholds.ss && ['s', seconds]  ||
            seconds < thresholds.s   && ['ss', seconds] ||
            minutes <= 1             && ['m']           ||
            minutes < thresholds.m   && ['mm', minutes] ||
            hours   <= 1             && ['h']           ||
            hours   < thresholds.h   && ['hh', hours]   ||
            days    <= 1             && ['d']           ||
            days    < thresholds.d   && ['dd', days]    ||
            months  <= 1             && ['M']           ||
            months  < thresholds.M   && ['MM', months]  ||
            years   <= 1             && ['y']           || ['yy', years];

    a[2] = withoutSuffix;
    a[3] = +posNegDuration > 0;
    a[4] = locale;
    return substituteTimeAgo.apply(null, a);
}

// This function allows you to set the rounding function for relative time strings
function getSetRelativeTimeRounding (roundingFunction) {
    if (roundingFunction === undefined) {
        return round;
    }
    if (typeof(roundingFunction) === 'function') {
        round = roundingFunction;
        return true;
    }
    return false;
}

// This function allows you to set a threshold for relative time strings
function getSetRelativeTimeThreshold (threshold, limit) {
    if (thresholds[threshold] === undefined) {
        return false;
    }
    if (limit === undefined) {
        return thresholds[threshold];
    }
    thresholds[threshold] = limit;
    if (threshold === 's') {
        thresholds.ss = limit - 1;
    }
    return true;
}

function humanize (withSuffix) {
    if (!this.isValid()) {
        return this.localeData().invalidDate();
    }

    var locale = this.localeData();
    var output = relativeTime$1(this, !withSuffix, locale);

    if (withSuffix) {
        output = locale.pastFuture(+this, output);
    }

    return locale.postformat(output);
}

var abs$1 = Math.abs;

function sign(x) {
    return ((x > 0) - (x < 0)) || +x;
}

function toISOString$1() {
    // for ISO strings we do not use the normal bubbling rules:
    //  * milliseconds bubble up until they become hours
    //  * days do not bubble at all
    //  * months bubble up until they become years
    // This is because there is no context-free conversion between hours and days
    // (think of clock changes)
    // and also not between days and months (28-31 days per month)
    if (!this.isValid()) {
        return this.localeData().invalidDate();
    }

    var seconds = abs$1(this._milliseconds) / 1000;
    var days         = abs$1(this._days);
    var months       = abs$1(this._months);
    var minutes, hours, years;

    // 3600 seconds -> 60 minutes -> 1 hour
    minutes           = absFloor(seconds / 60);
    hours             = absFloor(minutes / 60);
    seconds %= 60;
    minutes %= 60;

    // 12 months -> 1 year
    years  = absFloor(months / 12);
    months %= 12;


    // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
    var Y = years;
    var M = months;
    var D = days;
    var h = hours;
    var m = minutes;
    var s = seconds ? seconds.toFixed(3).replace(/\.?0+$/, '') : '';
    var total = this.asSeconds();

    if (!total) {
        // this is the same as C#'s (Noda) and python (isodate)...
        // but not other JS (goog.date)
        return 'P0D';
    }

    var totalSign = total < 0 ? '-' : '';
    var ymSign = sign(this._months) !== sign(total) ? '-' : '';
    var daysSign = sign(this._days) !== sign(total) ? '-' : '';
    var hmsSign = sign(this._milliseconds) !== sign(total) ? '-' : '';

    return totalSign + 'P' +
        (Y ? ymSign + Y + 'Y' : '') +
        (M ? ymSign + M + 'M' : '') +
        (D ? daysSign + D + 'D' : '') +
        ((h || m || s) ? 'T' : '') +
        (h ? hmsSign + h + 'H' : '') +
        (m ? hmsSign + m + 'M' : '') +
        (s ? hmsSign + s + 'S' : '');
}

var proto$2 = Duration.prototype;

proto$2.isValid        = isValid$1;
proto$2.abs            = abs;
proto$2.add            = add$1;
proto$2.subtract       = subtract$1;
proto$2.as             = as;
proto$2.asMilliseconds = asMilliseconds;
proto$2.asSeconds      = asSeconds;
proto$2.asMinutes      = asMinutes;
proto$2.asHours        = asHours;
proto$2.asDays         = asDays;
proto$2.asWeeks        = asWeeks;
proto$2.asMonths       = asMonths;
proto$2.asYears        = asYears;
proto$2.valueOf        = valueOf$1;
proto$2._bubble        = bubble;
proto$2.clone          = clone$1;
proto$2.get            = get$2;
proto$2.milliseconds   = milliseconds;
proto$2.seconds        = seconds;
proto$2.minutes        = minutes;
proto$2.hours          = hours;
proto$2.days           = days;
proto$2.weeks          = weeks;
proto$2.months         = months;
proto$2.years          = years;
proto$2.humanize       = humanize;
proto$2.toISOString    = toISOString$1;
proto$2.toString       = toISOString$1;
proto$2.toJSON         = toISOString$1;
proto$2.locale         = locale;
proto$2.localeData     = localeData;

// Deprecations
proto$2.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', toISOString$1);
proto$2.lang = lang;

// Side effect imports

// FORMATTING

addFormatToken('X', 0, 0, 'unix');
addFormatToken('x', 0, 0, 'valueOf');

// PARSING

addRegexToken('x', matchSigned);
addRegexToken('X', matchTimestamp);
addParseToken('X', function (input, array, config) {
    config._d = new Date(parseFloat(input, 10) * 1000);
});
addParseToken('x', function (input, array, config) {
    config._d = new Date(toInt(input));
});

// Side effect imports


hooks.version = '2.20.1';

setHookCallback(createLocal);

hooks.fn                    = proto;
hooks.min                   = min;
hooks.max                   = max;
hooks.now                   = now;
hooks.utc                   = createUTC;
hooks.unix                  = createUnix;
hooks.months                = listMonths;
hooks.isDate                = isDate;
hooks.locale                = getSetGlobalLocale;
hooks.invalid               = createInvalid;
hooks.duration              = createDuration;
hooks.isMoment              = isMoment;
hooks.weekdays              = listWeekdays;
hooks.parseZone             = createInZone;
hooks.localeData            = getLocale;
hooks.isDuration            = isDuration;
hooks.monthsShort           = listMonthsShort;
hooks.weekdaysMin           = listWeekdaysMin;
hooks.defineLocale          = defineLocale;
hooks.updateLocale          = updateLocale;
hooks.locales               = listLocales;
hooks.weekdaysShort         = listWeekdaysShort;
hooks.normalizeUnits        = normalizeUnits;
hooks.relativeTimeRounding  = getSetRelativeTimeRounding;
hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
hooks.calendarFormat        = getCalendarFormat;
hooks.prototype             = proto;

// currently HTML5 input type only supports 24-hour formats
hooks.HTML5_FMT = {
    DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm',             // <input type="datetime-local" />
    DATETIME_LOCAL_SECONDS: 'YYYY-MM-DDTHH:mm:ss',  // <input type="datetime-local" step="1" />
    DATETIME_LOCAL_MS: 'YYYY-MM-DDTHH:mm:ss.SSS',   // <input type="datetime-local" step="0.001" />
    DATE: 'YYYY-MM-DD',                             // <input type="date" />
    TIME: 'HH:mm',                                  // <input type="time" />
    TIME_SECONDS: 'HH:mm:ss',                       // <input type="time" step="1" />
    TIME_MS: 'HH:mm:ss.SSS',                        // <input type="time" step="0.001" />
    WEEK: 'YYYY-[W]WW',                             // <input type="week" />
    MONTH: 'YYYY-MM'                                // <input type="month" />
};

return hooks;

})));

},{}]},{},[49]);
