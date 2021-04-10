var global$1 = (typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {});

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var inited = false;
function init () {
  inited = true;
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }

  revLookup['-'.charCodeAt(0)] = 62;
  revLookup['_'.charCodeAt(0)] = 63;
}

function toByteArray (b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders);

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len;

  var L = 0;

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = (tmp >> 16) & 0xFF;
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[L++] = tmp & 0xFF;
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var output = '';
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[(tmp << 4) & 0x3F];
    output += '==';
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
    output += lookup[tmp >> 10];
    output += lookup[(tmp >> 4) & 0x3F];
    output += lookup[(tmp << 2) & 0x3F];
    output += '=';
  }

  parts.push(output);

  return parts.join('')
}

function read (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

function write (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
}

var toString = {}.toString;

var isArray = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

var INSPECT_MAX_BYTES = 50;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
  ? global$1.TYPED_ARRAY_SUPPORT
  : true;

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length);
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length);
    }
    that.length = length;
  }

  return that
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
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192; // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype;
  return arr
};

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
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
  return from(null, value, encodingOrOffset, length)
};

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype;
  Buffer.__proto__ = Uint8Array;
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
};

function allocUnsafe (that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
};

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);

  var actual = that.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual);
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array);
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array;
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array);
  }
  return that
}

function fromObject (that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len);
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}
Buffer.isBuffer = isBuffer;
function internalIsBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

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
};

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (!internalIsBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer
};

function byteLength (string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false;
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
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer.byteLength = byteLength;

function slowToString (encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8';

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
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true;

function swap (b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this
};

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this
};

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this
};

Buffer.prototype.toString = function toString () {
  var length = this.length | 0;
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
};

Buffer.prototype.equals = function equals (b) {
  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
};

Buffer.prototype.inspect = function inspect () {
  var str = '';
  var max = INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>'
};

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!internalIsBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
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

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

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
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset;  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1);
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (Buffer.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
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
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
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
};

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
};

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
};

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed;
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
    encoding = 'utf8';
    length = this.length;
    offset = 0;
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0;
    if (isFinite(length)) {
      length = length | 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
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
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
};

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf)
  } else {
    return fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end);
    newBuf.__proto__ = Buffer.prototype;
  } else {
    var sliceLen = end - start;
    newBuf = new Buffer(sliceLen, undefined);
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start];
    }
  }

  return newBuf
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val
};

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val
};

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset]
};

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | (this[offset + 1] << 8)
};

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return (this[offset] << 8) | this[offset + 1]
};

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
};

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
};

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
};

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | (this[offset + 1] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | (this[offset] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
};

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
};

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, true, 23, 4)
};

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, false, 23, 4)
};

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, true, 52, 8)
};

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, false, 52, 8)
};

function checkInt (buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  this[offset] = (value & 0xff);
  return offset + 1
};

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8;
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24);
    this[offset + 2] = (value >>> 16);
    this[offset + 1] = (value >>> 8);
    this[offset] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = (value & 0xff);
  return offset + 1
};

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
    this[offset + 2] = (value >>> 16);
    this[offset + 3] = (value >>> 24);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
};

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
};

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
};

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

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
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;
  var i;

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    );
  }

  return len
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (code < 256) {
        val = code;
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = internalIsBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString());
    var len = bytes.length;
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        }

        // valid lead
        leadSurrogate = codePoint;

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray
}


function base64ToBytes (str) {
  return toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i];
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}


// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
}

function isFastBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
}

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global$1.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global$1.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

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
function nextTick(fun) {
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
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
var title = 'browser';
var platform = 'browser';
var browser = true;
var env = {};
var argv = [];
var version = ''; // empty string to avoid regexp issues
var versions = {};
var release = {};
var config = {};

function noop() {}

var on$1 = noop;
var addListener = noop;
var once = noop;
var off = noop;
var removeListener = noop;
var removeAllListeners = noop;
var emit = noop;

function binding(name) {
    throw new Error('process.binding is not supported');
}

function cwd () { return '/' }
function chdir (dir) {
    throw new Error('process.chdir is not supported');
}function umask() { return 0; }

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
var performance$1 = global$1.performance || {};
var performanceNow =
  performance$1.now        ||
  performance$1.mozNow     ||
  performance$1.msNow      ||
  performance$1.oNow       ||
  performance$1.webkitNow  ||
  function(){ return (new Date()).getTime() };

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
function hrtime(previousTimestamp){
  var clocktime = performanceNow.call(performance$1)*1e-3;
  var seconds = Math.floor(clocktime);
  var nanoseconds = Math.floor((clocktime%1)*1e9);
  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0];
    nanoseconds = nanoseconds - previousTimestamp[1];
    if (nanoseconds<0) {
      seconds--;
      nanoseconds += 1e9;
    }
  }
  return [seconds,nanoseconds]
}

var startTime = new Date();
function uptime() {
  var currentTime = new Date();
  var dif = currentTime - startTime;
  return dif / 1000;
}

var process = {
  nextTick: nextTick,
  title: title,
  browser: browser,
  env: env,
  argv: argv,
  version: version,
  versions: versions,
  on: on$1,
  addListener: addListener,
  once: once,
  off: off,
  removeListener: removeListener,
  removeAllListeners: removeAllListeners,
  emit: emit,
  binding: binding,
  cwd: cwd,
  chdir: chdir,
  umask: umask,
  hrtime: hrtime,
  platform: platform,
  release: release,
  config: config,
  uptime: uptime
};

/*
  @license
	Rollup.js v2.45.0
	Fri, 09 Apr 2021 04:39:40 GMT - commit 5a22c8ad72ca6c619ffc43877499e2cda3757ef3


	https://github.com/rollup/rollup

	Released under the MIT License.
*/
for(var t={},s="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",i=0;i<s.length;i++)t[s.charCodeAt(i)]=i;function n(e,t,s){4===s?e.push([t[0],t[1],t[2],t[3]]):5===s?e.push([t[0],t[1],t[2],t[3],t[4]]):1===s&&e.push([t[0]]);}function r(e){var t="";e=e<0?-e<<1|1:e<<1;do{var i=31&e;(e>>>=5)>0&&(i|=32),t+=s[i];}while(e>0);return t}var a=function e(t){this.bits=t instanceof e?t.bits.slice():[];};a.prototype.add=function(e){this.bits[e>>5]|=1<<(31&e);},a.prototype.has=function(e){return !!(this.bits[e>>5]&1<<(31&e))};var o=function(e,t,s){this.start=e,this.end=t,this.original=s,this.intro="",this.outro="",this.content=s,this.storeName=!1,this.edited=!1,Object.defineProperties(this,{previous:{writable:!0,value:null},next:{writable:!0,value:null}});};o.prototype.appendLeft=function(e){this.outro+=e;},o.prototype.appendRight=function(e){this.intro=this.intro+e;},o.prototype.clone=function(){var e=new o(this.start,this.end,this.original);return e.intro=this.intro,e.outro=this.outro,e.content=this.content,e.storeName=this.storeName,e.edited=this.edited,e},o.prototype.contains=function(e){return this.start<e&&e<this.end},o.prototype.eachNext=function(e){for(var t=this;t;)e(t),t=t.next;},o.prototype.eachPrevious=function(e){for(var t=this;t;)e(t),t=t.previous;},o.prototype.edit=function(e,t,s){return this.content=e,s||(this.intro="",this.outro=""),this.storeName=t,this.edited=!0,this},o.prototype.prependLeft=function(e){this.outro=e+this.outro;},o.prototype.prependRight=function(e){this.intro=e+this.intro;},o.prototype.split=function(e){var t=e-this.start,s=this.original.slice(0,t),i=this.original.slice(t);this.original=s;var n=new o(e,this.end,i);return n.outro=this.outro,this.outro="",this.end=e,this.edited?(n.edit("",!1),this.content=""):this.content=s,n.next=this.next,n.next&&(n.next.previous=n),n.previous=this,this.next=n,n},o.prototype.toString=function(){return this.intro+this.content+this.outro},o.prototype.trimEnd=function(e){if(this.outro=this.outro.replace(e,""),this.outro.length)return !0;var t=this.content.replace(e,"");return t.length?(t!==this.content&&this.split(this.start+t.length).edit("",void 0,!0),!0):(this.edit("",void 0,!0),this.intro=this.intro.replace(e,""),!!this.intro.length||void 0)},o.prototype.trimStart=function(e){if(this.intro=this.intro.replace(e,""),this.intro.length)return !0;var t=this.content.replace(e,"");return t.length?(t!==this.content&&(this.split(this.end-t.length),this.edit("",void 0,!0)),!0):(this.edit("",void 0,!0),this.outro=this.outro.replace(e,""),!!this.outro.length||void 0)};var h=function(){throw new Error("Unsupported environment: `window.btoa` or `Buffer` should be supported.")};"undefined"!=typeof window&&"function"==typeof window.btoa?h=function(e){return window.btoa(unescape(encodeURIComponent(e)))}:"function"==typeof Buffer&&(h=function(e){return Buffer.from(e,"utf-8").toString("base64")});var l=function(e){this.version=3,this.file=e.file,this.sources=e.sources,this.sourcesContent=e.sourcesContent,this.names=e.names,this.mappings=function(e){for(var t=0,s=0,i=0,n=0,a="",o=0;o<e.length;o++){var h=e[o];if(o>0&&(a+=";"),0!==h.length){for(var l=0,c=[],u=0,d=h;u<d.length;u++){var p=d[u],f=r(p[0]-l);l=p[0],p.length>1&&(f+=r(p[1]-t)+r(p[2]-s)+r(p[3]-i),t=p[1],s=p[2],i=p[3]),5===p.length&&(f+=r(p[4]-n),n=p[4]),c.push(f);}a+=c.join(",");}}return a}(e.mappings);};function c(e){var t=e.split("\n"),s=t.filter((function(e){return /^\t+/.test(e)})),i=t.filter((function(e){return /^ {2,}/.test(e)}));if(0===s.length&&0===i.length)return null;if(s.length>=i.length)return "\t";var n=i.reduce((function(e,t){var s=/^ +/.exec(t)[0].length;return Math.min(s,e)}),1/0);return new Array(n+1).join(" ")}function u(e,t){var s=e.split(/[/\\]/),i=t.split(/[/\\]/);for(s.pop();s[0]===i[0];)s.shift(),i.shift();if(s.length)for(var n=s.length;n--;)s[n]="..";return s.concat(i).join("/")}l.prototype.toString=function(){return JSON.stringify(this)},l.prototype.toUrl=function(){return "data:application/json;charset=utf-8;base64,"+h(this.toString())};var d=Object.prototype.toString;function p(e){return "[object Object]"===d.call(e)}function f(e){for(var t=e.split("\n"),s=[],i=0,n=0;i<t.length;i++)s.push(n),n+=t[i].length+1;return function(e){for(var t=0,i=s.length;t<i;){var n=t+i>>1;e<s[n]?i=n:t=n+1;}var r=t-1;return {line:r,column:e-s[r]}}}var m=function(e){this.hires=e,this.generatedCodeLine=0,this.generatedCodeColumn=0,this.raw=[],this.rawSegments=this.raw[this.generatedCodeLine]=[],this.pending=null;};m.prototype.addEdit=function(e,t,s,i){if(t.length){var n=[this.generatedCodeColumn,e,s.line,s.column];i>=0&&n.push(i),this.rawSegments.push(n);}else this.pending&&this.rawSegments.push(this.pending);this.advance(t),this.pending=null;},m.prototype.addUneditedChunk=function(e,t,s,i,n){for(var r=t.start,a=!0;r<t.end;)(this.hires||a||n.has(r))&&this.rawSegments.push([this.generatedCodeColumn,e,i.line,i.column]),"\n"===s[r]?(i.line+=1,i.column=0,this.generatedCodeLine+=1,this.raw[this.generatedCodeLine]=this.rawSegments=[],this.generatedCodeColumn=0,a=!0):(i.column+=1,this.generatedCodeColumn+=1,a=!1),r+=1;this.pending=null;},m.prototype.advance=function(e){if(e){var t=e.split("\n");if(t.length>1){for(var s=0;s<t.length-1;s++)this.generatedCodeLine++,this.raw[this.generatedCodeLine]=this.rawSegments=[];this.generatedCodeColumn=0;}this.generatedCodeColumn+=t[t.length-1].length;}};var g="\n",y={insertLeft:!1,insertRight:!1,storeName:!1},x=function(e,t){void 0===t&&(t={});var s=new o(0,e.length,e);Object.defineProperties(this,{original:{writable:!0,value:e},outro:{writable:!0,value:""},intro:{writable:!0,value:""},firstChunk:{writable:!0,value:s},lastChunk:{writable:!0,value:s},lastSearchedChunk:{writable:!0,value:s},byStart:{writable:!0,value:{}},byEnd:{writable:!0,value:{}},filename:{writable:!0,value:t.filename},indentExclusionRanges:{writable:!0,value:t.indentExclusionRanges},sourcemapLocations:{writable:!0,value:new a},storedNames:{writable:!0,value:{}},indentStr:{writable:!0,value:c(e)}}),this.byStart[0]=s,this.byEnd[e.length]=s;};x.prototype.addSourcemapLocation=function(e){this.sourcemapLocations.add(e);},x.prototype.append=function(e){if("string"!=typeof e)throw new TypeError("outro content must be a string");return this.outro+=e,this},x.prototype.appendLeft=function(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);var s=this.byEnd[e];return s?s.appendLeft(t):this.intro+=t,this},x.prototype.appendRight=function(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);var s=this.byStart[e];return s?s.appendRight(t):this.outro+=t,this},x.prototype.clone=function(){for(var e=new x(this.original,{filename:this.filename}),t=this.firstChunk,s=e.firstChunk=e.lastSearchedChunk=t.clone();t;){e.byStart[s.start]=s,e.byEnd[s.end]=s;var i=t.next,n=i&&i.clone();n&&(s.next=n,n.previous=s,s=n),t=i;}return e.lastChunk=s,this.indentExclusionRanges&&(e.indentExclusionRanges=this.indentExclusionRanges.slice()),e.sourcemapLocations=new a(this.sourcemapLocations),e.intro=this.intro,e.outro=this.outro,e},x.prototype.generateDecodedMap=function(e){var t=this;e=e||{};var s=Object.keys(this.storedNames),i=new m(e.hires),n=f(this.original);return this.intro&&i.advance(this.intro),this.firstChunk.eachNext((function(e){var r=n(e.start);e.intro.length&&i.advance(e.intro),e.edited?i.addEdit(0,e.content,r,e.storeName?s.indexOf(e.original):-1):i.addUneditedChunk(0,e,t.original,r,t.sourcemapLocations),e.outro.length&&i.advance(e.outro);})),{file:e.file?e.file.split(/[/\\]/).pop():null,sources:[e.source?u(e.file||"",e.source):null],sourcesContent:e.includeContent?[this.original]:[null],names:s,mappings:i.raw}},x.prototype.generateMap=function(e){return new l(this.generateDecodedMap(e))},x.prototype.getIndentString=function(){return null===this.indentStr?"\t":this.indentStr},x.prototype.indent=function(e,t){var s=/^[^\r\n]/gm;if(p(e)&&(t=e,e=void 0),""===(e=void 0!==e?e:this.indentStr||"\t"))return this;var i={};(t=t||{}).exclude&&("number"==typeof t.exclude[0]?[t.exclude]:t.exclude).forEach((function(e){for(var t=e[0];t<e[1];t+=1)i[t]=!0;}));var n=!1!==t.indentStart,r=function(t){return n?""+e+t:(n=!0,t)};this.intro=this.intro.replace(s,r);for(var a=0,o=this.firstChunk;o;){var h=o.end;if(o.edited)i[a]||(o.content=o.content.replace(s,r),o.content.length&&(n="\n"===o.content[o.content.length-1]));else for(a=o.start;a<h;){if(!i[a]){var l=this.original[a];"\n"===l?n=!0:"\r"!==l&&n&&(n=!1,a===o.start?o.prependRight(e):(this._splitChunk(o,a),(o=o.next).prependRight(e)));}a+=1;}a=o.end,o=o.next;}return this.outro=this.outro.replace(s,r),this},x.prototype.insert=function(){throw new Error("magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...)")},x.prototype.insertLeft=function(e,t){return y.insertLeft||(console.warn("magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead"),y.insertLeft=!0),this.appendLeft(e,t)},x.prototype.insertRight=function(e,t){return y.insertRight||(console.warn("magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead"),y.insertRight=!0),this.prependRight(e,t)},x.prototype.move=function(e,t,s){if(s>=e&&s<=t)throw new Error("Cannot move a selection inside itself");this._split(e),this._split(t),this._split(s);var i=this.byStart[e],n=this.byEnd[t],r=i.previous,a=n.next,o=this.byStart[s];if(!o&&n===this.lastChunk)return this;var h=o?o.previous:this.lastChunk;return r&&(r.next=a),a&&(a.previous=r),h&&(h.next=i),o&&(o.previous=n),i.previous||(this.firstChunk=n.next),n.next||(this.lastChunk=i.previous,this.lastChunk.next=null),i.previous=h,n.next=o||null,h||(this.firstChunk=i),o||(this.lastChunk=n),this},x.prototype.overwrite=function(e,t,s,i){if("string"!=typeof s)throw new TypeError("replacement content must be a string");for(;e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;if(t>this.original.length)throw new Error("end is out of bounds");if(e===t)throw new Error("Cannot overwrite a zero-length range – use appendLeft or prependRight instead");this._split(e),this._split(t),!0===i&&(y.storeName||(console.warn("The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string"),y.storeName=!0),i={storeName:!0});var n=void 0!==i&&i.storeName,r=void 0!==i&&i.contentOnly;if(n){var a=this.original.slice(e,t);this.storedNames[a]=!0;}var h=this.byStart[e],l=this.byEnd[t];if(h){if(t>h.end&&h.next!==this.byStart[h.end])throw new Error("Cannot overwrite across a split point");if(h.edit(s,n,r),h!==l){for(var c=h.next;c!==l;)c.edit("",!1),c=c.next;c.edit("",!1);}}else {var u=new o(e,t,"").edit(s,n);l.next=u,u.previous=l;}return this},x.prototype.prepend=function(e){if("string"!=typeof e)throw new TypeError("outro content must be a string");return this.intro=e+this.intro,this},x.prototype.prependLeft=function(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);var s=this.byEnd[e];return s?s.prependLeft(t):this.intro=t+this.intro,this},x.prototype.prependRight=function(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);var s=this.byStart[e];return s?s.prependRight(t):this.outro=t+this.outro,this},x.prototype.remove=function(e,t){for(;e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;if(e===t)return this;if(e<0||t>this.original.length)throw new Error("Character is out of bounds");if(e>t)throw new Error("end must be greater than start");this._split(e),this._split(t);for(var s=this.byStart[e];s;)s.intro="",s.outro="",s.edit(""),s=t>s.end?this.byStart[s.end]:null;return this},x.prototype.lastChar=function(){if(this.outro.length)return this.outro[this.outro.length-1];var e=this.lastChunk;do{if(e.outro.length)return e.outro[e.outro.length-1];if(e.content.length)return e.content[e.content.length-1];if(e.intro.length)return e.intro[e.intro.length-1]}while(e=e.previous);return this.intro.length?this.intro[this.intro.length-1]:""},x.prototype.lastLine=function(){var e=this.outro.lastIndexOf(g);if(-1!==e)return this.outro.substr(e+1);var t=this.outro,s=this.lastChunk;do{if(s.outro.length>0){if(-1!==(e=s.outro.lastIndexOf(g)))return s.outro.substr(e+1)+t;t=s.outro+t;}if(s.content.length>0){if(-1!==(e=s.content.lastIndexOf(g)))return s.content.substr(e+1)+t;t=s.content+t;}if(s.intro.length>0){if(-1!==(e=s.intro.lastIndexOf(g)))return s.intro.substr(e+1)+t;t=s.intro+t;}}while(s=s.previous);return -1!==(e=this.intro.lastIndexOf(g))?this.intro.substr(e+1)+t:this.intro+t},x.prototype.slice=function(e,t){for(void 0===e&&(e=0),void 0===t&&(t=this.original.length);e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;for(var s="",i=this.firstChunk;i&&(i.start>e||i.end<=e);){if(i.start<t&&i.end>=t)return s;i=i.next;}if(i&&i.edited&&i.start!==e)throw new Error("Cannot use replaced character "+e+" as slice start anchor.");for(var n=i;i;){!i.intro||n===i&&i.start!==e||(s+=i.intro);var r=i.start<t&&i.end>=t;if(r&&i.edited&&i.end!==t)throw new Error("Cannot use replaced character "+t+" as slice end anchor.");var a=n===i?e-i.start:0,o=r?i.content.length+t-i.end:i.content.length;if(s+=i.content.slice(a,o),!i.outro||r&&i.end!==t||(s+=i.outro),r)break;i=i.next;}return s},x.prototype.snip=function(e,t){var s=this.clone();return s.remove(0,e),s.remove(t,s.original.length),s},x.prototype._split=function(e){if(!this.byStart[e]&&!this.byEnd[e])for(var t=this.lastSearchedChunk,s=e>t.end;t;){if(t.contains(e))return this._splitChunk(t,e);t=s?this.byStart[t.end]:this.byEnd[t.start];}},x.prototype._splitChunk=function(e,t){if(e.edited&&e.content.length){var s=f(this.original)(t);throw new Error("Cannot split a chunk that has already been edited ("+s.line+":"+s.column+' – "'+e.original+'")')}var i=e.split(t);return this.byEnd[t]=e,this.byStart[t]=i,this.byEnd[i.end]=i,e===this.lastChunk&&(this.lastChunk=i),this.lastSearchedChunk=e,!0},x.prototype.toString=function(){for(var e=this.intro,t=this.firstChunk;t;)e+=t.toString(),t=t.next;return e+this.outro},x.prototype.isEmpty=function(){var e=this.firstChunk;do{if(e.intro.length&&e.intro.trim()||e.content.length&&e.content.trim()||e.outro.length&&e.outro.trim())return !1}while(e=e.next);return !0},x.prototype.length=function(){var e=this.firstChunk,t=0;do{t+=e.intro.length+e.content.length+e.outro.length;}while(e=e.next);return t},x.prototype.trimLines=function(){return this.trim("[\\r\\n]")},x.prototype.trim=function(e){return this.trimStart(e).trimEnd(e)},x.prototype.trimEndAborted=function(e){var t=new RegExp((e||"\\s")+"+$");if(this.outro=this.outro.replace(t,""),this.outro.length)return !0;var s=this.lastChunk;do{var i=s.end,n=s.trimEnd(t);if(s.end!==i&&(this.lastChunk===s&&(this.lastChunk=s.next),this.byEnd[s.end]=s,this.byStart[s.next.start]=s.next,this.byEnd[s.next.end]=s.next),n)return !0;s=s.previous;}while(s);return !1},x.prototype.trimEnd=function(e){return this.trimEndAborted(e),this},x.prototype.trimStartAborted=function(e){var t=new RegExp("^"+(e||"\\s")+"+");if(this.intro=this.intro.replace(t,""),this.intro.length)return !0;var s=this.firstChunk;do{var i=s.end,n=s.trimStart(t);if(s.end!==i&&(s===this.lastChunk&&(this.lastChunk=s.next),this.byEnd[s.end]=s,this.byStart[s.next.start]=s.next,this.byEnd[s.next.end]=s.next),n)return !0;s=s.next;}while(s);return !1},x.prototype.trimStart=function(e){return this.trimStartAborted(e),this};var E=Object.prototype.hasOwnProperty,v=function(e){void 0===e&&(e={}),this.intro=e.intro||"",this.separator=void 0!==e.separator?e.separator:"\n",this.sources=[],this.uniqueSources=[],this.uniqueSourceIndexByFilename={};};v.prototype.addSource=function(e){if(e instanceof x)return this.addSource({content:e,filename:e.filename,separator:this.separator});if(!p(e)||!e.content)throw new Error("bundle.addSource() takes an object with a `content` property, which should be an instance of MagicString, and an optional `filename`");if(["filename","indentExclusionRanges","separator"].forEach((function(t){E.call(e,t)||(e[t]=e.content[t]);})),void 0===e.separator&&(e.separator=this.separator),e.filename)if(E.call(this.uniqueSourceIndexByFilename,e.filename)){var t=this.uniqueSources[this.uniqueSourceIndexByFilename[e.filename]];if(e.content.original!==t.content)throw new Error("Illegal source: same filename ("+e.filename+"), different contents")}else this.uniqueSourceIndexByFilename[e.filename]=this.uniqueSources.length,this.uniqueSources.push({filename:e.filename,content:e.content.original});return this.sources.push(e),this},v.prototype.append=function(e,t){return this.addSource({content:new x(e),separator:t&&t.separator||""}),this},v.prototype.clone=function(){var e=new v({intro:this.intro,separator:this.separator});return this.sources.forEach((function(t){e.addSource({filename:t.filename,content:t.content.clone(),separator:t.separator});})),e},v.prototype.generateDecodedMap=function(e){var t=this;void 0===e&&(e={});var s=[];this.sources.forEach((function(e){Object.keys(e.content.storedNames).forEach((function(e){~s.indexOf(e)||s.push(e);}));}));var i=new m(e.hires);return this.intro&&i.advance(this.intro),this.sources.forEach((function(e,n){n>0&&i.advance(t.separator);var r=e.filename?t.uniqueSourceIndexByFilename[e.filename]:-1,a=e.content,o=f(a.original);a.intro&&i.advance(a.intro),a.firstChunk.eachNext((function(t){var n=o(t.start);t.intro.length&&i.advance(t.intro),e.filename?t.edited?i.addEdit(r,t.content,n,t.storeName?s.indexOf(t.original):-1):i.addUneditedChunk(r,t,a.original,n,a.sourcemapLocations):i.advance(t.content),t.outro.length&&i.advance(t.outro);})),a.outro&&i.advance(a.outro);})),{file:e.file?e.file.split(/[/\\]/).pop():null,sources:this.uniqueSources.map((function(t){return e.file?u(e.file,t.filename):t.filename})),sourcesContent:this.uniqueSources.map((function(t){return e.includeContent?t.content:null})),names:s,mappings:i.raw}},v.prototype.generateMap=function(e){return new l(this.generateDecodedMap(e))},v.prototype.getIndentString=function(){var e={};return this.sources.forEach((function(t){var s=t.content.indentStr;null!==s&&(e[s]||(e[s]=0),e[s]+=1);})),Object.keys(e).sort((function(t,s){return e[t]-e[s]}))[0]||"\t"},v.prototype.indent=function(e){var t=this;if(arguments.length||(e=this.getIndentString()),""===e)return this;var s=!this.intro||"\n"===this.intro.slice(-1);return this.sources.forEach((function(i,n){var r=void 0!==i.separator?i.separator:t.separator,a=s||n>0&&/\r?\n$/.test(r);i.content.indent(e,{exclude:i.indentExclusionRanges,indentStart:a}),s="\n"===i.content.lastChar();})),this.intro&&(this.intro=e+this.intro.replace(/^[^\n]/gm,(function(t,s){return s>0?e+t:t}))),this},v.prototype.prepend=function(e){return this.intro=e+this.intro,this},v.prototype.toString=function(){var e=this,t=this.sources.map((function(t,s){var i=void 0!==t.separator?t.separator:e.separator;return (s>0?i:"")+t.content.toString()})).join("");return this.intro+t},v.prototype.isEmpty=function(){return (!this.intro.length||!this.intro.trim())&&!this.sources.some((function(e){return !e.content.isEmpty()}))},v.prototype.length=function(){return this.sources.reduce((function(e,t){return e+t.content.length()}),this.intro.length)},v.prototype.trimLines=function(){return this.trim("[\\r\\n]")},v.prototype.trim=function(e){return this.trimStart(e).trimEnd(e)},v.prototype.trimStart=function(e){var t=new RegExp("^"+(e||"\\s")+"+");if(this.intro=this.intro.replace(t,""),!this.intro){var s,i=0;do{if(!(s=this.sources[i++]))break}while(!s.content.trimStartAborted(e))}return this},v.prototype.trimEnd=function(e){var t,s=new RegExp((e||"\\s")+"+$"),i=this.sources.length-1;do{if(!(t=this.sources[i--])){this.intro=this.intro.replace(s,"");break}}while(!t.content.trimEndAborted(e));return this};const b=/^(?:\/|(?:[A-Za-z]:)?[\\|/])/,S=/^\.?\.\//;function A(e){return b.test(e)}function P(e){return S.test(e)}function C(e){return e.replace(/\\/g,"/")}function w(e){return e.split(/(\/|\\)/).pop()}function _(e){const t=/(\/|\\)[^/\\]*$/.exec(e);if(!t)return ".";const s=e.slice(0,-t[0].length);return s||"/"}function k(e){const t=/\.[^.]+$/.exec(w(e));return t?t[0]:""}function N(e,t){const s=e.split(/[/\\]/).filter(Boolean),i=t.split(/[/\\]/).filter(Boolean);for("."===s[0]&&s.shift(),"."===i[0]&&i.shift();s[0]&&i[0]&&s[0]===i[0];)s.shift(),i.shift();for(;".."===i[0]&&s.length>0;)i.shift(),s.pop();for(;s.pop();)i.unshift("..");return i.join("/")}function I(...e){const t=e.shift();if(!t)return "/";let s=t.split(/[/\\]/);for(const t of e)if(A(t))s=t.split(/[/\\]/);else {const e=t.split(/[/\\]/);for(;"."===e[0]||".."===e[0];){".."===e.shift()&&s.pop();}s.push.apply(s,e);}return s.join("/")}function $(e,t,s,i){if(t.remove(s,i),e.annotations)for(const i of e.annotations)if(i.comment){if(!(i.comment.start<s))return;t.remove(i.comment.start,i.comment.end);}}function M(e,t){if(e.annotations||"ExpressionStatement"!==e.parent.type||(e=e.parent),e.annotations)for(const s of e.annotations.filter((e=>e.comment)))t.remove(s.comment.start,s.comment.end);}const T={isNoStatement:!0};function R(e,t,s=0){let i,n;for(i=e.indexOf(t,s);;){if(-1===(s=e.indexOf("/",s))||s>=i)return i;n=e.charCodeAt(++s),++s,(s=47===n?e.indexOf("\n",s)+1:e.indexOf("*/",s)+2)>i&&(i=e.indexOf(t,s));}}const L=/\S/g;function O(e,t){L.lastIndex=t;return L.exec(e).index}function D(e){let t,s,i=0;for(t=e.indexOf("\n",i);;){if(i=e.indexOf("/",i),-1===i||i>t)return [t,t+1];if(s=e.charCodeAt(i+1),47===s)return [i,t+1];i=e.indexOf("*/",i+3)+2,i>t&&(t=e.indexOf("\n",i));}}function V(e,t,s,i,n){let r,a,o,h,l=e[0],c=!l.included||l.needsBoundaries;c&&(h=s+D(t.original.slice(s,l.start))[1]);for(let s=1;s<=e.length;s++)r=l,a=h,o=c,l=e[s],c=void 0!==l&&(!l.included||l.needsBoundaries),o||c?(h=r.end+D(t.original.slice(r.end,void 0===l?i:l.start))[1],r.included?o?r.render(t,n,{end:h,start:a}):r.render(t,n):$(r,t,a,h)):r.render(t,n);}function B(e,t,s,i){const n=[];let r,a,o,h,l,c=s-1;for(let i=0;i<e.length;i++){for(a=e[i],void 0!==r&&(c=r.end+R(t.original.slice(r.end,a.start),",")),o=h=c+1+D(t.original.slice(c+1,a.start))[1];l=t.original.charCodeAt(o),32===l||9===l||10===l||13===l;)o++;void 0!==r&&n.push({contentEnd:h,end:o,node:r,separator:c,start:s}),r=a,s=o;}return n.push({contentEnd:i,end:i,node:r,separator:null,start:s}),n}function F(e,t,s){for(;;){const[i,n]=D(e.original.slice(t,s));if(-1===i)break;e.remove(t+i,t+=n);}}function W(e,t){const s=t.compact?"":" ";if(1===e.length&&1===t.exportNamesByVariable.get(e[0]).length){const i=e[0];return `exports('${t.exportNamesByVariable.get(i)}',${s}${i.getName()})`}return `exports({${s}${e.map((e=>t.exportNamesByVariable.get(e).map((t=>`${t}:${s}${e.getName()}`)).join(`,${s}`))).join(`,${s}`)}${s}})`}function U(e,t,s){const i=s.compact?"":" ",n=s.compact?"":";";return `function${i}(v)${i}{${i}return exports({${i}${e.map((e=>s.exportNamesByVariable.get(e).map((s=>`${s}:${i}${t?e.getName():"v"}`)).join(`,${i}`))).join(`,${i}`)}${i}}),${i}v${n}${i}}(`}function j(e){let t="";do{const s=e%64;e=Math.floor(e/64),t="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$"[s]+t;}while(0!==e);return t}const z={__proto__:null,await:!0,break:!0,case:!0,catch:!0,class:!0,const:!0,continue:!0,debugger:!0,default:!0,delete:!0,do:!0,else:!0,enum:!0,eval:!0,export:!0,extends:!0,false:!0,finally:!0,for:!0,function:!0,if:!0,implements:!0,import:!0,in:!0,instanceof:!0,interface:!0,let:!0,new:!0,null:!0,package:!0,private:!0,protected:!0,public:!0,return:!0,static:!0,super:!0,switch:!0,this:!0,throw:!0,true:!0,try:!0,typeof:!0,undefined:!0,var:!0,void:!0,while:!0,with:!0,yield:!0};function G(e,t){let s=e,i=1;for(;t.has(s)||z[s];)s=`${e}$${j(i++)}`;return t.add(s),s}const H=[];function q(e,t,s){const i=e.get(t);if(i)return i;const n=s();return e.set(t,n),n}const K=Symbol("Unknown Key"),X=[],Y=[K],Q=Symbol("Entities");class J{constructor(){this.entityPaths=Object.create(null,{[Q]:{value:new Set}});}getEntities(e){let t=this.entityPaths;for(const s of e)t=t[s]=t[s]||Object.create(null,{[Q]:{value:new Set}});return t[Q]}}const Z=new J;class ee{constructor(){this.entityPaths=Object.create(null,{[Q]:{value:new Map}});}getEntities(e,t){let s=this.entityPaths;for(const t of e)s=s[t]=s[t]||Object.create(null,{[Q]:{value:new Map}});return q(s[Q],t,(()=>new Set))}}function te(e,t=null){return Object.create(t,e)}const se=Symbol("Unknown Value");class ie{constructor(){this.included=!0;}deoptimizePath(){}getLiteralValueAtPath(){return se}getReturnExpressionWhenCalledAtPath(e){return re}hasEffectsWhenAccessedAtPath(e,t){return e.length>0}hasEffectsWhenAssignedAtPath(e){return e.length>0}hasEffectsWhenCalledAtPath(e,t,s){return !0}include(){}includeCallArguments(e,t){}mayModifyThisWhenCalledAtPath(){return !0}}function ne(e,t){for(const s of t)s.include(e,!1);}const re=new class extends ie{includeCallArguments(e,t){ne(e,t);}},ae=new class extends ie{getLiteralValueAtPath(){}},oe={value:{callsArgs:null,mutatesSelf:!1,returns:null,returnsPrimitive:re}},he={value:{returns:null,returnsPrimitive:re,callsArgs:null,mutatesSelf:!0}},le={value:{returns:null,returnsPrimitive:re,callsArgs:[0],mutatesSelf:!1}};class ce extends ie{constructor(){super(...arguments),this.included=!1;}getReturnExpressionWhenCalledAtPath(e){return 1===e.length?$e(we,e[0]):re}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenAssignedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e,t,s){return 1!==e.length||Ie(we,e[0],this.included,t,s)}include(){this.included=!0;}includeCallArguments(e,t){ne(e,t);}}const ue={value:{callsArgs:null,mutatesSelf:!1,returns:ce,returnsPrimitive:null}},de={value:{callsArgs:null,mutatesSelf:!0,returns:ce,returnsPrimitive:null}},pe={value:{callsArgs:[0],mutatesSelf:!1,returns:ce,returnsPrimitive:null}},fe={value:{callsArgs:[0],mutatesSelf:!0,returns:ce,returnsPrimitive:null}},me=new class extends ie{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?$e(_e,e[0]):re}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e){if(1===e.length){const t=e[0];return "string"!=typeof t||!_e[t]}return !0}includeCallArguments(e,t){ne(e,t);}},ge={value:{callsArgs:null,mutatesSelf:!1,returns:null,returnsPrimitive:me}},ye={value:{callsArgs:[0],mutatesSelf:!1,returns:null,returnsPrimitive:me}},xe=new class extends ie{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?$e(ke,e[0]):re}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e){if(1===e.length){const t=e[0];return "string"!=typeof t||!ke[t]}return !0}includeCallArguments(e,t){ne(e,t);}},Ee={value:{callsArgs:null,mutatesSelf:!1,returns:null,returnsPrimitive:xe}},ve={value:{callsArgs:null,mutatesSelf:!0,returns:null,returnsPrimitive:xe}},be={value:{callsArgs:[0],mutatesSelf:!1,returns:null,returnsPrimitive:xe}},Se=new class extends ie{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?$e(Ne,e[0]):re}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e,t,s){return 1!==e.length||Ie(Ne,e[0],!0,t,s)}includeCallArguments(e,t){ne(e,t);}},Ae={value:{callsArgs:null,mutatesSelf:!1,returns:null,returnsPrimitive:Se}};class Pe extends ie{constructor(){super(...arguments),this.included=!1;}getReturnExpressionWhenCalledAtPath(e){return 1===e.length?$e(Ce,e[0]):re}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenAssignedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e,t,s){return 1!==e.length||Ie(Ce,e[0],this.included,t,s)}include(){this.included=!0;}includeCallArguments(e,t){ne(e,t);}}const Ce=te({hasOwnProperty:ge,isPrototypeOf:ge,propertyIsEnumerable:ge,toLocaleString:Ae,toString:Ae,valueOf:oe}),we=te({concat:ue,copyWithin:de,every:ye,fill:de,filter:pe,find:le,findIndex:be,forEach:le,includes:ge,indexOf:Ee,join:Ae,lastIndexOf:Ee,map:pe,pop:he,push:ve,reduce:le,reduceRight:le,reverse:de,shift:he,slice:ue,some:ye,sort:fe,splice:de,unshift:ve},Ce),_e=te({valueOf:ge},Ce),ke=te({toExponential:Ae,toFixed:Ae,toLocaleString:Ae,toPrecision:Ae,valueOf:Ee},Ce),Ne=te({charAt:Ae,charCodeAt:Ee,codePointAt:Ee,concat:Ae,endsWith:ge,includes:ge,indexOf:Ee,lastIndexOf:Ee,localeCompare:Ee,match:ge,normalize:Ae,padEnd:Ae,padStart:Ae,repeat:Ae,replace:{value:{callsArgs:[1],mutatesSelf:!1,returns:null,returnsPrimitive:Se}},search:Ee,slice:Ae,split:ue,startsWith:ge,substr:Ae,substring:Ae,toLocaleLowerCase:Ae,toLocaleUpperCase:Ae,toLowerCase:Ae,toUpperCase:Ae,trim:Ae,valueOf:Ae},Ce);function Ie(e,t,s,i,n){if("string"!=typeof t||!e[t]||e[t].mutatesSelf&&s)return !0;if(!e[t].callsArgs)return !1;for(const s of e[t].callsArgs)if(i.args[s]&&i.args[s].hasEffectsWhenCalledAtPath(X,{args:H,withNew:!1},n))return !0;return !1}function $e(e,t){return "string"==typeof t&&e[t]?null!==e[t].returnsPrimitive?e[t].returnsPrimitive:new e[t].returns:re}function Me(){return {brokenFlow:0,includedCallArguments:new Set,includedLabels:new Set}}function Te(){return {accessed:new J,assigned:new J,brokenFlow:0,called:new ee,ignore:{breaks:!1,continues:!1,labels:new Set,returnAwaitYield:!1},includedLabels:new Set,instantiated:new ee,replacedVariableInits:new Map}}class Re{constructor(e){this.alwaysRendered=!1,this.included=!1,this.isId=!1,this.isReassigned=!1,this.renderBaseName=null,this.renderName=null,this.name=e;}addReference(e){}deoptimizePath(e){}getBaseVariableName(){return this.renderBaseName||this.renderName||this.name}getLiteralValueAtPath(e,t,s){return se}getName(){const e=this.renderName||this.name;return this.renderBaseName?`${this.renderBaseName}${z[e]?`['${e}']`:`.${e}`}`:e}getReturnExpressionWhenCalledAtPath(e,t,s){return re}hasEffectsWhenAccessedAtPath(e,t){return e.length>0}hasEffectsWhenAssignedAtPath(e,t){return !0}hasEffectsWhenCalledAtPath(e,t,s){return !0}include(){this.included=!0;}includeCallArguments(e,t){for(const s of t)s.include(e,!1);}markCalledFromTryStatement(){}mayModifyThisWhenCalledAtPath(e,t){return !0}setRenderNames(e,t){this.renderBaseName=e,this.renderName=t;}}class Le extends Re{constructor(e,t,s,i){super(e),this.additionalInitializers=null,this.calledFromTryStatement=!1,this.expressionsToBeDeoptimized=[],this.declarations=t?[t]:[],this.init=s,this.deoptimizationTracker=i.deoptimizationTracker,this.module=i.module;}addDeclaration(e,t){this.declarations.push(e),null===this.additionalInitializers&&(this.additionalInitializers=null===this.init?[]:[this.init],this.init=re,this.isReassigned=!0),null!==t&&this.additionalInitializers.push(t);}consolidateInitializers(){if(null!==this.additionalInitializers){for(const e of this.additionalInitializers)e.deoptimizePath(Y);this.additionalInitializers=null;}}deoptimizePath(e){if(e.length>7||this.isReassigned)return;const t=this.deoptimizationTracker.getEntities(e);if(!t.has(this))if(t.add(this),0===e.length){if(!this.isReassigned){this.isReassigned=!0;const e=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[];for(const t of e)t.deoptimizeCache();this.init&&this.init.deoptimizePath(Y);}}else this.init&&this.init.deoptimizePath(e);}getLiteralValueAtPath(e,t,s){if(this.isReassigned||!this.init||e.length>7)return se;const i=t.getEntities(e);if(i.has(this.init))return se;this.expressionsToBeDeoptimized.push(s),i.add(this.init);const n=this.init.getLiteralValueAtPath(e,t,s);return i.delete(this.init),n}getReturnExpressionWhenCalledAtPath(e,t,s){if(this.isReassigned||!this.init||e.length>7)return re;const i=t.getEntities(e);if(i.has(this.init))return re;this.expressionsToBeDeoptimized.push(s),i.add(this.init);const n=this.init.getReturnExpressionWhenCalledAtPath(e,t,s);return i.delete(this.init),n}hasEffectsWhenAccessedAtPath(e,t){if(0===e.length)return !1;if(this.isReassigned||e.length>7)return !0;const s=t.accessed.getEntities(e);return !s.has(this)&&(s.add(this),this.init&&this.init.hasEffectsWhenAccessedAtPath(e,t))}hasEffectsWhenAssignedAtPath(e,t){if(this.included||e.length>7)return !0;if(0===e.length)return !1;if(this.isReassigned)return !0;const s=t.assigned.getEntities(e);return !s.has(this)&&(s.add(this),this.init&&this.init.hasEffectsWhenAssignedAtPath(e,t))}hasEffectsWhenCalledAtPath(e,t,s){if(e.length>7||this.isReassigned)return !0;const i=(t.withNew?s.instantiated:s.called).getEntities(e,t);return !i.has(this)&&(i.add(this),this.init&&this.init.hasEffectsWhenCalledAtPath(e,t,s))}include(){if(!this.included){this.included=!0;for(const e of this.declarations){e.included||e.include(Me(),!1);let t=e.parent;for(;!t.included&&(t.included=!0,"Program"!==t.type);)t=t.parent;}}}includeCallArguments(e,t){if(this.isReassigned||this.init&&e.includedCallArguments.has(this.init))for(const s of t)s.include(e,!1);else this.init&&(e.includedCallArguments.add(this.init),this.init.includeCallArguments(e,t),e.includedCallArguments.delete(this.init));}markCalledFromTryStatement(){this.calledFromTryStatement=!0;}mayModifyThisWhenCalledAtPath(e,t){if(this.isReassigned||!this.init||e.length>7)return !0;const s=t.getEntities(e);if(s.has(this.init))return !0;s.add(this.init);const i=this.init.mayModifyThisWhenCalledAtPath(e,t);return s.delete(this.init),i}}class Oe{constructor(){this.children=[],this.variables=new Map;}addDeclaration(e,t,s,i){const n=e.name;let r=this.variables.get(n);return r?r.addDeclaration(e,s):(r=new Le(e.name,e,s||ae,t),this.variables.set(n,r)),r}contains(e){return this.variables.has(e)}findVariable(e){throw new Error("Internal Error: findVariable needs to be implemented by a subclass")}}class De extends Oe{constructor(e){super(),this.accessedOutsideVariables=new Map,this.parent=e,e.children.push(this);}addAccessedDynamicImport(e){(this.accessedDynamicImports||(this.accessedDynamicImports=new Set)).add(e),this.parent instanceof De&&this.parent.addAccessedDynamicImport(e);}addAccessedGlobals(e,t){const s=t.get(this)||new Set;for(const t of e)s.add(t);t.set(this,s),this.parent instanceof De&&this.parent.addAccessedGlobals(e,t);}addNamespaceMemberAccess(e,t){this.accessedOutsideVariables.set(e,t),this.parent.addNamespaceMemberAccess(e,t);}addReturnExpression(e){this.parent instanceof De&&this.parent.addReturnExpression(e);}addUsedOutsideNames(e,t,s,i){for(const i of this.accessedOutsideVariables.values())i.included&&(e.add(i.getBaseVariableName()),"system"===t&&s.has(i)&&e.add("exports"));const n=i.get(this);if(n)for(const t of n)e.add(t);}contains(e){return this.variables.has(e)||this.parent.contains(e)}deconflict(e,t,s){const i=new Set;if(this.addUsedOutsideNames(i,e,t,s),this.accessedDynamicImports)for(const e of this.accessedDynamicImports)e.inlineNamespace&&i.add(e.inlineNamespace.getBaseVariableName());for(const[e,t]of this.variables)(t.included||t.alwaysRendered)&&t.setRenderNames(null,G(e,i));for(const i of this.children)i.deconflict(e,t,s);}findLexicalBoundary(){return this.parent.findLexicalBoundary()}findVariable(e){const t=this.variables.get(e)||this.accessedOutsideVariables.get(e);if(t)return t;const s=this.parent.findVariable(e);return this.accessedOutsideVariables.set(e,s),s}}function Ve(e,t,s){if("number"==typeof s)throw new Error("locate takes a { startIndex, offsetLine, offsetColumn } object as the third argument");return function(e,t){void 0===t&&(t={});var s=t.offsetLine||0,i=t.offsetColumn||0,n=e.split("\n"),r=0,a=n.map((function(e,t){var s=r+e.length+1,i={start:r,end:s,line:t};return r=s,i})),o=0;function h(e,t){return e.start<=t&&t<e.end}function l(e,t){return {line:s+e.line,column:i+t-e.start,character:t}}return function(t,s){"string"==typeof t&&(t=e.indexOf(t,s||0));for(var i=a[o],n=t>=i.end?1:-1;i;){if(h(i,t))return l(i,t);i=a[o+=n];}}}(e,s)(t,s&&s.startIndex)}const Be={Literal:[],Program:["body"]};class Fe{constructor(e,t,s){this.included=!1,this.esTreeNode=e,this.keys=Be[e.type]||function(e){return Be[e.type]=Object.keys(e).filter((t=>"_rollupAnnotations"!==t&&"object"==typeof e[t])),Be[e.type]}(e),this.parent=t,this.context=t.context,this.createScope(s),this.parseNode(e),this.initialise(),this.context.magicString.addSourcemapLocation(this.start),this.context.magicString.addSourcemapLocation(this.end);}addExportedVariables(e,t){}bind(){for(const e of this.keys){const t=this[e];if(null!==t)if(Array.isArray(t))for(const e of t)null!==e&&e.bind();else t.bind();}}createScope(e){this.scope=e;}deoptimizePath(e){}getLiteralValueAtPath(e,t,s){return se}getReturnExpressionWhenCalledAtPath(e,t,s){return re}hasEffects(e){for(const t of this.keys){const s=this[t];if(null!==s)if(Array.isArray(s)){for(const t of s)if(null!==t&&t.hasEffects(e))return !0}else if(s.hasEffects(e))return !0}return !1}hasEffectsWhenAccessedAtPath(e,t){return e.length>0}hasEffectsWhenAssignedAtPath(e,t){return !0}hasEffectsWhenCalledAtPath(e,t,s){return !0}include(e,t){this.included=!0;for(const s of this.keys){const i=this[s];if(null!==i)if(Array.isArray(i))for(const s of i)null!==s&&s.include(e,t);else i.include(e,t);}}includeAsSingleStatement(e,t){this.include(e,t);}includeCallArguments(e,t){for(const s of t)s.include(e,!1);}initialise(){}insertSemicolon(e){";"!==e.original[this.end-1]&&e.appendLeft(this.end,";");}mayModifyThisWhenCalledAtPath(e,t){return !0}parseNode(e){for(const t of Object.keys(e)){if(this.hasOwnProperty(t))continue;const s=e[t];if("_rollupAnnotations"===t)this.annotations=s;else if("object"!=typeof s||null===s)this[t]=s;else if(Array.isArray(s)){this[t]=[];for(const e of s)this[t].push(null===e?null:new(this.context.nodeConstructors[e.type]||this.context.nodeConstructors.UnknownNode)(e,this,this.scope));}else this[t]=new(this.context.nodeConstructors[s.type]||this.context.nodeConstructors.UnknownNode)(s,this,this.scope);}}render(e,t){for(const s of this.keys){const i=this[s];if(null!==i)if(Array.isArray(i))for(const s of i)null!==s&&s.render(e,t);else i.render(e,t);}}shouldBeIncluded(e){return this.included||!e.brokenFlow&&this.hasEffects(Te())}}class We extends Fe{createScope(e){this.scope=new De(e);}hasEffectsWhenAccessedAtPath(e){return !(e.length<=1)&&(e.length>2||"prototype"!==e[0])}hasEffectsWhenAssignedAtPath(e){return !(e.length<=1)&&(e.length>2||"prototype"!==e[0])}hasEffectsWhenCalledAtPath(e,t,s){return !t.withNew||(this.body.hasEffectsWhenCalledAtPath(e,t,s)||null!==this.superClass&&this.superClass.hasEffectsWhenCalledAtPath(e,t,s))}initialise(){null!==this.id&&this.id.declare("class",this);}}class Ue extends We{initialise(){super.initialise(),null!==this.id&&(this.id.variable.isId=!0);}parseNode(e){null!==e.id&&(this.id=new this.context.nodeConstructors.Identifier(e.id,this,this.scope.parent)),super.parseNode(e);}render(e,t){"system"===t.format&&this.id&&t.exportNamesByVariable.has(this.id.variable)&&e.appendLeft(this.end,`${t.compact?"":" "}${W([this.id.variable],t)};`),super.render(e,t);}}class je extends Le{constructor(e){super("arguments",null,re,e);}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenAssignedAtPath(){return !0}hasEffectsWhenCalledAtPath(){return !0}}class ze extends Le{constructor(e){super("this",null,null,e);}getLiteralValueAtPath(){return se}hasEffectsWhenAccessedAtPath(e,t){return this.getInit(t).hasEffectsWhenAccessedAtPath(e,t)||super.hasEffectsWhenAccessedAtPath(e,t)}hasEffectsWhenAssignedAtPath(e,t){return this.getInit(t).hasEffectsWhenAssignedAtPath(e,t)||super.hasEffectsWhenAssignedAtPath(e,t)}hasEffectsWhenCalledAtPath(e,t,s){return this.getInit(s).hasEffectsWhenCalledAtPath(e,t,s)||super.hasEffectsWhenCalledAtPath(e,t,s)}getInit(e){return e.replacedVariableInits.get(this)||re}}class Ge extends Fe{bind(){super.bind(),this.argument.deoptimizePath([K,K]);}}class He extends De{constructor(e,t){super(e),this.parameters=[],this.hasRest=!1,this.context=t,this.hoistedBodyVarScope=new De(this);}addParameterDeclaration(e){const t=e.name;let s=this.hoistedBodyVarScope.variables.get(t);return s?s.addDeclaration(e,null):s=new Le(t,e,re,this.context),this.variables.set(t,s),s}addParameterVariables(e,t){this.parameters=e;for(const t of e)for(const e of t)e.alwaysRendered=!0;this.hasRest=t;}includeCallArguments(e,t){let s=!1,i=!1;const n=this.hasRest&&this.parameters[this.parameters.length-1];for(const s of t)if(s instanceof Ge){for(const s of t)s.include(e,!1);break}for(let r=t.length-1;r>=0;r--){const a=this.parameters[r]||n,o=t[r];if(a)if(s=!1,0===a.length)i=!0;else for(const e of a)e.included&&(i=!0),e.calledFromTryStatement&&(s=!0);!i&&o.shouldBeIncluded(e)&&(i=!0),i&&o.include(e,s);}}}class qe extends He{constructor(){super(...arguments),this.returnExpression=null,this.returnExpressions=[];}addReturnExpression(e){this.returnExpressions.push(e);}getReturnExpression(){return null===this.returnExpression&&this.updateReturnExpression(),this.returnExpression}updateReturnExpression(){if(1===this.returnExpressions.length)this.returnExpression=this.returnExpressions[0];else {this.returnExpression=re;for(const e of this.returnExpressions)e.deoptimizePath(Y);}}}class Ke extends qe{constructor(e,t){super(e,t),this.variables.set("arguments",this.argumentsVariable=new je(t)),this.variables.set("this",this.thisVariable=new ze(t));}findLexicalBoundary(){return this}includeCallArguments(e,t){if(super.includeCallArguments(e,t),this.argumentsVariable.included)for(const s of t)s.included||s.include(e,!1);}}function Xe(e,t){if("MemberExpression"===e.type)return !e.computed&&Xe(e.object,e);if("Identifier"===e.type){if(!t)return !0;switch(t.type){case"MemberExpression":return t.computed||e===t.object;case"MethodDefinition":return t.computed;case"PropertyDefinition":case"Property":return t.computed||e===t.value;case"ExportSpecifier":case"ImportSpecifier":return e===t.local;case"LabeledStatement":case"BreakStatement":case"ContinueStatement":return !1;default:return !0}}return !1}const Ye=Object.freeze(Object.create(null)),Qe=Object.freeze({}),Je=Object.freeze([]),Ze=Symbol("Value Properties"),et={pure:!0},tt={pure:!1},st={__proto__:null,[Ze]:tt},it={__proto__:null,[Ze]:et},nt={__proto__:null,[Ze]:tt,prototype:st},rt={__proto__:null,[Ze]:et,prototype:st},at={__proto__:null,[Ze]:et,from:it,of:it,prototype:st},ot={__proto__:null,[Ze]:et,supportedLocalesOf:rt},ht={global:st,globalThis:st,self:st,window:st,__proto__:null,[Ze]:tt,Array:{__proto__:null,[Ze]:tt,from:st,isArray:it,of:it,prototype:st},ArrayBuffer:{__proto__:null,[Ze]:et,isView:it,prototype:st},Atomics:st,BigInt:nt,BigInt64Array:nt,BigUint64Array:nt,Boolean:rt,constructor:nt,DataView:rt,Date:{__proto__:null,[Ze]:et,now:it,parse:it,prototype:st,UTC:it},decodeURI:it,decodeURIComponent:it,encodeURI:it,encodeURIComponent:it,Error:rt,escape:it,eval:st,EvalError:rt,Float32Array:at,Float64Array:at,Function:nt,hasOwnProperty:st,Infinity:st,Int16Array:at,Int32Array:at,Int8Array:at,isFinite:it,isNaN:it,isPrototypeOf:st,JSON:st,Map:rt,Math:{__proto__:null,[Ze]:tt,abs:it,acos:it,acosh:it,asin:it,asinh:it,atan:it,atan2:it,atanh:it,cbrt:it,ceil:it,clz32:it,cos:it,cosh:it,exp:it,expm1:it,floor:it,fround:it,hypot:it,imul:it,log:it,log10:it,log1p:it,log2:it,max:it,min:it,pow:it,random:it,round:it,sign:it,sin:it,sinh:it,sqrt:it,tan:it,tanh:it,trunc:it},NaN:st,Number:{__proto__:null,[Ze]:et,isFinite:it,isInteger:it,isNaN:it,isSafeInteger:it,parseFloat:it,parseInt:it,prototype:st},Object:{__proto__:null,[Ze]:et,create:it,getNotifier:it,getOwn:it,getOwnPropertyDescriptor:it,getOwnPropertyNames:it,getOwnPropertySymbols:it,getPrototypeOf:it,is:it,isExtensible:it,isFrozen:it,isSealed:it,keys:it,prototype:st},parseFloat:it,parseInt:it,Promise:{__proto__:null,[Ze]:tt,all:it,prototype:st,race:it,resolve:it},propertyIsEnumerable:st,Proxy:st,RangeError:rt,ReferenceError:rt,Reflect:st,RegExp:rt,Set:rt,SharedArrayBuffer:nt,String:{__proto__:null,[Ze]:et,fromCharCode:it,fromCodePoint:it,prototype:st,raw:it},Symbol:{__proto__:null,[Ze]:et,for:it,keyFor:it,prototype:st},SyntaxError:rt,toLocaleString:st,toString:st,TypeError:rt,Uint16Array:at,Uint32Array:at,Uint8Array:at,Uint8ClampedArray:at,unescape:it,URIError:rt,valueOf:st,WeakMap:rt,WeakSet:rt,clearInterval:nt,clearTimeout:nt,console:st,Intl:{__proto__:null,[Ze]:tt,Collator:ot,DateTimeFormat:ot,ListFormat:ot,NumberFormat:ot,PluralRules:ot,RelativeTimeFormat:ot},setInterval:nt,setTimeout:nt,TextDecoder:nt,TextEncoder:nt,URL:nt,URLSearchParams:nt,AbortController:nt,AbortSignal:nt,addEventListener:st,alert:st,AnalyserNode:nt,Animation:nt,AnimationEvent:nt,applicationCache:st,ApplicationCache:nt,ApplicationCacheErrorEvent:nt,atob:st,Attr:nt,Audio:nt,AudioBuffer:nt,AudioBufferSourceNode:nt,AudioContext:nt,AudioDestinationNode:nt,AudioListener:nt,AudioNode:nt,AudioParam:nt,AudioProcessingEvent:nt,AudioScheduledSourceNode:nt,AudioWorkletNode:nt,BarProp:nt,BaseAudioContext:nt,BatteryManager:nt,BeforeUnloadEvent:nt,BiquadFilterNode:nt,Blob:nt,BlobEvent:nt,blur:st,BroadcastChannel:nt,btoa:st,ByteLengthQueuingStrategy:nt,Cache:nt,caches:st,CacheStorage:nt,cancelAnimationFrame:st,cancelIdleCallback:st,CanvasCaptureMediaStreamTrack:nt,CanvasGradient:nt,CanvasPattern:nt,CanvasRenderingContext2D:nt,ChannelMergerNode:nt,ChannelSplitterNode:nt,CharacterData:nt,clientInformation:st,ClipboardEvent:nt,close:st,closed:st,CloseEvent:nt,Comment:nt,CompositionEvent:nt,confirm:st,ConstantSourceNode:nt,ConvolverNode:nt,CountQueuingStrategy:nt,createImageBitmap:st,Credential:nt,CredentialsContainer:nt,crypto:st,Crypto:nt,CryptoKey:nt,CSS:nt,CSSConditionRule:nt,CSSFontFaceRule:nt,CSSGroupingRule:nt,CSSImportRule:nt,CSSKeyframeRule:nt,CSSKeyframesRule:nt,CSSMediaRule:nt,CSSNamespaceRule:nt,CSSPageRule:nt,CSSRule:nt,CSSRuleList:nt,CSSStyleDeclaration:nt,CSSStyleRule:nt,CSSStyleSheet:nt,CSSSupportsRule:nt,CustomElementRegistry:nt,customElements:st,CustomEvent:nt,DataTransfer:nt,DataTransferItem:nt,DataTransferItemList:nt,defaultstatus:st,defaultStatus:st,DelayNode:nt,DeviceMotionEvent:nt,DeviceOrientationEvent:nt,devicePixelRatio:st,dispatchEvent:st,document:st,Document:nt,DocumentFragment:nt,DocumentType:nt,DOMError:nt,DOMException:nt,DOMImplementation:nt,DOMMatrix:nt,DOMMatrixReadOnly:nt,DOMParser:nt,DOMPoint:nt,DOMPointReadOnly:nt,DOMQuad:nt,DOMRect:nt,DOMRectReadOnly:nt,DOMStringList:nt,DOMStringMap:nt,DOMTokenList:nt,DragEvent:nt,DynamicsCompressorNode:nt,Element:nt,ErrorEvent:nt,Event:nt,EventSource:nt,EventTarget:nt,external:st,fetch:st,File:nt,FileList:nt,FileReader:nt,find:st,focus:st,FocusEvent:nt,FontFace:nt,FontFaceSetLoadEvent:nt,FormData:nt,frames:st,GainNode:nt,Gamepad:nt,GamepadButton:nt,GamepadEvent:nt,getComputedStyle:st,getSelection:st,HashChangeEvent:nt,Headers:nt,history:st,History:nt,HTMLAllCollection:nt,HTMLAnchorElement:nt,HTMLAreaElement:nt,HTMLAudioElement:nt,HTMLBaseElement:nt,HTMLBodyElement:nt,HTMLBRElement:nt,HTMLButtonElement:nt,HTMLCanvasElement:nt,HTMLCollection:nt,HTMLContentElement:nt,HTMLDataElement:nt,HTMLDataListElement:nt,HTMLDetailsElement:nt,HTMLDialogElement:nt,HTMLDirectoryElement:nt,HTMLDivElement:nt,HTMLDListElement:nt,HTMLDocument:nt,HTMLElement:nt,HTMLEmbedElement:nt,HTMLFieldSetElement:nt,HTMLFontElement:nt,HTMLFormControlsCollection:nt,HTMLFormElement:nt,HTMLFrameElement:nt,HTMLFrameSetElement:nt,HTMLHeadElement:nt,HTMLHeadingElement:nt,HTMLHRElement:nt,HTMLHtmlElement:nt,HTMLIFrameElement:nt,HTMLImageElement:nt,HTMLInputElement:nt,HTMLLabelElement:nt,HTMLLegendElement:nt,HTMLLIElement:nt,HTMLLinkElement:nt,HTMLMapElement:nt,HTMLMarqueeElement:nt,HTMLMediaElement:nt,HTMLMenuElement:nt,HTMLMetaElement:nt,HTMLMeterElement:nt,HTMLModElement:nt,HTMLObjectElement:nt,HTMLOListElement:nt,HTMLOptGroupElement:nt,HTMLOptionElement:nt,HTMLOptionsCollection:nt,HTMLOutputElement:nt,HTMLParagraphElement:nt,HTMLParamElement:nt,HTMLPictureElement:nt,HTMLPreElement:nt,HTMLProgressElement:nt,HTMLQuoteElement:nt,HTMLScriptElement:nt,HTMLSelectElement:nt,HTMLShadowElement:nt,HTMLSlotElement:nt,HTMLSourceElement:nt,HTMLSpanElement:nt,HTMLStyleElement:nt,HTMLTableCaptionElement:nt,HTMLTableCellElement:nt,HTMLTableColElement:nt,HTMLTableElement:nt,HTMLTableRowElement:nt,HTMLTableSectionElement:nt,HTMLTemplateElement:nt,HTMLTextAreaElement:nt,HTMLTimeElement:nt,HTMLTitleElement:nt,HTMLTrackElement:nt,HTMLUListElement:nt,HTMLUnknownElement:nt,HTMLVideoElement:nt,IDBCursor:nt,IDBCursorWithValue:nt,IDBDatabase:nt,IDBFactory:nt,IDBIndex:nt,IDBKeyRange:nt,IDBObjectStore:nt,IDBOpenDBRequest:nt,IDBRequest:nt,IDBTransaction:nt,IDBVersionChangeEvent:nt,IdleDeadline:nt,IIRFilterNode:nt,Image:nt,ImageBitmap:nt,ImageBitmapRenderingContext:nt,ImageCapture:nt,ImageData:nt,indexedDB:st,innerHeight:st,innerWidth:st,InputEvent:nt,IntersectionObserver:nt,IntersectionObserverEntry:nt,isSecureContext:st,KeyboardEvent:nt,KeyframeEffect:nt,length:st,localStorage:st,location:st,Location:nt,locationbar:st,matchMedia:st,MediaDeviceInfo:nt,MediaDevices:nt,MediaElementAudioSourceNode:nt,MediaEncryptedEvent:nt,MediaError:nt,MediaKeyMessageEvent:nt,MediaKeySession:nt,MediaKeyStatusMap:nt,MediaKeySystemAccess:nt,MediaList:nt,MediaQueryList:nt,MediaQueryListEvent:nt,MediaRecorder:nt,MediaSettingsRange:nt,MediaSource:nt,MediaStream:nt,MediaStreamAudioDestinationNode:nt,MediaStreamAudioSourceNode:nt,MediaStreamEvent:nt,MediaStreamTrack:nt,MediaStreamTrackEvent:nt,menubar:st,MessageChannel:nt,MessageEvent:nt,MessagePort:nt,MIDIAccess:nt,MIDIConnectionEvent:nt,MIDIInput:nt,MIDIInputMap:nt,MIDIMessageEvent:nt,MIDIOutput:nt,MIDIOutputMap:nt,MIDIPort:nt,MimeType:nt,MimeTypeArray:nt,MouseEvent:nt,moveBy:st,moveTo:st,MutationEvent:nt,MutationObserver:nt,MutationRecord:nt,name:st,NamedNodeMap:nt,NavigationPreloadManager:nt,navigator:st,Navigator:nt,NetworkInformation:nt,Node:nt,NodeFilter:st,NodeIterator:nt,NodeList:nt,Notification:nt,OfflineAudioCompletionEvent:nt,OfflineAudioContext:nt,offscreenBuffering:st,OffscreenCanvas:nt,open:st,openDatabase:st,Option:nt,origin:st,OscillatorNode:nt,outerHeight:st,outerWidth:st,PageTransitionEvent:nt,pageXOffset:st,pageYOffset:st,PannerNode:nt,parent:st,Path2D:nt,PaymentAddress:nt,PaymentRequest:nt,PaymentRequestUpdateEvent:nt,PaymentResponse:nt,performance:st,Performance:nt,PerformanceEntry:nt,PerformanceLongTaskTiming:nt,PerformanceMark:nt,PerformanceMeasure:nt,PerformanceNavigation:nt,PerformanceNavigationTiming:nt,PerformanceObserver:nt,PerformanceObserverEntryList:nt,PerformancePaintTiming:nt,PerformanceResourceTiming:nt,PerformanceTiming:nt,PeriodicWave:nt,Permissions:nt,PermissionStatus:nt,personalbar:st,PhotoCapabilities:nt,Plugin:nt,PluginArray:nt,PointerEvent:nt,PopStateEvent:nt,postMessage:st,Presentation:nt,PresentationAvailability:nt,PresentationConnection:nt,PresentationConnectionAvailableEvent:nt,PresentationConnectionCloseEvent:nt,PresentationConnectionList:nt,PresentationReceiver:nt,PresentationRequest:nt,print:st,ProcessingInstruction:nt,ProgressEvent:nt,PromiseRejectionEvent:nt,prompt:st,PushManager:nt,PushSubscription:nt,PushSubscriptionOptions:nt,queueMicrotask:st,RadioNodeList:nt,Range:nt,ReadableStream:nt,RemotePlayback:nt,removeEventListener:st,Request:nt,requestAnimationFrame:st,requestIdleCallback:st,resizeBy:st,ResizeObserver:nt,ResizeObserverEntry:nt,resizeTo:st,Response:nt,RTCCertificate:nt,RTCDataChannel:nt,RTCDataChannelEvent:nt,RTCDtlsTransport:nt,RTCIceCandidate:nt,RTCIceTransport:nt,RTCPeerConnection:nt,RTCPeerConnectionIceEvent:nt,RTCRtpReceiver:nt,RTCRtpSender:nt,RTCSctpTransport:nt,RTCSessionDescription:nt,RTCStatsReport:nt,RTCTrackEvent:nt,screen:st,Screen:nt,screenLeft:st,ScreenOrientation:nt,screenTop:st,screenX:st,screenY:st,ScriptProcessorNode:nt,scroll:st,scrollbars:st,scrollBy:st,scrollTo:st,scrollX:st,scrollY:st,SecurityPolicyViolationEvent:nt,Selection:nt,ServiceWorker:nt,ServiceWorkerContainer:nt,ServiceWorkerRegistration:nt,sessionStorage:st,ShadowRoot:nt,SharedWorker:nt,SourceBuffer:nt,SourceBufferList:nt,speechSynthesis:st,SpeechSynthesisEvent:nt,SpeechSynthesisUtterance:nt,StaticRange:nt,status:st,statusbar:st,StereoPannerNode:nt,stop:st,Storage:nt,StorageEvent:nt,StorageManager:nt,styleMedia:st,StyleSheet:nt,StyleSheetList:nt,SubtleCrypto:nt,SVGAElement:nt,SVGAngle:nt,SVGAnimatedAngle:nt,SVGAnimatedBoolean:nt,SVGAnimatedEnumeration:nt,SVGAnimatedInteger:nt,SVGAnimatedLength:nt,SVGAnimatedLengthList:nt,SVGAnimatedNumber:nt,SVGAnimatedNumberList:nt,SVGAnimatedPreserveAspectRatio:nt,SVGAnimatedRect:nt,SVGAnimatedString:nt,SVGAnimatedTransformList:nt,SVGAnimateElement:nt,SVGAnimateMotionElement:nt,SVGAnimateTransformElement:nt,SVGAnimationElement:nt,SVGCircleElement:nt,SVGClipPathElement:nt,SVGComponentTransferFunctionElement:nt,SVGDefsElement:nt,SVGDescElement:nt,SVGDiscardElement:nt,SVGElement:nt,SVGEllipseElement:nt,SVGFEBlendElement:nt,SVGFEColorMatrixElement:nt,SVGFEComponentTransferElement:nt,SVGFECompositeElement:nt,SVGFEConvolveMatrixElement:nt,SVGFEDiffuseLightingElement:nt,SVGFEDisplacementMapElement:nt,SVGFEDistantLightElement:nt,SVGFEDropShadowElement:nt,SVGFEFloodElement:nt,SVGFEFuncAElement:nt,SVGFEFuncBElement:nt,SVGFEFuncGElement:nt,SVGFEFuncRElement:nt,SVGFEGaussianBlurElement:nt,SVGFEImageElement:nt,SVGFEMergeElement:nt,SVGFEMergeNodeElement:nt,SVGFEMorphologyElement:nt,SVGFEOffsetElement:nt,SVGFEPointLightElement:nt,SVGFESpecularLightingElement:nt,SVGFESpotLightElement:nt,SVGFETileElement:nt,SVGFETurbulenceElement:nt,SVGFilterElement:nt,SVGForeignObjectElement:nt,SVGGElement:nt,SVGGeometryElement:nt,SVGGradientElement:nt,SVGGraphicsElement:nt,SVGImageElement:nt,SVGLength:nt,SVGLengthList:nt,SVGLinearGradientElement:nt,SVGLineElement:nt,SVGMarkerElement:nt,SVGMaskElement:nt,SVGMatrix:nt,SVGMetadataElement:nt,SVGMPathElement:nt,SVGNumber:nt,SVGNumberList:nt,SVGPathElement:nt,SVGPatternElement:nt,SVGPoint:nt,SVGPointList:nt,SVGPolygonElement:nt,SVGPolylineElement:nt,SVGPreserveAspectRatio:nt,SVGRadialGradientElement:nt,SVGRect:nt,SVGRectElement:nt,SVGScriptElement:nt,SVGSetElement:nt,SVGStopElement:nt,SVGStringList:nt,SVGStyleElement:nt,SVGSVGElement:nt,SVGSwitchElement:nt,SVGSymbolElement:nt,SVGTextContentElement:nt,SVGTextElement:nt,SVGTextPathElement:nt,SVGTextPositioningElement:nt,SVGTitleElement:nt,SVGTransform:nt,SVGTransformList:nt,SVGTSpanElement:nt,SVGUnitTypes:nt,SVGUseElement:nt,SVGViewElement:nt,TaskAttributionTiming:nt,Text:nt,TextEvent:nt,TextMetrics:nt,TextTrack:nt,TextTrackCue:nt,TextTrackCueList:nt,TextTrackList:nt,TimeRanges:nt,toolbar:st,top:st,Touch:nt,TouchEvent:nt,TouchList:nt,TrackEvent:nt,TransitionEvent:nt,TreeWalker:nt,UIEvent:nt,ValidityState:nt,visualViewport:st,VisualViewport:nt,VTTCue:nt,WaveShaperNode:nt,WebAssembly:st,WebGL2RenderingContext:nt,WebGLActiveInfo:nt,WebGLBuffer:nt,WebGLContextEvent:nt,WebGLFramebuffer:nt,WebGLProgram:nt,WebGLQuery:nt,WebGLRenderbuffer:nt,WebGLRenderingContext:nt,WebGLSampler:nt,WebGLShader:nt,WebGLShaderPrecisionFormat:nt,WebGLSync:nt,WebGLTexture:nt,WebGLTransformFeedback:nt,WebGLUniformLocation:nt,WebGLVertexArrayObject:nt,WebSocket:nt,WheelEvent:nt,Window:nt,Worker:nt,WritableStream:nt,XMLDocument:nt,XMLHttpRequest:nt,XMLHttpRequestEventTarget:nt,XMLHttpRequestUpload:nt,XMLSerializer:nt,XPathEvaluator:nt,XPathExpression:nt,XPathResult:nt,XSLTProcessor:nt};for(const e of ["window","global","self","globalThis"])ht[e]=ht;function lt(e){let t=ht;for(const s of e){if("string"!=typeof s)return null;if(t=t[s],!t)return null}return t[Ze]}class ct extends Re{constructor(){super(...arguments),this.isReassigned=!0;}hasEffectsWhenAccessedAtPath(e){return !function(e){return 1===e.length?"undefined"===e[0]||null!==lt(e):null!==lt(e.slice(0,-1))}([this.name,...e])}hasEffectsWhenCalledAtPath(e){return !function(e){const t=lt(e);return null!==t&&t.pure}([this.name,...e])}}class ut extends Fe{constructor(){super(...arguments),this.variable=null,this.bound=!1;}addExportedVariables(e,t){null!==this.variable&&t.has(this.variable)&&e.push(this.variable);}bind(){this.bound||(this.bound=!0,null===this.variable&&Xe(this,this.parent)&&(this.variable=this.scope.findVariable(this.name),this.variable.addReference(this)),null!==this.variable&&this.variable instanceof Le&&null!==this.variable.additionalInitializers&&this.variable.consolidateInitializers());}declare(e,t){let s;switch(e){case"var":s=this.scope.addDeclaration(this,this.context,t,!0);break;case"function":s=this.scope.addDeclaration(this,this.context,t,!1);break;case"let":case"const":case"class":s=this.scope.addDeclaration(this,this.context,t,!1);break;case"parameter":s=this.scope.addParameterDeclaration(this);break;default:throw new Error(`Internal Error: Unexpected identifier kind ${e}.`)}return [this.variable=s]}deoptimizePath(e){this.bound||this.bind(),0!==e.length||this.scope.contains(this.name)||this.disallowImportReassignment(),this.variable.deoptimizePath(e);}getLiteralValueAtPath(e,t,s){return this.bound||this.bind(),this.variable.getLiteralValueAtPath(e,t,s)}getReturnExpressionWhenCalledAtPath(e,t,s){return this.bound||this.bind(),this.variable.getReturnExpressionWhenCalledAtPath(e,t,s)}hasEffects(){return this.context.options.treeshake.unknownGlobalSideEffects&&this.variable instanceof ct&&this.variable.hasEffectsWhenAccessedAtPath(X)}hasEffectsWhenAccessedAtPath(e,t){return null!==this.variable&&this.variable.hasEffectsWhenAccessedAtPath(e,t)}hasEffectsWhenAssignedAtPath(e,t){return !this.variable||this.variable.hasEffectsWhenAssignedAtPath(e,t)}hasEffectsWhenCalledAtPath(e,t,s){return !this.variable||this.variable.hasEffectsWhenCalledAtPath(e,t,s)}include(){this.included||(this.included=!0,null!==this.variable&&this.context.includeVariableInModule(this.variable));}includeCallArguments(e,t){this.variable.includeCallArguments(e,t);}mayModifyThisWhenCalledAtPath(e,t){return !this.variable||this.variable.mayModifyThisWhenCalledAtPath(e,t)}render(e,t,{renderedParentType:s,isCalleeOfRenderedParent:i,isShorthandProperty:n}=Ye){if(this.variable){const t=this.variable.getName();t!==this.name&&(e.overwrite(this.start,this.end,t,{contentOnly:!0,storeName:!0}),n&&e.prependRight(this.start,`${this.name}: `)),"eval"===t&&"CallExpression"===s&&i&&e.appendRight(this.start,"0, ");}}disallowImportReassignment(){return this.context.error({code:"ILLEGAL_REASSIGNMENT",message:`Illegal reassignment to import '${this.name}'`},this.start)}}class dt extends Fe{constructor(){super(...arguments),this.declarationInit=null;}addExportedVariables(e,t){this.argument.addExportedVariables(e,t);}bind(){super.bind(),null!==this.declarationInit&&this.declarationInit.deoptimizePath([K,K]);}declare(e,t){return this.declarationInit=t,this.argument.declare(e,re)}deoptimizePath(e){0===e.length&&this.argument.deoptimizePath(X);}hasEffectsWhenAssignedAtPath(e,t){return e.length>0||this.argument.hasEffectsWhenAssignedAtPath(X,t)}}class pt extends Fe{constructor(){super(...arguments),this.isPrototypeDeoptimized=!1;}createScope(e){this.scope=new Ke(e,this.context);}deoptimizePath(e){1===e.length&&("prototype"===e[0]?this.isPrototypeDeoptimized=!0:e[0]===K&&(this.isPrototypeDeoptimized=!0,this.scope.getReturnExpression().deoptimizePath(Y)));}getReturnExpressionWhenCalledAtPath(e){return 0===e.length?this.scope.getReturnExpression():re}hasEffects(){return null!==this.id&&this.id.hasEffects()}hasEffectsWhenAccessedAtPath(e){return !(e.length<=1)&&(e.length>2||"prototype"!==e[0]||this.isPrototypeDeoptimized)}hasEffectsWhenAssignedAtPath(e){return !(e.length<=1)&&(e.length>2||"prototype"!==e[0]||this.isPrototypeDeoptimized)}hasEffectsWhenCalledAtPath(e,t,s){if(e.length>0)return !0;for(const e of this.params)if(e.hasEffects(s))return !0;const i=s.replacedVariableInits.get(this.scope.thisVariable);s.replacedVariableInits.set(this.scope.thisVariable,t.withNew?new Pe:re);const{brokenFlow:n,ignore:r}=s;return s.ignore={breaks:!1,continues:!1,labels:new Set,returnAwaitYield:!0},!!this.body.hasEffects(s)||(s.brokenFlow=n,i?s.replacedVariableInits.set(this.scope.thisVariable,i):s.replacedVariableInits.delete(this.scope.thisVariable),s.ignore=r,!1)}include(e,t){this.included=!0,this.id&&this.id.include();const s=this.scope.argumentsVariable.included;for(const i of this.params)i instanceof ut&&!s||i.include(e,t);const{brokenFlow:i}=e;e.brokenFlow=0,this.body.include(e,t),e.brokenFlow=i;}includeCallArguments(e,t){this.scope.includeCallArguments(e,t);}initialise(){null!==this.id&&this.id.declare("function",this),this.scope.addParameterVariables(this.params.map((e=>e.declare("parameter",re))),this.params[this.params.length-1]instanceof dt),this.body.addImplicitReturnExpressionToScope();}mayModifyThisWhenCalledAtPath(e){return !!e.length||this.referencesThis}parseNode(e){this.referencesThis=!1,this.body=new this.context.nodeConstructors.BlockStatement(e.body,this,this.scope.hoistedBodyVarScope),super.parseNode(e);}}pt.prototype.preventChildBlockScope=!0;class ft extends pt{initialise(){super.initialise(),null!==this.id&&(this.id.variable.isId=!0);}parseNode(e){null!==e.id&&(this.id=new this.context.nodeConstructors.Identifier(e.id,this,this.scope.parent)),super.parseNode(e);}}class mt extends Fe{include(e,t){super.include(e,t),t&&this.context.includeVariableInModule(this.variable);}initialise(){const e=this.declaration;this.declarationName=e.id&&e.id.name||this.declaration.name,this.variable=this.scope.addExportDefaultDeclaration(this.declarationName||this.context.getModuleName(),this,this.context),this.context.addExport(this);}render(e,t,s){const{start:i,end:n}=s,r=function(e,t){return O(e,R(e,"default",t)+7)}(e.original,this.start);if(this.declaration instanceof ft)this.renderNamedDeclaration(e,r,"function","(",null===this.declaration.id,t);else if(this.declaration instanceof Ue)this.renderNamedDeclaration(e,r,"class","{",null===this.declaration.id,t);else {if(this.variable.getOriginalVariable()!==this.variable)return void $(this,e,i,n);if(!this.variable.included)return e.remove(this.start,r),this.declaration.render(e,t,{isCalleeOfRenderedParent:!1,renderedParentType:"ExpressionStatement"}),void(";"!==e.original[this.end-1]&&e.appendLeft(this.end,";"));this.renderVariableDeclaration(e,r,t);}this.declaration.render(e,t);}renderNamedDeclaration(e,t,s,i,n,r){const a=this.variable.getName();e.remove(this.start,t),n&&e.appendLeft(function(e,t,s,i){const n=R(e,t,i)+t.length;e=e.slice(n,R(e,s,n));const r=R(e,"*");return -1===r?n:n+r+1}(e.original,s,i,t),` ${a}`),"system"===r.format&&this.declaration instanceof Ue&&r.exportNamesByVariable.has(this.variable)&&e.appendLeft(this.end,` ${W([this.variable],r)};`);}renderVariableDeclaration(e,t,s){const i=59===e.original.charCodeAt(this.end-1),n="system"===s.format&&s.exportNamesByVariable.get(this.variable);n?(e.overwrite(this.start,t,`${s.varOrConst} ${this.variable.getName()} = exports('${n[0]}', `),e.appendRight(i?this.end-1:this.end,")"+(i?"":";"))):(e.overwrite(this.start,t,`${s.varOrConst} ${this.variable.getName()} = `),i||e.appendLeft(this.end,";"));}}mt.prototype.needsBoundaries=!0;class gt extends Re{constructor(){super("undefined");}getLiteralValueAtPath(){}}class yt extends Le{constructor(e,t,s){super(e,t,t.declaration,s),this.hasId=!1,this.originalId=null,this.originalVariable=null;const i=t.declaration;(i instanceof ft||i instanceof Ue)&&i.id?(this.hasId=!0,this.originalId=i.id):i instanceof ut&&(this.originalId=i);}addReference(e){this.hasId||(this.name=e.name);}getAssignedVariableName(){return this.originalId&&this.originalId.name||null}getBaseVariableName(){const e=this.getOriginalVariable();return e===this?super.getBaseVariableName():e.getBaseVariableName()}getDirectOriginalVariable(){return !this.originalId||!this.hasId&&(this.originalId.variable.isReassigned||this.originalId.variable instanceof gt||"syntheticNamespace"in this.originalId.variable)?null:this.originalId.variable}getName(){const e=this.getOriginalVariable();return e===this?super.getName():e.getName()}getOriginalVariable(){if(this.originalVariable)return this.originalVariable;let e,t=this;const s=new Set;do{s.add(t),e=t,t=e.getDirectOriginalVariable();}while(t instanceof yt&&!s.has(t));return this.originalVariable=t||e}}class xt extends Re{constructor(e){super("_missingExportShim"),this.module=e;}}class Et extends Re{constructor(e,t){super(e.getModuleName()),this.memberVariables=null,this.mergedNamespaces=[],this.referencedEarly=!1,this.references=[],this.context=e,this.module=e.module,this.syntheticNamedExports=t;}addReference(e){this.references.push(e),this.name=e.name;}deoptimizePath(){const e=this.getMemberVariables();for(const t of Object.keys(e))e[t].deoptimizePath(Y);}getMemberVariables(){if(this.memberVariables)return this.memberVariables;const e=Object.create(null);for(const t of this.context.getExports().concat(this.context.getReexports()))"*"!==t[0]&&t!==this.module.info.syntheticNamedExports&&(e[t]=this.context.traceExport(t));return this.memberVariables=e}include(){this.included=!0,this.context.includeAllExports();}prepareNamespace(e){this.mergedNamespaces=e;const t=this.context.getModuleExecIndex();for(const e of this.references)if(e.context.getModuleExecIndex()<=t){this.referencedEarly=!0;break}}renderBlock(e){const t=e.compact?"":" ",s=e.compact?"":"\n",i=e.indent,n=this.getMemberVariables(),r=Object.keys(n).map((s=>{const r=n[s];if(this.referencedEarly||r.isReassigned)return `${i}get ${s}${t}()${t}{${t}return ${r.getName()}${e.compact?"":";"}${t}}`;return `${i}${z[s]?`'${s}'`:s}: ${r.getName()}`}));e.namespaceToStringTag&&r.unshift(`${i}[Symbol.toStringTag]:${t}'Module'`);const a=this.mergedNamespaces.length>0||this.syntheticNamedExports;a||r.unshift(`${i}__proto__:${t}null`);let o=`{${s}${r.join(`,${s}`)}${s}}`;if(a){const e=["/*#__PURE__*/Object.create(null)"];this.mergedNamespaces.length>0&&e.push(...this.mergedNamespaces.map((e=>e.getName()))),this.syntheticNamedExports&&e.push(this.module.getSyntheticNamespace().getName()),r.length>0&&e.push(o),o=`/*#__PURE__*/Object.assign(${e.join(`,${t}`)})`;}e.freeze&&(o=`/*#__PURE__*/Object.freeze(${o})`);const h=this.getName();return o=`${e.varOrConst} ${h}${t}=${t}${o};`,"system"===e.format&&e.exportNamesByVariable.has(this)&&(o+=`${s}${W([this],e)};`),o}renderFirst(){return this.referencedEarly}}Et.prototype.isNamespace=!0;class vt extends Re{constructor(e,t,s){super(t),this.baseVariable=null,this.context=e,this.module=e.module,this.syntheticNamespace=s;}getBaseVariable(){if(this.baseVariable)return this.baseVariable;let e=this.syntheticNamespace;for(;e instanceof yt||e instanceof vt;){if(e instanceof yt){const t=e.getOriginalVariable();if(t===e)break;e=t;}e instanceof vt&&(e=e.syntheticNamespace);}return this.baseVariable=e}getBaseVariableName(){return this.syntheticNamespace.getBaseVariableName()}getName(){const e=this.name;return `${this.syntheticNamespace.getName()}${bt(e)}`}include(){this.included||(this.included=!0,this.context.includeVariableInModule(this.syntheticNamespace));}setRenderNames(e,t){super.setRenderNames(e,t);}}const bt=e=>!z[e]&&/^(?!\d)[\w$]+$/.test(e)?`.${e}`:`[${JSON.stringify(e)}]`;class St extends Re{constructor(e,t){super(t),this.module=e,this.isNamespace="*"===t,this.referenced=!1;}addReference(e){this.referenced=!0,"default"!==this.name&&"*"!==this.name||this.module.suggestName(e.name);}hasEffectsWhenAccessedAtPath(e){return e.length>(this.isNamespace?1:0)}include(){this.included||(this.included=!0,this.module.used=!0);}}const At="break case class catch const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield enum await implements package protected static interface private public".split(" "),Pt="Infinity NaN undefined null true false eval uneval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Symbol Error EvalError InternalError RangeError ReferenceError SyntaxError TypeError URIError Number Math Date String RegExp Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array Map Set WeakMap WeakSet SIMD ArrayBuffer DataView JSON Promise Generator GeneratorFunction Reflect Proxy Intl".split(" "),Ct=new Set(At.concat(Pt)),wt=/[^$_a-zA-Z0-9]/g,_t=e=>/\d/.test(e[0]);function kt(e){return e=e.replace(/-(\w)/g,((e,t)=>t.toUpperCase())).replace(wt,"_"),(_t(e)||Ct.has(e))&&(e=`_${e}`),e||"_"}class Nt{constructor(e,t,s,i,n){this.options=e,this.id=t,this.renormalizeRenderPath=n,this.defaultVariableName="",this.dynamicImporters=[],this.importers=[],this.mostCommonSuggestion=0,this.namespaceVariableName="",this.reexported=!1,this.renderPath=void 0,this.used=!1,this.variableName="",this.execIndex=1/0,this.suggestedVariableName=kt(t.split(/[\\/]/).pop()),this.nameSuggestions=Object.create(null),this.declarations=Object.create(null),this.exportedVariables=new Map;const r=this;this.info={ast:null,code:null,dynamicallyImportedIds:Je,get dynamicImporters(){return r.dynamicImporters.sort()},hasModuleSideEffects:s,id:t,implicitlyLoadedAfterOneOf:Je,implicitlyLoadedBefore:Je,importedIds:Je,get importers(){return r.importers.sort()},isEntry:!1,isExternal:!0,meta:i,syntheticNamedExports:!1};}getVariableForExportName(e){let t=this.declarations[e];return t||(this.declarations[e]=t=new St(this,e),this.exportedVariables.set(t,e),t)}setRenderPath(e,t){return this.renderPath="function"==typeof e.paths?e.paths(this.id):e.paths[this.id],this.renderPath||(this.renderPath=this.renormalizeRenderPath?C(N(t,this.id)):this.id),this.renderPath}suggestName(e){this.nameSuggestions[e]||(this.nameSuggestions[e]=0),this.nameSuggestions[e]+=1,this.nameSuggestions[e]>this.mostCommonSuggestion&&(this.mostCommonSuggestion=this.nameSuggestions[e],this.suggestedVariableName=e);}warnUnusedImports(){const e=Object.keys(this.declarations).filter((e=>{if("*"===e)return !1;const t=this.declarations[e];return !t.included&&!this.reexported&&!t.referenced}));if(0===e.length)return;const t=1===e.length?`'${e[0]}' is`:`${e.slice(0,-1).map((e=>`'${e}'`)).join(", ")} and '${e.slice(-1)}' are`;this.options.onwarn({code:"UNUSED_EXTERNAL_IMPORT",message:`${t} imported from external module '${this.id}' but never used`,names:e,source:this.id});}}function It(e){return e.endsWith(".js")?e.slice(0,-3):e}function $t(e,t){return e.autoId?`${e.basePath?e.basePath+"/":""}${It(t)}`:e.id||""}const Mt={auto:"_interopDefault",default:null,defaultOnly:null,esModule:null,false:null,true:"_interopDefaultLegacy"};function Tt(e,t){return "esModule"===e||t&&("auto"===e||"true"===e)}const Rt={auto:"_interopNamespace",default:"_interopNamespaceDefault",defaultOnly:"_interopNamespaceDefaultOnly",esModule:null,false:null,true:"_interopNamespace"};function Lt(e,t){return Tt(e,t)&&"_interopDefault"===Mt[e]}const Ot={_interopDefault:(e,t,s,i,n)=>`function _interopDefault${e}(e)${e}{${e}return e${e}&&${e}e.__esModule${e}?${e}${n?Dt(e):Vt(e)}${s}${e}}${t}${t}`,_interopDefaultLegacy:(e,t,s,i,n)=>`function _interopDefaultLegacy${e}(e)${e}{${e}return e${e}&&${e}typeof e${e}===${e}'object'${e}&&${e}'default'${e}in e${e}?${e}${n?Dt(e):Vt(e)}${s}${e}}${t}${t}`,_interopNamespace:(e,t,s,i,n,r,a,o)=>`function _interopNamespace(e)${e}{${t}`+(o.has("_interopNamespaceDefault")?`${i}return e${e}&&${e}e.__esModule${e}?${e}e${e}:${e}_interopNamespaceDefault(e)${s}${t}`:`${i}if${e}(e${e}&&${e}e.__esModule)${e}return e;${t}`+Bt(e,t,i,i,n,r,a))+`}${t}${t}`,_interopNamespaceDefault:(e,t,s,i,n,r,a)=>`function _interopNamespaceDefault(e)${e}{${t}`+Bt(e,t,i,i,n,r,a)+`}${t}${t}`,_interopNamespaceDefaultOnly:(e,t,s,i,n,r,a)=>`function _interopNamespaceDefaultOnly(e)${e}{${t}${i}return ${Ut(`{__proto__: null,${a?`${e}[Symbol.toStringTag]:${e}'Module',`:""}${e}'default':${e}e}`,r)};${t}}${t}${t}`};function Dt(e){return `e${e}:${e}{${e}'default':${e}e${e}}`}function Vt(e){return `e['default']${e}:${e}e`}function Bt(e,t,s,i,n,r,a){return `${i}var n${e}=${e}${a?`{__proto__:${e}null,${e}[Symbol.toStringTag]:${e}'Module'}`:"Object.create(null)"};${t}${i}if${e}(e)${e}{${t}${i}${s}Object.keys(e).forEach(function${e}(k)${e}{${t}`+(n?Ft:Wt)(e,t,s,i+s+s)+`${i}${s}});${t}`+`${i}}${t}`+`${i}n['default']${e}=${e}e;${t}`+`${i}return ${Ut("n",r)};${t}`}function Ft(e,t,s,i){return `${i}if${e}(k${e}!==${e}'default')${e}{${t}${i}${s}var d${e}=${e}Object.getOwnPropertyDescriptor(e,${e}k);${t}${i}${s}Object.defineProperty(n,${e}k,${e}d.get${e}?${e}d${e}:${e}{${t}${i}${s}${s}enumerable:${e}true,${t}${i}${s}${s}get:${e}function${e}()${e}{${t}${i}${s}${s}${s}return e[k];${t}${i}${s}${s}}${t}${i}${s}});${t}${i}}${t}`}function Wt(e,t,s,i){return `${i}n[k]${e}=${e}e[k];${t}`}function Ut(e,t){return t?`Object.freeze(${e})`:e}const jt=Object.keys(Ot);function zt(e,t,s,i,n,r,a,o="return "){const h=n?"":" ",l=n?"":"\n";if(!s)return `${l}${l}${o}${function(e,t,s,i){if(e.length>0)return e[0].local;for(const{defaultVariableName:e,id:n,isChunk:r,name:a,namedExportsMode:o,namespaceVariableName:h,reexports:l}of t)if(l)return Gt(a,l[0].imported,o,r,e,h,s,n,i)}(e,t,i,a)};`;let c="";for(const{defaultVariableName:e,id:n,isChunk:o,name:u,namedExportsMode:d,namespaceVariableName:p,reexports:f}of t)if(f&&s)for(const t of f)if("*"!==t.reexported){const s=Gt(u,t.imported,d,o,e,p,i,n,a);c&&(c+=l),c+="*"!==t.imported&&t.needsLiveBinding?`Object.defineProperty(exports,${h}'${t.reexported}',${h}{${l}${r}enumerable:${h}true,${l}${r}get:${h}function${h}()${h}{${l}${r}${r}return ${s};${l}${r}}${l}});`:`exports.${t.reexported}${h}=${h}${s};`;}for(const t of e){const e=`exports.${t.exported}`,s=t.local;e!==s&&(c&&(c+=l),c+=`${e}${h}=${h}${s};`);}for(const{name:e,reexports:i}of t)if(i&&s)for(const t of i)"*"===t.reexported&&(c&&(c+=l),t.needsLiveBinding?c+=`Object.keys(${e}).forEach(function${h}(k)${h}{${l}${r}if${h}(k${h}!==${h}'default'${h}&&${h}!exports.hasOwnProperty(k))${h}Object.defineProperty(exports,${h}k,${h}{${l}${r}${r}enumerable:${h}true,${l}${r}${r}get:${h}function${h}()${h}{${l}${r}${r}${r}return ${e}[k];${l}${r}${r}}${l}${r}});${l}});`:c+=`Object.keys(${e}).forEach(function${h}(k)${h}{${l}${r}if${h}(k${h}!==${h}'default'${h}&&${h}!exports.hasOwnProperty(k))${h}exports[k]${h}=${h}${e}[k];${l}});`);return c?`${l}${l}${c}`:""}function Gt(e,t,s,i,n,r,a,o,h){if("default"===t){if(!i){const t=String(a(o)),s=Mt[t]?n:e;return Tt(t,h)?`${s}['default']`:s}return s?`${e}['default']`:e}return "*"===t?(i?!s:Rt[String(a(o))])?r:e:`${e}.${t}`}function Ht(e,t,s,i,n){let r="";return e&&(t&&(r+=function(e){return `Object.defineProperty(exports,${e}'__esModule',${e}{${e}value:${e}true${e}});`}(i)),s&&(r&&(r+=n),r+=function(e){return `exports[Symbol.toStringTag]${e}=${e}'Module';`}(i))),r}function qt(e,t,s,i,n,r,a,o,h,l,c){const u=new Set,d=[],p=(e,s,i)=>{u.add(s),d.push(`${t} ${e}${o}=${o}/*#__PURE__*/${s}(${i});`);};for(const{defaultVariableName:t,imports:i,id:n,isChunk:r,name:a,namedExportsMode:o,namespaceVariableName:h,reexports:l}of e)if(r){for(const{imported:e,reexported:t}of [...i||[],...l||[]])if("*"===e&&"*"!==t){o||p(h,"_interopNamespaceDefaultOnly",a);break}}else {const e=String(s(n));let r=!1,o=!1;for(const{imported:s,reexported:n}of [...i||[],...l||[]]){let i,l;"default"===s?r||(r=!0,t!==h&&(l=t,i=Mt[e])):"*"===s&&"*"!==n&&(o||(o=!0,i=Rt[e],l=h)),i&&p(l,i,a);}}return `${function(e,t,s,i,n,r,a,o,h){return jt.map((l=>e.has(l)||t.has(l)?Ot[l](s,i,n,r,a,o,h,e):"")).join("")}(u,a,o,h,l,c,i,n,r)}${d.length>0?`${d.join(h)}${h}${h}`:""}`}function Kt(e){return "."===e[0]?It(e):e}const Xt={assert:!0,buffer:!0,console:!0,constants:!0,domain:!0,events:!0,http:!0,https:!0,os:!0,path:!0,process:!0,punycode:!0,querystring:!0,stream:!0,string_decoder:!0,timers:!0,tty:!0,url:!0,util:!0,vm:!0,zlib:!0};function Yt(e,t){const s=t.map((({id:e})=>e)).filter((e=>e in Xt));if(!s.length)return;e({code:"MISSING_NODE_BUILTINS",message:`Creating a browser bundle that depends on Node.js built-in ${1===s.length?`module ('${s[0]}')`:`modules (${s.slice(0,-1).map((e=>`'${e}'`)).join(", ")} and '${s.slice(-1)}')`}. You might need to include https://github.com/ionic-team/rollup-plugin-node-polyfills`,modules:s});}function Qt(e){return e.replace(/^\t+/,(e=>e.split("\t").join("  ")))}function Jt(e){const t=/^[a-z]:/i.exec(e),s=t?t[0]:"";return s+e.substr(s.length).replace(/[\0?*:]/g,"_")}function Zt(e){const t=w(e);return t.substr(0,t.length-k(e).length)}function es(e){return A(e)?N(I(),e):e}function ts(e){return !("/"===e[0]||"."===e[0]&&("/"===e[1]||"."===e[1])||Jt(e)!==e||A(e))}function ss(e){throw e instanceof Error||(e=Object.assign(new Error(e.message),e)),e}function is(e,t,s,i){if("object"==typeof t){const{line:s,column:n}=t;e.loc={file:i,line:s,column:n};}else {e.pos=t;const{line:n,column:r}=Ve(s,t,{offsetLine:1});e.loc={file:i,line:n,column:r};}if(void 0===e.frame){const{line:t,column:i}=e.loc;e.frame=function(e,t,s){let i=e.split("\n");const n=Math.max(0,t-3);let r=Math.min(t+2,i.length);for(i=i.slice(n,r);!/\S/.test(i[i.length-1]);)i.pop(),r-=1;const a=String(r).length;return i.map(((e,i)=>{const r=n+i+1===t;let o=String(i+n+1);for(;o.length<a;)o=` ${o}`;if(r){const t=function(e){let t="";for(;e--;)t+=" ";return t}(a+2+Qt(e.slice(0,s)).length)+"^";return `${o}: ${Qt(e)}\n${t}`}return `${o}: ${Qt(e)}`})).join("\n")}(s,t,i);}}var ns;function rs({fileName:e,code:t},s){const i={code:ns.CHUNK_INVALID,message:`Chunk "${e}" is not valid JavaScript: ${s.message}.`};return is(i,s.loc,t,e),i}function as(e,t,s){return {code:"INVALID_EXPORT_OPTION",message:`"${e}" was specified for "output.exports", but entry module "${es(s)}" has the following exports: ${t.join(", ")}`}}function os(e,t,s){return {code:ns.MISSING_EXPORT,message:`'${e}' is not exported by ${es(s)}, imported by ${es(t)}`,url:"https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module"}}function hs(e){const t=Array.from(e.implicitlyLoadedBefore,(e=>es(e.id))).sort();return {code:ns.MISSING_IMPLICIT_DEPENDANT,message:`Module "${es(e.id)}" that should be implicitly loaded before "${1===t.length?t[0]:`${t.slice(0,-1).join('", "')}" and "${t.slice(-1)[0]}`}" is not included in the module graph. Either it was not imported by an included module or only via a tree-shaken dynamic import, or no imported bindings were used and it had otherwise no side-effects.`}}function ls(e,t,s){return {code:ns.NAMESPACE_CONFLICT,message:`Conflicting namespaces: ${es(t.id)} re-exports '${e}' from both ${es(t.exportsAll[e])} and ${es(s.exportsAll[e])} (will be ignored)`,name:e,reexporter:t.id,sources:[t.exportsAll[e],s.exportsAll[e]]}}function cs(e,t,s){const i=s?"reexport":"import";return {code:ns.UNEXPECTED_NAMED_IMPORT,id:e,message:`The named export "${t}" was ${i}ed from the external module ${es(e)} even though its interop type is "defaultOnly". Either remove or change this ${i} or change the value of the "output.interop" option.`,url:"https://rollupjs.org/guide/en/#outputinterop"}}function us(e){return {code:ns.UNEXPECTED_NAMED_IMPORT,id:e,message:`There was a namespace "*" reexport from the external module ${es(e)} even though its interop type is "defaultOnly". This will be ignored as namespace reexports only reexport named exports. If this is not intended, either remove or change this reexport or change the value of the "output.interop" option.`,url:"https://rollupjs.org/guide/en/#outputinterop"}}function ds(e){return {code:ns.VALIDATION_ERROR,message:e}}function ps(){return {code:ns.ALREADY_CLOSED,message:'Bundle is already closed, no more calls to "generate" or "write" are allowed.'}}function fs(e,t,s){ms(e,t,s.onwarn,s.strictDeprecations);}function ms(e,t,s,i){if(t||i){const t=function(e){return {code:ns.DEPRECATED_FEATURE,..."string"==typeof e?{message:e}:e}}(e);if(i)return ss(t);s(t);}}!function(e){e.ALREADY_CLOSED="ALREADY_CLOSED",e.ASSET_NOT_FINALISED="ASSET_NOT_FINALISED",e.ASSET_NOT_FOUND="ASSET_NOT_FOUND",e.ASSET_SOURCE_ALREADY_SET="ASSET_SOURCE_ALREADY_SET",e.ASSET_SOURCE_MISSING="ASSET_SOURCE_MISSING",e.BAD_LOADER="BAD_LOADER",e.CANNOT_EMIT_FROM_OPTIONS_HOOK="CANNOT_EMIT_FROM_OPTIONS_HOOK",e.CHUNK_NOT_GENERATED="CHUNK_NOT_GENERATED",e.CHUNK_INVALID="CHUNK_INVALID",e.CIRCULAR_REEXPORT="CIRCULAR_REEXPORT",e.CYCLIC_CROSS_CHUNK_REEXPORT="CYCLIC_CROSS_CHUNK_REEXPORT",e.DEPRECATED_FEATURE="DEPRECATED_FEATURE",e.EXTERNAL_SYNTHETIC_EXPORTS="EXTERNAL_SYNTHETIC_EXPORTS",e.FILE_NAME_CONFLICT="FILE_NAME_CONFLICT",e.FILE_NOT_FOUND="FILE_NOT_FOUND",e.INPUT_HOOK_IN_OUTPUT_PLUGIN="INPUT_HOOK_IN_OUTPUT_PLUGIN",e.INVALID_CHUNK="INVALID_CHUNK",e.INVALID_EXPORT_OPTION="INVALID_EXPORT_OPTION",e.INVALID_EXTERNAL_ID="INVALID_EXTERNAL_ID",e.INVALID_OPTION="INVALID_OPTION",e.INVALID_PLUGIN_HOOK="INVALID_PLUGIN_HOOK",e.INVALID_ROLLUP_PHASE="INVALID_ROLLUP_PHASE",e.MISSING_EXPORT="MISSING_EXPORT",e.MISSING_IMPLICIT_DEPENDANT="MISSING_IMPLICIT_DEPENDANT",e.MIXED_EXPORTS="MIXED_EXPORTS",e.NAMESPACE_CONFLICT="NAMESPACE_CONFLICT",e.NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE="NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE",e.PLUGIN_ERROR="PLUGIN_ERROR",e.PREFER_NAMED_EXPORTS="PREFER_NAMED_EXPORTS",e.SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT="SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT",e.UNEXPECTED_NAMED_IMPORT="UNEXPECTED_NAMED_IMPORT",e.UNRESOLVED_ENTRY="UNRESOLVED_ENTRY",e.UNRESOLVED_IMPORT="UNRESOLVED_IMPORT",e.VALIDATION_ERROR="VALIDATION_ERROR";}(ns||(ns={}));const gs=/^[a-zA-Z$_][a-zA-Z0-9$_]*$/;function ys(e){return gs.test(e)?`.${e}`:`['${e}']`}function xs(e){return e.split(".").map(ys).join("")}function Es(e,t,s,i,n){const r=i?"":" ",a=e.split(".");a[0]=("function"==typeof s?s(a[0]):s[a[0]])||a[0];const o=a.pop();let h=t,l=a.map((e=>(h+=ys(e),`${h}${r}=${r}${h}${r}||${r}{}`))).concat(`${h}${ys(o)}`).join(`,${r}`).concat(`${r}=${r}${n}`);return a.length>0&&(l=`(${l})`),l}function vs(e){let t=e.length;for(;t--;){const{imports:s,reexports:i}=e[t];if(s||i)return e.slice(0,t+1)}return []}const bs=e=>`this${xs(e)}`;function Ss({dependencies:e,exports:t}){const s=new Set(t.map((e=>e.exported)));s.has("default")||s.add("default");for(const{reexports:t}of e)if(t)for(const e of t)"*"===e.imported||s.has(e.reexported)||s.add(e.reexported);return s}function As(e,t,s,i){return 0===e.length?"":1===e.length?`${s}${s}${s}exports('${e[0].name}',${t}${e[0].value});${i}${i}`:`${s}${s}${s}exports({${i}`+e.map((({name:e,value:i})=>`${s}${s}${s}${s}${e}:${t}${i}`)).join(`,${i}`)+`${i}${s}${s}${s}});${i}${i}`}function Ps(e,t){return e?`${t}${xs(e)}`:"null"}var Cs={system:function(e,{accessedGlobals:t,dependencies:s,exports:i,hasExports:n,indentString:r,intro:a,outro:o,usesTopLevelAwait:h,varOrConst:l},c){const u=c.compact?"":"\n",d=c.compact?"":" ",p=s.map((e=>`'${e.id}'`)),f=[];let m;const g=[];for(const{imports:e,reexports:t}of s){const n=[];if(e)for(const t of e)f.push(t.local),"*"===t.imported?n.push(`${t.local}${d}=${d}module;`):n.push(`${t.local}${d}=${d}module.${t.imported};`);if(t){let e=!1;if(t.length>1||1===t.length&&("*"===t[0].reexported||"*"===t[0].imported)){for(const a of t)"*"===a.reexported&&(m||(m=Ss({dependencies:s,exports:i})),e||(n.push(`${l} _setter${d}=${d}{};`),e=!0),n.push(`for${d}(var _$p${d}in${d}module)${d}{`),n.push(`${r}if${d}(!_starExcludes[_$p])${d}_setter[_$p]${d}=${d}module[_$p];`),n.push("}"));for(const e of t)"*"===e.imported&&"*"!==e.reexported&&n.push(`exports('${e.reexported}',${d}module);`);for(const s of t)"*"!==s.reexported&&"*"!==s.imported&&(e||(n.push(`${l} _setter${d}=${d}{};`),e=!0),n.push(`_setter.${s.reexported}${d}=${d}module.${s.imported};`));e&&n.push("exports(_setter);");}else for(const e of t)n.push(`exports('${e.reexported}',${d}module.${e.imported});`);}g.push(n.join(`${u}${r}${r}${r}`));}const y=c.name?`'${c.name}',${d}`:"",x=t.has("module")?`exports,${d}module`:n?"exports":"";let E=`System.register(${y}[`+p.join(`,${d}`)+`],${d}function${d}(${x})${d}{${u}${r}${c.strict?"'use strict';":""}`+((e,t,s,i,n)=>e?`${n}${i}${t} _starExcludes${s}=${s}{${s}${[...e].map((e=>`${e}:${s}1`)).join(`,${s}`)}${s}};`:"")(m,l,d,r,u)+((e,t,s,i)=>e.length?`${i}${s}var ${e.join(`,${t}`)};`:"")(f,d,r,u)+`${u}${r}return${d}{${g.length?`${u}${r}${r}setters:${d}[${g.map((e=>e?`function${d}(module)${d}{${u}${r}${r}${r}${e}${u}${r}${r}}`:c.systemNullSetters?"null":`function${d}()${d}{}`)).join(`,${d}`)}],`:""}${u}`;E+=`${r}${r}execute:${d}${h?`async${d}`:""}function${d}()${d}{${u}${u}`+((e,t,s,i)=>As(e.filter((e=>e.hoisted||e.uninitialized)).map((e=>({name:e.exported,value:e.uninitialized?"void 0":e.local}))),t,s,i))(i,d,r,u);const v=`${u}${u}`+((e,t,s,i)=>As(e.filter((e=>e.expression)).map((e=>({name:e.exported,value:e.local}))),t,s,i))(i,d,r,u)+((e,t,s,i)=>As(e.filter((e=>"_missingExportShim"===e.local)).map((e=>({name:e.exported,value:"_missingExportShim"}))),t,s,i))(i,d,r,u)+`${r}${r}}${u}${r}}${c.compact?"":";"}${u}});`;return a&&e.prepend(a),o&&e.append(o),e.indent(`${r}${r}${r}`).append(v).prepend(E)},amd:function(e,{accessedGlobals:t,dependencies:s,exports:i,hasExports:n,id:r,indentString:a,intro:o,isEntryFacade:h,isModuleFacade:l,namedExportsMode:c,outro:u,varOrConst:d,warn:p},{amd:f,compact:m,esModule:g,externalLiveBindings:y,freeze:x,interop:E,namespaceToStringTag:v,strict:b}){Yt(p,s);const S=s.map((e=>`'${Kt(e.id)}'`)),A=s.map((e=>e.name)),P=m?"":"\n",C=m?"":";",w=m?"":" ";c&&n&&(A.unshift("exports"),S.unshift("'exports'")),t.has("require")&&(A.unshift("require"),S.unshift("'require'")),t.has("module")&&(A.unshift("module"),S.unshift("'module'"));const _=$t(f,r),k=(_?`'${_}',${w}`:"")+(S.length?`[${S.join(`,${w}`)}],${w}`:""),N=b?`${w}'use strict';`:"";e.prepend(`${o}${qt(s,d,E,y,x,v,t,w,P,C,a)}`);const I=zt(i,s,c,E,m,a,y);let $=Ht(c&&n,h&&g,l&&v,w,P);return $&&($=P+P+$),e.append(`${I}${$}${u}`),e.indent(a).prepend(`${f.define}(${k}function${w}(${A.join(`,${w}`)})${w}{${N}${P}${P}`).append(`${P}${P}});`)},cjs:function(e,{accessedGlobals:t,dependencies:s,exports:i,hasExports:n,indentString:r,intro:a,isEntryFacade:o,isModuleFacade:h,namedExportsMode:l,outro:c,varOrConst:u},{compact:d,esModule:p,externalLiveBindings:f,freeze:m,interop:g,namespaceToStringTag:y,strict:x}){const E=d?"":"\n",v=d?"":";",b=d?"":" ",S=x?`'use strict';${E}${E}`:"";let A=Ht(l&&n,o&&p,h&&y,b,E);A&&(A+=E+E);const P=function(e,t,s,i,n){let r="",a=!1;for(const{id:o,name:h,reexports:l,imports:c}of e)l||c?(r+=t&&a?",":`${r?`;${i}`:""}${s} `,a=!0,r+=`${h}${n}=${n}require('${o}')`):(r&&(r+=!t||a?`;${i}`:","),a=!1,r+=`require('${o}')`);if(r)return `${r};${i}${i}`;return ""}(s,d,u,E,b),C=qt(s,u,g,f,m,y,t,b,E,v,r);e.prepend(`${S}${a}${A}${P}${C}`);const w=zt(i,s,l,g,d,r,f,`module.exports${b}=${b}`);return e.append(`${w}${c}`)},es:function(e,{intro:t,outro:s,dependencies:i,exports:n,varOrConst:r},{compact:a}){const o=a?"":" ",h=a?"":"\n",l=function(e,t){const s=[];for(const{id:i,reexports:n,imports:r,name:a}of e)if(n||r){if(r){let e=null,n=null;const a=[];for(const t of r)"default"===t.imported?e=t:"*"===t.imported?n=t:a.push(t);n&&s.push(`import${t}*${t}as ${n.local} from${t}'${i}';`),e&&0===a.length?s.push(`import ${e.local} from${t}'${i}';`):a.length>0&&s.push(`import ${e?`${e.local},${t}`:""}{${t}${a.map((e=>e.imported===e.local?e.imported:`${e.imported} as ${e.local}`)).join(`,${t}`)}${t}}${t}from${t}'${i}';`);}if(n){let e=null;const o=[],h=[];for(const t of n)"*"===t.reexported?e=t:"*"===t.imported?o.push(t):h.push(t);if(e&&s.push(`export${t}*${t}from${t}'${i}';`),o.length>0){r&&r.some((e=>"*"===e.imported&&e.local===a))||s.push(`import${t}*${t}as ${a} from${t}'${i}';`);for(const e of o)s.push(`export${t}{${t}${a===e.reexported?a:`${a} as ${e.reexported}`} };`);}h.length>0&&s.push(`export${t}{${t}${h.map((e=>e.imported===e.reexported?e.imported:`${e.imported} as ${e.reexported}`)).join(`,${t}`)}${t}}${t}from${t}'${i}';`);}}else s.push(`import${t}'${i}';`);return s}(i,o);l.length>0&&(t+=l.join(h)+h+h),t&&e.prepend(t);const c=function(e,t,s){const i=[],n=[];for(const r of e)"default"===r.exported?i.push(`export default ${r.local};`):(r.expression&&i.push(`${s} ${r.local}${t}=${t}${r.expression};`),n.push(r.exported===r.local?r.local:`${r.local} as ${r.exported}`));n.length&&i.push(`export${t}{${t}${n.join(`,${t}`)}${t}};`);return i}(n,o,r);return c.length&&e.append(h+h+c.join(h).trim()),s&&e.append(s),e.trim()},iife:function(e,{accessedGlobals:t,dependencies:s,exports:i,hasExports:n,indentString:r,intro:a,namedExportsMode:o,outro:h,varOrConst:l,warn:c},{compact:u,esModule:d,extend:p,freeze:f,externalLiveBindings:m,globals:g,interop:y,name:x,namespaceToStringTag:E,strict:v}){const b=u?"":" ",S=u?"":";",A=u?"":"\n",P=x&&-1!==x.indexOf("."),C=!p&&!P;if(x&&C&&(_t(w=x)||Ct.has(w)||wt.test(w)))return ss({code:"ILLEGAL_IDENTIFIER_AS_NAME",message:`Given name "${x}" is not a legal JS identifier. If you need this, you can try "output.extend: true".`});var w;Yt(c,s);const _=vs(s),k=_.map((e=>e.globalName||"null")),N=_.map((e=>e.name));n&&!x&&c({code:"MISSING_NAME_OPTION_FOR_IIFE_EXPORT",message:'If you do not supply "output.name", you may not be able to access the exports of an IIFE bundle.'}),o&&n&&(p?(k.unshift(`${bs(x)}${b}=${b}${bs(x)}${b}||${b}{}`),N.unshift("exports")):(k.unshift("{}"),N.unshift("exports")));const I=v?`${r}'use strict';${A}`:"",$=qt(s,l,y,m,f,E,t,b,A,S,r);e.prepend(`${a}${$}`);let M=`(function${b}(${N.join(`,${b}`)})${b}{${A}${I}${A}`;n&&(!x||p&&o||(M=(C?`${l} ${x}`:bs(x))+`${b}=${b}${M}`),P&&(M=function(e,t,s,i){const n=i?"":" ",r=e.split(".");r[0]=("function"==typeof s?s(r[0]):s[r[0]])||r[0],r.pop();let a=t;return r.map((e=>(a+=ys(e),`${a}${n}=${n}${a}${n}||${n}{}${i?"":";"}`))).join(i?",":"\n")+(i&&r.length?";":"\n")}(x,"this",g,u)+M));let T=`${A}${A}}(${k.join(`,${b}`)}));`;n&&!p&&o&&(T=`${A}${A}${r}return exports;${T}`);const R=zt(i,s,o,y,u,r,m);let L=Ht(o&&n,d,E,b,A);return L&&(L=A+A+L),e.append(`${R}${L}${h}`),e.indent(r).prepend(M).append(T)},umd:function(e,{accessedGlobals:t,dependencies:s,exports:i,hasExports:n,id:r,indentString:a,intro:o,namedExportsMode:h,outro:l,varOrConst:c,warn:u},{amd:d,compact:p,esModule:f,extend:m,externalLiveBindings:g,freeze:y,interop:x,name:E,namespaceToStringTag:v,globals:b,noConflict:S,strict:A}){const P=p?"":" ",C=p?"":"\n",w=p?"":";",_=p?"f":"factory",k=p?"g":"global";if(n&&!E)return ss({code:"MISSING_NAME_OPTION_FOR_IIFE_EXPORT",message:'You must supply "output.name" for UMD bundles that have exports so that the exports are accessible in environments without a module loader.'});Yt(u,s);const N=s.map((e=>`'${Kt(e.id)}'`)),I=s.map((e=>`require('${e.id}')`)),$=vs(s),M=$.map((e=>Ps(e.globalName,k))),T=$.map((e=>e.name));h&&(n||S)&&(N.unshift("'exports'"),I.unshift("exports"),M.unshift(Es(E,k,b,p,(m?`${Ps(E,k)}${P}||${P}`:"")+"{}")),T.unshift("exports"));const R=$t(d,r),L=(R?`'${R}',${P}`:"")+(N.length?`[${N.join(`,${P}`)}],${P}`:""),O=d.define,D=!h&&n?`module.exports${P}=${P}`:"",V=A?`${P}'use strict';${C}`:"";let B;if(S){const e=p?"e":"exports";let t;if(!h&&n)t=`var ${e}${P}=${P}${Es(E,k,b,p,`${_}(${M.join(`,${P}`)})`)};`;else {t=`var ${e}${P}=${P}${M.shift()};${C}${a}${a}${_}(${[e].concat(M).join(`,${P}`)});`;}B=`(function${P}()${P}{${C}${a}${a}var current${P}=${P}${function(e,t,s){const i=e.split(".");let n=t;return i.map((e=>n+=ys(e))).join(`${s}&&${s}`)}(E,k,P)};${C}${a}${a}${t}${C}${a}${a}${e}.noConflict${P}=${P}function${P}()${P}{${P}${Ps(E,k)}${P}=${P}current;${P}return ${e}${p?"":"; "}};${C}${a}}())`;}else B=`${_}(${M.join(`,${P}`)})`,!h&&n&&(B=Es(E,k,b,p,B));const F=n||S&&h||M.length>0,W=F?`this,${P}`:"",U=F?`(${k}${P}=${P}typeof globalThis${P}!==${P}'undefined'${P}?${P}globalThis${P}:${P}${k}${P}||${P}self,${P}`:"",j=F?")":"",z=`(function${P}(${F?`${k},${P}`:""}${_})${P}{${C}`+(F?`${a}typeof exports${P}===${P}'object'${P}&&${P}typeof module${P}!==${P}'undefined'${P}?${P}${D}${_}(${I.join(`,${P}`)})${P}:${C}`:"")+`${a}typeof ${O}${P}===${P}'function'${P}&&${P}${O}.amd${P}?${P}${O}(${L}${_})${P}:${C}`+`${a}${U}${B}${j};${C}`+`}(${W}(function${P}(${T.join(", ")})${P}{${V}${C}`,G=C+C+"})));";e.prepend(`${o}${qt(s,c,x,g,y,v,t,P,C,w,a)}`);const H=zt(i,s,h,x,p,a,g);let q=Ht(h&&n,f,v,P,C);return q&&(q=C+C+q),e.append(`${H}${q}${l}`),e.trim().indent(a).append(G).prepend(z)}};const ws={ArrayPattern(e,t){for(const s of t.elements)s&&ws[s.type](e,s);},AssignmentPattern(e,t){ws[t.left.type](e,t.left);},Identifier(e,t){e.push(t.name);},MemberExpression(){},ObjectPattern(e,t){for(const s of t.properties)"RestElement"===s.type?ws.RestElement(e,s):ws[s.value.type](e,s.value);},RestElement(e,t){ws[t.argument.type](e,t.argument);}},_s=function(e){const t=[];return ws[e.type](t,e),t};class ks extends Fe{hasEffects(){return !1}initialise(){this.context.addExport(this);}render(e,t,s){e.remove(s.start,s.end);}}ks.prototype.needsBoundaries=!0;class Ns extends De{addDeclaration(e,t,s,i){return i?this.parent.addDeclaration(e,t,re,i):super.addDeclaration(e,t,s,!1)}}class Is extends Fe{initialise(){this.directive&&"use strict"!==this.directive&&"Program"===this.parent.type&&this.context.warn({code:"MODULE_LEVEL_DIRECTIVE",message:`Module level directives cause errors when bundled, '${this.directive}' was ignored.`},this.start);}render(e,t){super.render(e,t),this.included&&this.insertSemicolon(e);}shouldBeIncluded(e){return this.directive&&"use strict"!==this.directive?"Program"!==this.parent.type:super.shouldBeIncluded(e)}}class $s extends Fe{constructor(){super(...arguments),this.directlyIncluded=!1;}addImplicitReturnExpressionToScope(){const e=this.body[this.body.length-1];e&&"ReturnStatement"===e.type||this.scope.addReturnExpression(re);}createScope(e){this.scope=this.parent.preventChildBlockScope?e:new Ns(e);}hasEffects(e){if(this.deoptimizeBody)return !0;for(const t of this.body){if(t.hasEffects(e))return !0;if(e.brokenFlow)break}return !1}include(e,t){if(!this.deoptimizeBody||!this.directlyIncluded){this.included=!0,this.directlyIncluded=!0,this.deoptimizeBody&&(t=!0);for(const s of this.body)(t||s.shouldBeIncluded(e))&&s.include(e,t);}}initialise(){const e=this.body[0];this.deoptimizeBody=e instanceof Is&&"use asm"===e.directive;}render(e,t){this.body.length?V(this.body,e,this.start+1,this.end-1,t):super.render(e,t);}}class Ms extends Fe{createScope(e){this.scope=new qe(e,this.context);}deoptimizePath(e){1===e.length&&e[0]===K&&this.scope.getReturnExpression().deoptimizePath(Y);}getReturnExpressionWhenCalledAtPath(e){return 0===e.length?this.scope.getReturnExpression():re}hasEffects(){return !1}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenAssignedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e,t,s){if(e.length>0)return !0;for(const e of this.params)if(e.hasEffects(s))return !0;const{ignore:i,brokenFlow:n}=s;return s.ignore={breaks:!1,continues:!1,labels:new Set,returnAwaitYield:!0},!!this.body.hasEffects(s)||(s.ignore=i,s.brokenFlow=n,!1)}include(e,t){this.included=!0;for(const s of this.params)s instanceof ut||s.include(e,t);const{brokenFlow:s}=e;e.brokenFlow=0,this.body.include(e,t),e.brokenFlow=s;}includeCallArguments(e,t){this.scope.includeCallArguments(e,t);}initialise(){this.scope.addParameterVariables(this.params.map((e=>e.declare("parameter",re))),this.params[this.params.length-1]instanceof dt),this.body instanceof $s?this.body.addImplicitReturnExpressionToScope():this.scope.addReturnExpression(this.body);}mayModifyThisWhenCalledAtPath(){return !1}parseNode(e){"BlockStatement"===e.body.type&&(this.body=new this.context.nodeConstructors.BlockStatement(e.body,this,this.scope.hoistedBodyVarScope)),super.parseNode(e);}}Ms.prototype.preventChildBlockScope=!0;const Ts={"!=":(e,t)=>e!=t,"!==":(e,t)=>e!==t,"%":(e,t)=>e%t,"&":(e,t)=>e&t,"*":(e,t)=>e*t,"**":(e,t)=>e**t,"+":(e,t)=>e+t,"-":(e,t)=>e-t,"/":(e,t)=>e/t,"<":(e,t)=>e<t,"<<":(e,t)=>e<<t,"<=":(e,t)=>e<=t,"==":(e,t)=>e==t,"===":(e,t)=>e===t,">":(e,t)=>e>t,">=":(e,t)=>e>=t,">>":(e,t)=>e>>t,">>>":(e,t)=>e>>>t,"^":(e,t)=>e^t,in:()=>se,instanceof:()=>se,"|":(e,t)=>e|t};class Rs extends Fe{getLiteralValueAtPath(e){return e.length>0||null===this.value&&110!==this.context.code.charCodeAt(this.start)||"bigint"==typeof this.value||47===this.context.code.charCodeAt(this.start)?se:this.value}getReturnExpressionWhenCalledAtPath(e){return 1!==e.length?re:$e(this.members,e[0])}hasEffectsWhenAccessedAtPath(e){return null===this.value?e.length>0:e.length>1}hasEffectsWhenAssignedAtPath(e){return e.length>0}hasEffectsWhenCalledAtPath(e,t,s){return 1!==e.length||Ie(this.members,e[0],this.included,t,s)}initialise(){this.members=function(e){switch(typeof e){case"boolean":return _e;case"number":return ke;case"string":return Ne;default:return Object.create(null)}}(this.value);}parseNode(e){this.value=e.value,this.regex=e.regex,super.parseNode(e);}render(e){"string"==typeof this.value&&e.indentExclusionRanges.push([this.start+1,this.end-1]);}}function Ls(e){return e.computed?function(e){if(e instanceof Rs)return String(e.value);return null}(e.property):e.property.name}function Os(e){const t=e.propertyKey,s=e.object;if("string"==typeof t){if(s instanceof ut)return [{key:s.name,pos:s.start},{key:t,pos:e.property.start}];if(s instanceof Ds){const i=Os(s);return i&&[...i,{key:t,pos:e.property.start}]}}return null}class Ds extends Fe{constructor(){super(...arguments),this.variable=null,this.bound=!1,this.expressionsToBeDeoptimized=[],this.replacement=null,this.wasPathDeoptimizedWhileOptimized=!1;}bind(){if(this.bound)return;this.bound=!0;const e=Os(this),t=e&&this.scope.findVariable(e[0].key);if(t&&t.isNamespace){const s=this.resolveNamespaceVariables(t,e.slice(1));s?"string"==typeof s?this.replacement=s:(this.variable=s,this.scope.addNamespaceMemberAccess(function(e){let t=e[0].key;for(let s=1;s<e.length;s++)t+="."+e[s].key;return t}(e),s)):super.bind();}else super.bind(),this.getPropertyKey();}deoptimizeCache(){const e=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[],this.propertyKey=K,this.wasPathDeoptimizedWhileOptimized&&this.object.deoptimizePath(Y);for(const t of e)t.deoptimizeCache();}deoptimizePath(e){if(this.bound||this.bind(),0===e.length&&this.disallowNamespaceReassignment(),this.variable)this.variable.deoptimizePath(e);else {const t=this.getPropertyKey();t===K?this.object.deoptimizePath(Y):(this.wasPathDeoptimizedWhileOptimized=!0,this.object.deoptimizePath([t,...e]));}}getLiteralValueAtPath(e,t,s){return this.bound||this.bind(),null!==this.variable?this.variable.getLiteralValueAtPath(e,t,s):(this.expressionsToBeDeoptimized.push(s),this.object.getLiteralValueAtPath([this.getPropertyKey(),...e],t,s))}getReturnExpressionWhenCalledAtPath(e,t,s){return this.bound||this.bind(),null!==this.variable?this.variable.getReturnExpressionWhenCalledAtPath(e,t,s):(this.expressionsToBeDeoptimized.push(s),this.object.getReturnExpressionWhenCalledAtPath([this.getPropertyKey(),...e],t,s))}hasEffects(e){const t=this.context.options.treeshake.propertyReadSideEffects;return "always"===t||this.property.hasEffects(e)||this.object.hasEffects(e)||t&&this.object.hasEffectsWhenAccessedAtPath([this.propertyKey],e)}hasEffectsWhenAccessedAtPath(e,t){return 0!==e.length&&(null!==this.variable?this.variable.hasEffectsWhenAccessedAtPath(e,t):this.object.hasEffectsWhenAccessedAtPath([this.propertyKey,...e],t))}hasEffectsWhenAssignedAtPath(e,t){return null!==this.variable?this.variable.hasEffectsWhenAssignedAtPath(e,t):this.object.hasEffectsWhenAssignedAtPath([this.propertyKey,...e],t)}hasEffectsWhenCalledAtPath(e,t,s){return null!==this.variable?this.variable.hasEffectsWhenCalledAtPath(e,t,s):this.object.hasEffectsWhenCalledAtPath([this.propertyKey,...e],t,s)}include(e,t){this.included||(this.included=!0,null!==this.variable&&this.context.includeVariableInModule(this.variable)),this.object.include(e,t),this.property.include(e,t);}includeCallArguments(e,t){this.variable?this.variable.includeCallArguments(e,t):super.includeCallArguments(e,t);}initialise(){this.propertyKey=Ls(this);}mayModifyThisWhenCalledAtPath(e,t){return this.variable?this.variable.mayModifyThisWhenCalledAtPath(e,t):this.object.mayModifyThisWhenCalledAtPath([this.propertyKey].concat(e),t)}render(e,t,{renderedParentType:s,isCalleeOfRenderedParent:i,renderedSurroundingElement:n}=Ye){const r="CallExpression"===s&&i;if(this.variable||this.replacement){let t=this.variable?this.variable.getName():this.replacement;r&&(t="0, "+t),e.overwrite(this.start,this.end,t,{contentOnly:!0,storeName:!0});}else {r&&e.appendRight(this.start,"0, ");const i=s||n;this.object.render(e,t,i?{renderedSurroundingElement:i}:Ye),this.property.render(e,t);}}disallowNamespaceReassignment(){if(this.object instanceof ut){this.scope.findVariable(this.object.name).isNamespace&&(this.variable&&this.context.includeVariableInModule(this.variable),this.context.warn({code:"ILLEGAL_NAMESPACE_REASSIGNMENT",message:`Illegal reassignment to import '${this.object.name}'`},this.start));}}getPropertyKey(){if(null===this.propertyKey){this.propertyKey=K;const e=this.property.getLiteralValueAtPath(X,Z,this);return this.propertyKey=e===se?K:String(e)}return this.propertyKey}resolveNamespaceVariables(e,t){if(0===t.length)return e;if(!e.isNamespace||e instanceof St)return null;const s=t[0].key,i=e.context.traceExport(s);if(!i){const i=e.context.fileName;return this.context.warn({code:"MISSING_EXPORT",exporter:es(i),importer:es(this.context.fileName),message:`'${s}' is not exported by '${es(i)}'`,missing:s,url:"https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module"},t[0].pos),"undefined"}return this.resolveNamespaceVariables(i,t.slice(1))}}class Vs extends He{addDeclaration(e,t,s,i){return i?this.parent.addDeclaration(e,t,s,i):super.addDeclaration(e,t,s,!1)}}class Bs extends Fe{createScope(e){this.scope=new Vs(e,this.context);}initialise(){this.param&&this.param.declare("parameter",re);}parseNode(e){this.body=new this.context.nodeConstructors.BlockStatement(e.body,this,this.scope),super.parseNode(e);}}Bs.prototype.preventChildBlockScope=!0;class Fs extends De{findLexicalBoundary(){return this}}class Ws extends Fe{hasEffects(e){return this.key.hasEffects(e)}hasEffectsWhenCalledAtPath(e,t,s){return e.length>0||this.value.hasEffectsWhenCalledAtPath(X,t,s)}}class Us{constructor(e){this.included=!1,this.expressions=e;}deoptimizePath(e){for(const t of this.expressions)t.deoptimizePath(e);}getLiteralValueAtPath(){return se}getReturnExpressionWhenCalledAtPath(e,t,s){return new Us(this.expressions.map((i=>i.getReturnExpressionWhenCalledAtPath(e,t,s))))}hasEffectsWhenAccessedAtPath(e,t){for(const s of this.expressions)if(s.hasEffectsWhenAccessedAtPath(e,t))return !0;return !1}hasEffectsWhenAssignedAtPath(e,t){for(const s of this.expressions)if(s.hasEffectsWhenAssignedAtPath(e,t))return !0;return !1}hasEffectsWhenCalledAtPath(e,t,s){for(const i of this.expressions)if(i.hasEffectsWhenCalledAtPath(e,t,s))return !0;return !1}include(e,t){for(const s of this.expressions)s.included||s.include(e,t);}includeCallArguments(){}mayModifyThisWhenCalledAtPath(e,t){return this.expressions.some((s=>s.mayModifyThisWhenCalledAtPath(e,t)))}}class js extends Fe{bind(){null!==this.declaration&&this.declaration.bind();}hasEffects(e){return null!==this.declaration&&this.declaration.hasEffects(e)}initialise(){this.context.addExport(this);}render(e,t,s){const{start:i,end:n}=s;null===this.declaration?e.remove(i,n):(e.remove(this.start,this.declaration.start),this.declaration.render(e,t,{start:i,end:n}));}}js.prototype.needsBoundaries=!0;class zs extends Ns{constructor(){super(...arguments),this.hoistedDeclarations=[];}addDeclaration(e,t,s,i){return this.hoistedDeclarations.push(e),this.parent.addDeclaration(e,t,s,i)}}const Gs=Symbol("unset");class Hs extends Fe{constructor(){super(...arguments),this.testValue=Gs;}deoptimizeCache(){this.testValue=se;}hasEffects(e){if(this.test.hasEffects(e))return !0;const t=this.getTestValue();if(t===se){const{brokenFlow:t}=e;if(this.consequent.hasEffects(e))return !0;const s=e.brokenFlow;return e.brokenFlow=t,null===this.alternate?!1:!!this.alternate.hasEffects(e)||(e.brokenFlow=e.brokenFlow<s?e.brokenFlow:s,!1)}return t?this.consequent.hasEffects(e):null!==this.alternate&&this.alternate.hasEffects(e)}include(e,t){if(this.included=!0,t)this.includeRecursively(t,e);else {const t=this.getTestValue();t===se?this.includeUnknownTest(e):this.includeKnownTest(e,t);}}parseNode(e){this.consequentScope=new zs(this.scope),this.consequent=new(this.context.nodeConstructors[e.consequent.type]||this.context.nodeConstructors.UnknownNode)(e.consequent,this,this.consequentScope),e.alternate&&(this.alternateScope=new zs(this.scope),this.alternate=new(this.context.nodeConstructors[e.alternate.type]||this.context.nodeConstructors.UnknownNode)(e.alternate,this,this.alternateScope)),super.parseNode(e);}render(e,t){const s=this.getTestValue(),i=[],n=this.test.included,r=!this.context.options.treeshake;n?this.test.render(e,t):(M(this,e),e.remove(this.start,this.consequent.start)),this.consequent.included&&(r||s===se||s)?this.consequent.render(e,t):(e.overwrite(this.consequent.start,this.consequent.end,n?";":""),i.push(...this.consequentScope.hoistedDeclarations)),this.alternate&&(!this.alternate.included||!r&&s!==se&&s?(n&&this.shouldKeepAlternateBranch()?e.overwrite(this.alternate.start,this.end,";"):e.remove(this.consequent.end,this.end),i.push(...this.alternateScope.hoistedDeclarations)):(n?101===e.original.charCodeAt(this.alternate.start-1)&&e.prependLeft(this.alternate.start," "):e.remove(this.consequent.end,this.alternate.start),this.alternate.render(e,t))),this.renderHoistedDeclarations(i,e);}getTestValue(){return this.testValue===Gs?this.testValue=this.test.getLiteralValueAtPath(X,Z,this):this.testValue}includeKnownTest(e,t){this.test.shouldBeIncluded(e)&&this.test.include(e,!1),t&&this.consequent.shouldBeIncluded(e)&&this.consequent.includeAsSingleStatement(e,!1),null!==this.alternate&&!t&&this.alternate.shouldBeIncluded(e)&&this.alternate.includeAsSingleStatement(e,!1);}includeRecursively(e,t){this.test.include(t,e),this.consequent.include(t,e),null!==this.alternate&&this.alternate.include(t,e);}includeUnknownTest(e){this.test.include(e,!1);const{brokenFlow:t}=e;let s=0;this.consequent.shouldBeIncluded(e)&&(this.consequent.includeAsSingleStatement(e,!1),s=e.brokenFlow,e.brokenFlow=t),null!==this.alternate&&this.alternate.shouldBeIncluded(e)&&(this.alternate.includeAsSingleStatement(e,!1),e.brokenFlow=e.brokenFlow<s?e.brokenFlow:s);}renderHoistedDeclarations(e,t){const s=[...new Set(e.map((e=>{const t=e.variable;return t.included?t.getName():""})))].filter(Boolean).join(", ");if(s){const e=this.parent.type,i="Program"!==e&&"BlockStatement"!==e;t.prependRight(this.start,`${i?"{ ":""}var ${s}; `),i&&t.appendLeft(this.end," }");}}shouldKeepAlternateBranch(){let e=this.parent;do{if(e instanceof Hs&&e.alternate)return !0;if(e instanceof $s)return !1;e=e.parent;}while(e);return !1}}class qs extends Fe{bind(){}hasEffects(){return !1}initialise(){this.context.addImport(this);}render(e,t,s){e.remove(s.start,s.end);}}qs.prototype.needsBoundaries=!0;const Ks={amd:["require"],cjs:["require"],system:["module"]};const Xs="ROLLUP_ASSET_URL_",Ys="ROLLUP_FILE_URL_";const Qs={amd:["document","module","URL"],cjs:["document","require","URL"],es:[],iife:["document","URL"],system:["module"],umd:["document","require","URL"]},Js={amd:["document","require","URL"],cjs:["document","require","URL"],es:[],iife:["document","URL"],system:["module","URL"],umd:["document","require","URL"]},Zs=(e,t="URL")=>`new ${t}(${e}).href`,ei=e=>Zs(`'${e}', document.currentScript && document.currentScript.src || document.baseURI`),ti=e=>(t,s)=>{const i=e(s);return null===t?`({ url: ${i} })`:"url"===t?i:"undefined"},si=e=>`(document.currentScript && document.currentScript.src || new URL('${e}', document.baseURI).href)`,ii={amd:e=>("."!==e[0]&&(e="./"+e),Zs(`require.toUrl('${e}'), document.baseURI`)),cjs:e=>`(typeof document === 'undefined' ? ${Zs(`'file:' + __dirname + '/${e}'`,"(require('u' + 'rl').URL)")} : ${ei(e)})`,es:e=>Zs(`'${e}', import.meta.url`),iife:e=>ei(e),system:e=>Zs(`'${e}', module.meta.url`),umd:e=>`(typeof document === 'undefined' ? ${Zs(`'file:' + __dirname + '/${e}'`,"(require('u' + 'rl').URL)")} : ${ei(e)})`},ni={amd:ti((()=>Zs("module.uri, document.baseURI"))),cjs:ti((e=>`(typeof document === 'undefined' ? ${Zs("'file:' + __filename","(require('u' + 'rl').URL)")} : ${si(e)})`)),iife:ti((e=>si(e))),system:e=>null===e?"module.meta":`module.meta.${e}`,umd:ti((e=>`(typeof document === 'undefined' ? ${Zs("'file:' + __filename","(require('u' + 'rl').URL)")} : ${si(e)})`))};class ri extends Fe{constructor(){super(...arguments),this.hasCachedEffect=!1;}hasEffects(e){if(this.hasCachedEffect)return !0;for(const t of this.body)if(t.hasEffects(e))return this.hasCachedEffect=!0;return !1}include(e,t){this.included=!0;for(const s of this.body)(t||s.shouldBeIncluded(e))&&s.include(e,t);}render(e,t){this.body.length?V(this.body,e,this.start,this.end,t):super.render(e,t);}}class ai extends Fe{hasEffects(e){if(this.test&&this.test.hasEffects(e))return !0;for(const t of this.consequent){if(e.brokenFlow)break;if(t.hasEffects(e))return !0}return !1}include(e,t){this.included=!0,this.test&&this.test.include(e,t);for(const s of this.consequent)(t||s.shouldBeIncluded(e))&&s.include(e,t);}render(e,t,s){if(this.consequent.length){this.test&&this.test.render(e,t);const i=this.test?this.test.end:R(e.original,"default",this.start)+7,n=R(e.original,":",i)+1;V(this.consequent,e,n,s.end,t);}else super.render(e,t);}}ai.prototype.needsBoundaries=!0;class oi extends Fe{getLiteralValueAtPath(e){return e.length>0||1!==this.quasis.length?se:this.quasis[0].value.cooked}render(e,t){e.indentExclusionRanges.push([this.start,this.end]),super.render(e,t);}}class hi extends De{constructor(e,t){super(e),this.context=t,this.variables.set("this",new Le("this",null,ae,t));}addExportDefaultDeclaration(e,t,s){const i=new yt(e,t,s);return this.variables.set("default",i),i}addNamespaceMemberAccess(){}deconflict(e,t,s){for(const i of this.children)i.deconflict(e,t,s);}findLexicalBoundary(){return this}findVariable(e){const t=this.variables.get(e)||this.accessedOutsideVariables.get(e);if(t)return t;const s=this.context.traceVariable(e)||this.parent.findVariable(e);return s instanceof ct&&this.accessedOutsideVariables.set(e,s),s}}const li={"!":e=>!e,"+":e=>+e,"-":e=>-e,delete:()=>se,typeof:e=>typeof e,void:()=>{},"~":e=>~e};function ci(e,t){return null!==e.renderBaseName&&t.has(e)&&e.isReassigned}class ui extends Fe{deoptimizePath(){for(const e of this.declarations)e.deoptimizePath(X);}hasEffectsWhenAssignedAtPath(){return !1}include(e,t){this.included=!0;for(const s of this.declarations)(t||s.shouldBeIncluded(e))&&s.include(e,t);}includeAsSingleStatement(e,t){this.included=!0;for(const s of this.declarations)(t||s.shouldBeIncluded(e))&&(s.include(e,t),s.id.include(e,t));}initialise(){for(const e of this.declarations)e.declareDeclarator(this.kind);}render(e,t,s=Ye){if(function(e,t){for(const s of e){if(!s.id.included)return !1;if("Identifier"===s.id.type){if(t.has(s.id.variable))return !1}else {const e=[];if(s.id.addExportedVariables(e,t),e.length>0)return !1}}return !0}(this.declarations,t.exportNamesByVariable)){for(const s of this.declarations)s.render(e,t);s.isNoStatement||59===e.original.charCodeAt(this.end-1)||e.appendLeft(this.end,";");}else this.renderReplacedDeclarations(e,t,s);}renderDeclarationEnd(e,t,s,i,n,r,a,o){59===e.original.charCodeAt(this.end-1)&&e.remove(this.end-1,this.end),o||(t+=";"),null!==s?(10!==e.original.charCodeAt(i-1)||10!==e.original.charCodeAt(this.end)&&13!==e.original.charCodeAt(this.end)||(i--,13===e.original.charCodeAt(i)&&i--),i===s+1?e.overwrite(s,n,t):(e.overwrite(s,s+1,t),e.remove(i,n))):e.appendLeft(n,t),r.length>0&&e.appendLeft(n,` ${W(r,a)};`);}renderReplacedDeclarations(e,t,{isNoStatement:s}){const i=B(this.declarations,e,this.start+this.kind.length,this.end-(59===e.original.charCodeAt(this.end-1)?1:0));let n,r;r=O(e.original,this.start+this.kind.length);let a=r-1;e.remove(this.start,a);let o,h,l=!1,c=!1,u="";const d=[];for(const{node:s,start:p,separator:f,contentEnd:m,end:g}of i)if(s.included){if(o="",h="",!s.id.included||s.id instanceof ut&&ci(s.id.variable,t.exportNamesByVariable))c&&(u+=";"),l=!1;else {if("system"===t.format&&null!==s.init)if("Identifier"!==s.id.type)s.id.addExportedVariables(d,t.exportNamesByVariable);else {const i=t.exportNamesByVariable.get(s.id.variable);if(i){const n=t.compact?"":" ",r=R(e.original,"=",s.id.end);e.prependLeft(O(e.original,r+1),1===i.length?`exports('${i[0]}',${n}`:U([s.id.variable],!1,t)),h+=")";}}l?u+=",":(c&&(u+=";"),o+=`${this.kind} `,l=!0);}r===a+1?e.overwrite(a,r,u+o):(e.overwrite(a,a+1,u),e.appendLeft(r,o)),s.render(e,t),n=m,r=g,c=!0,a=f,u=h;}else e.remove(p,g);this.renderDeclarationEnd(e,u,a,n,r,d,t,s);}}const di={ArrayExpression:class extends Fe{bind(){super.bind();for(const e of this.elements)null!==e&&e.deoptimizePath(Y);}getReturnExpressionWhenCalledAtPath(e){return 1!==e.length?re:$e(we,e[0])}hasEffectsWhenAccessedAtPath(e){return e.length>1}hasEffectsWhenCalledAtPath(e,t,s){return 1!==e.length||Ie(we,e[0],this.included,t,s)}},ArrayPattern:class extends Fe{addExportedVariables(e,t){for(const s of this.elements)null!==s&&s.addExportedVariables(e,t);}declare(e){const t=[];for(const s of this.elements)null!==s&&t.push(...s.declare(e,re));return t}deoptimizePath(e){if(0===e.length)for(const t of this.elements)null!==t&&t.deoptimizePath(e);}hasEffectsWhenAssignedAtPath(e,t){if(e.length>0)return !0;for(const e of this.elements)if(null!==e&&e.hasEffectsWhenAssignedAtPath(X,t))return !0;return !1}},ArrowFunctionExpression:Ms,AssignmentExpression:class extends Fe{constructor(){super(...arguments),this.deoptimized=!1;}hasEffects(e){return this.deoptimized||this.applyDeoptimizations(),this.right.hasEffects(e)||this.left.hasEffects(e)||this.left.hasEffectsWhenAssignedAtPath(X,e)}hasEffectsWhenAccessedAtPath(e,t){return e.length>0&&this.right.hasEffectsWhenAccessedAtPath(e,t)}include(e,t){let s;this.deoptimized||this.applyDeoptimizations(),this.included=!0,(t||"="!==this.operator||this.left.included||(s=Te(),this.left.hasEffects(s)||this.left.hasEffectsWhenAssignedAtPath(X,s)))&&this.left.include(e,t),this.right.include(e,t);}render(e,t,{preventASI:s,renderedParentType:i}=Ye){if(this.left.included)this.left.render(e,t),this.right.render(e,t);else {const n=O(e.original,R(e.original,"=",this.left.end)+1);e.remove(this.start,n),s&&F(e,n,this.right.start),this.right.render(e,t,{renderedParentType:i||this.parent.type});}if("system"===t.format){const s=this.left.variable&&t.exportNamesByVariable.get(this.left.variable);if("Identifier"===this.left.type&&s){const i=t.compact?"":" ",n=R(e.original,this.operator,this.left.end),r=this.operator.length>1?`${s[0]}${i}${this.operator.slice(0,-1)}${i}`:"";e.overwrite(n,O(e.original,n+this.operator.length),`=${i}${1===s.length?`exports('${s[0]}',${i}`:U([this.left.variable],!1,t)}${r}`),e.appendLeft(this.right.end,")");}else {const s=[];this.left.addExportedVariables(s,t.exportNamesByVariable),s.length>0&&(e.prependRight(this.start,`(${U(s,!0,t)}`),e.appendLeft(this.end,"))"));}}}applyDeoptimizations(){this.deoptimized=!0,this.left.deoptimizePath(X),this.right.deoptimizePath(Y);}},AssignmentPattern:class extends Fe{addExportedVariables(e,t){this.left.addExportedVariables(e,t);}bind(){super.bind(),this.left.deoptimizePath(X),this.right.deoptimizePath(Y);}declare(e,t){return this.left.declare(e,t)}deoptimizePath(e){0===e.length&&this.left.deoptimizePath(e);}hasEffectsWhenAssignedAtPath(e,t){return e.length>0||this.left.hasEffectsWhenAssignedAtPath(X,t)}render(e,t,{isShorthandProperty:s}=Ye){this.left.render(e,t,{isShorthandProperty:s}),this.right.render(e,t);}},AwaitExpression:class extends Fe{hasEffects(e){return !e.ignore.returnAwaitYield||this.argument.hasEffects(e)}include(e,t){if(!this.included){this.included=!0;e:if(!this.context.usesTopLevelAwait){let e=this.parent;do{if(e instanceof pt||e instanceof Ms)break e}while(e=e.parent);this.context.usesTopLevelAwait=!0;}}this.argument.include(e,t);}},BinaryExpression:class extends Fe{deoptimizeCache(){}getLiteralValueAtPath(e,t,s){if(e.length>0)return se;const i=this.left.getLiteralValueAtPath(X,t,s);if(i===se)return se;const n=this.right.getLiteralValueAtPath(X,t,s);if(n===se)return se;const r=Ts[this.operator];return r?r(i,n):se}hasEffects(e){return "+"===this.operator&&this.parent instanceof Is&&""===this.left.getLiteralValueAtPath(X,Z,this)||super.hasEffects(e)}hasEffectsWhenAccessedAtPath(e){return e.length>1}},BlockStatement:$s,BreakStatement:class extends Fe{hasEffects(e){if(this.label){if(!e.ignore.labels.has(this.label.name))return !0;e.includedLabels.add(this.label.name),e.brokenFlow=2;}else {if(!e.ignore.breaks)return !0;e.brokenFlow=1;}return !1}include(e){this.included=!0,this.label&&(this.label.include(),e.includedLabels.add(this.label.name)),e.brokenFlow=this.label?2:1;}},CallExpression:class extends Fe{constructor(){super(...arguments),this.expressionsToBeDeoptimized=[],this.returnExpression=null,this.wasPathDeoptmizedWhileOptimized=!1;}bind(){if(super.bind(),this.callee instanceof ut){this.scope.findVariable(this.callee.name).isNamespace&&this.context.warn({code:"CANNOT_CALL_NAMESPACE",message:`Cannot call a namespace ('${this.callee.name}')`},this.start),"eval"===this.callee.name&&this.context.warn({code:"EVAL",message:"Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification",url:"https://rollupjs.org/guide/en/#avoiding-eval"},this.start);}this.getReturnExpression(Z),this.callee instanceof Ds&&!this.callee.variable&&this.callee.mayModifyThisWhenCalledAtPath([],Z)&&this.callee.object.deoptimizePath(Y);for(const e of this.arguments)e.deoptimizePath(Y);}deoptimizeCache(){if(this.returnExpression!==re){this.returnExpression=null;const e=this.getReturnExpression(Z),t=this.expressionsToBeDeoptimized;e!==re&&(this.expressionsToBeDeoptimized=[],this.wasPathDeoptmizedWhileOptimized&&(e.deoptimizePath(Y),this.wasPathDeoptmizedWhileOptimized=!1));for(const e of t)e.deoptimizeCache();}}deoptimizePath(e){if(0===e.length)return;const t=this.context.deoptimizationTracker.getEntities(e);if(t.has(this))return;t.add(this);const s=this.getReturnExpression(Z);s!==re&&(this.wasPathDeoptmizedWhileOptimized=!0,s.deoptimizePath(e));}getLiteralValueAtPath(e,t,s){const i=this.getReturnExpression(t);if(i===re)return se;const n=t.getEntities(e);if(n.has(i))return se;this.expressionsToBeDeoptimized.push(s),n.add(i);const r=i.getLiteralValueAtPath(e,t,s);return n.delete(i),r}getReturnExpressionWhenCalledAtPath(e,t,s){const i=this.getReturnExpression(t);if(this.returnExpression===re)return re;const n=t.getEntities(e);if(n.has(i))return re;this.expressionsToBeDeoptimized.push(s),n.add(i);const r=i.getReturnExpressionWhenCalledAtPath(e,t,s);return n.delete(i),r}hasEffects(e){var t;for(const t of this.arguments)if(t.hasEffects(e))return !0;return (!this.context.options.treeshake.annotations||!(null===(t=this.annotations)||void 0===t?void 0:t.some((e=>e.pure))))&&(this.callee.hasEffects(e)||this.callee.hasEffectsWhenCalledAtPath(X,this.callOptions,e))}hasEffectsWhenAccessedAtPath(e,t){if(0===e.length)return !1;const s=t.accessed.getEntities(e);return !s.has(this)&&(s.add(this),this.returnExpression.hasEffectsWhenAccessedAtPath(e,t))}hasEffectsWhenAssignedAtPath(e,t){if(0===e.length)return !0;const s=t.assigned.getEntities(e);return !s.has(this)&&(s.add(this),this.returnExpression.hasEffectsWhenAssignedAtPath(e,t))}hasEffectsWhenCalledAtPath(e,t,s){const i=(t.withNew?s.instantiated:s.called).getEntities(e,t);return !i.has(this)&&(i.add(this),this.returnExpression.hasEffectsWhenCalledAtPath(e,t,s))}include(e,t){t?(super.include(e,t),"variables"===t&&this.callee instanceof ut&&this.callee.variable&&this.callee.variable.markCalledFromTryStatement()):(this.included=!0,this.callee.include(e,!1)),this.callee.includeCallArguments(e,this.arguments),this.returnExpression.included||this.returnExpression.include(e,!1);}initialise(){this.callOptions={args:this.arguments,withNew:!1};}render(e,t,{renderedParentType:s,renderedSurroundingElement:i}=Ye){const n=s||i;if(this.callee.render(e,t,n?{renderedSurroundingElement:n}:Ye),this.arguments.length>0)if(this.arguments[this.arguments.length-1].included)for(const s of this.arguments)s.render(e,t);else {let s=this.arguments.length-2;for(;s>=0&&!this.arguments[s].included;)s--;if(s>=0){for(let i=0;i<=s;i++)this.arguments[i].render(e,t);e.remove(R(e.original,",",this.arguments[s].end),this.end-1);}else e.remove(R(e.original,"(",this.callee.end)+1,this.end-1);}}getReturnExpression(e){return null===this.returnExpression?(this.returnExpression=re,this.returnExpression=this.callee.getReturnExpressionWhenCalledAtPath(X,e,this)):this.returnExpression}},CatchClause:Bs,ChainExpression:class extends Fe{},ClassBody:class extends Fe{createScope(e){this.scope=new Fs(e);}hasEffectsWhenCalledAtPath(e,t,s){return e.length>0||null!==this.classConstructor&&this.classConstructor.hasEffectsWhenCalledAtPath(X,t,s)}initialise(){for(const e of this.body)if(e instanceof Ws&&"constructor"===e.kind)return void(this.classConstructor=e);this.classConstructor=null;}},ClassDeclaration:Ue,ClassExpression:class extends We{render(e,t,{renderedParentType:s,renderedSurroundingElement:i}=Ye){super.render(e,t);"ExpressionStatement"===(s||i)&&(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}},ConditionalExpression:class extends Fe{constructor(){super(...arguments),this.expressionsToBeDeoptimized=[],this.isBranchResolutionAnalysed=!1,this.usedBranch=null,this.wasPathDeoptimizedWhileOptimized=!1;}bind(){super.bind(),this.getUsedBranch();}deoptimizeCache(){if(null!==this.usedBranch){const e=this.usedBranch===this.consequent?this.alternate:this.consequent;this.usedBranch=null;const t=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[],this.wasPathDeoptimizedWhileOptimized&&e.deoptimizePath(Y);for(const e of t)e.deoptimizeCache();}}deoptimizePath(e){if(e.length>0){const t=this.getUsedBranch();null===t?(this.consequent.deoptimizePath(e),this.alternate.deoptimizePath(e)):(this.wasPathDeoptimizedWhileOptimized=!0,t.deoptimizePath(e));}}getLiteralValueAtPath(e,t,s){const i=this.getUsedBranch();return null===i?se:(this.expressionsToBeDeoptimized.push(s),i.getLiteralValueAtPath(e,t,s))}getReturnExpressionWhenCalledAtPath(e,t,s){const i=this.getUsedBranch();return null===i?new Us([this.consequent.getReturnExpressionWhenCalledAtPath(e,t,s),this.alternate.getReturnExpressionWhenCalledAtPath(e,t,s)]):(this.expressionsToBeDeoptimized.push(s),i.getReturnExpressionWhenCalledAtPath(e,t,s))}hasEffects(e){return !!this.test.hasEffects(e)||(null===this.usedBranch?this.consequent.hasEffects(e)||this.alternate.hasEffects(e):this.usedBranch.hasEffects(e))}hasEffectsWhenAccessedAtPath(e,t){return 0!==e.length&&(null===this.usedBranch?this.consequent.hasEffectsWhenAccessedAtPath(e,t)||this.alternate.hasEffectsWhenAccessedAtPath(e,t):this.usedBranch.hasEffectsWhenAccessedAtPath(e,t))}hasEffectsWhenAssignedAtPath(e,t){return 0===e.length||(null===this.usedBranch?this.consequent.hasEffectsWhenAssignedAtPath(e,t)||this.alternate.hasEffectsWhenAssignedAtPath(e,t):this.usedBranch.hasEffectsWhenAssignedAtPath(e,t))}hasEffectsWhenCalledAtPath(e,t,s){return null===this.usedBranch?this.consequent.hasEffectsWhenCalledAtPath(e,t,s)||this.alternate.hasEffectsWhenCalledAtPath(e,t,s):this.usedBranch.hasEffectsWhenCalledAtPath(e,t,s)}include(e,t){this.included=!0,t||this.test.shouldBeIncluded(e)||null===this.usedBranch?(this.test.include(e,t),this.consequent.include(e,t),this.alternate.include(e,t)):this.usedBranch.include(e,t);}includeCallArguments(e,t){null===this.usedBranch?(this.consequent.includeCallArguments(e,t),this.alternate.includeCallArguments(e,t)):this.usedBranch.includeCallArguments(e,t);}render(e,t,{renderedParentType:s,isCalleeOfRenderedParent:i,preventASI:n}=Ye){if(this.test.included)super.render(e,t);else {const r=R(e.original,":",this.consequent.end),a=O(e.original,(this.consequent.included?R(e.original,"?",this.test.end):r)+1);n&&F(e,a,this.usedBranch.start),e.remove(this.start,a),this.consequent.included&&e.remove(r,this.end),M(this,e),this.usedBranch.render(e,t,{isCalleeOfRenderedParent:s?i:this.parent.callee===this,preventASI:!0,renderedParentType:s||this.parent.type});}}getUsedBranch(){if(this.isBranchResolutionAnalysed)return this.usedBranch;this.isBranchResolutionAnalysed=!0;const e=this.test.getLiteralValueAtPath(X,Z,this);return e===se?null:this.usedBranch=e?this.consequent:this.alternate}},ContinueStatement:class extends Fe{hasEffects(e){if(this.label){if(!e.ignore.labels.has(this.label.name))return !0;e.includedLabels.add(this.label.name),e.brokenFlow=2;}else {if(!e.ignore.continues)return !0;e.brokenFlow=1;}return !1}include(e){this.included=!0,this.label&&(this.label.include(),e.includedLabels.add(this.label.name)),e.brokenFlow=this.label?2:1;}},DoWhileStatement:class extends Fe{hasEffects(e){if(this.test.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:s,continues:i}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=s,e.ignore.continues=i,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.test.include(e,t);const{brokenFlow:s}=e;this.body.includeAsSingleStatement(e,t),e.brokenFlow=s;}},EmptyStatement:class extends Fe{hasEffects(){return !1}},ExportAllDeclaration:ks,ExportDefaultDeclaration:mt,ExportNamedDeclaration:js,ExportSpecifier:class extends Fe{},ExpressionStatement:Is,ForInStatement:class extends Fe{bind(){this.left.bind(),this.left.deoptimizePath(X),this.right.bind(),this.body.bind();}createScope(e){this.scope=new Ns(e);}hasEffects(e){if(this.left&&(this.left.hasEffects(e)||this.left.hasEffectsWhenAssignedAtPath(X,e))||this.right&&this.right.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:s,continues:i}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=s,e.ignore.continues=i,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.left.include(e,t||!0),this.left.deoptimizePath(X),this.right.include(e,t);const{brokenFlow:s}=e;this.body.includeAsSingleStatement(e,t),e.brokenFlow=s;}render(e,t){this.left.render(e,t,T),this.right.render(e,t,T),110===e.original.charCodeAt(this.right.start-1)&&e.prependLeft(this.right.start," "),this.body.render(e,t);}},ForOfStatement:class extends Fe{bind(){this.left.bind(),this.left.deoptimizePath(X),this.right.bind(),this.body.bind();}createScope(e){this.scope=new Ns(e);}hasEffects(){return !0}include(e,t){this.included=!0,this.left.include(e,t||!0),this.left.deoptimizePath(X),this.right.include(e,t);const{brokenFlow:s}=e;this.body.includeAsSingleStatement(e,t),e.brokenFlow=s;}render(e,t){this.left.render(e,t,T),this.right.render(e,t,T),102===e.original.charCodeAt(this.right.start-1)&&e.prependLeft(this.right.start," "),this.body.render(e,t);}},ForStatement:class extends Fe{createScope(e){this.scope=new Ns(e);}hasEffects(e){if(this.init&&this.init.hasEffects(e)||this.test&&this.test.hasEffects(e)||this.update&&this.update.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:s,continues:i}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=s,e.ignore.continues=i,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.init&&this.init.includeAsSingleStatement(e,t),this.test&&this.test.include(e,t);const{brokenFlow:s}=e;this.update&&this.update.include(e,t),this.body.includeAsSingleStatement(e,t),e.brokenFlow=s;}render(e,t){this.init&&this.init.render(e,t,T),this.test&&this.test.render(e,t,T),this.update&&this.update.render(e,t,T),this.body.render(e,t);}},FunctionDeclaration:ft,FunctionExpression:class extends pt{render(e,t,{renderedParentType:s,renderedSurroundingElement:i}=Ye){super.render(e,t);"ExpressionStatement"===(s||i)&&(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}},Identifier:ut,IfStatement:Hs,ImportDeclaration:qs,ImportDefaultSpecifier:class extends Fe{},ImportExpression:class extends Fe{constructor(){super(...arguments),this.inlineNamespace=null,this.mechanism=null,this.resolution=null;}hasEffects(){return !0}include(e,t){this.included||(this.included=!0,this.context.includeDynamicImport(this),this.scope.addAccessedDynamicImport(this)),this.source.include(e,t);}initialise(){this.context.addDynamicImport(this);}render(e,t){if(this.inlineNamespace){const s=t.compact?"":" ",i=t.compact?"":";";e.overwrite(this.start,this.end,`Promise.resolve().then(function${s}()${s}{${s}return ${this.inlineNamespace.getName()}${i}${s}})`);}else this.mechanism&&(e.overwrite(this.start,R(e.original,"(",this.start+6)+1,this.mechanism.left),e.overwrite(this.end-1,this.end,this.mechanism.right)),this.source.render(e,t);}renderFinalResolution(e,t,s,i){if(e.overwrite(this.source.start,this.source.end,t),s){const t=i.compact?"":" ",n=i.compact?"":";";e.prependLeft(this.end,`.then(function${t}(n)${t}{${t}return n.${s}${n}${t}})`);}}setExternalResolution(e,t,s,i,n){this.resolution=t;const r=[...Ks[s.format]||[]];let a;({helper:a,mechanism:this.mechanism}=this.getDynamicImportMechanismAndHelper(t,e,s,i)),a&&r.push(a),r.length>0&&this.scope.addAccessedGlobals(r,n);}setInternalResolution(e){this.inlineNamespace=e;}getDynamicImportMechanismAndHelper(e,t,s,i){const n=i.hookFirstSync("renderDynamicImport",[{customResolution:"string"==typeof this.resolution?this.resolution:null,format:s.format,moduleId:this.context.module.id,targetModuleId:this.resolution&&"string"!=typeof this.resolution?this.resolution.id:null}]);if(n)return {helper:null,mechanism:n};switch(s.format){case"cjs":{const i=s.compact?"":" ",n=s.compact?"":";",r=`Promise.resolve().then(function${i}()${i}{${i}return`,a=this.getInteropHelper(e,t,s.interop);return {helper:a,mechanism:a?{left:`${r} /*#__PURE__*/${a}(require(`,right:`))${n}${i}})`}:{left:`${r} require(`,right:`)${n}${i}})`}}}case"amd":{const i=s.compact?"":" ",n=s.compact?"c":"resolve",r=s.compact?"e":"reject",a=this.getInteropHelper(e,t,s.interop);return {helper:a,mechanism:{left:`new Promise(function${i}(${n},${i}${r})${i}{${i}require([`,right:`],${i}${a?`function${i}(m)${i}{${i}${n}(/*#__PURE__*/${a}(m));${i}}`:n},${i}${r})${i}})`}}}case"system":return {helper:null,mechanism:{left:"module.import(",right:")"}};case"es":if(s.dynamicImportFunction)return {helper:null,mechanism:{left:`${s.dynamicImportFunction}(`,right:")"}}}return {helper:null,mechanism:null}}getInteropHelper(e,t,s){return "external"===t?Rt[String(s(e instanceof Nt?e.id:null))]:"default"===t?"_interopNamespaceDefaultOnly":null}},ImportNamespaceSpecifier:class extends Fe{},ImportSpecifier:class extends Fe{},LabeledStatement:class extends Fe{hasEffects(e){const t=e.brokenFlow;return e.ignore.labels.add(this.label.name),!!this.body.hasEffects(e)||(e.ignore.labels.delete(this.label.name),e.includedLabels.has(this.label.name)&&(e.includedLabels.delete(this.label.name),e.brokenFlow=t),!1)}include(e,t){this.included=!0;const s=e.brokenFlow;this.body.include(e,t),(t||e.includedLabels.has(this.label.name))&&(this.label.include(),e.includedLabels.delete(this.label.name),e.brokenFlow=s);}render(e,t){this.label.included?this.label.render(e,t):e.remove(this.start,O(e.original,R(e.original,":",this.label.end)+1)),this.body.render(e,t);}},Literal:Rs,LogicalExpression:class extends Fe{constructor(){super(...arguments),this.expressionsToBeDeoptimized=[],this.isBranchResolutionAnalysed=!1,this.unusedBranch=null,this.usedBranch=null,this.wasPathDeoptimizedWhileOptimized=!1;}bind(){super.bind(),this.getUsedBranch();}deoptimizeCache(){if(null!==this.usedBranch){this.usedBranch=null;const e=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[],this.wasPathDeoptimizedWhileOptimized&&this.unusedBranch.deoptimizePath(Y);for(const t of e)t.deoptimizeCache();}}deoptimizePath(e){const t=this.getUsedBranch();null===t?(this.left.deoptimizePath(e),this.right.deoptimizePath(e)):(this.wasPathDeoptimizedWhileOptimized=!0,t.deoptimizePath(e));}getLiteralValueAtPath(e,t,s){const i=this.getUsedBranch();return null===i?se:(this.expressionsToBeDeoptimized.push(s),i.getLiteralValueAtPath(e,t,s))}getReturnExpressionWhenCalledAtPath(e,t,s){const i=this.getUsedBranch();return null===i?new Us([this.left.getReturnExpressionWhenCalledAtPath(e,t,s),this.right.getReturnExpressionWhenCalledAtPath(e,t,s)]):(this.expressionsToBeDeoptimized.push(s),i.getReturnExpressionWhenCalledAtPath(e,t,s))}hasEffects(e){return !!this.left.hasEffects(e)||this.usedBranch!==this.left&&this.right.hasEffects(e)}hasEffectsWhenAccessedAtPath(e,t){return 0!==e.length&&(null===this.usedBranch?this.left.hasEffectsWhenAccessedAtPath(e,t)||this.right.hasEffectsWhenAccessedAtPath(e,t):this.usedBranch.hasEffectsWhenAccessedAtPath(e,t))}hasEffectsWhenAssignedAtPath(e,t){return 0===e.length||(null===this.usedBranch?this.left.hasEffectsWhenAssignedAtPath(e,t)||this.right.hasEffectsWhenAssignedAtPath(e,t):this.usedBranch.hasEffectsWhenAssignedAtPath(e,t))}hasEffectsWhenCalledAtPath(e,t,s){return null===this.usedBranch?this.left.hasEffectsWhenCalledAtPath(e,t,s)||this.right.hasEffectsWhenCalledAtPath(e,t,s):this.usedBranch.hasEffectsWhenCalledAtPath(e,t,s)}include(e,t){this.included=!0,t||this.usedBranch===this.right&&this.left.shouldBeIncluded(e)||null===this.usedBranch?(this.left.include(e,t),this.right.include(e,t)):this.usedBranch.include(e,t);}render(e,t,{renderedParentType:s,isCalleeOfRenderedParent:i,preventASI:n}=Ye){if(this.left.included&&this.right.included)this.left.render(e,t,{preventASI:n}),this.right.render(e,t);else {const r=R(e.original,this.operator,this.left.end);if(this.right.included){const t=O(e.original,r+2);e.remove(this.start,t),n&&F(e,t,this.right.start);}else e.remove(r,this.end);M(this,e),this.usedBranch.render(e,t,{isCalleeOfRenderedParent:s?i:this.parent.callee===this,preventASI:n,renderedParentType:s||this.parent.type});}}getUsedBranch(){if(!this.isBranchResolutionAnalysed){this.isBranchResolutionAnalysed=!0;const e=this.left.getLiteralValueAtPath(X,Z,this);if(e===se)return null;"||"===this.operator&&e||"&&"===this.operator&&!e||"??"===this.operator&&null!=e?(this.usedBranch=this.left,this.unusedBranch=this.right):(this.usedBranch=this.right,this.unusedBranch=this.left);}return this.usedBranch}},MemberExpression:Ds,MetaProperty:class extends Fe{addAccessedGlobals(e,t){const s=this.metaProperty,i=(s&&(s.startsWith(Ys)||s.startsWith(Xs)||s.startsWith("ROLLUP_CHUNK_URL_"))?Js:Qs)[e];i.length>0&&this.scope.addAccessedGlobals(i,t);}getReferencedFileName(e){const t=this.metaProperty;return t&&t.startsWith(Ys)?e.getFileName(t.substr(Ys.length)):null}hasEffects(){return !1}hasEffectsWhenAccessedAtPath(e){return e.length>1}include(){if(!this.included&&(this.included=!0,"import"===this.meta.name)){this.context.addImportMeta(this);const e=this.parent;this.metaProperty=e instanceof Ds&&"string"==typeof e.propertyKey?e.propertyKey:null;}}renderFinalMechanism(e,t,s,i){var n;const r=this.parent,a=this.metaProperty;if(a&&(a.startsWith(Ys)||a.startsWith(Xs)||a.startsWith("ROLLUP_CHUNK_URL_"))){let n,o=null,h=null,l=null;a.startsWith(Ys)?(o=a.substr(Ys.length),n=i.getFileName(o)):a.startsWith(Xs)?(fs(`Using the "${Xs}" prefix to reference files is deprecated. Use the "${Ys}" prefix instead.`,!0,this.context.options),h=a.substr(Xs.length),n=i.getFileName(h)):(fs(`Using the "ROLLUP_CHUNK_URL_" prefix to reference files is deprecated. Use the "${Ys}" prefix instead.`,!0,this.context.options),l=a.substr("ROLLUP_CHUNK_URL_".length),n=i.getFileName(l));const c=C(N(_(t),n));let u;return null!==h&&(u=i.hookFirstSync("resolveAssetUrl",[{assetFileName:n,chunkId:t,format:s,moduleId:this.context.module.id,relativeAssetPath:c}])),u||(u=i.hookFirstSync("resolveFileUrl",[{assetReferenceId:h,chunkId:t,chunkReferenceId:l,fileName:n,format:s,moduleId:this.context.module.id,referenceId:o||h||l,relativePath:c}])||ii[s](c)),void e.overwrite(r.start,r.end,u,{contentOnly:!0})}const o=i.hookFirstSync("resolveImportMeta",[a,{chunkId:t,format:s,moduleId:this.context.module.id}])||(null===(n=ni[s])||void 0===n?void 0:n.call(ni,a,t));"string"==typeof o&&(r instanceof Ds?e.overwrite(r.start,r.end,o,{contentOnly:!0}):e.overwrite(this.start,this.end,o,{contentOnly:!0}));}},MethodDefinition:Ws,NewExpression:class extends Fe{bind(){super.bind();for(const e of this.arguments)e.deoptimizePath(Y);}hasEffects(e){var t;for(const t of this.arguments)if(t.hasEffects(e))return !0;return (!this.context.options.treeshake.annotations||!(null===(t=this.annotations)||void 0===t?void 0:t.some((e=>e.pure))))&&(this.callee.hasEffects(e)||this.callee.hasEffectsWhenCalledAtPath(X,this.callOptions,e))}hasEffectsWhenAccessedAtPath(e){return e.length>1}initialise(){this.callOptions={args:this.arguments,withNew:!0};}},ObjectExpression:class extends Fe{constructor(){super(...arguments),this.deoptimizedPaths=new Set,this.expressionsToBeDeoptimized=new Map,this.hasUnknownDeoptimizedProperty=!1,this.propertyMap=null,this.unmatchablePropertiesRead=[],this.unmatchablePropertiesWrite=[];}bind(){super.bind(),this.getPropertyMap();}deoptimizeCache(){this.hasUnknownDeoptimizedProperty||this.deoptimizeAllProperties();}deoptimizePath(e){if(this.hasUnknownDeoptimizedProperty)return;const t=this.getPropertyMap(),s=e[0];if(1===e.length){if("string"!=typeof s)return void this.deoptimizeAllProperties();if(!this.deoptimizedPaths.has(s)){this.deoptimizedPaths.add(s);const e=this.expressionsToBeDeoptimized.get(s);if(e)for(const t of e)t.deoptimizeCache();}}const i=1===e.length?Y:e.slice(1);for(const e of "string"==typeof s?t[s]?t[s].propertiesRead:[]:this.properties)e.deoptimizePath(i);}getLiteralValueAtPath(e,t,s){const i=this.getPropertyMap(),n=e[0];return 0===e.length||this.hasUnknownDeoptimizedProperty||"string"!=typeof n||this.deoptimizedPaths.has(n)?se:1!==e.length||i[n]||Ce[n]||0!==this.unmatchablePropertiesRead.length?!i[n]||null===i[n].exactMatchRead||i[n].propertiesRead.length>1?se:(q(this.expressionsToBeDeoptimized,n,(()=>[])).push(s),i[n].exactMatchRead.getLiteralValueAtPath(e.slice(1),t,s)):void q(this.expressionsToBeDeoptimized,n,(()=>[])).push(s)}getReturnExpressionWhenCalledAtPath(e,t,s){const i=this.getPropertyMap(),n=e[0];return 0===e.length||this.hasUnknownDeoptimizedProperty||"string"!=typeof n||this.deoptimizedPaths.has(n)?re:1!==e.length||!Ce[n]||0!==this.unmatchablePropertiesRead.length||i[n]&&null!==i[n].exactMatchRead?!i[n]||null===i[n].exactMatchRead||i[n].propertiesRead.length>1?re:(q(this.expressionsToBeDeoptimized,n,(()=>[])).push(s),i[n].exactMatchRead.getReturnExpressionWhenCalledAtPath(e.slice(1),t,s)):$e(Ce,n)}hasEffectsWhenAccessedAtPath(e,t){if(0===e.length)return !1;const s=e[0],i=this.propertyMap;if(e.length>1&&(this.hasUnknownDeoptimizedProperty||"string"!=typeof s||this.deoptimizedPaths.has(s)||!i[s]||null===i[s].exactMatchRead))return !0;const n=e.slice(1);for(const e of "string"!=typeof s?this.properties:i[s]?i[s].propertiesRead:[])if(e.hasEffectsWhenAccessedAtPath(n,t))return !0;return !1}hasEffectsWhenAssignedAtPath(e,t){const s=e[0],i=this.propertyMap;if(e.length>1&&(this.hasUnknownDeoptimizedProperty||this.deoptimizedPaths.has(s)||!i[s]||null===i[s].exactMatchRead))return !0;const n=e.slice(1);for(const r of "string"!=typeof s?this.properties:e.length>1?i[s].propertiesRead:i[s]?i[s].propertiesWrite:[])if(r.hasEffectsWhenAssignedAtPath(n,t))return !0;return !1}hasEffectsWhenCalledAtPath(e,t,s){const i=e[0];if("string"!=typeof i||this.hasUnknownDeoptimizedProperty||this.deoptimizedPaths.has(i)||(this.propertyMap[i]?!this.propertyMap[i].exactMatchRead:e.length>1||!Ce[i]))return !0;const n=e.slice(1);if(this.propertyMap[i])for(const e of this.propertyMap[i].propertiesRead)if(e.hasEffectsWhenCalledAtPath(n,t,s))return !0;return !(1!==e.length||!Ce[i])&&Ie(Ce,i,this.included,t,s)}mayModifyThisWhenCalledAtPath(e,t){var s;if(!e.length||"string"!=typeof e[0])return !0;const i=null===(s=this.getPropertyMap()[e[0]])||void 0===s?void 0:s.exactMatchRead;return !i||i.value.mayModifyThisWhenCalledAtPath(e.slice(1),t)}render(e,t,{renderedParentType:s,renderedSurroundingElement:i}=Ye){super.render(e,t);const n=s||i;"ExpressionStatement"!==n&&"ArrowFunctionExpression"!==n||(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}deoptimizeAllProperties(){this.hasUnknownDeoptimizedProperty=!0;for(const e of this.properties)e.deoptimizePath(Y);for(const e of this.expressionsToBeDeoptimized.values())for(const t of e)t.deoptimizeCache();}getPropertyMap(){if(null!==this.propertyMap)return this.propertyMap;const e=this.propertyMap=Object.create(null);for(let t=this.properties.length-1;t>=0;t--){const s=this.properties[t];if(s instanceof Ge){this.unmatchablePropertiesRead.push(s);continue}const i="get"!==s.kind,n="set"!==s.kind;let r,a=!1;if(s.computed){const e=s.key.getLiteralValueAtPath(X,Z,this);e===se&&(a=!0),r=String(e);}else r=s.key instanceof ut?s.key.name:String(s.key.value);if(a||"__proto__"===r&&!s.computed){n?this.unmatchablePropertiesRead.push(s):this.unmatchablePropertiesWrite.push(s);continue}const o=e[r];o?(n&&null===o.exactMatchRead&&(o.exactMatchRead=s,o.propertiesRead.push(s,...this.unmatchablePropertiesRead)),i&&!n&&null===o.exactMatchWrite&&(o.exactMatchWrite=s,o.propertiesWrite.push(s,...this.unmatchablePropertiesWrite))):e[r]={exactMatchRead:n?s:null,exactMatchWrite:i?s:null,propertiesRead:n?[s,...this.unmatchablePropertiesRead]:[],propertiesWrite:i&&!n?[s,...this.unmatchablePropertiesWrite]:[]};}return e}},ObjectPattern:class extends Fe{addExportedVariables(e,t){for(const s of this.properties)"Property"===s.type?s.value.addExportedVariables(e,t):s.argument.addExportedVariables(e,t);}declare(e,t){const s=[];for(const i of this.properties)s.push(...i.declare(e,t));return s}deoptimizePath(e){if(0===e.length)for(const t of this.properties)t.deoptimizePath(e);}hasEffectsWhenAssignedAtPath(e,t){if(e.length>0)return !0;for(const e of this.properties)if(e.hasEffectsWhenAssignedAtPath(X,t))return !0;return !1}},PrivateIdentifier:class extends Fe{},Program:ri,Property:class extends Fe{constructor(){super(...arguments),this.declarationInit=null,this.returnExpression=null;}bind(){super.bind(),"get"===this.kind&&this.getReturnExpression(),null!==this.declarationInit&&this.declarationInit.deoptimizePath([K,K]);}declare(e,t){return this.declarationInit=t,this.value.declare(e,re)}deoptimizeCache(){}deoptimizePath(e){"get"===this.kind?this.getReturnExpression().deoptimizePath(e):this.value.deoptimizePath(e);}getLiteralValueAtPath(e,t,s){return "get"===this.kind?this.getReturnExpression().getLiteralValueAtPath(e,t,s):this.value.getLiteralValueAtPath(e,t,s)}getReturnExpressionWhenCalledAtPath(e,t,s){return "get"===this.kind?this.getReturnExpression().getReturnExpressionWhenCalledAtPath(e,t,s):this.value.getReturnExpressionWhenCalledAtPath(e,t,s)}hasEffects(e){const t=this.context.options.treeshake.propertyReadSideEffects;return "ObjectPattern"===this.parent.type&&"always"===t||this.key.hasEffects(e)||this.value.hasEffects(e)}hasEffectsWhenAccessedAtPath(e,t){if("get"===this.kind){const s=t.accessed.getEntities(e);return !s.has(this)&&(s.add(this),this.value.hasEffectsWhenCalledAtPath(X,this.accessorCallOptions,t)||e.length>0&&this.returnExpression.hasEffectsWhenAccessedAtPath(e,t))}return this.value.hasEffectsWhenAccessedAtPath(e,t)}hasEffectsWhenAssignedAtPath(e,t){if("get"===this.kind){const s=t.assigned.getEntities(e);return !s.has(this)&&(s.add(this),this.returnExpression.hasEffectsWhenAssignedAtPath(e,t))}if("set"===this.kind){const s=t.assigned.getEntities(e);return !s.has(this)&&(s.add(this),this.value.hasEffectsWhenCalledAtPath(X,this.accessorCallOptions,t))}return this.value.hasEffectsWhenAssignedAtPath(e,t)}hasEffectsWhenCalledAtPath(e,t,s){if("get"===this.kind){const i=(t.withNew?s.instantiated:s.called).getEntities(e,t);return !i.has(this)&&(i.add(this),this.returnExpression.hasEffectsWhenCalledAtPath(e,t,s))}return this.value.hasEffectsWhenCalledAtPath(e,t,s)}initialise(){this.accessorCallOptions={args:H,withNew:!1};}render(e,t){this.shorthand||this.key.render(e,t),this.value.render(e,t,{isShorthandProperty:this.shorthand});}getReturnExpression(){return null===this.returnExpression?(this.returnExpression=re,this.returnExpression=this.value.getReturnExpressionWhenCalledAtPath(X,Z,this)):this.returnExpression}},PropertyDefinition:class extends Fe{hasEffects(e){return this.key.hasEffects(e)||this.static&&null!==this.value&&this.value.hasEffects(e)}},RestElement:dt,ReturnStatement:class extends Fe{hasEffects(e){return !(e.ignore.returnAwaitYield&&(null===this.argument||!this.argument.hasEffects(e)))||(e.brokenFlow=2,!1)}include(e,t){this.included=!0,this.argument&&this.argument.include(e,t),e.brokenFlow=2;}initialise(){this.scope.addReturnExpression(this.argument||re);}render(e,t){this.argument&&(this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+6&&e.prependLeft(this.start+6," "));}},SequenceExpression:class extends Fe{deoptimizePath(e){e.length>0&&this.expressions[this.expressions.length-1].deoptimizePath(e);}getLiteralValueAtPath(e,t,s){return this.expressions[this.expressions.length-1].getLiteralValueAtPath(e,t,s)}hasEffects(e){for(const t of this.expressions)if(t.hasEffects(e))return !0;return !1}hasEffectsWhenAccessedAtPath(e,t){return e.length>0&&this.expressions[this.expressions.length-1].hasEffectsWhenAccessedAtPath(e,t)}hasEffectsWhenAssignedAtPath(e,t){return 0===e.length||this.expressions[this.expressions.length-1].hasEffectsWhenAssignedAtPath(e,t)}hasEffectsWhenCalledAtPath(e,t,s){return this.expressions[this.expressions.length-1].hasEffectsWhenCalledAtPath(e,t,s)}include(e,t){this.included=!0;for(let s=0;s<this.expressions.length-1;s++){const i=this.expressions[s];(t||i.shouldBeIncluded(e))&&i.include(e,t);}this.expressions[this.expressions.length-1].include(e,t);}render(e,t,{renderedParentType:s,isCalleeOfRenderedParent:i,preventASI:n}=Ye){let r=0;for(const{node:a,start:o,end:h}of B(this.expressions,e,this.start,this.end))a.included?(r++,1===r&&n&&F(e,o,a.start),a===this.expressions[this.expressions.length-1]&&1===r?a.render(e,t,{isCalleeOfRenderedParent:s?i:this.parent.callee===this,renderedParentType:s||this.parent.type}):a.render(e,t)):$(a,e,o,h);}},SpreadElement:Ge,Super:class extends Fe{},SwitchCase:ai,SwitchStatement:class extends Fe{createScope(e){this.scope=new Ns(e);}hasEffects(e){if(this.discriminant.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:s}}=e;let i=1/0;e.ignore.breaks=!0;for(const s of this.cases){if(s.hasEffects(e))return !0;i=e.brokenFlow<i?e.brokenFlow:i,e.brokenFlow=t;}return null!==this.defaultCase&&1!==i&&(e.brokenFlow=i),e.ignore.breaks=s,!1}include(e,t){this.included=!0,this.discriminant.include(e,t);const{brokenFlow:s}=e;let i=1/0,n=t||null!==this.defaultCase&&this.defaultCase<this.cases.length-1;for(let r=this.cases.length-1;r>=0;r--){const a=this.cases[r];if(a.included&&(n=!0),!n){const e=Te();e.ignore.breaks=!0,n=a.hasEffects(e);}n?(a.include(e,t),i=i<e.brokenFlow?i:e.brokenFlow,e.brokenFlow=s):i=s;}n&&null!==this.defaultCase&&1!==i&&(e.brokenFlow=i);}initialise(){for(let e=0;e<this.cases.length;e++)if(null===this.cases[e].test)return void(this.defaultCase=e);this.defaultCase=null;}render(e,t){this.discriminant.render(e,t),this.cases.length>0&&V(this.cases,e,this.cases[0].start,this.end-1,t);}},TaggedTemplateExpression:class extends Fe{bind(){if(super.bind(),"Identifier"===this.tag.type){const e=this.tag.name;this.scope.findVariable(e).isNamespace&&this.context.warn({code:"CANNOT_CALL_NAMESPACE",message:`Cannot call a namespace ('${e}')`},this.start),"eval"===e&&this.context.warn({code:"EVAL",message:"Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification",url:"https://rollupjs.org/guide/en/#avoiding-eval"},this.start);}}hasEffects(e){return super.hasEffects(e)||this.tag.hasEffectsWhenCalledAtPath(X,this.callOptions,e)}initialise(){this.callOptions={args:H,withNew:!1};}},TemplateElement:class extends Fe{bind(){}hasEffects(){return !1}include(){this.included=!0;}parseNode(e){this.value=e.value,super.parseNode(e);}render(){}},TemplateLiteral:oi,ThisExpression:class extends Fe{bind(){super.bind(),this.variable=this.scope.findVariable("this");}hasEffectsWhenAccessedAtPath(e,t){return e.length>0&&this.variable.hasEffectsWhenAccessedAtPath(e,t)}hasEffectsWhenAssignedAtPath(e,t){return this.variable.hasEffectsWhenAssignedAtPath(e,t)}initialise(){this.alias=this.scope.findLexicalBoundary()instanceof hi?this.context.moduleContext:null,"undefined"===this.alias&&this.context.warn({code:"THIS_IS_UNDEFINED",message:"The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten",url:"https://rollupjs.org/guide/en/#error-this-is-undefined"},this.start);for(let e=this.parent;e instanceof Fe;e=e.parent)if(e instanceof pt){e.referencesThis=!0;break}}render(e){null!==this.alias&&e.overwrite(this.start,this.end,this.alias,{contentOnly:!1,storeName:!0});}},ThrowStatement:class extends Fe{hasEffects(){return !0}include(e,t){this.included=!0,this.argument.include(e,t),e.brokenFlow=2;}render(e,t){this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+5&&e.prependLeft(this.start+5," ");}},TryStatement:class extends Fe{constructor(){super(...arguments),this.directlyIncluded=!1,this.includedLabelsAfterBlock=null;}hasEffects(e){return (this.context.options.treeshake.tryCatchDeoptimization?this.block.body.length>0:this.block.hasEffects(e))||null!==this.finalizer&&this.finalizer.hasEffects(e)}include(e,t){var s;const i=null===(s=this.context.options.treeshake)||void 0===s?void 0:s.tryCatchDeoptimization,{brokenFlow:n}=e;if(this.directlyIncluded&&i){if(this.includedLabelsAfterBlock)for(const t of this.includedLabelsAfterBlock)e.includedLabels.add(t);}else this.included=!0,this.directlyIncluded=!0,this.block.include(e,i?"variables":t),e.includedLabels.size>0&&(this.includedLabelsAfterBlock=[...e.includedLabels]),e.brokenFlow=n;null!==this.handler&&(this.handler.include(e,t),e.brokenFlow=n),null!==this.finalizer&&this.finalizer.include(e,t);}},UnaryExpression:class extends Fe{bind(){super.bind(),"delete"===this.operator&&this.argument.deoptimizePath(X);}getLiteralValueAtPath(e,t,s){if(e.length>0)return se;const i=this.argument.getLiteralValueAtPath(X,t,s);return i===se?se:li[this.operator](i)}hasEffects(e){return !("typeof"===this.operator&&this.argument instanceof ut)&&(this.argument.hasEffects(e)||"delete"===this.operator&&this.argument.hasEffectsWhenAssignedAtPath(X,e))}hasEffectsWhenAccessedAtPath(e){return "void"===this.operator?e.length>0:e.length>1}},UnknownNode:class extends Fe{hasEffects(){return !0}include(e){super.include(e,!0);}},UpdateExpression:class extends Fe{bind(){if(super.bind(),this.argument.deoptimizePath(X),this.argument instanceof ut){this.scope.findVariable(this.argument.name).isReassigned=!0;}}hasEffects(e){return this.argument.hasEffects(e)||this.argument.hasEffectsWhenAssignedAtPath(X,e)}hasEffectsWhenAccessedAtPath(e){return e.length>1}render(e,t){if(this.argument.render(e,t),"system"===t.format){const s=this.argument.variable,i=t.exportNamesByVariable.get(s);if(i&&i.length){const n=t.compact?"":" ",r=s.getName();if(this.prefix)1===i.length?e.overwrite(this.start,this.end,`exports('${i[0]}',${n}${this.operator}${r})`):e.overwrite(this.start,this.end,`(${this.operator}${r},${n}${W([s],t)},${n}${r})`);else if(i.length>1)e.overwrite(this.start,this.end,`(${U([s],!1,t)}${this.operator}${r}))`);else {let t;switch(this.operator){case"++":t=`${r}${n}+${n}1`;break;case"--":t=`${r}${n}-${n}1`;}e.overwrite(this.start,this.end,`(exports('${i[0]}',${n}${t}),${n}${r}${this.operator})`);}}}}},VariableDeclaration:ui,VariableDeclarator:class extends Fe{declareDeclarator(e){this.id.declare(e,this.init||ae);}deoptimizePath(e){this.id.deoptimizePath(e);}hasEffects(e){return this.id.hasEffects(e)||null!==this.init&&this.init.hasEffects(e)}include(e,t){this.included=!0,(t||this.id.shouldBeIncluded(e))&&this.id.include(e,t),this.init&&this.init.include(e,t);}render(e,t){const s=this.id.included;if(s)this.id.render(e,t);else {const t=R(e.original,"=",this.id.end);e.remove(this.start,O(e.original,t+1));}if(this.init)this.init.render(e,t,s?Ye:{renderedParentType:"ExpressionStatement"});else if(this.id instanceof ut&&ci(this.id.variable,t.exportNamesByVariable)){const s=t.compact?"":" ";e.appendLeft(this.end,`${s}=${s}void 0`);}}},WhileStatement:class extends Fe{hasEffects(e){if(this.test.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:s,continues:i}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=s,e.ignore.continues=i,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.test.include(e,t);const{brokenFlow:s}=e;this.body.includeAsSingleStatement(e,t),e.brokenFlow=s;}},YieldExpression:class extends Fe{bind(){super.bind(),null!==this.argument&&this.argument.deoptimizePath(Y);}hasEffects(e){return !e.ignore.returnAwaitYield||null!==this.argument&&this.argument.hasEffects(e)}render(e,t){this.argument&&(this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+5&&e.prependLeft(this.start+5," "));}}};function pi(e){return e.id}const mi="[ \\f\\r\\t\\v\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]",gi=new RegExp(`(${`//#${mi}+sourceMappingURL=.+`})|(${`/\\*#${mi}+sourceMappingURL=.+\\*/`})`,"g"),yi=()=>{};let xi=()=>[0,0],Ei=()=>0,vi=()=>0,bi={};function Si(e,t){switch(t){case 1:return `# ${e}`;case 2:return `## ${e}`;case 3:return e;default:return `${"  ".repeat(t-4)}- ${e}`}}function Ai(e,t=3){e=Si(e,t),bi.hasOwnProperty(e)||(bi[e]={memory:0,startMemory:void 0,startTime:void 0,time:0,totalMemory:0});const s=vi();bi[e].startTime=xi(),bi[e].startMemory=s;}function Pi(e,t=3){if(e=Si(e,t),bi.hasOwnProperty(e)){const t=vi();bi[e].time+=Ei(bi[e].startTime),bi[e].totalMemory=Math.max(bi[e].totalMemory,t),bi[e].memory+=t-bi[e].startMemory;}}function Ci(){const e={};for(const t of Object.keys(bi))e[t]=[bi[t].time,bi[t].memory,bi[t].totalMemory];return e}let wi=yi,_i=yi;const ki={load:!0,resolveDynamicImport:!0,resolveId:!0,transform:!0};function Ni(e,t){const s={};for(const i of Object.keys(e))if(!0===ki[i]){let n=`plugin ${t}`;e.name&&(n+=` (${e.name})`),n+=` - ${i}`,s[i]=function(){wi(n,4);let t=e[i].apply(this===s?e:this,arguments);return _i(n,4),t&&"function"==typeof t.then&&(wi(`${n} (async)`,4),t=t.then((e=>(_i(`${n} (async)`,4),e)))),t};}else s[i]=e[i];return s}function Ii(e){e.perf?(bi={},"undefined"!=typeof process&&"function"==typeof process.hrtime?(xi=process.hrtime.bind(process),Ei=e=>{return 1e3*(t=process.hrtime(e))[0]+t[1]/1e6;var t;}):"undefined"!=typeof performance&&"function"==typeof performance.now&&(xi=()=>[performance.now(),0],Ei=e=>performance.now()-e[0]),"undefined"!=typeof process&&"function"==typeof process.memoryUsage&&(vi=()=>process.memoryUsage().heapUsed),wi=Ai,_i=Pi,e.plugins=e.plugins.map(Ni)):(wi=yi,_i=yi);}function $i(e){e.isExecuted=!0;const t=[e],s=new Set;for(const e of t)for(const i of [...e.dependencies,...e.implicitlyLoadedBefore])i instanceof Nt||i.isExecuted||!i.info.hasModuleSideEffects&&!e.implicitlyLoadedBefore.has(i)||s.has(i.id)||(i.isExecuted=!0,s.add(i.id),t.push(i));}const Mi={identifier:null,localName:"_missingExportShim"};function Ti(e,t,s,i,n=new Map){const r=n.get(t);if(r){if(r.has(e))return i?null:ss((a=t,o=e.id,{code:ns.CIRCULAR_REEXPORT,id:o,message:`"${a}" cannot be exported from ${es(o)} as it is a reexport that references itself.`}));r.add(e);}else n.set(t,new Set([e]));var a,o;return e.getVariableForExportName(t,s,i,n)}class Ri{constructor(e,t,s,i,n,r,a){this.graph=e,this.id=t,this.options=s,this.alternativeReexportModules=new Map,this.ast=null,this.chunkFileNames=new Set,this.chunkName=null,this.cycles=new Set,this.dependencies=new Set,this.dynamicDependencies=new Set,this.dynamicImporters=[],this.dynamicImports=[],this.execIndex=1/0,this.exportAllSources=new Set,this.exports=Object.create(null),this.exportsAll=Object.create(null),this.implicitlyLoadedAfter=new Set,this.implicitlyLoadedBefore=new Set,this.importDescriptions=Object.create(null),this.importers=[],this.importMetas=[],this.imports=new Set,this.includedDynamicImporters=[],this.isExecuted=!1,this.isUserDefinedEntryPoint=!1,this.preserveSignature=this.options.preserveEntrySignatures,this.reexportDescriptions=Object.create(null),this.sideEffectDependenciesByVariable=new Map,this.sources=new Set,this.userChunkNames=new Set,this.usesTopLevelAwait=!1,this.allExportNames=null,this.exportAllModules=[],this.exportNamesByVariable=null,this.exportShimVariable=new xt(this),this.relevantDependencies=null,this.syntheticExports=new Map,this.syntheticNamespace=null,this.transformDependencies=[],this.transitiveReexports=null,this.excludeFromSourcemap=/\0/.test(t),this.context=s.moduleContext(t);const o=this;this.info={ast:null,code:null,get dynamicallyImportedIds(){const e=[];for(const{resolution:t}of o.dynamicImports)(t instanceof Ri||t instanceof Nt)&&e.push(t.id);return e},get dynamicImporters(){return o.dynamicImporters.sort()},hasModuleSideEffects:n,id:t,get implicitlyLoadedAfterOneOf(){return Array.from(o.implicitlyLoadedAfter,pi)},get implicitlyLoadedBefore(){return Array.from(o.implicitlyLoadedBefore,pi)},get importedIds(){return Array.from(o.sources,(e=>o.resolvedIds[e].id))},get importers(){return o.importers.sort()},isEntry:i,isExternal:!1,meta:a,syntheticNamedExports:r};}basename(){const e=w(this.id),t=k(this.id);return kt(t?e.slice(0,-t.length):e)}bindReferences(){this.ast.bind();}error(e,t){return this.addLocationToLogProps(e,t),ss(e)}getAllExportNames(){if(this.allExportNames)return this.allExportNames;const e=this.allExportNames=new Set;for(const t of Object.keys(this.exports))e.add(t);for(const t of Object.keys(this.reexportDescriptions))e.add(t);for(const t of this.exportAllModules)if(t instanceof Nt)e.add(`*${t.id}`);else for(const s of t.getAllExportNames())"default"!==s&&e.add(s);return e}getDependenciesToBeIncluded(){if(this.relevantDependencies)return this.relevantDependencies;const e=new Set,t=new Set,s=new Set;let i=this.imports.keys();if(this.info.isEntry||this.includedDynamicImporters.length>0||this.namespace.included||this.implicitlyLoadedAfter.size>0){i=new Set(i);for(const e of [...this.getReexports(),...this.getExports()])i.add(this.getVariableForExportName(e));}for(let e of i){const i=this.sideEffectDependenciesByVariable.get(e);if(i)for(const e of i)s.add(e);e instanceof vt?e=e.getBaseVariable():e instanceof yt&&(e=e.getOriginalVariable()),t.add(e.module);}if(this.options.treeshake&&"no-treeshake"!==this.info.hasModuleSideEffects)this.addRelevantSideEffectDependencies(e,t,s);else for(const t of this.dependencies)e.add(t);for(const s of t)e.add(s);return this.relevantDependencies=e}getExportNamesByVariable(){if(this.exportNamesByVariable)return this.exportNamesByVariable;const e=new Map;for(const t of this.getAllExportNames()){if(t===this.info.syntheticNamedExports)continue;let s=this.getVariableForExportName(t);if(s instanceof yt&&(s=s.getOriginalVariable()),!s||!(s.included||s instanceof St))continue;const i=e.get(s);i?i.push(t):e.set(s,[t]);}return this.exportNamesByVariable=e}getExports(){return Object.keys(this.exports)}getReexports(){if(this.transitiveReexports)return this.transitiveReexports;this.transitiveReexports=[];const e=new Set;for(const t in this.reexportDescriptions)e.add(t);for(const t of this.exportAllModules)if(t instanceof Nt)e.add(`*${t.id}`);else for(const s of [...t.getReexports(),...t.getExports()])"default"!==s&&e.add(s);return this.transitiveReexports=[...e]}getRenderedExports(){const e=[],t=[];for(const s in this.exports){const i=this.getVariableForExportName(s);(i&&i.included?e:t).push(s);}return {renderedExports:e,removedExports:t}}getSyntheticNamespace(){return null===this.syntheticNamespace&&(this.syntheticNamespace=void 0,this.syntheticNamespace=this.getVariableForExportName("string"==typeof this.info.syntheticNamedExports?this.info.syntheticNamedExports:"default")),this.syntheticNamespace?this.syntheticNamespace:ss((e=this.id,t=this.info.syntheticNamedExports,{code:ns.SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,id:e,message:`Module "${es(e)}" that is marked with 'syntheticNamedExports: ${JSON.stringify(t)}' needs ${"string"==typeof t&&"default"!==t?`an export named "${t}"`:"a default export"} that does not reexport an unresolved named export of the same module.`}));var e,t;}getVariableForExportName(e,t,s,i){if("*"===e[0]){if(1===e.length)return this.namespace;return this.graph.modulesById.get(e.slice(1)).getVariableForExportName("*")}const n=this.reexportDescriptions[e];if(n){const e=Ti(n.module,n.localName,t,!1,i);return e?(t&&Li(e,t,this),e):this.error(os(n.localName,this.id,n.module.id),n.start)}const r=this.exports[e];if(r){if(r===Mi)return this.exportShimVariable;const e=r.localName,s=this.traceVariable(e,t);return t&&(q(t.sideEffectDependenciesByVariable,s,(()=>new Set)).add(this),Li(s,t,this)),s}if("default"!==e){let s=null;for(const n of this.exportAllModules){const r=Ti(n,e,t,!0,i);if(r){if(!(r instanceof vt))return r;s||(s=r);}}if(s)return s}if(this.info.syntheticNamedExports){let t=this.syntheticExports.get(e);if(!t){const s=this.getSyntheticNamespace();return t=new vt(this.astContext,e,s),this.syntheticExports.set(e,t),t}return t}return !s&&this.options.shimMissingExports?(this.shimMissingExport(e),this.exportShimVariable):null}hasEffects(){return "no-treeshake"===this.info.hasModuleSideEffects||this.ast.included&&this.ast.hasEffects(Te())}include(){const e=Me();this.ast.shouldBeIncluded(e)&&this.ast.include(e,!1);}includeAllExports(e){this.isExecuted||(this.graph.needsTreeshakingPass=!0,$i(this));for(const t of this.getExports())if(e||t!==this.info.syntheticNamedExports){const e=this.getVariableForExportName(t);e.deoptimizePath(Y),e.included||this.includeVariable(e);}for(const e of this.getReexports()){const t=this.getVariableForExportName(e);t.deoptimizePath(Y),t.included||this.includeVariable(t),t instanceof St&&(t.module.reexported=!0);}e&&this.namespace.prepareNamespace(this.includeAndGetAdditionalMergedNamespaces());}includeAllInBundle(){this.ast.include(Me(),!0);}isIncluded(){return this.ast.included||this.namespace.included}linkImports(){this.addModulesToImportDescriptions(this.importDescriptions),this.addModulesToImportDescriptions(this.reexportDescriptions);for(const e in this.exports)"default"!==e&&e!==this.info.syntheticNamedExports&&(this.exportsAll[e]=this.id);const e=[];for(const t of this.exportAllSources){const s=this.graph.modulesById.get(this.resolvedIds[t].id);if(s instanceof Nt)e.push(s);else {this.exportAllModules.push(s);for(const e in s.exportsAll)e in this.exportsAll?this.options.onwarn(ls(e,this,s)):this.exportsAll[e]=s.exportsAll[e];}}this.exportAllModules.push(...e);}render(e){const t=this.magicString.clone();return this.ast.render(t,e),this.usesTopLevelAwait=this.astContext.usesTopLevelAwait,t}setSource({alwaysRemovedCode:e,ast:t,code:s,customTransformCache:i,originalCode:n,originalSourcemap:r,resolvedIds:a,sourcemapChain:o,transformDependencies:h,transformFiles:l,...c}){this.info.code=s,this.originalCode=n,this.originalSourcemap=r,this.sourcemapChain=o,l&&(this.transformFiles=l),this.transformDependencies=h,this.customTransformCache=i,this.updateOptions(c),wi("generate ast",3),this.alwaysRemovedCode=e||[],t||(t=this.tryParse()),this.alwaysRemovedCode.push(...function(e,t){const s=[],i=(e,i)=>{if(e==i)return;let n;const r=t.slice(e,i);for(;n=gi.exec(r);)s.push([e+n.index,e+gi.lastIndex]);};let n=0;for(const t of e.body)i(n,t.start),n=t.end;return i(n,t.length),s}(t,this.info.code)),_i("generate ast",3),this.resolvedIds=a||Object.create(null);const u=this.id;this.magicString=new x(s,{filename:this.excludeFromSourcemap?null:u,indentExclusionRanges:[]});for(const[e,t]of this.alwaysRemovedCode)this.magicString.remove(e,t);wi("analyse ast",3),this.astContext={addDynamicImport:this.addDynamicImport.bind(this),addExport:this.addExport.bind(this),addImport:this.addImport.bind(this),addImportMeta:this.addImportMeta.bind(this),code:s,deoptimizationTracker:this.graph.deoptimizationTracker,error:this.error.bind(this),fileName:u,getExports:this.getExports.bind(this),getModuleExecIndex:()=>this.execIndex,getModuleName:this.basename.bind(this),getReexports:this.getReexports.bind(this),importDescriptions:this.importDescriptions,includeAllExports:()=>this.includeAllExports(!0),includeDynamicImport:this.includeDynamicImport.bind(this),includeVariableInModule:this.includeVariableInModule.bind(this),magicString:this.magicString,module:this,moduleContext:this.context,nodeConstructors:di,options:this.options,traceExport:this.getVariableForExportName.bind(this),traceVariable:this.traceVariable.bind(this),usesTopLevelAwait:!1,warn:this.warn.bind(this)},this.scope=new hi(this.graph.scope,this.astContext),this.namespace=new Et(this.astContext,this.info.syntheticNamedExports),this.ast=new ri(t,{type:"Module",context:this.astContext},this.scope),this.info.ast=t,_i("analyse ast",3);}toJSON(){return {alwaysRemovedCode:this.alwaysRemovedCode,ast:this.ast.esTreeNode,code:this.info.code,customTransformCache:this.customTransformCache,dependencies:Array.from(this.dependencies,pi),id:this.id,meta:this.info.meta,moduleSideEffects:this.info.hasModuleSideEffects,originalCode:this.originalCode,originalSourcemap:this.originalSourcemap,resolvedIds:this.resolvedIds,sourcemapChain:this.sourcemapChain,syntheticNamedExports:this.info.syntheticNamedExports,transformDependencies:this.transformDependencies,transformFiles:this.transformFiles}}traceVariable(e,t){const s=this.scope.variables.get(e);if(s)return s;if(e in this.importDescriptions){const s=this.importDescriptions[e],i=s.module;if(i instanceof Ri&&"*"===s.name)return i.namespace;const n=i.getVariableForExportName(s.name,t||this);return n||this.error(os(s.name,this.id,i.id),s.start)}return null}tryParse(){try{return this.graph.contextParse(this.info.code)}catch(e){let t=e.message.replace(/ \(\d+:\d+\)$/,"");return this.id.endsWith(".json")?t+=" (Note that you need @rollup/plugin-json to import JSON files)":this.id.endsWith(".js")||(t+=" (Note that you need plugins to import files that are not JavaScript)"),this.error({code:"PARSE_ERROR",message:t,parserError:e},e.pos)}}updateOptions({meta:e,moduleSideEffects:t,syntheticNamedExports:s}){null!=t&&(this.info.hasModuleSideEffects=t),null!=s&&(this.info.syntheticNamedExports=s),null!=e&&(this.info.meta={...this.info.meta,...e});}warn(e,t){this.addLocationToLogProps(e,t),this.options.onwarn(e);}addDynamicImport(e){let t=e.source;t instanceof oi?1===t.quasis.length&&t.quasis[0].value.cooked&&(t=t.quasis[0].value.cooked):t instanceof Rs&&"string"==typeof t.value&&(t=t.value),this.dynamicImports.push({node:e,resolution:null,argument:t});}addExport(e){if(e instanceof mt)this.exports.default={identifier:e.variable.getAssignedVariableName(),localName:"default"};else if(e instanceof ks){const t=e.source.value;if(this.sources.add(t),e.exported){const s=e.exported.name;this.reexportDescriptions[s]={localName:"*",module:null,source:t,start:e.start};}else this.exportAllSources.add(t);}else if(e.source instanceof Rs){const t=e.source.value;this.sources.add(t);for(const s of e.specifiers){const e=s.exported.name;this.reexportDescriptions[e]={localName:s.local.name,module:null,source:t,start:s.start};}}else if(e.declaration){const t=e.declaration;if(t instanceof ui)for(const e of t.declarations)for(const t of _s(e.id))this.exports[t]={identifier:null,localName:t};else {const e=t.id.name;this.exports[e]={identifier:null,localName:e};}}else for(const t of e.specifiers){const e=t.local.name,s=t.exported.name;this.exports[s]={identifier:null,localName:e};}}addImport(e){const t=e.source.value;this.sources.add(t);for(const s of e.specifiers){const e="ImportDefaultSpecifier"===s.type,i="ImportNamespaceSpecifier"===s.type,n=e?"default":i?"*":s.imported.name;this.importDescriptions[s.local.name]={module:null,name:n,source:t,start:s.start};}}addImportMeta(e){this.importMetas.push(e);}addLocationToLogProps(e,t){e.id=this.id,e.pos=t;let s=this.info.code,{column:i,line:n}=Ve(s,t,{offsetLine:1});try{({column:i,line:n}=function(e,t){const s=e.filter((e=>e.mappings));for(;s.length>0;){const e=s.pop(),i=e.mappings[t.line-1];let n=!1;if(void 0!==i)for(const s of i)if(s[0]>=t.column){if(1===s.length)break;t={column:s[3],line:s[2]+1,name:5===s.length?e.names[s[4]]:void 0,source:e.sources[s[1]]},n=!0;break}if(!n)throw new Error("Can't resolve original location of error.")}return t}(this.sourcemapChain,{column:i,line:n})),s=this.originalCode;}catch(e){this.options.onwarn({code:"SOURCEMAP_ERROR",id:this.id,loc:{column:i,file:this.id,line:n},message:`Error when using sourcemap for reporting an error: ${e.message}`,pos:t});}is(e,{column:i,line:n},s,this.id);}addModulesToImportDescriptions(e){for(const t of Object.keys(e)){const s=e[t],i=this.resolvedIds[s.source].id;s.module=this.graph.modulesById.get(i);}}addRelevantSideEffectDependencies(e,t,s){const i=new Set,n=r=>{for(const a of r)i.has(a)||(i.add(a),t.has(a)?e.add(a):(a.info.hasModuleSideEffects||s.has(a))&&(a instanceof Nt||a.hasEffects()?e.add(a):n(a.dependencies)));};n(this.dependencies),n(s);}includeAndGetAdditionalMergedNamespaces(){const e=[];for(const t of this.exportAllModules)if(t instanceof Nt){const s=t.getVariableForExportName("*");s.include(),this.imports.add(s),e.push(s);}else if(t.info.syntheticNamedExports){const s=t.getSyntheticNamespace();s.include(),this.imports.add(s),e.push(s);}return e}includeDynamicImport(e){const t=this.dynamicImports.find((t=>t.node===e)).resolution;t instanceof Ri&&(t.includedDynamicImporters.push(this),t.includeAllExports(!0));}includeVariable(e){if(!e.included){e.include(),this.graph.needsTreeshakingPass=!0;const t=e.module;if(t&&t instanceof Ri&&(t.isExecuted||$i(t),t!==this)){const t=function(e,t){const s=q(t.sideEffectDependenciesByVariable,e,(()=>new Set));let i=e;const n=new Set([i]);for(;;){const e=i.module;if(i=i instanceof yt?i.getDirectOriginalVariable():i instanceof vt?i.syntheticNamespace:null,!i||n.has(i))break;n.add(i),s.add(e);const t=e.sideEffectDependenciesByVariable.get(i);if(t)for(const e of t)s.add(e);}return s}(e,this);for(const e of t)e.isExecuted||$i(e);}}}includeVariableInModule(e){this.includeVariable(e);const t=e.module;t&&t!==this&&this.imports.add(e);}shimMissingExport(e){this.options.onwarn({code:"SHIMMED_EXPORT",exporter:es(this.id),exportName:e,message:`Missing export "${e}" has been shimmed in module ${es(this.id)}.`}),this.exports[e]=Mi;}}function Li(e,t,s){if(e.module instanceof Ri&&e.module!==s){const i=e.module.cycles;if(i.size>0){const n=s.cycles;for(const r of n)if(i.has(r)){t.alternativeReexportModules.set(e,s);break}}}}class Oi{constructor(e,t){this.isOriginal=!0,this.filename=e,this.content=t;}traceSegment(e,t,s){return {line:e,column:t,name:s,source:this}}}class Di{constructor(e,t){this.sources=t,this.names=e.names,this.mappings=e.mappings;}traceMappings(){const e=[],t=[],s=[],i=[];for(const n of this.mappings){const r=[];for(const i of n){if(1==i.length)continue;const n=this.sources[i[1]];if(!n)continue;const a=n.traceSegment(i[2],i[3],5===i.length?this.names[i[4]]:"");if(a){let n=e.lastIndexOf(a.source.filename);if(-1===n)n=e.length,e.push(a.source.filename),t[n]=a.source.content;else if(null==t[n])t[n]=a.source.content;else if(null!=a.source.content&&t[n]!==a.source.content)return ss({message:`Multiple conflicting contents for sourcemap source ${a.source.filename}`});const o=[i[0],n,a.line,a.column];if(a.name){let e=s.indexOf(a.name);-1===e&&(e=s.length,s.push(a.name)),o[4]=e;}r.push(o);}}i.push(r);}return {sources:e,sourcesContent:t,names:s,mappings:i}}traceSegment(e,t,s){const i=this.mappings[e];if(!i)return null;let n=0,r=i.length-1;for(;n<=r;){const e=n+r>>1,a=i[e];if(a[0]===t){if(1==a.length)return null;const e=this.sources[a[1]];return e?e.traceSegment(a[2],a[3],5===a.length?this.names[a[4]]:s):null}a[0]>t?r=e-1:n=e+1;}return null}}function Vi(e){return function(t,s){return s.mappings?new Di(s,[t]):(e({code:"SOURCEMAP_BROKEN",message:`Sourcemap is likely to be incorrect: a plugin (${s.plugin}) was used to transform files, but didn't generate a sourcemap for the transformation. Consult the plugin documentation for help`,plugin:s.plugin,url:"https://rollupjs.org/guide/en/#warning-sourcemap-is-likely-to-be-incorrect"}),new Di({mappings:[],names:[]},[t]))}}function Bi(e,t,s,i,n){let r;if(s){const t=s.sources,i=s.sourcesContent||[],n=_(e)||".",a=s.sourceRoot||".",o=t.map(((e,t)=>new Oi(I(n,a,e),i[t])));r=new Di(s,o);}else r=new Oi(e,t);return i.reduce(n,r)}function Fi(e){if(e.__esModule)return e;var t=Object.defineProperty({},"__esModule",{value:!0});return Object.keys(e).forEach((function(s){var i=Object.getOwnPropertyDescriptor(e,s);Object.defineProperty(t,s,i.get?i:{enumerable:!0,get:function(){return e[s]}});})),t}var Wi={},Ui=ji;function ji(e,t){if(!e)throw new Error(t||"Assertion failed")}ji.equal=function(e,t,s){if(e!=t)throw new Error(s||"Assertion failed: "+e+" != "+t)};var zi={exports:{}};"function"==typeof Object.create?zi.exports=function(e,t){t&&(e.super_=t,e.prototype=Object.create(t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}));}:zi.exports=function(e,t){if(t){e.super_=t;var s=function(){};s.prototype=t.prototype,e.prototype=new s,e.prototype.constructor=e;}};var Gi=Ui,Hi=zi.exports;function qi(e,t){return 55296==(64512&e.charCodeAt(t))&&(!(t<0||t+1>=e.length)&&56320==(64512&e.charCodeAt(t+1)))}function Ki(e){return (e>>>24|e>>>8&65280|e<<8&16711680|(255&e)<<24)>>>0}function Xi(e){return 1===e.length?"0"+e:e}function Yi(e){return 7===e.length?"0"+e:6===e.length?"00"+e:5===e.length?"000"+e:4===e.length?"0000"+e:3===e.length?"00000"+e:2===e.length?"000000"+e:1===e.length?"0000000"+e:e}Wi.inherits=Hi,Wi.toArray=function(e,t){if(Array.isArray(e))return e.slice();if(!e)return [];var s=[];if("string"==typeof e)if(t){if("hex"===t)for((e=e.replace(/[^a-z0-9]+/gi,"")).length%2!=0&&(e="0"+e),n=0;n<e.length;n+=2)s.push(parseInt(e[n]+e[n+1],16));}else for(var i=0,n=0;n<e.length;n++){var r=e.charCodeAt(n);r<128?s[i++]=r:r<2048?(s[i++]=r>>6|192,s[i++]=63&r|128):qi(e,n)?(r=65536+((1023&r)<<10)+(1023&e.charCodeAt(++n)),s[i++]=r>>18|240,s[i++]=r>>12&63|128,s[i++]=r>>6&63|128,s[i++]=63&r|128):(s[i++]=r>>12|224,s[i++]=r>>6&63|128,s[i++]=63&r|128);}else for(n=0;n<e.length;n++)s[n]=0|e[n];return s},Wi.toHex=function(e){for(var t="",s=0;s<e.length;s++)t+=Xi(e[s].toString(16));return t},Wi.htonl=Ki,Wi.toHex32=function(e,t){for(var s="",i=0;i<e.length;i++){var n=e[i];"little"===t&&(n=Ki(n)),s+=Yi(n.toString(16));}return s},Wi.zero2=Xi,Wi.zero8=Yi,Wi.join32=function(e,t,s,i){var n=s-t;Gi(n%4==0);for(var r=new Array(n/4),a=0,o=t;a<r.length;a++,o+=4){var h;h="big"===i?e[o]<<24|e[o+1]<<16|e[o+2]<<8|e[o+3]:e[o+3]<<24|e[o+2]<<16|e[o+1]<<8|e[o],r[a]=h>>>0;}return r},Wi.split32=function(e,t){for(var s=new Array(4*e.length),i=0,n=0;i<e.length;i++,n+=4){var r=e[i];"big"===t?(s[n]=r>>>24,s[n+1]=r>>>16&255,s[n+2]=r>>>8&255,s[n+3]=255&r):(s[n+3]=r>>>24,s[n+2]=r>>>16&255,s[n+1]=r>>>8&255,s[n]=255&r);}return s},Wi.rotr32=function(e,t){return e>>>t|e<<32-t},Wi.rotl32=function(e,t){return e<<t|e>>>32-t},Wi.sum32=function(e,t){return e+t>>>0},Wi.sum32_3=function(e,t,s){return e+t+s>>>0},Wi.sum32_4=function(e,t,s,i){return e+t+s+i>>>0},Wi.sum32_5=function(e,t,s,i,n){return e+t+s+i+n>>>0},Wi.sum64=function(e,t,s,i){var n=e[t],r=i+e[t+1]>>>0,a=(r<i?1:0)+s+n;e[t]=a>>>0,e[t+1]=r;},Wi.sum64_hi=function(e,t,s,i){return (t+i>>>0<t?1:0)+e+s>>>0},Wi.sum64_lo=function(e,t,s,i){return t+i>>>0},Wi.sum64_4_hi=function(e,t,s,i,n,r,a,o){var h=0,l=t;return h+=(l=l+i>>>0)<t?1:0,h+=(l=l+r>>>0)<r?1:0,e+s+n+a+(h+=(l=l+o>>>0)<o?1:0)>>>0},Wi.sum64_4_lo=function(e,t,s,i,n,r,a,o){return t+i+r+o>>>0},Wi.sum64_5_hi=function(e,t,s,i,n,r,a,o,h,l){var c=0,u=t;return c+=(u=u+i>>>0)<t?1:0,c+=(u=u+r>>>0)<r?1:0,c+=(u=u+o>>>0)<o?1:0,e+s+n+a+h+(c+=(u=u+l>>>0)<l?1:0)>>>0},Wi.sum64_5_lo=function(e,t,s,i,n,r,a,o,h,l){return t+i+r+o+l>>>0},Wi.rotr64_hi=function(e,t,s){return (t<<32-s|e>>>s)>>>0},Wi.rotr64_lo=function(e,t,s){return (e<<32-s|t>>>s)>>>0},Wi.shr64_hi=function(e,t,s){return e>>>s},Wi.shr64_lo=function(e,t,s){return (e<<32-s|t>>>s)>>>0};var Qi={},Ji=Wi,Zi=Ui;function en(){this.pending=null,this.pendingTotal=0,this.blockSize=this.constructor.blockSize,this.outSize=this.constructor.outSize,this.hmacStrength=this.constructor.hmacStrength,this.padLength=this.constructor.padLength/8,this.endian="big",this._delta8=this.blockSize/8,this._delta32=this.blockSize/32;}Qi.BlockHash=en,en.prototype.update=function(e,t){if(e=Ji.toArray(e,t),this.pending?this.pending=this.pending.concat(e):this.pending=e,this.pendingTotal+=e.length,this.pending.length>=this._delta8){var s=(e=this.pending).length%this._delta8;this.pending=e.slice(e.length-s,e.length),0===this.pending.length&&(this.pending=null),e=Ji.join32(e,0,e.length-s,this.endian);for(var i=0;i<e.length;i+=this._delta32)this._update(e,i,i+this._delta32);}return this},en.prototype.digest=function(e){return this.update(this._pad()),Zi(null===this.pending),this._digest(e)},en.prototype._pad=function(){var e=this.pendingTotal,t=this._delta8,s=t-(e+this.padLength)%t,i=new Array(s+this.padLength);i[0]=128;for(var n=1;n<s;n++)i[n]=0;if(e<<=3,"big"===this.endian){for(var r=8;r<this.padLength;r++)i[n++]=0;i[n++]=0,i[n++]=0,i[n++]=0,i[n++]=0,i[n++]=e>>>24&255,i[n++]=e>>>16&255,i[n++]=e>>>8&255,i[n++]=255&e;}else for(i[n++]=255&e,i[n++]=e>>>8&255,i[n++]=e>>>16&255,i[n++]=e>>>24&255,i[n++]=0,i[n++]=0,i[n++]=0,i[n++]=0,r=8;r<this.padLength;r++)i[n++]=0;return i};var tn={},sn=Wi.rotr32;function nn(e,t,s){return e&t^~e&s}function rn(e,t,s){return e&t^e&s^t&s}function an(e,t,s){return e^t^s}tn.ft_1=function(e,t,s,i){return 0===e?nn(t,s,i):1===e||3===e?an(t,s,i):2===e?rn(t,s,i):void 0},tn.ch32=nn,tn.maj32=rn,tn.p32=an,tn.s0_256=function(e){return sn(e,2)^sn(e,13)^sn(e,22)},tn.s1_256=function(e){return sn(e,6)^sn(e,11)^sn(e,25)},tn.g0_256=function(e){return sn(e,7)^sn(e,18)^e>>>3},tn.g1_256=function(e){return sn(e,17)^sn(e,19)^e>>>10};var on=Wi,hn=Qi,ln=tn,cn=Ui,un=on.sum32,dn=on.sum32_4,pn=on.sum32_5,fn=ln.ch32,mn=ln.maj32,gn=ln.s0_256,yn=ln.s1_256,xn=ln.g0_256,En=ln.g1_256,vn=hn.BlockHash,bn=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];function Sn(){if(!(this instanceof Sn))return new Sn;vn.call(this),this.h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],this.k=bn,this.W=new Array(64);}on.inherits(Sn,vn);var An=Sn;Sn.blockSize=512,Sn.outSize=256,Sn.hmacStrength=192,Sn.padLength=64,Sn.prototype._update=function(e,t){for(var s=this.W,i=0;i<16;i++)s[i]=e[t+i];for(;i<s.length;i++)s[i]=dn(En(s[i-2]),s[i-7],xn(s[i-15]),s[i-16]);var n=this.h[0],r=this.h[1],a=this.h[2],o=this.h[3],h=this.h[4],l=this.h[5],c=this.h[6],u=this.h[7];for(cn(this.k.length===s.length),i=0;i<s.length;i++){var d=pn(u,yn(h),fn(h,l,c),this.k[i],s[i]),p=un(gn(n),mn(n,r,a));u=c,c=l,l=h,h=un(o,d),o=a,a=r,r=n,n=un(d,p);}this.h[0]=un(this.h[0],n),this.h[1]=un(this.h[1],r),this.h[2]=un(this.h[2],a),this.h[3]=un(this.h[3],o),this.h[4]=un(this.h[4],h),this.h[5]=un(this.h[5],l),this.h[6]=un(this.h[6],c),this.h[7]=un(this.h[7],u);},Sn.prototype._digest=function(e){return "hex"===e?on.toHex32(this.h,"big"):on.split32(this.h,"big")};const Pn=()=>An(),Cn={amd:kn,cjs:kn,es:_n,iife:kn,system:_n,umd:kn};function wn(e,t,s,i,n,r,a,o,h,l,c,u,d){const p=e.slice().reverse();for(const e of p)e.scope.addUsedOutsideNames(i,n,c,u);!function(e,t,s){for(const i of t){for(const t of i.scope.variables.values())t.included&&!(t.renderBaseName||t instanceof yt&&t.getOriginalVariable()!==t)&&t.setRenderNames(null,G(t.name,e));if(s.has(i)){const t=i.namespace;t.setRenderNames(null,G(t.name,e));}}}(i,p,d),Cn[n](i,s,t,r,a,o,h,l);for(const e of p)e.scope.deconflict(n,c,u);}function _n(e,t,s,i,n,r,a,o){for(const t of s.dependencies)(n||t instanceof Nt)&&(t.variableName=G(t.suggestedVariableName,e));for(const s of t){const t=s.module,i=s.name;s.isNamespace&&(n||t instanceof Nt)?s.setRenderNames(null,(t instanceof Nt?t:a.get(t)).variableName):t instanceof Nt&&"default"===i?s.setRenderNames(null,G([...t.exportedVariables].some((([e,t])=>"*"===t&&e.included))?t.suggestedVariableName+"__default":t.suggestedVariableName,e)):s.setRenderNames(null,G(i,e));}for(const t of o)t.setRenderNames(null,G(t.name,e));}function kn(e,t,{deconflictedDefault:s,deconflictedNamespace:i,dependencies:n},r,a,o,h){for(const t of n)t.variableName=G(t.suggestedVariableName,e);for(const t of i)t.namespaceVariableName=G(`${t.suggestedVariableName}__namespace`,e);for(const t of s)i.has(t)&&Lt(String(r(t.id)),o)?t.defaultVariableName=t.namespaceVariableName:t.defaultVariableName=G(`${t.suggestedVariableName}__default`,e);for(const e of t){const t=e.module;if(t instanceof Nt){const s=e.name;if("default"===s){const s=String(r(t.id)),i=Mt[s]?t.defaultVariableName:t.variableName;Tt(s,o)?e.setRenderNames(i,"default"):e.setRenderNames(null,i);}else "*"===s?e.setRenderNames(null,Rt[String(r(t.id))]?t.namespaceVariableName:t.variableName):e.setRenderNames(t.variableName,null);}else {const s=h.get(t);a&&e.isNamespace?e.setRenderNames(null,"default"===s.exportMode?s.namespaceVariableName:s.variableName):"default"===s.exportMode?e.setRenderNames(null,s.variableName):e.setRenderNames(s.variableName,s.getVariableExportName(e));}}}const Nn=/[\\'\r\n\u2028\u2029]/,In=/(['\r\n\u2028\u2029])/g,$n=/\\/g;function Mn(e){return e.match(Nn)?e.replace($n,"\\\\").replace(In,"\\$1"):e}function Tn(e,{exports:t,name:s,format:i},n,r,a){const o=e.getExportNames();if("default"===t){if(1!==o.length||"default"!==o[0])return ss(as("default",o,r))}else if("none"===t&&o.length)return ss(as("none",o,r));return "auto"===t&&(0===o.length?t="none":1===o.length&&"default"===o[0]?("cjs"===i&&n.has("exports")&&a(function(e){const t=es(e);return {code:ns.PREFER_NAMED_EXPORTS,id:e,message:`Entry module "${t}" is implicitly using "default" export mode, which means for CommonJS output that its default export is assigned to "module.exports". For many tools, such CommonJS output will not be interchangeable with the original ES module. If this is intended, explicitly set "output.exports" to either "auto" or "default", otherwise you might want to consider changing the signature of "${t}" to use named exports only.`,url:"https://rollupjs.org/guide/en/#outputexports"}}(r)),t="default"):("es"!==i&&-1!==o.indexOf("default")&&a(function(e,t){return {code:ns.MIXED_EXPORTS,id:e,message:`Entry module "${es(e)}" is using named and default exports together. Consumers of your bundle will have to use \`${t||"chunk"}["default"]\` to access the default export, which may not be what you want. Use \`output.exports: "named"\` to disable this warning`,url:"https://rollupjs.org/guide/en/#outputexports"}}(r,s)),t="named")),t}function Rn(e){const t=e.split("\n"),s=t.filter((e=>/^\t+/.test(e))),i=t.filter((e=>/^ {2,}/.test(e)));if(0===s.length&&0===i.length)return null;if(s.length>=i.length)return "\t";const n=i.reduce(((e,t)=>{const s=/^ +/.exec(t)[0].length;return Math.min(s,e)}),1/0);return new Array(n+1).join(" ")}function Ln(e,t,s,i,n){const r=e.getDependenciesToBeIncluded();for(const e of r){if(e instanceof Nt){t.push(e);continue}const r=n.get(e);r===i?s.has(e)||(s.add(e),Ln(e,t,s,i,n)):t.push(r);}}function On(e){if(!e)return null;if("string"==typeof e&&(e=JSON.parse(e)),""===e.mappings)return {mappings:[],names:[],sources:[],version:3};let s;return s="string"==typeof e.mappings?function(e){for(var s=[],i=[],r=[0,0,0,0,0],a=0,o=0,h=0,l=0;o<e.length;o++){var c=e.charCodeAt(o);if(44===c)n(i,r,a),a=0;else if(59===c)n(i,r,a),a=0,s.push(i),i=[],r[0]=0;else {var u=t[c];if(void 0===u)throw new Error("Invalid character ("+String.fromCharCode(c)+")");var d=32&u;if(l+=(u&=31)<<h,d)h+=5;else {var p=1&l;l>>>=1,p&&(l=0===l?-2147483648:-l),r[a]+=l,a++,l=h=0;}}}return n(i,r,a),s.push(i),s}(e.mappings):e.mappings,{...e,mappings:s}}function Dn(e,t,s){return ts(e)?e.replace(/\[(\w+)\]/g,((e,i)=>{if(!s.hasOwnProperty(i))return ss(ds(`"[${i}]" is not a valid placeholder in "${t}" pattern.`));const n=s[i]();return ts(n)?n:ss(ds(`Invalid substitution "${n}" for placeholder "[${i}]" in "${t}" pattern, can be neither absolute nor relative path.`))})):ss(ds(`Invalid pattern "${e}" for "${t}", patterns can be neither absolute nor relative paths and must not contain invalid characters.`))}function Vn(e,t){const s=new Set(Object.keys(t).map((e=>e.toLowerCase())));if(!s.has(e.toLocaleLowerCase()))return e;const i=k(e);e=e.substr(0,e.length-i.length);let n,r=1;for(;s.has((n=e+ ++r+i).toLowerCase()););return n}const Bn=[".js",".jsx",".ts",".tsx"];function Fn(e,t,s,i){const n="function"==typeof t?t(e.id):t[e.id];return n||(s?(i({code:"MISSING_GLOBAL_NAME",guess:e.variableName,message:`No name was provided for external module '${e.id}' in output.globals – guessing '${e.variableName}'`,source:e.id}),e.variableName):void 0)}class Wn{constructor(e,t,s,i,n,r,a,o,h,l){this.orderedModules=e,this.inputOptions=t,this.outputOptions=s,this.unsetOptions=i,this.pluginDriver=n,this.modulesById=r,this.chunkByModule=a,this.facadeChunkByModule=o,this.includedNamespaces=h,this.manualChunkAlias=l,this.entryModules=[],this.exportMode="named",this.facadeModule=null,this.id=null,this.namespaceVariableName="",this.variableName="",this.accessedGlobalsByScope=new Map,this.dependencies=new Set,this.dynamicDependencies=new Set,this.dynamicEntryModules=[],this.exportNamesByVariable=new Map,this.exports=new Set,this.exportsByName=Object.create(null),this.fileName=null,this.implicitEntryModules=[],this.implicitlyLoadedBefore=new Set,this.imports=new Set,this.indentString=void 0,this.isEmpty=!0,this.name=null,this.needsExportsShim=!1,this.renderedDependencies=null,this.renderedExports=null,this.renderedHash=void 0,this.renderedModules=Object.create(null),this.renderedModuleSources=new Map,this.renderedSource=null,this.sortedExportNames=null,this.strictFacade=!1,this.usedModules=void 0,this.execIndex=e.length>0?e[0].execIndex:1/0;const c=new Set(e);for(const t of e){t.namespace.included&&h.add(t),this.isEmpty&&t.isIncluded()&&(this.isEmpty=!1),(t.info.isEntry||s.preserveModules)&&this.entryModules.push(t);for(const e of t.includedDynamicImporters)c.has(e)||(this.dynamicEntryModules.push(t),t.info.syntheticNamedExports&&!s.preserveModules&&(h.add(t),this.exports.add(t.namespace)));t.implicitlyLoadedAfter.size>0&&this.implicitEntryModules.push(t);}this.suggestedVariableName=kt(this.generateVariableName());}static generateFacade(e,t,s,i,n,r,a,o,h,l){const c=new Wn([],e,t,s,i,n,r,a,o,null);c.assignFacadeName(l,h),a.has(h)||a.set(h,c);for(const e of h.getDependenciesToBeIncluded())c.dependencies.add(e instanceof Ri?r.get(e):e);return !c.dependencies.has(r.get(h))&&h.info.hasModuleSideEffects&&h.hasEffects()&&c.dependencies.add(r.get(h)),c.ensureReexportsAreAvailableForModule(h),c.facadeModule=h,c.strictFacade=!0,c}canModuleBeFacade(e,t){const s=e.getExportNamesByVariable();for(const t of this.exports)if(!s.has(t))return 0===s.size&&e.isUserDefinedEntryPoint&&"strict"===e.preserveSignature&&this.unsetOptions.has("preserveEntrySignatures")&&this.inputOptions.onwarn({code:"EMPTY_FACADE",id:e.id,message:`To preserve the export signature of the entry module "${es(e.id)}", an empty facade chunk was created. This often happens when creating a bundle for a web app where chunks are placed in script tags and exports are ignored. In this case it is recommended to set "preserveEntrySignatures: false" to avoid this and reduce the number of chunks. Otherwise if this is intentional, set "preserveEntrySignatures: 'strict'" explicitly to silence this warning.`,url:"https://rollupjs.org/guide/en/#preserveentrysignatures"}),!1;for(const i of t)if(!s.has(i)&&i.module!==e)return !1;return !0}generateExports(){this.sortedExportNames=null;const e=new Set(this.exports);if(null!==this.facadeModule&&(!1!==this.facadeModule.preserveSignature||this.strictFacade)){const t=this.facadeModule.getExportNamesByVariable();for(const[s,i]of t){this.exportNamesByVariable.set(s,[...i]);for(const e of i)this.exportsByName[e]=s;e.delete(s);}}this.outputOptions.minifyInternalExports?function(e,t,s){let i=0;for(const n of e){let e=n.name[0];if(t[e])do{e=j(++i),49===e.charCodeAt(0)&&(i+=9*64**(e.length-1),e=j(i));}while(z[e]||t[e]);t[e]=n,s.set(n,[e]);}}(e,this.exportsByName,this.exportNamesByVariable):function(e,t,s){for(const i of e){let e=0,n=i.name;for(;t[n];)n=i.name+"$"+ ++e;t[n]=i,s.set(i,[n]);}}(e,this.exportsByName,this.exportNamesByVariable),(this.outputOptions.preserveModules||this.facadeModule&&this.facadeModule.info.isEntry)&&(this.exportMode=Tn(this,this.outputOptions,this.unsetOptions,this.facadeModule.id,this.inputOptions.onwarn));}generateFacades(){var e;const t=[],s=new Set([...this.entryModules,...this.implicitEntryModules]),i=new Set(this.dynamicEntryModules.map((e=>e.namespace)));for(const e of s)if(e.preserveSignature)for(const t of e.getExportNamesByVariable().keys())i.add(t);for(const e of s){const s=Array.from(e.userChunkNames,(e=>({name:e})));if(0===s.length&&e.isUserDefinedEntryPoint&&s.push({}),s.push(...Array.from(e.chunkFileNames,(e=>({fileName:e})))),0===s.length&&s.push({}),!this.facadeModule){const t="strict"===e.preserveSignature||"exports-only"===e.preserveSignature&&0!==e.getExportNamesByVariable().size;(!t||this.outputOptions.preserveModules||this.canModuleBeFacade(e,i))&&(this.facadeModule=e,this.facadeChunkByModule.set(e,this),e.preserveSignature&&(this.strictFacade=t),this.assignFacadeName(s.shift(),e));}for(const i of s)t.push(Wn.generateFacade(this.inputOptions,this.outputOptions,this.unsetOptions,this.pluginDriver,this.modulesById,this.chunkByModule,this.facadeChunkByModule,this.includedNamespaces,e,i));}for(const t of this.dynamicEntryModules)t.info.syntheticNamedExports||(!this.facadeModule&&this.canModuleBeFacade(t,i)?(this.facadeModule=t,this.facadeChunkByModule.set(t,this),this.strictFacade=!0,this.assignFacadeName({},t)):this.facadeModule===t&&!this.strictFacade&&this.canModuleBeFacade(t,i)?this.strictFacade=!0:(null===(e=this.facadeChunkByModule.get(t))||void 0===e?void 0:e.strictFacade)||(this.includedNamespaces.add(t),this.exports.add(t.namespace)));return t}generateId(e,t,s,i){if(null!==this.fileName)return this.fileName;const[n,r]=this.facadeModule&&this.facadeModule.isUserDefinedEntryPoint?[t.entryFileNames,"output.entryFileNames"]:[t.chunkFileNames,"output.chunkFileNames"];return Vn(Dn("function"==typeof n?n(this.getChunkInfo()):n,r,{format:()=>t.format,hash:()=>i?this.computeContentHashWithDependencies(e,t,s):"[hash]",name:()=>this.getChunkName()}),s)}generateIdPreserveModules(e,t,s,i){const n=this.orderedModules[0].id,r=Jt(n);let a;if(A(n)){const s=k(n),o=i.has("entryFileNames")?Bn.includes(s)?"[name].js":"[name][extname].js":t.entryFileNames,h=`${_(r)}/${Dn("function"==typeof o?o(this.getChunkInfo()):o,"output.entryFileNames",{ext:()=>s.substr(1),extname:()=>s,format:()=>t.format,name:()=>this.getChunkName()})}`,{preserveModulesRoot:l}=t;a=l&&h.startsWith(l)?h.slice(l.length).replace(/^[\\/]/,""):N(e,h);}else a=`_virtual/${w(r)}`;return Vn(C(a),s)}getChunkInfo(){const e=this.facadeModule,t=this.getChunkName.bind(this);return {exports:this.getExportNames(),facadeModuleId:e&&e.id,isDynamicEntry:this.dynamicEntryModules.length>0,isEntry:null!==e&&e.info.isEntry,isImplicitEntry:this.implicitEntryModules.length>0,modules:this.renderedModules,get name(){return t()},type:"chunk"}}getChunkInfoWithFileNames(){return Object.assign(this.getChunkInfo(),{code:void 0,dynamicImports:Array.from(this.dynamicDependencies,pi),fileName:this.id,implicitlyLoadedBefore:Array.from(this.implicitlyLoadedBefore,pi),importedBindings:this.getImportedBindingsPerDependency(),imports:Array.from(this.dependencies,pi),map:void 0,referencedFiles:this.getReferencedFiles()})}getChunkName(){return this.name||(this.name=Jt(this.getFallbackChunkName()))}getExportNames(){return this.sortedExportNames||(this.sortedExportNames=Object.keys(this.exportsByName).sort())}getRenderedHash(){if(this.renderedHash)return this.renderedHash;const e=Pn(),t=this.pluginDriver.hookReduceValueSync("augmentChunkHash","",[this.getChunkInfo()],((e,t)=>(t&&(e+=t),e)));return e.update(t),e.update(this.renderedSource.toString()),e.update(this.getExportNames().map((e=>{const t=this.exportsByName[e];return `${es(t.module.id).replace(/\\/g,"/")}:${t.name}:${e}`})).join(",")),this.renderedHash=e.digest("hex")}getVariableExportName(e){return this.outputOptions.preserveModules&&e instanceof Et?"*":this.exportNamesByVariable.get(e)[0]}link(){this.dependencies=function(e,t,s){const i=[],n=new Set;for(let r=t.length-1;r>=0;r--){const a=t[r];if(!n.has(a)){const t=[];Ln(a,t,n,e,s),i.unshift(t);}}const r=new Set;for(const e of i)for(const t of e)r.add(t);return r}(this,this.orderedModules,this.chunkByModule);for(const e of this.orderedModules)this.addDependenciesToChunk(e.dynamicDependencies,this.dynamicDependencies),this.addDependenciesToChunk(e.implicitlyLoadedBefore,this.implicitlyLoadedBefore),this.setUpChunkImportsAndExportsForModule(e);}preRender(e,t){const s=new v({separator:e.compact?"":"\n\n"});this.usedModules=[],this.indentString=function(e,t){if(!0!==t.indent)return t.indent;for(let t=0;t<e.length;t++){const s=Rn(e[t].originalCode);if(null!==s)return s}return "\t"}(this.orderedModules,e);const i=e.compact?"":"\n",n=e.compact?"":" ",r={compact:e.compact,dynamicImportFunction:e.dynamicImportFunction,exportNamesByVariable:this.exportNamesByVariable,format:e.format,freeze:e.freeze,indent:this.indentString,namespaceToStringTag:e.namespaceToStringTag,outputPluginDriver:this.pluginDriver,varOrConst:e.preferConst?"const":"var"};if(e.hoistTransitiveImports&&!this.outputOptions.preserveModules&&null!==this.facadeModule)for(const e of this.dependencies)e instanceof Wn&&this.inlineChunkDependencies(e);this.prepareDynamicImportsAndImportMetas(),this.setIdentifierRenderResolutions(e);let a="";const o=this.renderedModules;for(const t of this.orderedModules){let n=0;if(t.isIncluded()||this.includedNamespaces.has(t)){const o=t.render(r).trim();n=o.length(),n&&(e.compact&&-1!==o.lastLine().indexOf("//")&&o.append("\n"),this.renderedModuleSources.set(t,o),s.addSource(o),this.usedModules.push(t));const h=t.namespace;if(this.includedNamespaces.has(t)&&!this.outputOptions.preserveModules){const e=h.renderBlock(r);h.renderFirst()?a+=i+e:s.addSource(new x(e));}}const{renderedExports:h,removedExports:l}=t.getRenderedExports(),c=this;o[t.id]={originalLength:t.originalCode.length,removedExports:l,renderedExports:h,renderedLength:n,get code(){var e,s;return null!==(s=null===(e=c.renderedModuleSources.get(t))||void 0===e?void 0:e.toString())&&void 0!==s?s:null}};}if(a&&s.prepend(a+i+i),this.needsExportsShim&&s.prepend(`${i}${r.varOrConst} _missingExportShim${n}=${n}void 0;${i}${i}`),e.compact?this.renderedSource=s:this.renderedSource=s.trim(),this.renderedHash=void 0,this.isEmpty&&0===this.getExportNames().length&&0===this.dependencies.size){const e=this.getChunkName();this.inputOptions.onwarn({chunkName:e,code:"EMPTY_BUNDLE",message:`Generated an empty chunk: "${e}"`});}this.setExternalRenderPaths(e,t),this.renderedDependencies=this.getChunkDependencyDeclarations(e),this.renderedExports="none"===this.exportMode?[]:this.getChunkExportDeclarations(e.format);}async render(e,t,s){wi("render format",2);const i=e.format,n=Cs[i];e.dynamicImportFunction&&"es"!==i&&this.inputOptions.onwarn({code:"INVALID_OPTION",message:'"output.dynamicImportFunction" is ignored for formats other than "es".'});for(const e of this.dependencies){const t=this.renderedDependencies.get(e);if(e instanceof Nt){const s=e.renderPath;t.id=Mn(e.renormalizeRenderPath?this.getRelativePath(s,!1):s);}else t.namedExportsMode="default"!==e.exportMode,t.id=Mn(this.getRelativePath(e.id,!1));}this.finaliseDynamicImports(e),this.finaliseImportMetas(i);const r=0!==this.renderedExports.length||[...this.renderedDependencies.values()].some((e=>e.reexports&&0!==e.reexports.length));let a=!1;const o=new Set;for(const e of this.orderedModules){e.usesTopLevelAwait&&(a=!0);const t=this.accessedGlobalsByScope.get(e.scope);if(t)for(const e of t)o.add(e);}if(a&&"es"!==i&&"system"!==i)return ss({code:"INVALID_TLA_FORMAT",message:`Module format ${i} does not support top-level await. Use the "es" or "system" output formats rather.`});if(!this.id)throw new Error("Internal Error: expecting chunk id");const h=n(this.renderedSource,{accessedGlobals:o,dependencies:[...this.renderedDependencies.values()],exports:this.renderedExports,hasExports:r,id:this.id,indentString:this.indentString,intro:t.intro,isEntryFacade:this.outputOptions.preserveModules||null!==this.facadeModule&&this.facadeModule.info.isEntry,isModuleFacade:null!==this.facadeModule,namedExportsMode:"default"!==this.exportMode,outro:t.outro,usesTopLevelAwait:a,varOrConst:e.preferConst?"const":"var",warn:this.inputOptions.onwarn},e);t.banner&&h.prepend(t.banner),t.footer&&h.append(t.footer);const c=h.toString();_i("render format",2);let u=null;const d=[];let p=await function({code:e,options:t,outputPluginDriver:s,renderChunk:i,sourcemapChain:n}){return s.hookReduceArg0("renderChunk",[e,i,t],((e,t,s)=>{if(null==t)return e;if("string"==typeof t&&(t={code:t,map:void 0}),null!==t.map){const e=On(t.map);n.push(e||{missing:!0,plugin:s.name});}return t.code}))}({code:c,options:e,outputPluginDriver:this.pluginDriver,renderChunk:s,sourcemapChain:d});if(e.sourcemap){let t;wi("sourcemap",2),t=e.file?I(e.sourcemapFile||e.file):e.dir?I(e.dir,this.id):I(this.id);const s=h.generateDecodedMap({});u=function(e,t,s,i,n,r){const a=Vi(r),o=s.filter((e=>!e.excludeFromSourcemap)).map((e=>Bi(e.id,e.originalCode,e.originalSourcemap,e.sourcemapChain,a)));let h=new Di(t,o);h=i.reduce(a,h);let{sources:c,sourcesContent:u,names:d,mappings:p}=h.traceMappings();if(e){const t=_(e);c=c.map((e=>N(t,e))),e=w(e);}return u=n?null:u,new l({file:e,sources:c,sourcesContent:u,names:d,mappings:p})}(t,s,this.usedModules,d,e.sourcemapExcludeSources,this.inputOptions.onwarn),u.sources=u.sources.map((s=>{const{sourcemapPathTransform:i}=e;if(i){const e=i(s,`${t}.map`);return "string"!=typeof e&&ss(ds("sourcemapPathTransform function must return a string.")),e}return s})).map(C),_i("sourcemap",2);}return e.compact||"\n"===p[p.length-1]||(p+="\n"),{code:p,map:u}}addDependenciesToChunk(e,t){for(const s of e)if(s instanceof Ri){const e=this.chunkByModule.get(s);e&&e!==this&&t.add(e);}else t.add(s);}assignFacadeName({fileName:e,name:t},s){e?this.fileName=e:this.name=Jt(t||s.chunkName||Zt(s.id));}checkCircularDependencyImport(e,t){const s=e.module;if(s instanceof Ri){const o=this.chunkByModule.get(s);let h;do{if(h=t.alternativeReexportModules.get(e),h){const l=this.chunkByModule.get(h);l&&l!==o&&this.inputOptions.onwarn((i=s.getExportNamesByVariable().get(e)[0],n=s.id,r=h.id,a=t.id,{code:ns.CYCLIC_CROSS_CHUNK_REEXPORT,exporter:n,importer:a,message:`Export "${i}" of module ${es(n)} was reexported through module ${es(r)} while both modules are dependencies of each other and will end up in different chunks by current Rollup settings. This scenario is not well supported at the moment as it will produce a circular dependency between chunks and will likely lead to broken execution order.\nEither change the import in ${es(a)} to point directly to the exporting module or do not use "preserveModules" to ensure these modules end up in the same chunk.`,reexporter:r})),t=h;}}while(h)}var i,n,r,a;}computeContentHashWithDependencies(e,t,s){const i=Pn();i.update([e.intro,e.outro,e.banner,e.footer].map((e=>e||"")).join(":")),i.update(t.format);const n=new Set([this]);for(const r of n)if(r instanceof Nt?i.update(":"+r.renderPath):(i.update(r.getRenderedHash()),i.update(r.generateId(e,t,s,!1))),!(r instanceof Nt))for(const e of [...r.dependencies,...r.dynamicDependencies])n.add(e);return i.digest("hex").substr(0,8)}ensureReexportsAreAvailableForModule(e){const t=e.getExportNamesByVariable();for(const s of t.keys()){const t=s instanceof vt,i=t?s.getBaseVariable():s;if(!(i instanceof Et&&this.outputOptions.preserveModules)){this.checkCircularDependencyImport(i,e);const s=i.module;if(s instanceof Ri){const e=this.chunkByModule.get(s);e&&e!==this&&(e.exports.add(i),t&&this.imports.add(i));}}}}finaliseDynamicImports(e){const t="amd"===e.format;for(const[s,i]of this.renderedModuleSources)for(const{node:n,resolution:r}of s.dynamicImports){const s=this.chunkByModule.get(r),a=this.facadeChunkByModule.get(r);if(!r||!n.included||s===this)continue;const o=r instanceof Ri?`'${this.getRelativePath((a||s).id,t)}'`:r instanceof Nt?`'${r.renormalizeRenderPath?this.getRelativePath(r.renderPath,t):r.renderPath}'`:r;n.renderFinalResolution(i,o,r instanceof Ri&&!(null==a?void 0:a.strictFacade)&&s.exportNamesByVariable.get(r.namespace)[0],e);}}finaliseImportMetas(e){for(const[t,s]of this.renderedModuleSources)for(const i of t.importMetas)i.renderFinalMechanism(s,this.id,e,this.pluginDriver);}generateVariableName(){if(this.manualChunkAlias)return this.manualChunkAlias;const e=this.entryModules[0]||this.implicitEntryModules[0]||this.dynamicEntryModules[0]||this.orderedModules[this.orderedModules.length-1];return e?e.chunkName||Zt(e.id):"chunk"}getChunkDependencyDeclarations(e){const t=this.getImportSpecifiers(),s=this.getReexportSpecifiers(),i=new Map;for(const n of this.dependencies){const r=t.get(n)||null,a=s.get(n)||null,o=n instanceof Nt||"default"!==n.exportMode;i.set(n,{defaultVariableName:n.defaultVariableName,globalName:n instanceof Nt&&("umd"===e.format||"iife"===e.format)&&Fn(n,e.globals,null!==(r||a),this.inputOptions.onwarn),id:void 0,imports:r,isChunk:n instanceof Wn,name:n.variableName,namedExportsMode:o,namespaceVariableName:n.namespaceVariableName,reexports:a});}return i}getChunkExportDeclarations(e){const t=[];for(const s of this.getExportNames()){if("*"===s[0])continue;const i=this.exportsByName[s];if(!(i instanceof vt)){const e=i.module;if(e&&this.chunkByModule.get(e)!==this)continue}let n=null,r=!1,a=!1,o=i.getName();if(i instanceof Le){i.init===ae&&(a=!0);for(const e of i.declarations)if(e.parent instanceof ft||e instanceof mt&&e.declaration instanceof ft){r=!0;break}}else i instanceof vt&&(n=o,"es"===e&&"default"!==s&&(o=i.renderName));t.push({exported:s,expression:n,hoisted:r,local:o,uninitialized:a});}return t}getDependenciesToBeDeconflicted(e,t,s){const i=new Set,n=new Set,r=new Set;for(const t of [...this.exportNamesByVariable.keys(),...this.imports])if(e||t.isNamespace){const a=t.module;if(a instanceof Nt)i.add(a),e&&("default"===t.name?Mt[String(s(a.id))]&&n.add(a):"*"===t.name&&Rt[String(s(a.id))]&&r.add(a));else {const s=this.chunkByModule.get(a);s!==this&&(i.add(s),e&&"default"===s.exportMode&&t.isNamespace&&r.add(s));}}if(t)for(const e of this.dependencies)i.add(e);return {deconflictedDefault:n,deconflictedNamespace:r,dependencies:i}}getFallbackChunkName(){return this.manualChunkAlias?this.manualChunkAlias:this.fileName?Zt(this.fileName):Zt(this.orderedModules[this.orderedModules.length-1].id)}getImportedBindingsPerDependency(){const e={};for(const[t,s]of this.renderedDependencies){const i=new Set;if(s.imports)for(const{imported:e}of s.imports)i.add(e);if(s.reexports)for(const{imported:e}of s.reexports)i.add(e);e[t.id]=[...i];}return e}getImportSpecifiers(){const{interop:e}=this.outputOptions,t=new Map;for(const s of this.imports){const i=s.module;let n,r;if(i instanceof Nt){if(n=i,r=s.name,"default"!==r&&"*"!==r&&"defaultOnly"===e(i.id))return ss(cs(i.id,r,!1))}else n=this.chunkByModule.get(i),r=n.getVariableExportName(s);q(t,n,(()=>[])).push({imported:r,local:s.getName()});}return t}getReexportSpecifiers(){const{externalLiveBindings:e,interop:t}=this.outputOptions,s=new Map;for(let i of this.getExportNames()){let n,r,a=!1;if("*"===i[0]){const s=i.substr(1);"defaultOnly"===t(s)&&this.inputOptions.onwarn(us(s)),a=e,n=this.modulesById.get(s),r=i="*";}else {const s=this.exportsByName[i];if(s instanceof vt)continue;const o=s.module;if(o instanceof Ri){if(n=this.chunkByModule.get(o),n===this)continue;r=n.getVariableExportName(s),a=s.isReassigned;}else {if(n=o,r=s.name,"default"!==r&&"*"!==r&&"defaultOnly"===t(o.id))return ss(cs(o.id,r,!0));a=e&&("default"!==r||Tt(String(t(o.id)),!0));}}q(s,n,(()=>[])).push({imported:r,needsLiveBinding:a,reexported:i});}return s}getReferencedFiles(){const e=[];for(const t of this.orderedModules)for(const s of t.importMetas){const t=s.getReferencedFileName(this.pluginDriver);t&&e.push(t);}return e}getRelativePath(e,t){let s=C(N(_(this.id),e));return t&&s.endsWith(".js")&&(s=s.slice(0,-3)),".."===s?"../../"+w(e):""===s?"../"+w(e):s.startsWith("../")?s:"./"+s}inlineChunkDependencies(e){for(const t of e.dependencies)this.dependencies.has(t)||(this.dependencies.add(t),t instanceof Wn&&this.inlineChunkDependencies(t));}prepareDynamicImportsAndImportMetas(){var e;const t=this.accessedGlobalsByScope;for(const s of this.orderedModules){for(const{node:i,resolution:n}of s.dynamicImports)if(i.included)if(n instanceof Ri){const s=this.chunkByModule.get(n);s===this?i.setInternalResolution(n.namespace):i.setExternalResolution((null===(e=this.facadeChunkByModule.get(n))||void 0===e?void 0:e.exportMode)||s.exportMode,n,this.outputOptions,this.pluginDriver,t);}else i.setExternalResolution("external",n,this.outputOptions,this.pluginDriver,t);for(const e of s.importMetas)e.addAccessedGlobals(this.outputOptions.format,t);}}setExternalRenderPaths(e,t){for(const s of [...this.dependencies,...this.dynamicDependencies])s instanceof Nt&&s.setRenderPath(e,t);}setIdentifierRenderResolutions({format:e,interop:t,namespaceToStringTag:s}){const i=new Set;for(const t of this.getExportNames()){const s=this.exportsByName[t];s instanceof xt&&(this.needsExportsShim=!0),"es"!==e&&"system"!==e&&s.isReassigned&&!s.isId?s.setRenderNames("exports",t):s instanceof vt?i.add(s):s.setRenderNames(null,null);}const n=new Set(["Object","Promise"]);switch(this.needsExportsShim&&n.add("_missingExportShim"),s&&n.add("Symbol"),e){case"system":n.add("module").add("exports");break;case"es":break;case"cjs":n.add("module").add("require").add("__filename").add("__dirname");default:n.add("exports");for(const e of jt)n.add(e);}wn(this.orderedModules,this.getDependenciesToBeDeconflicted("es"!==e&&"system"!==e,"amd"===e||"umd"===e||"iife"===e,t),this.imports,n,e,t,this.outputOptions.preserveModules,this.outputOptions.externalLiveBindings,this.chunkByModule,i,this.exportNamesByVariable,this.accessedGlobalsByScope,this.includedNamespaces);}setUpChunkImportsAndExportsForModule(e){const t=new Set(e.imports);if(!this.outputOptions.preserveModules&&this.includedNamespaces.has(e)){const s=e.namespace.getMemberVariables();for(const e of Object.keys(s))t.add(s[e]);}for(let s of t){s instanceof yt&&(s=s.getOriginalVariable()),s instanceof vt&&(s=s.getBaseVariable());const t=this.chunkByModule.get(s.module);t!==this&&(this.imports.add(s),!(s instanceof Et&&this.outputOptions.preserveModules)&&s.module instanceof Ri&&(t.exports.add(s),this.checkCircularDependencyImport(s,e)));}(this.includedNamespaces.has(e)||e.info.isEntry&&!1!==e.preserveSignature||e.includedDynamicImporters.some((e=>this.chunkByModule.get(e)!==this)))&&this.ensureReexportsAreAvailableForModule(e);for(const{node:t,resolution:s}of e.dynamicImports)t.included&&s instanceof Ri&&this.chunkByModule.get(s)===this&&!this.includedNamespaces.has(s)&&(this.includedNamespaces.add(s),this.ensureReexportsAreAvailableForModule(s));}}const Un=(e,t)=>t?`${e}\n${t}`:e,jn=(e,t)=>t?`${e}\n\n${t}`:e;function zn(e,t){const s=[],i=new Set(t.keys()),n=Object.create(null);for(const[e,s]of t){Gn(e,n[s]=n[s]||[],i);}for(const[e,t]of Object.entries(n))s.push({alias:e,modules:t});const r=new Map,{dependentEntryPointsByModule:a,dynamicEntryModules:o}=function(e){const t=new Set,s=new Map,i=new Set(e);for(const e of i){const n=new Set([e]);for(const r of n){q(s,r,(()=>new Set)).add(e);for(const e of r.getDependenciesToBeIncluded())e instanceof Nt||n.add(e);for(const{resolution:e}of r.dynamicImports)e instanceof Ri&&e.includedDynamicImporters.length>0&&(t.add(e),i.add(e));for(const e of r.implicitlyLoadedBefore)t.add(e),i.add(e);}}return {dependentEntryPointsByModule:s,dynamicEntryModules:t}}(e),h=function(e,t){const s=new Map;for(const i of t){const t=q(s,i,(()=>new Set));for(const s of [...i.includedDynamicImporters,...i.implicitlyLoadedAfter])for(const i of e.get(s))t.add(i);}return s}(a,o),l=new Set(e);function c(e,t){const s=new Set([e]);for(const n of s){const o=q(r,n,(()=>new Set));if(!t||!u(t,a.get(n))){o.add(e);for(const e of n.getDependenciesToBeIncluded())e instanceof Nt||i.has(e)||s.add(e);}}}function u(e,t){const s=new Set(e);for(const e of s)if(!t.has(e)){if(l.has(e))return !1;const t=h.get(e);for(const e of t)s.add(e);}return !0}for(const t of e)i.has(t)||c(t,null);for(const e of o)i.has(e)||c(e,h.get(e));return s.push(...function(e,t){const s=Object.create(null);for(const[i,n]of t){let t="";for(const s of e)t+=n.has(s)?"X":"_";const r=s[t];r?r.push(i):s[t]=[i];}return Object.keys(s).map((e=>({alias:null,modules:s[e]})))}([...e,...o],r)),s}function Gn(e,t,s){const i=new Set([e]);for(const e of i){s.add(e),t.push(e);for(const t of e.dependencies)t instanceof Nt||s.has(t)||i.add(t);}}const Hn=(e,t)=>e.execIndex>t.execIndex?1:-1;function qn(e,t,s){const i=Symbol(e.id),n=[es(e.id)];let r=t;for(e.cycles.add(i);r!==e;)r.cycles.add(i),n.push(es(r.id)),r=s.get(r);return n.push(n[0]),n.reverse(),n}var Kn;function Xn(e,t,s){e in t&&s(function(e){return {code:ns.FILE_NAME_CONFLICT,message:`The emitted file "${e}" overwrites a previously emitted file of the same name.`}}(e)),t[e]=Yn;}!function(e){e[e.LOAD_AND_PARSE=0]="LOAD_AND_PARSE",e[e.ANALYSE=1]="ANALYSE",e[e.GENERATE=2]="GENERATE";}(Kn||(Kn={}));const Yn={type:"placeholder"};function Qn(e,t,s){if(!("string"==typeof e||e instanceof Uint8Array)){const e=t.fileName||t.name||s;return ss(ds(`Could not set source for ${"string"==typeof e?`asset "${e}"`:"unnamed asset"}, asset source needs to be a string, Uint8Array or Buffer.`))}return e}function Jn(e,t){return "string"!=typeof e.fileName?ss((s=e.name||t,{code:ns.ASSET_NOT_FINALISED,message:`Plugin error - Unable to get file name for asset "${s}". Ensure that the source is set and that generate is called first.`})):e.fileName;var s;}function Zn(e,t){var s;const i=e.fileName||e.module&&(null===(s=null==t?void 0:t.get(e.module))||void 0===s?void 0:s.id);return i||ss((n=e.fileName||e.name,{code:ns.CHUNK_NOT_GENERATED,message:`Plugin error - Unable to get file name for chunk "${n}". Ensure that generate is called first.`}));var n;}class er{constructor(e,t,s){this.graph=e,this.options=t,this.facadeChunkByModule=null,this.output=null,this.assertAssetsFinalized=()=>{for(const[t,s]of this.filesByReferenceId.entries())if("asset"===s.type&&"string"!=typeof s.fileName)return ss((e=s.name||t,{code:ns.ASSET_SOURCE_MISSING,message:`Plugin error creating asset "${e}" - no asset source set.`}));var e;},this.emitFile=e=>function(e){return Boolean(e&&("asset"===e.type||"chunk"===e.type))}(e)?function(e){const t=e.fileName||e.name;return !t||"string"==typeof t&&ts(t)}(e)?"chunk"===e.type?this.emitChunk(e):this.emitAsset(e):ss(ds(`The "fileName" or "name" properties of emitted files must be strings that are neither absolute nor relative paths and do not contain invalid characters, received "${e.fileName||e.name}".`)):ss(ds(`Emitted files must be of type "asset" or "chunk", received "${e&&e.type}".`)),this.getFileName=e=>{const t=this.filesByReferenceId.get(e);return t?"chunk"===t.type?Zn(t,this.facadeChunkByModule):Jn(t,e):ss((s=e,{code:ns.FILE_NOT_FOUND,message:`Plugin error - Unable to get file name for unknown file "${s}".`}));var s;},this.setAssetSource=(e,t)=>{const s=this.filesByReferenceId.get(e);if(!s)return ss((i=e,{code:ns.ASSET_NOT_FOUND,message:`Plugin error - Unable to set the source for unknown asset "${i}".`}));var i,n;if("asset"!==s.type)return ss(ds(`Asset sources can only be set for emitted assets but "${e}" is an emitted chunk.`));if(void 0!==s.source)return ss((n=s.name||e,{code:ns.ASSET_SOURCE_ALREADY_SET,message:`Unable to set the source for asset "${n}", source already set.`}));const r=Qn(t,s,e);this.output?this.finalizeAsset(s,r,e,this.output):s.source=r;},this.setOutputBundle=(e,t,s)=>{this.output={assetFileNames:t,bundle:e},this.facadeChunkByModule=s;for(const e of this.filesByReferenceId.values())e.fileName&&Xn(e.fileName,this.output.bundle,this.options.onwarn);for(const[e,t]of this.filesByReferenceId.entries())"asset"===t.type&&void 0!==t.source&&this.finalizeAsset(t,t.source,e,this.output);},this.filesByReferenceId=s?new Map(s.filesByReferenceId):new Map;}assignReferenceId(e,t){let s;do{const e=Pn();s?e.update(s):e.update(t),s=e.digest("hex").substr(0,8);}while(this.filesByReferenceId.has(s));return this.filesByReferenceId.set(s,e),s}emitAsset(e){const t=void 0!==e.source?Qn(e.source,e,null):void 0,s={fileName:e.fileName,name:e.name,source:t,type:"asset"},i=this.assignReferenceId(s,e.fileName||e.name||e.type);return this.output&&(e.fileName&&Xn(e.fileName,this.output.bundle,this.options.onwarn),void 0!==t&&this.finalizeAsset(s,t,i,this.output)),i}emitChunk(e){if(this.graph.phase>Kn.LOAD_AND_PARSE)return ss({code:ns.INVALID_ROLLUP_PHASE,message:"Cannot emit chunks after module loading has finished."});if("string"!=typeof e.id)return ss(ds(`Emitted chunks need to have a valid string id, received "${e.id}"`));const t={fileName:e.fileName,module:null,name:e.name||e.id,type:"chunk"};return this.graph.moduleLoader.emitChunk(e).then((e=>t.module=e)).catch((()=>{})),this.assignReferenceId(t,e.id)}finalizeAsset(e,t,s,i){const n=e.fileName||function(e,t){for(const s of Object.keys(e)){const i=e[s];if("asset"===i.type&&tr(t,i.source))return s}return null}(i.bundle,t)||function(e,t,s){const i=e||"asset";return Vn(Dn("function"==typeof s.assetFileNames?s.assetFileNames({name:e,source:t,type:"asset"}):s.assetFileNames,"output.assetFileNames",{hash(){const e=Pn();return e.update(i),e.update(":"),e.update(t),e.digest("hex").substr(0,8)},ext:()=>k(i).substr(1),extname:()=>k(i),name:()=>i.substr(0,i.length-k(i).length)}),s.bundle)}(e.name,t,i),r={...e,source:t,fileName:n};this.filesByReferenceId.set(s,r);const a=this.options;i.bundle[n]={fileName:n,name:e.name,get isAsset(){return fs('Accessing "isAsset" on files in the bundle is deprecated, please use "type === \'asset\'" instead',!0,a),!0},source:t,type:"asset"};}}function tr(e,t){if("string"==typeof e)return e===t;if("string"==typeof t)return !1;if("equals"in e)return e.equals(t);if(e.length!==t.length)return !1;for(let s=0;s<e.length;s++)if(e[s]!==t[s])return !1;return !0}class sr{constructor(e,t,s,i,n){this.outputOptions=e,this.unsetOptions=t,this.inputOptions=s,this.pluginDriver=i,this.graph=n,this.facadeChunkByModule=new Map,this.includedNamespaces=new Set;}async generate(e){wi("GENERATE",1);const t=Object.create(null);this.pluginDriver.setOutputBundle(t,this.outputOptions.assetFileNames,this.facadeChunkByModule);try{await this.pluginDriver.hookParallel("renderStart",[this.outputOptions,this.inputOptions]),wi("generate chunks",2);const e=await this.generateChunks();e.length>1&&function(e,t){if("umd"===e.format||"iife"===e.format)return ss({code:"INVALID_OPTION",message:"UMD and IIFE output formats are not supported for code-splitting builds."});if("string"==typeof e.file)return ss({code:"INVALID_OPTION",message:'When building multiple chunks, the "output.dir" option must be used, not "output.file". To inline dynamic imports, set the "inlineDynamicImports" option.'});if(e.sourcemapFile)return ss({code:"INVALID_OPTION",message:'"output.sourcemapFile" is only supported for single-file builds.'});!e.amd.autoId&&e.amd.id&&t({code:"INVALID_OPTION",message:'"output.amd.id" is only properly supported for single-file builds. Use "output.amd.autoId" and "output.amd.basePath".'});}(this.outputOptions,this.inputOptions.onwarn);const s=function(e){if(0===e.length)return "/";if(1===e.length)return _(e[0]);const t=e.slice(1).reduce(((e,t)=>{const s=t.split(/\/+|\\+/);let i;for(i=0;e[i]===s[i]&&i<Math.min(e.length,s.length);i++);return e.slice(0,i)}),e[0].split(/\/+|\\+/));return t.length>1?t.join("/"):"/"}(function(e){const t=[];for(const s of e)for(const e of s.entryModules)A(e.id)&&t.push(e.id);return t}(e));_i("generate chunks",2),wi("render modules",2);const i=await async function(e,t){try{let[s,i,n,r]=await Promise.all([t.hookReduceValue("banner",e.banner(),[],Un),t.hookReduceValue("footer",e.footer(),[],Un),t.hookReduceValue("intro",e.intro(),[],jn),t.hookReduceValue("outro",e.outro(),[],jn)]);return n&&(n+="\n\n"),r&&(r=`\n\n${r}`),s.length&&(s+="\n"),i.length&&(i="\n"+i),{intro:n,outro:r,banner:s,footer:i}}catch(e){return ss({code:"ADDON_ERROR",message:`Could not retrieve ${e.hook}. Check configuration of plugin ${e.plugin}.\n\tError Message: ${e.message}`})}}(this.outputOptions,this.pluginDriver);this.prerenderChunks(e,s),_i("render modules",2),await this.addFinalizedChunksToBundle(e,s,i,t);}catch(e){throw await this.pluginDriver.hookParallel("renderError",[e]),e}return await this.pluginDriver.hookSeq("generateBundle",[this.outputOptions,t,e]),this.finaliseAssets(t),_i("GENERATE",1),t}async addFinalizedChunksToBundle(e,t,s,i){this.assignChunkIds(e,t,s,i);for(const t of e)i[t.id]=t.getChunkInfoWithFileNames();await Promise.all(e.map((async e=>{const t=i[e.id];Object.assign(t,await e.render(this.outputOptions,s,t));})));}async addManualChunks(e){const t=new Map,s=await Promise.all(Object.keys(e).map((async t=>({alias:t,entries:await this.graph.moduleLoader.addAdditionalModules(e[t])}))));for(const{alias:e,entries:i}of s)for(const s of i)nr(e,s,t);return t}assignChunkIds(e,t,s,i){const n=[],r=[];for(const t of e)(t.facadeModule&&t.facadeModule.isUserDefinedEntryPoint?n:r).push(t);const a=n.concat(r);for(const e of a)this.outputOptions.file?e.id=w(this.outputOptions.file):this.outputOptions.preserveModules?e.id=e.generateIdPreserveModules(t,this.outputOptions,i,this.unsetOptions):e.id=e.generateId(s,this.outputOptions,i,!0),i[e.id]=Yn;}assignManualChunks(e){const t=new Map,s={getModuleIds:()=>this.graph.modulesById.keys(),getModuleInfo:this.graph.getModuleInfo};for(const i of this.graph.modulesById.values())if(i instanceof Ri){const n=e(i.id,s);"string"==typeof n&&nr(n,i,t);}return t}finaliseAssets(e){for(const t of Object.keys(e)){const s=e[t];if(s.type||(fs('A plugin is directly adding properties to the bundle object in the "generateBundle" hook. This is deprecated and will be removed in a future Rollup version, please use "this.emitFile" instead.',!0,this.inputOptions),s.type="asset"),this.outputOptions.validate&&"string"==typeof s.code)try{this.graph.contextParse(s.code,{allowHashBang:!0,ecmaVersion:"latest"});}catch(e){this.inputOptions.onwarn(rs(s,e));}}this.pluginDriver.finaliseAssets();}async generateChunks(){const{manualChunks:e}=this.outputOptions,t="object"==typeof e?await this.addManualChunks(e):this.assignManualChunks(e),s=[],i=new Map;for(const{alias:e,modules:n}of this.outputOptions.inlineDynamicImports?[{alias:null,modules:ir(this.graph.modulesById)}]:this.outputOptions.preserveModules?ir(this.graph.modulesById).map((e=>({alias:null,modules:[e]}))):zn(this.graph.entryModules,t)){n.sort(Hn);const t=new Wn(n,this.inputOptions,this.outputOptions,this.unsetOptions,this.pluginDriver,this.graph.modulesById,i,this.facadeChunkByModule,this.includedNamespaces,e);s.push(t);for(const e of n)i.set(e,t);}for(const e of s)e.link();const n=[];for(const e of s)n.push(...e.generateFacades());return [...s,...n]}prerenderChunks(e,t){for(const t of e)t.generateExports();for(const s of e)s.preRender(this.outputOptions,t);}}function ir(e){return [...e.values()].filter((e=>e instanceof Ri&&(e.isIncluded()||e.info.isEntry||e.includedDynamicImporters.length>0)))}function nr(e,t,s){const i=s.get(t);if("string"==typeof i&&i!==e)return ss((n=t.id,r=e,a=i,{code:ns.INVALID_CHUNK,message:`Cannot assign ${es(n)} to the "${r}" chunk as it is already in the "${a}" chunk.`}));var n,r,a;s.set(t,e);}var rr={3:"abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",5:"class enum extends super const export import",6:"enum",strict:"implements interface let package private protected public static yield",strictBind:"eval arguments"},ar="break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this",or={5:ar,"5module":ar+" export import",6:ar+" const class extends export import super"},hr=/^in(stanceof)?$/,lr="ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࢠ-ࢴࢶ-ࣇऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜌᜎ-ᜑᜠ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭋᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲈᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-Ⱞⰰ-ⱞⱠ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-鿼ꀀ-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-ꞿꟂ-ꟊꟵ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ",cr="‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛࣓-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-ໍ໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜔ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠐-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿᫀᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷹᷻-᷿‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿",ur=new RegExp("["+lr+"]"),dr=new RegExp("["+lr+cr+"]");lr=cr=null;var pr=[0,11,2,25,2,18,2,1,2,14,3,13,35,122,70,52,268,28,4,48,48,31,14,29,6,37,11,29,3,35,5,7,2,4,43,157,19,35,5,35,5,39,9,51,157,310,10,21,11,7,153,5,3,0,2,43,2,1,4,0,3,22,11,22,10,30,66,18,2,1,11,21,11,25,71,55,7,1,65,0,16,3,2,2,2,28,43,28,4,28,36,7,2,27,28,53,11,21,11,18,14,17,111,72,56,50,14,50,14,35,349,41,7,1,79,28,11,0,9,21,107,20,28,22,13,52,76,44,33,24,27,35,30,0,3,0,9,34,4,0,13,47,15,3,22,0,2,0,36,17,2,24,85,6,2,0,2,3,2,14,2,9,8,46,39,7,3,1,3,21,2,6,2,1,2,4,4,0,19,0,13,4,159,52,19,3,21,2,31,47,21,1,2,0,185,46,42,3,37,47,21,0,60,42,14,0,72,26,230,43,117,63,32,7,3,0,3,7,2,1,2,23,16,0,2,0,95,7,3,38,17,0,2,0,29,0,11,39,8,0,22,0,12,45,20,0,35,56,264,8,2,36,18,0,50,29,113,6,2,1,2,37,22,0,26,5,2,1,2,31,15,0,328,18,190,0,80,921,103,110,18,195,2749,1070,4050,582,8634,568,8,30,114,29,19,47,17,3,32,20,6,18,689,63,129,74,6,0,67,12,65,1,2,0,29,6135,9,1237,43,8,8952,286,50,2,18,3,9,395,2309,106,6,12,4,8,8,9,5991,84,2,70,2,1,3,0,3,1,3,3,2,11,2,0,2,6,2,64,2,3,3,7,2,6,2,27,2,3,2,4,2,0,4,6,2,339,3,24,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,7,2357,44,11,6,17,0,370,43,1301,196,60,67,8,0,1205,3,2,26,2,1,2,0,3,0,2,9,2,3,2,0,2,0,7,0,5,0,2,0,2,0,2,2,2,1,2,0,3,0,2,0,2,0,2,0,2,0,2,1,2,0,3,3,2,6,2,3,2,3,2,0,2,9,2,16,6,2,2,4,2,16,4421,42717,35,4148,12,221,3,5761,15,7472,3104,541,1507,4938],fr=[509,0,227,0,150,4,294,9,1368,2,2,1,6,3,41,2,5,0,166,1,574,3,9,9,370,1,154,10,176,2,54,14,32,9,16,3,46,10,54,9,7,2,37,13,2,9,6,1,45,0,13,2,49,13,9,3,2,11,83,11,7,0,161,11,6,9,7,3,56,1,2,6,3,1,3,2,10,0,11,1,3,6,4,4,193,17,10,9,5,0,82,19,13,9,214,6,3,8,28,1,83,16,16,9,82,12,9,9,84,14,5,9,243,14,166,9,71,5,2,1,3,3,2,0,2,1,13,9,120,6,3,6,4,0,29,9,41,6,2,3,9,0,10,10,47,15,406,7,2,7,17,9,57,21,2,13,123,5,4,0,2,1,2,6,2,0,9,9,49,4,2,1,2,4,9,9,330,3,19306,9,135,4,60,6,26,9,1014,0,2,54,8,3,82,0,12,1,19628,1,5319,4,4,5,9,7,3,6,31,3,149,2,1418,49,513,54,5,49,9,0,15,0,23,4,2,14,1361,6,2,16,3,6,2,1,2,4,262,6,10,9,419,13,1495,6,110,6,6,9,4759,9,787719,239];function mr(e,t){for(var s=65536,i=0;i<t.length;i+=2){if((s+=t[i])>e)return !1;if((s+=t[i+1])>=e)return !0}}function gr(e,t){return e<65?36===e:e<91||(e<97?95===e:e<123||(e<=65535?e>=170&&ur.test(String.fromCharCode(e)):!1!==t&&mr(e,pr)))}function yr(e,t){return e<48?36===e:e<58||!(e<65)&&(e<91||(e<97?95===e:e<123||(e<=65535?e>=170&&dr.test(String.fromCharCode(e)):!1!==t&&(mr(e,pr)||mr(e,fr)))))}var xr=function(e,t){void 0===t&&(t={}),this.label=e,this.keyword=t.keyword,this.beforeExpr=!!t.beforeExpr,this.startsExpr=!!t.startsExpr,this.isLoop=!!t.isLoop,this.isAssign=!!t.isAssign,this.prefix=!!t.prefix,this.postfix=!!t.postfix,this.binop=t.binop||null,this.updateContext=null;};function Er(e,t){return new xr(e,{beforeExpr:!0,binop:t})}var vr={beforeExpr:!0},br={startsExpr:!0},Sr={};function Ar(e,t){return void 0===t&&(t={}),t.keyword=e,Sr[e]=new xr(e,t)}var Pr={num:new xr("num",br),regexp:new xr("regexp",br),string:new xr("string",br),name:new xr("name",br),eof:new xr("eof"),bracketL:new xr("[",{beforeExpr:!0,startsExpr:!0}),bracketR:new xr("]"),braceL:new xr("{",{beforeExpr:!0,startsExpr:!0}),braceR:new xr("}"),parenL:new xr("(",{beforeExpr:!0,startsExpr:!0}),parenR:new xr(")"),comma:new xr(",",vr),semi:new xr(";",vr),colon:new xr(":",vr),dot:new xr("."),question:new xr("?",vr),questionDot:new xr("?."),arrow:new xr("=>",vr),template:new xr("template"),invalidTemplate:new xr("invalidTemplate"),ellipsis:new xr("...",vr),backQuote:new xr("`",br),dollarBraceL:new xr("${",{beforeExpr:!0,startsExpr:!0}),eq:new xr("=",{beforeExpr:!0,isAssign:!0}),assign:new xr("_=",{beforeExpr:!0,isAssign:!0}),incDec:new xr("++/--",{prefix:!0,postfix:!0,startsExpr:!0}),prefix:new xr("!/~",{beforeExpr:!0,prefix:!0,startsExpr:!0}),logicalOR:Er("||",1),logicalAND:Er("&&",2),bitwiseOR:Er("|",3),bitwiseXOR:Er("^",4),bitwiseAND:Er("&",5),equality:Er("==/!=/===/!==",6),relational:Er("</>/<=/>=",7),bitShift:Er("<</>>/>>>",8),plusMin:new xr("+/-",{beforeExpr:!0,binop:9,prefix:!0,startsExpr:!0}),modulo:Er("%",10),star:Er("*",10),slash:Er("/",10),starstar:new xr("**",{beforeExpr:!0}),coalesce:Er("??",1),_break:Ar("break"),_case:Ar("case",vr),_catch:Ar("catch"),_continue:Ar("continue"),_debugger:Ar("debugger"),_default:Ar("default",vr),_do:Ar("do",{isLoop:!0,beforeExpr:!0}),_else:Ar("else",vr),_finally:Ar("finally"),_for:Ar("for",{isLoop:!0}),_function:Ar("function",br),_if:Ar("if"),_return:Ar("return",vr),_switch:Ar("switch"),_throw:Ar("throw",vr),_try:Ar("try"),_var:Ar("var"),_const:Ar("const"),_while:Ar("while",{isLoop:!0}),_with:Ar("with"),_new:Ar("new",{beforeExpr:!0,startsExpr:!0}),_this:Ar("this",br),_super:Ar("super",br),_class:Ar("class",br),_extends:Ar("extends",vr),_export:Ar("export"),_import:Ar("import",br),_null:Ar("null",br),_true:Ar("true",br),_false:Ar("false",br),_in:Ar("in",{beforeExpr:!0,binop:7}),_instanceof:Ar("instanceof",{beforeExpr:!0,binop:7}),_typeof:Ar("typeof",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_void:Ar("void",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_delete:Ar("delete",{beforeExpr:!0,prefix:!0,startsExpr:!0})},Cr=/\r\n?|\n|\u2028|\u2029/,wr=new RegExp(Cr.source,"g");function _r(e,t){return 10===e||13===e||!t&&(8232===e||8233===e)}var kr=/[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/,Nr=/(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g,Ir=Object.prototype,$r=Ir.hasOwnProperty,Mr=Ir.toString;function Tr(e,t){return $r.call(e,t)}var Rr=Array.isArray||function(e){return "[object Array]"===Mr.call(e)};function Lr(e){return new RegExp("^(?:"+e.replace(/ /g,"|")+")$")}var Or=function(e,t){this.line=e,this.column=t;};Or.prototype.offset=function(e){return new Or(this.line,this.column+e)};var Dr=function(e,t,s){this.start=t,this.end=s,null!==e.sourceFile&&(this.source=e.sourceFile);};function Vr(e,t){for(var s=1,i=0;;){wr.lastIndex=i;var n=wr.exec(e);if(!(n&&n.index<t))return new Or(s,t-i);++s,i=n.index+n[0].length;}}var Br={ecmaVersion:null,sourceType:"script",onInsertedSemicolon:null,onTrailingComma:null,allowReserved:null,allowReturnOutsideFunction:!1,allowImportExportEverywhere:!1,allowAwaitOutsideFunction:!1,allowHashBang:!1,locations:!1,onToken:null,onComment:null,ranges:!1,program:null,sourceFile:null,directSourceFile:null,preserveParens:!1},Fr=!1;function Wr(e){var t={};for(var s in Br)t[s]=e&&Tr(e,s)?e[s]:Br[s];if("latest"===t.ecmaVersion?t.ecmaVersion=1e8:null==t.ecmaVersion?(!Fr&&"object"==typeof console&&console.warn&&(Fr=!0,console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.")),t.ecmaVersion=11):t.ecmaVersion>=2015&&(t.ecmaVersion-=2009),null==t.allowReserved&&(t.allowReserved=t.ecmaVersion<5),Rr(t.onToken)){var i=t.onToken;t.onToken=function(e){return i.push(e)};}return Rr(t.onComment)&&(t.onComment=function(e,t){return function(s,i,n,r,a,o){var h={type:s?"Block":"Line",value:i,start:n,end:r};e.locations&&(h.loc=new Dr(this,a,o)),e.ranges&&(h.range=[n,r]),t.push(h);}}(t,t.onComment)),t}function Ur(e,t){return 2|(e?4:0)|(t?8:0)}var jr=function(e,t,s){this.options=e=Wr(e),this.sourceFile=e.sourceFile,this.keywords=Lr(or[e.ecmaVersion>=6?6:"module"===e.sourceType?"5module":5]);var i="";!0!==e.allowReserved&&(i=rr[e.ecmaVersion>=6?6:5===e.ecmaVersion?5:3],"module"===e.sourceType&&(i+=" await")),this.reservedWords=Lr(i);var n=(i?i+" ":"")+rr.strict;this.reservedWordsStrict=Lr(n),this.reservedWordsStrictBind=Lr(n+" "+rr.strictBind),this.input=String(t),this.containsEsc=!1,s?(this.pos=s,this.lineStart=this.input.lastIndexOf("\n",s-1)+1,this.curLine=this.input.slice(0,this.lineStart).split(Cr).length):(this.pos=this.lineStart=0,this.curLine=1),this.type=Pr.eof,this.value=null,this.start=this.end=this.pos,this.startLoc=this.endLoc=this.curPosition(),this.lastTokEndLoc=this.lastTokStartLoc=null,this.lastTokStart=this.lastTokEnd=this.pos,this.context=this.initialContext(),this.exprAllowed=!0,this.inModule="module"===e.sourceType,this.strict=this.inModule||this.strictDirective(this.pos),this.potentialArrowAt=-1,this.yieldPos=this.awaitPos=this.awaitIdentPos=0,this.labels=[],this.undefinedExports=Object.create(null),0===this.pos&&e.allowHashBang&&"#!"===this.input.slice(0,2)&&this.skipLineComment(2),this.scopeStack=[],this.enterScope(1),this.regexpState=null;},zr={inFunction:{configurable:!0},inGenerator:{configurable:!0},inAsync:{configurable:!0},allowSuper:{configurable:!0},allowDirectSuper:{configurable:!0},treatFunctionsAsVar:{configurable:!0},inNonArrowFunction:{configurable:!0}};jr.prototype.parse=function(){var e=this.options.program||this.startNode();return this.nextToken(),this.parseTopLevel(e)},zr.inFunction.get=function(){return (2&this.currentVarScope().flags)>0},zr.inGenerator.get=function(){return (8&this.currentVarScope().flags)>0},zr.inAsync.get=function(){return (4&this.currentVarScope().flags)>0},zr.allowSuper.get=function(){return (64&this.currentThisScope().flags)>0},zr.allowDirectSuper.get=function(){return (128&this.currentThisScope().flags)>0},zr.treatFunctionsAsVar.get=function(){return this.treatFunctionsAsVarInScope(this.currentScope())},zr.inNonArrowFunction.get=function(){return (2&this.currentThisScope().flags)>0},jr.extend=function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];for(var s=this,i=0;i<e.length;i++)s=e[i](s);return s},jr.parse=function(e,t){return new this(t,e).parse()},jr.parseExpressionAt=function(e,t,s){var i=new this(s,e,t);return i.nextToken(),i.parseExpression()},jr.tokenizer=function(e,t){return new this(t,e)},Object.defineProperties(jr.prototype,zr);var Gr=jr.prototype,Hr=/^(?:'((?:\\.|[^'\\])*?)'|"((?:\\.|[^"\\])*?)")/;function qr(){this.shorthandAssign=this.trailingComma=this.parenthesizedAssign=this.parenthesizedBind=this.doubleProto=-1;}Gr.strictDirective=function(e){for(;;){Nr.lastIndex=e,e+=Nr.exec(this.input)[0].length;var t=Hr.exec(this.input.slice(e));if(!t)return !1;if("use strict"===(t[1]||t[2])){Nr.lastIndex=e+t[0].length;var s=Nr.exec(this.input),i=s.index+s[0].length,n=this.input.charAt(i);return ";"===n||"}"===n||Cr.test(s[0])&&!(/[(`.[+\-/*%<>=,?^&]/.test(n)||"!"===n&&"="===this.input.charAt(i+1))}e+=t[0].length,Nr.lastIndex=e,e+=Nr.exec(this.input)[0].length,";"===this.input[e]&&e++;}},Gr.eat=function(e){return this.type===e&&(this.next(),!0)},Gr.isContextual=function(e){return this.type===Pr.name&&this.value===e&&!this.containsEsc},Gr.eatContextual=function(e){return !!this.isContextual(e)&&(this.next(),!0)},Gr.expectContextual=function(e){this.eatContextual(e)||this.unexpected();},Gr.canInsertSemicolon=function(){return this.type===Pr.eof||this.type===Pr.braceR||Cr.test(this.input.slice(this.lastTokEnd,this.start))},Gr.insertSemicolon=function(){if(this.canInsertSemicolon())return this.options.onInsertedSemicolon&&this.options.onInsertedSemicolon(this.lastTokEnd,this.lastTokEndLoc),!0},Gr.semicolon=function(){this.eat(Pr.semi)||this.insertSemicolon()||this.unexpected();},Gr.afterTrailingComma=function(e,t){if(this.type===e)return this.options.onTrailingComma&&this.options.onTrailingComma(this.lastTokStart,this.lastTokStartLoc),t||this.next(),!0},Gr.expect=function(e){this.eat(e)||this.unexpected();},Gr.unexpected=function(e){this.raise(null!=e?e:this.start,"Unexpected token");},Gr.checkPatternErrors=function(e,t){if(e){e.trailingComma>-1&&this.raiseRecoverable(e.trailingComma,"Comma is not permitted after the rest element");var s=t?e.parenthesizedAssign:e.parenthesizedBind;s>-1&&this.raiseRecoverable(s,"Parenthesized pattern");}},Gr.checkExpressionErrors=function(e,t){if(!e)return !1;var s=e.shorthandAssign,i=e.doubleProto;if(!t)return s>=0||i>=0;s>=0&&this.raise(s,"Shorthand property assignments are valid only in destructuring patterns"),i>=0&&this.raiseRecoverable(i,"Redefinition of __proto__ property");},Gr.checkYieldAwaitInDefaultParams=function(){this.yieldPos&&(!this.awaitPos||this.yieldPos<this.awaitPos)&&this.raise(this.yieldPos,"Yield expression cannot be a default value"),this.awaitPos&&this.raise(this.awaitPos,"Await expression cannot be a default value");},Gr.isSimpleAssignTarget=function(e){return "ParenthesizedExpression"===e.type?this.isSimpleAssignTarget(e.expression):"Identifier"===e.type||"MemberExpression"===e.type};var Kr=jr.prototype;Kr.parseTopLevel=function(e){var t=Object.create(null);for(e.body||(e.body=[]);this.type!==Pr.eof;){var s=this.parseStatement(null,!0,t);e.body.push(s);}if(this.inModule)for(var i=0,n=Object.keys(this.undefinedExports);i<n.length;i+=1){var r=n[i];this.raiseRecoverable(this.undefinedExports[r].start,"Export '"+r+"' is not defined");}return this.adaptDirectivePrologue(e.body),this.next(),e.sourceType=this.options.sourceType,this.finishNode(e,"Program")};var Xr={kind:"loop"},Yr={kind:"switch"};Kr.isLet=function(e){if(this.options.ecmaVersion<6||!this.isContextual("let"))return !1;Nr.lastIndex=this.pos;var t=Nr.exec(this.input),s=this.pos+t[0].length,i=this.input.charCodeAt(s);if(91===i)return !0;if(e)return !1;if(123===i)return !0;if(gr(i,!0)){for(var n=s+1;yr(this.input.charCodeAt(n),!0);)++n;var r=this.input.slice(s,n);if(!hr.test(r))return !0}return !1},Kr.isAsyncFunction=function(){if(this.options.ecmaVersion<8||!this.isContextual("async"))return !1;Nr.lastIndex=this.pos;var e=Nr.exec(this.input),t=this.pos+e[0].length;return !(Cr.test(this.input.slice(this.pos,t))||"function"!==this.input.slice(t,t+8)||t+8!==this.input.length&&yr(this.input.charAt(t+8)))},Kr.parseStatement=function(e,t,s){var i,n=this.type,r=this.startNode();switch(this.isLet(e)&&(n=Pr._var,i="let"),n){case Pr._break:case Pr._continue:return this.parseBreakContinueStatement(r,n.keyword);case Pr._debugger:return this.parseDebuggerStatement(r);case Pr._do:return this.parseDoStatement(r);case Pr._for:return this.parseForStatement(r);case Pr._function:return e&&(this.strict||"if"!==e&&"label"!==e)&&this.options.ecmaVersion>=6&&this.unexpected(),this.parseFunctionStatement(r,!1,!e);case Pr._class:return e&&this.unexpected(),this.parseClass(r,!0);case Pr._if:return this.parseIfStatement(r);case Pr._return:return this.parseReturnStatement(r);case Pr._switch:return this.parseSwitchStatement(r);case Pr._throw:return this.parseThrowStatement(r);case Pr._try:return this.parseTryStatement(r);case Pr._const:case Pr._var:return i=i||this.value,e&&"var"!==i&&this.unexpected(),this.parseVarStatement(r,i);case Pr._while:return this.parseWhileStatement(r);case Pr._with:return this.parseWithStatement(r);case Pr.braceL:return this.parseBlock(!0,r);case Pr.semi:return this.parseEmptyStatement(r);case Pr._export:case Pr._import:if(this.options.ecmaVersion>10&&n===Pr._import){Nr.lastIndex=this.pos;var a=Nr.exec(this.input),o=this.pos+a[0].length,h=this.input.charCodeAt(o);if(40===h||46===h)return this.parseExpressionStatement(r,this.parseExpression())}return this.options.allowImportExportEverywhere||(t||this.raise(this.start,"'import' and 'export' may only appear at the top level"),this.inModule||this.raise(this.start,"'import' and 'export' may appear only with 'sourceType: module'")),n===Pr._import?this.parseImport(r):this.parseExport(r,s);default:if(this.isAsyncFunction())return e&&this.unexpected(),this.next(),this.parseFunctionStatement(r,!0,!e);var l=this.value,c=this.parseExpression();return n===Pr.name&&"Identifier"===c.type&&this.eat(Pr.colon)?this.parseLabeledStatement(r,l,c,e):this.parseExpressionStatement(r,c)}},Kr.parseBreakContinueStatement=function(e,t){var s="break"===t;this.next(),this.eat(Pr.semi)||this.insertSemicolon()?e.label=null:this.type!==Pr.name?this.unexpected():(e.label=this.parseIdent(),this.semicolon());for(var i=0;i<this.labels.length;++i){var n=this.labels[i];if(null==e.label||n.name===e.label.name){if(null!=n.kind&&(s||"loop"===n.kind))break;if(e.label&&s)break}}return i===this.labels.length&&this.raise(e.start,"Unsyntactic "+t),this.finishNode(e,s?"BreakStatement":"ContinueStatement")},Kr.parseDebuggerStatement=function(e){return this.next(),this.semicolon(),this.finishNode(e,"DebuggerStatement")},Kr.parseDoStatement=function(e){return this.next(),this.labels.push(Xr),e.body=this.parseStatement("do"),this.labels.pop(),this.expect(Pr._while),e.test=this.parseParenExpression(),this.options.ecmaVersion>=6?this.eat(Pr.semi):this.semicolon(),this.finishNode(e,"DoWhileStatement")},Kr.parseForStatement=function(e){this.next();var t=this.options.ecmaVersion>=9&&(this.inAsync||!this.inFunction&&this.options.allowAwaitOutsideFunction)&&this.eatContextual("await")?this.lastTokStart:-1;if(this.labels.push(Xr),this.enterScope(0),this.expect(Pr.parenL),this.type===Pr.semi)return t>-1&&this.unexpected(t),this.parseFor(e,null);var s=this.isLet();if(this.type===Pr._var||this.type===Pr._const||s){var i=this.startNode(),n=s?"let":this.value;return this.next(),this.parseVar(i,!0,n),this.finishNode(i,"VariableDeclaration"),(this.type===Pr._in||this.options.ecmaVersion>=6&&this.isContextual("of"))&&1===i.declarations.length?(this.options.ecmaVersion>=9&&(this.type===Pr._in?t>-1&&this.unexpected(t):e.await=t>-1),this.parseForIn(e,i)):(t>-1&&this.unexpected(t),this.parseFor(e,i))}var r=new qr,a=this.parseExpression(!0,r);return this.type===Pr._in||this.options.ecmaVersion>=6&&this.isContextual("of")?(this.options.ecmaVersion>=9&&(this.type===Pr._in?t>-1&&this.unexpected(t):e.await=t>-1),this.toAssignable(a,!1,r),this.checkLValPattern(a),this.parseForIn(e,a)):(this.checkExpressionErrors(r,!0),t>-1&&this.unexpected(t),this.parseFor(e,a))},Kr.parseFunctionStatement=function(e,t,s){return this.next(),this.parseFunction(e,Jr|(s?0:Zr),!1,t)},Kr.parseIfStatement=function(e){return this.next(),e.test=this.parseParenExpression(),e.consequent=this.parseStatement("if"),e.alternate=this.eat(Pr._else)?this.parseStatement("if"):null,this.finishNode(e,"IfStatement")},Kr.parseReturnStatement=function(e){return this.inFunction||this.options.allowReturnOutsideFunction||this.raise(this.start,"'return' outside of function"),this.next(),this.eat(Pr.semi)||this.insertSemicolon()?e.argument=null:(e.argument=this.parseExpression(),this.semicolon()),this.finishNode(e,"ReturnStatement")},Kr.parseSwitchStatement=function(e){var t;this.next(),e.discriminant=this.parseParenExpression(),e.cases=[],this.expect(Pr.braceL),this.labels.push(Yr),this.enterScope(0);for(var s=!1;this.type!==Pr.braceR;)if(this.type===Pr._case||this.type===Pr._default){var i=this.type===Pr._case;t&&this.finishNode(t,"SwitchCase"),e.cases.push(t=this.startNode()),t.consequent=[],this.next(),i?t.test=this.parseExpression():(s&&this.raiseRecoverable(this.lastTokStart,"Multiple default clauses"),s=!0,t.test=null),this.expect(Pr.colon);}else t||this.unexpected(),t.consequent.push(this.parseStatement(null));return this.exitScope(),t&&this.finishNode(t,"SwitchCase"),this.next(),this.labels.pop(),this.finishNode(e,"SwitchStatement")},Kr.parseThrowStatement=function(e){return this.next(),Cr.test(this.input.slice(this.lastTokEnd,this.start))&&this.raise(this.lastTokEnd,"Illegal newline after throw"),e.argument=this.parseExpression(),this.semicolon(),this.finishNode(e,"ThrowStatement")};var Qr=[];Kr.parseTryStatement=function(e){if(this.next(),e.block=this.parseBlock(),e.handler=null,this.type===Pr._catch){var t=this.startNode();if(this.next(),this.eat(Pr.parenL)){t.param=this.parseBindingAtom();var s="Identifier"===t.param.type;this.enterScope(s?32:0),this.checkLValPattern(t.param,s?4:2),this.expect(Pr.parenR);}else this.options.ecmaVersion<10&&this.unexpected(),t.param=null,this.enterScope(0);t.body=this.parseBlock(!1),this.exitScope(),e.handler=this.finishNode(t,"CatchClause");}return e.finalizer=this.eat(Pr._finally)?this.parseBlock():null,e.handler||e.finalizer||this.raise(e.start,"Missing catch or finally clause"),this.finishNode(e,"TryStatement")},Kr.parseVarStatement=function(e,t){return this.next(),this.parseVar(e,!1,t),this.semicolon(),this.finishNode(e,"VariableDeclaration")},Kr.parseWhileStatement=function(e){return this.next(),e.test=this.parseParenExpression(),this.labels.push(Xr),e.body=this.parseStatement("while"),this.labels.pop(),this.finishNode(e,"WhileStatement")},Kr.parseWithStatement=function(e){return this.strict&&this.raise(this.start,"'with' in strict mode"),this.next(),e.object=this.parseParenExpression(),e.body=this.parseStatement("with"),this.finishNode(e,"WithStatement")},Kr.parseEmptyStatement=function(e){return this.next(),this.finishNode(e,"EmptyStatement")},Kr.parseLabeledStatement=function(e,t,s,i){for(var n=0,r=this.labels;n<r.length;n+=1){r[n].name===t&&this.raise(s.start,"Label '"+t+"' is already declared");}for(var a=this.type.isLoop?"loop":this.type===Pr._switch?"switch":null,o=this.labels.length-1;o>=0;o--){var h=this.labels[o];if(h.statementStart!==e.start)break;h.statementStart=this.start,h.kind=a;}return this.labels.push({name:t,kind:a,statementStart:this.start}),e.body=this.parseStatement(i?-1===i.indexOf("label")?i+"label":i:"label"),this.labels.pop(),e.label=s,this.finishNode(e,"LabeledStatement")},Kr.parseExpressionStatement=function(e,t){return e.expression=t,this.semicolon(),this.finishNode(e,"ExpressionStatement")},Kr.parseBlock=function(e,t,s){for(void 0===e&&(e=!0),void 0===t&&(t=this.startNode()),t.body=[],this.expect(Pr.braceL),e&&this.enterScope(0);this.type!==Pr.braceR;){var i=this.parseStatement(null);t.body.push(i);}return s&&(this.strict=!1),this.next(),e&&this.exitScope(),this.finishNode(t,"BlockStatement")},Kr.parseFor=function(e,t){return e.init=t,this.expect(Pr.semi),e.test=this.type===Pr.semi?null:this.parseExpression(),this.expect(Pr.semi),e.update=this.type===Pr.parenR?null:this.parseExpression(),this.expect(Pr.parenR),e.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(e,"ForStatement")},Kr.parseForIn=function(e,t){var s=this.type===Pr._in;return this.next(),"VariableDeclaration"===t.type&&null!=t.declarations[0].init&&(!s||this.options.ecmaVersion<8||this.strict||"var"!==t.kind||"Identifier"!==t.declarations[0].id.type)&&this.raise(t.start,(s?"for-in":"for-of")+" loop variable declaration may not have an initializer"),e.left=t,e.right=s?this.parseExpression():this.parseMaybeAssign(),this.expect(Pr.parenR),e.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(e,s?"ForInStatement":"ForOfStatement")},Kr.parseVar=function(e,t,s){for(e.declarations=[],e.kind=s;;){var i=this.startNode();if(this.parseVarId(i,s),this.eat(Pr.eq)?i.init=this.parseMaybeAssign(t):"const"!==s||this.type===Pr._in||this.options.ecmaVersion>=6&&this.isContextual("of")?"Identifier"===i.id.type||t&&(this.type===Pr._in||this.isContextual("of"))?i.init=null:this.raise(this.lastTokEnd,"Complex binding patterns require an initialization value"):this.unexpected(),e.declarations.push(this.finishNode(i,"VariableDeclarator")),!this.eat(Pr.comma))break}return e},Kr.parseVarId=function(e,t){e.id=this.parseBindingAtom(),this.checkLValPattern(e.id,"var"===t?1:2,!1);};var Jr=1,Zr=2;Kr.parseFunction=function(e,t,s,i){this.initFunction(e),(this.options.ecmaVersion>=9||this.options.ecmaVersion>=6&&!i)&&(this.type===Pr.star&&t&Zr&&this.unexpected(),e.generator=this.eat(Pr.star)),this.options.ecmaVersion>=8&&(e.async=!!i),t&Jr&&(e.id=4&t&&this.type!==Pr.name?null:this.parseIdent(),!e.id||t&Zr||this.checkLValSimple(e.id,this.strict||e.generator||e.async?this.treatFunctionsAsVar?1:2:3));var n=this.yieldPos,r=this.awaitPos,a=this.awaitIdentPos;return this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(Ur(e.async,e.generator)),t&Jr||(e.id=this.type===Pr.name?this.parseIdent():null),this.parseFunctionParams(e),this.parseFunctionBody(e,s,!1),this.yieldPos=n,this.awaitPos=r,this.awaitIdentPos=a,this.finishNode(e,t&Jr?"FunctionDeclaration":"FunctionExpression")},Kr.parseFunctionParams=function(e){this.expect(Pr.parenL),e.params=this.parseBindingList(Pr.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams();},Kr.parseClass=function(e,t){this.next();var s=this.strict;this.strict=!0,this.parseClassId(e,t),this.parseClassSuper(e);var i=this.startNode(),n=!1;for(i.body=[],this.expect(Pr.braceL);this.type!==Pr.braceR;){var r=this.parseClassElement(null!==e.superClass);r&&(i.body.push(r),"MethodDefinition"===r.type&&"constructor"===r.kind&&(n&&this.raise(r.start,"Duplicate constructor in the same class"),n=!0));}return this.strict=s,this.next(),e.body=this.finishNode(i,"ClassBody"),this.finishNode(e,t?"ClassDeclaration":"ClassExpression")},Kr.parseClassElement=function(e){var t=this;if(this.eat(Pr.semi))return null;var s=this.startNode(),i=function(e,i){void 0===i&&(i=!1);var n=t.start,r=t.startLoc;return !!t.eatContextual(e)&&(!(t.type===Pr.parenL||i&&t.canInsertSemicolon())||(s.key&&t.unexpected(),s.computed=!1,s.key=t.startNodeAt(n,r),s.key.name=e,t.finishNode(s.key,"Identifier"),!1))};s.kind="method",s.static=i("static");var n=this.eat(Pr.star),r=!1;n||(this.options.ecmaVersion>=8&&i("async",!0)?(r=!0,n=this.options.ecmaVersion>=9&&this.eat(Pr.star)):i("get")?s.kind="get":i("set")&&(s.kind="set")),s.key||this.parsePropertyName(s);var a=s.key,o=!1;return s.computed||s.static||!("Identifier"===a.type&&"constructor"===a.name||"Literal"===a.type&&"constructor"===a.value)?s.static&&"Identifier"===a.type&&"prototype"===a.name&&this.raise(a.start,"Classes may not have a static property named prototype"):("method"!==s.kind&&this.raise(a.start,"Constructor can't have get/set modifier"),n&&this.raise(a.start,"Constructor can't be a generator"),r&&this.raise(a.start,"Constructor can't be an async method"),s.kind="constructor",o=e),this.parseClassMethod(s,n,r,o),"get"===s.kind&&0!==s.value.params.length&&this.raiseRecoverable(s.value.start,"getter should have no params"),"set"===s.kind&&1!==s.value.params.length&&this.raiseRecoverable(s.value.start,"setter should have exactly one param"),"set"===s.kind&&"RestElement"===s.value.params[0].type&&this.raiseRecoverable(s.value.params[0].start,"Setter cannot use rest params"),s},Kr.parseClassMethod=function(e,t,s,i){return e.value=this.parseMethod(t,s,i),this.finishNode(e,"MethodDefinition")},Kr.parseClassId=function(e,t){this.type===Pr.name?(e.id=this.parseIdent(),t&&this.checkLValSimple(e.id,2,!1)):(!0===t&&this.unexpected(),e.id=null);},Kr.parseClassSuper=function(e){e.superClass=this.eat(Pr._extends)?this.parseExprSubscripts():null;},Kr.parseExport=function(e,t){if(this.next(),this.eat(Pr.star))return this.options.ecmaVersion>=11&&(this.eatContextual("as")?(e.exported=this.parseIdent(!0),this.checkExport(t,e.exported.name,this.lastTokStart)):e.exported=null),this.expectContextual("from"),this.type!==Pr.string&&this.unexpected(),e.source=this.parseExprAtom(),this.semicolon(),this.finishNode(e,"ExportAllDeclaration");if(this.eat(Pr._default)){var s;if(this.checkExport(t,"default",this.lastTokStart),this.type===Pr._function||(s=this.isAsyncFunction())){var i=this.startNode();this.next(),s&&this.next(),e.declaration=this.parseFunction(i,4|Jr,!1,s);}else if(this.type===Pr._class){var n=this.startNode();e.declaration=this.parseClass(n,"nullableID");}else e.declaration=this.parseMaybeAssign(),this.semicolon();return this.finishNode(e,"ExportDefaultDeclaration")}if(this.shouldParseExportStatement())e.declaration=this.parseStatement(null),"VariableDeclaration"===e.declaration.type?this.checkVariableExport(t,e.declaration.declarations):this.checkExport(t,e.declaration.id.name,e.declaration.id.start),e.specifiers=[],e.source=null;else {if(e.declaration=null,e.specifiers=this.parseExportSpecifiers(t),this.eatContextual("from"))this.type!==Pr.string&&this.unexpected(),e.source=this.parseExprAtom();else {for(var r=0,a=e.specifiers;r<a.length;r+=1){var o=a[r];this.checkUnreserved(o.local),this.checkLocalExport(o.local);}e.source=null;}this.semicolon();}return this.finishNode(e,"ExportNamedDeclaration")},Kr.checkExport=function(e,t,s){e&&(Tr(e,t)&&this.raiseRecoverable(s,"Duplicate export '"+t+"'"),e[t]=!0);},Kr.checkPatternExport=function(e,t){var s=t.type;if("Identifier"===s)this.checkExport(e,t.name,t.start);else if("ObjectPattern"===s)for(var i=0,n=t.properties;i<n.length;i+=1){var r=n[i];this.checkPatternExport(e,r);}else if("ArrayPattern"===s)for(var a=0,o=t.elements;a<o.length;a+=1){var h=o[a];h&&this.checkPatternExport(e,h);}else "Property"===s?this.checkPatternExport(e,t.value):"AssignmentPattern"===s?this.checkPatternExport(e,t.left):"RestElement"===s?this.checkPatternExport(e,t.argument):"ParenthesizedExpression"===s&&this.checkPatternExport(e,t.expression);},Kr.checkVariableExport=function(e,t){if(e)for(var s=0,i=t;s<i.length;s+=1){var n=i[s];this.checkPatternExport(e,n.id);}},Kr.shouldParseExportStatement=function(){return "var"===this.type.keyword||"const"===this.type.keyword||"class"===this.type.keyword||"function"===this.type.keyword||this.isLet()||this.isAsyncFunction()},Kr.parseExportSpecifiers=function(e){var t=[],s=!0;for(this.expect(Pr.braceL);!this.eat(Pr.braceR);){if(s)s=!1;else if(this.expect(Pr.comma),this.afterTrailingComma(Pr.braceR))break;var i=this.startNode();i.local=this.parseIdent(!0),i.exported=this.eatContextual("as")?this.parseIdent(!0):i.local,this.checkExport(e,i.exported.name,i.exported.start),t.push(this.finishNode(i,"ExportSpecifier"));}return t},Kr.parseImport=function(e){return this.next(),this.type===Pr.string?(e.specifiers=Qr,e.source=this.parseExprAtom()):(e.specifiers=this.parseImportSpecifiers(),this.expectContextual("from"),e.source=this.type===Pr.string?this.parseExprAtom():this.unexpected()),this.semicolon(),this.finishNode(e,"ImportDeclaration")},Kr.parseImportSpecifiers=function(){var e=[],t=!0;if(this.type===Pr.name){var s=this.startNode();if(s.local=this.parseIdent(),this.checkLValSimple(s.local,2),e.push(this.finishNode(s,"ImportDefaultSpecifier")),!this.eat(Pr.comma))return e}if(this.type===Pr.star){var i=this.startNode();return this.next(),this.expectContextual("as"),i.local=this.parseIdent(),this.checkLValSimple(i.local,2),e.push(this.finishNode(i,"ImportNamespaceSpecifier")),e}for(this.expect(Pr.braceL);!this.eat(Pr.braceR);){if(t)t=!1;else if(this.expect(Pr.comma),this.afterTrailingComma(Pr.braceR))break;var n=this.startNode();n.imported=this.parseIdent(!0),this.eatContextual("as")?n.local=this.parseIdent():(this.checkUnreserved(n.imported),n.local=n.imported),this.checkLValSimple(n.local,2),e.push(this.finishNode(n,"ImportSpecifier"));}return e},Kr.adaptDirectivePrologue=function(e){for(var t=0;t<e.length&&this.isDirectiveCandidate(e[t]);++t)e[t].directive=e[t].expression.raw.slice(1,-1);},Kr.isDirectiveCandidate=function(e){return "ExpressionStatement"===e.type&&"Literal"===e.expression.type&&"string"==typeof e.expression.value&&('"'===this.input[e.start]||"'"===this.input[e.start])};var ea=jr.prototype;ea.toAssignable=function(e,t,s){if(this.options.ecmaVersion>=6&&e)switch(e.type){case"Identifier":this.inAsync&&"await"===e.name&&this.raise(e.start,"Cannot use 'await' as identifier inside an async function");break;case"ObjectPattern":case"ArrayPattern":case"AssignmentPattern":case"RestElement":break;case"ObjectExpression":e.type="ObjectPattern",s&&this.checkPatternErrors(s,!0);for(var i=0,n=e.properties;i<n.length;i+=1){var r=n[i];this.toAssignable(r,t),"RestElement"!==r.type||"ArrayPattern"!==r.argument.type&&"ObjectPattern"!==r.argument.type||this.raise(r.argument.start,"Unexpected token");}break;case"Property":"init"!==e.kind&&this.raise(e.key.start,"Object pattern can't contain getter or setter"),this.toAssignable(e.value,t);break;case"ArrayExpression":e.type="ArrayPattern",s&&this.checkPatternErrors(s,!0),this.toAssignableList(e.elements,t);break;case"SpreadElement":e.type="RestElement",this.toAssignable(e.argument,t),"AssignmentPattern"===e.argument.type&&this.raise(e.argument.start,"Rest elements cannot have a default value");break;case"AssignmentExpression":"="!==e.operator&&this.raise(e.left.end,"Only '=' operator can be used for specifying default value."),e.type="AssignmentPattern",delete e.operator,this.toAssignable(e.left,t);break;case"ParenthesizedExpression":this.toAssignable(e.expression,t,s);break;case"ChainExpression":this.raiseRecoverable(e.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":if(!t)break;default:this.raise(e.start,"Assigning to rvalue");}else s&&this.checkPatternErrors(s,!0);return e},ea.toAssignableList=function(e,t){for(var s=e.length,i=0;i<s;i++){var n=e[i];n&&this.toAssignable(n,t);}if(s){var r=e[s-1];6===this.options.ecmaVersion&&t&&r&&"RestElement"===r.type&&"Identifier"!==r.argument.type&&this.unexpected(r.argument.start);}return e},ea.parseSpread=function(e){var t=this.startNode();return this.next(),t.argument=this.parseMaybeAssign(!1,e),this.finishNode(t,"SpreadElement")},ea.parseRestBinding=function(){var e=this.startNode();return this.next(),6===this.options.ecmaVersion&&this.type!==Pr.name&&this.unexpected(),e.argument=this.parseBindingAtom(),this.finishNode(e,"RestElement")},ea.parseBindingAtom=function(){if(this.options.ecmaVersion>=6)switch(this.type){case Pr.bracketL:var e=this.startNode();return this.next(),e.elements=this.parseBindingList(Pr.bracketR,!0,!0),this.finishNode(e,"ArrayPattern");case Pr.braceL:return this.parseObj(!0)}return this.parseIdent()},ea.parseBindingList=function(e,t,s){for(var i=[],n=!0;!this.eat(e);)if(n?n=!1:this.expect(Pr.comma),t&&this.type===Pr.comma)i.push(null);else {if(s&&this.afterTrailingComma(e))break;if(this.type===Pr.ellipsis){var r=this.parseRestBinding();this.parseBindingListItem(r),i.push(r),this.type===Pr.comma&&this.raise(this.start,"Comma is not permitted after the rest element"),this.expect(e);break}var a=this.parseMaybeDefault(this.start,this.startLoc);this.parseBindingListItem(a),i.push(a);}return i},ea.parseBindingListItem=function(e){return e},ea.parseMaybeDefault=function(e,t,s){if(s=s||this.parseBindingAtom(),this.options.ecmaVersion<6||!this.eat(Pr.eq))return s;var i=this.startNodeAt(e,t);return i.left=s,i.right=this.parseMaybeAssign(),this.finishNode(i,"AssignmentPattern")},ea.checkLValSimple=function(e,t,s){void 0===t&&(t=0);var i=0!==t;switch(e.type){case"Identifier":this.strict&&this.reservedWordsStrictBind.test(e.name)&&this.raiseRecoverable(e.start,(i?"Binding ":"Assigning to ")+e.name+" in strict mode"),i&&(2===t&&"let"===e.name&&this.raiseRecoverable(e.start,"let is disallowed as a lexically bound name"),s&&(Tr(s,e.name)&&this.raiseRecoverable(e.start,"Argument name clash"),s[e.name]=!0),5!==t&&this.declareName(e.name,t,e.start));break;case"ChainExpression":this.raiseRecoverable(e.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":i&&this.raiseRecoverable(e.start,"Binding member expression");break;case"ParenthesizedExpression":return i&&this.raiseRecoverable(e.start,"Binding parenthesized expression"),this.checkLValSimple(e.expression,t,s);default:this.raise(e.start,(i?"Binding":"Assigning to")+" rvalue");}},ea.checkLValPattern=function(e,t,s){switch(void 0===t&&(t=0),e.type){case"ObjectPattern":for(var i=0,n=e.properties;i<n.length;i+=1){var r=n[i];this.checkLValInnerPattern(r,t,s);}break;case"ArrayPattern":for(var a=0,o=e.elements;a<o.length;a+=1){var h=o[a];h&&this.checkLValInnerPattern(h,t,s);}break;default:this.checkLValSimple(e,t,s);}},ea.checkLValInnerPattern=function(e,t,s){switch(void 0===t&&(t=0),e.type){case"Property":this.checkLValInnerPattern(e.value,t,s);break;case"AssignmentPattern":this.checkLValPattern(e.left,t,s);break;case"RestElement":this.checkLValPattern(e.argument,t,s);break;default:this.checkLValPattern(e,t,s);}};var ta=jr.prototype;ta.checkPropClash=function(e,t,s){if(!(this.options.ecmaVersion>=9&&"SpreadElement"===e.type||this.options.ecmaVersion>=6&&(e.computed||e.method||e.shorthand))){var i,n=e.key;switch(n.type){case"Identifier":i=n.name;break;case"Literal":i=String(n.value);break;default:return}var r=e.kind;if(this.options.ecmaVersion>=6)"__proto__"===i&&"init"===r&&(t.proto&&(s?s.doubleProto<0&&(s.doubleProto=n.start):this.raiseRecoverable(n.start,"Redefinition of __proto__ property")),t.proto=!0);else {var a=t[i="$"+i];if(a)("init"===r?this.strict&&a.init||a.get||a.set:a.init||a[r])&&this.raiseRecoverable(n.start,"Redefinition of property");else a=t[i]={init:!1,get:!1,set:!1};a[r]=!0;}}},ta.parseExpression=function(e,t){var s=this.start,i=this.startLoc,n=this.parseMaybeAssign(e,t);if(this.type===Pr.comma){var r=this.startNodeAt(s,i);for(r.expressions=[n];this.eat(Pr.comma);)r.expressions.push(this.parseMaybeAssign(e,t));return this.finishNode(r,"SequenceExpression")}return n},ta.parseMaybeAssign=function(e,t,s){if(this.isContextual("yield")){if(this.inGenerator)return this.parseYield(e);this.exprAllowed=!1;}var i=!1,n=-1,r=-1;t?(n=t.parenthesizedAssign,r=t.trailingComma,t.parenthesizedAssign=t.trailingComma=-1):(t=new qr,i=!0);var a=this.start,o=this.startLoc;this.type!==Pr.parenL&&this.type!==Pr.name||(this.potentialArrowAt=this.start);var h=this.parseMaybeConditional(e,t);if(s&&(h=s.call(this,h,a,o)),this.type.isAssign){var l=this.startNodeAt(a,o);return l.operator=this.value,this.type===Pr.eq&&(h=this.toAssignable(h,!1,t)),i||(t.parenthesizedAssign=t.trailingComma=t.doubleProto=-1),t.shorthandAssign>=h.start&&(t.shorthandAssign=-1),this.type===Pr.eq?this.checkLValPattern(h):this.checkLValSimple(h),l.left=h,this.next(),l.right=this.parseMaybeAssign(e),this.finishNode(l,"AssignmentExpression")}return i&&this.checkExpressionErrors(t,!0),n>-1&&(t.parenthesizedAssign=n),r>-1&&(t.trailingComma=r),h},ta.parseMaybeConditional=function(e,t){var s=this.start,i=this.startLoc,n=this.parseExprOps(e,t);if(this.checkExpressionErrors(t))return n;if(this.eat(Pr.question)){var r=this.startNodeAt(s,i);return r.test=n,r.consequent=this.parseMaybeAssign(),this.expect(Pr.colon),r.alternate=this.parseMaybeAssign(e),this.finishNode(r,"ConditionalExpression")}return n},ta.parseExprOps=function(e,t){var s=this.start,i=this.startLoc,n=this.parseMaybeUnary(t,!1);return this.checkExpressionErrors(t)||n.start===s&&"ArrowFunctionExpression"===n.type?n:this.parseExprOp(n,s,i,-1,e)},ta.parseExprOp=function(e,t,s,i,n){var r=this.type.binop;if(null!=r&&(!n||this.type!==Pr._in)&&r>i){var a=this.type===Pr.logicalOR||this.type===Pr.logicalAND,o=this.type===Pr.coalesce;o&&(r=Pr.logicalAND.binop);var h=this.value;this.next();var l=this.start,c=this.startLoc,u=this.parseExprOp(this.parseMaybeUnary(null,!1),l,c,r,n),d=this.buildBinary(t,s,e,u,h,a||o);return (a&&this.type===Pr.coalesce||o&&(this.type===Pr.logicalOR||this.type===Pr.logicalAND))&&this.raiseRecoverable(this.start,"Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses"),this.parseExprOp(d,t,s,i,n)}return e},ta.buildBinary=function(e,t,s,i,n,r){var a=this.startNodeAt(e,t);return a.left=s,a.operator=n,a.right=i,this.finishNode(a,r?"LogicalExpression":"BinaryExpression")},ta.parseMaybeUnary=function(e,t){var s,i=this.start,n=this.startLoc;if(this.isContextual("await")&&(this.inAsync||!this.inFunction&&this.options.allowAwaitOutsideFunction))s=this.parseAwait(),t=!0;else if(this.type.prefix){var r=this.startNode(),a=this.type===Pr.incDec;r.operator=this.value,r.prefix=!0,this.next(),r.argument=this.parseMaybeUnary(null,!0),this.checkExpressionErrors(e,!0),a?this.checkLValSimple(r.argument):this.strict&&"delete"===r.operator&&"Identifier"===r.argument.type?this.raiseRecoverable(r.start,"Deleting local variable in strict mode"):t=!0,s=this.finishNode(r,a?"UpdateExpression":"UnaryExpression");}else {if(s=this.parseExprSubscripts(e),this.checkExpressionErrors(e))return s;for(;this.type.postfix&&!this.canInsertSemicolon();){var o=this.startNodeAt(i,n);o.operator=this.value,o.prefix=!1,o.argument=s,this.checkLValSimple(s),this.next(),s=this.finishNode(o,"UpdateExpression");}}return !t&&this.eat(Pr.starstar)?this.buildBinary(i,n,s,this.parseMaybeUnary(null,!1),"**",!1):s},ta.parseExprSubscripts=function(e){var t=this.start,s=this.startLoc,i=this.parseExprAtom(e);if("ArrowFunctionExpression"===i.type&&")"!==this.input.slice(this.lastTokStart,this.lastTokEnd))return i;var n=this.parseSubscripts(i,t,s);return e&&"MemberExpression"===n.type&&(e.parenthesizedAssign>=n.start&&(e.parenthesizedAssign=-1),e.parenthesizedBind>=n.start&&(e.parenthesizedBind=-1)),n},ta.parseSubscripts=function(e,t,s,i){for(var n=this.options.ecmaVersion>=8&&"Identifier"===e.type&&"async"===e.name&&this.lastTokEnd===e.end&&!this.canInsertSemicolon()&&e.end-e.start==5&&this.potentialArrowAt===e.start,r=!1;;){var a=this.parseSubscript(e,t,s,i,n,r);if(a.optional&&(r=!0),a===e||"ArrowFunctionExpression"===a.type){if(r){var o=this.startNodeAt(t,s);o.expression=a,a=this.finishNode(o,"ChainExpression");}return a}e=a;}},ta.parseSubscript=function(e,t,s,i,n,r){var a=this.options.ecmaVersion>=11,o=a&&this.eat(Pr.questionDot);i&&o&&this.raise(this.lastTokStart,"Optional chaining cannot appear in the callee of new expressions");var h=this.eat(Pr.bracketL);if(h||o&&this.type!==Pr.parenL&&this.type!==Pr.backQuote||this.eat(Pr.dot)){var l=this.startNodeAt(t,s);l.object=e,l.property=h?this.parseExpression():this.parseIdent("never"!==this.options.allowReserved),l.computed=!!h,h&&this.expect(Pr.bracketR),a&&(l.optional=o),e=this.finishNode(l,"MemberExpression");}else if(!i&&this.eat(Pr.parenL)){var c=new qr,u=this.yieldPos,d=this.awaitPos,p=this.awaitIdentPos;this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0;var f=this.parseExprList(Pr.parenR,this.options.ecmaVersion>=8,!1,c);if(n&&!o&&!this.canInsertSemicolon()&&this.eat(Pr.arrow))return this.checkPatternErrors(c,!1),this.checkYieldAwaitInDefaultParams(),this.awaitIdentPos>0&&this.raise(this.awaitIdentPos,"Cannot use 'await' as identifier inside an async function"),this.yieldPos=u,this.awaitPos=d,this.awaitIdentPos=p,this.parseArrowExpression(this.startNodeAt(t,s),f,!0);this.checkExpressionErrors(c,!0),this.yieldPos=u||this.yieldPos,this.awaitPos=d||this.awaitPos,this.awaitIdentPos=p||this.awaitIdentPos;var m=this.startNodeAt(t,s);m.callee=e,m.arguments=f,a&&(m.optional=o),e=this.finishNode(m,"CallExpression");}else if(this.type===Pr.backQuote){(o||r)&&this.raise(this.start,"Optional chaining cannot appear in the tag of tagged template expressions");var g=this.startNodeAt(t,s);g.tag=e,g.quasi=this.parseTemplate({isTagged:!0}),e=this.finishNode(g,"TaggedTemplateExpression");}return e},ta.parseExprAtom=function(e){this.type===Pr.slash&&this.readRegexp();var t,s=this.potentialArrowAt===this.start;switch(this.type){case Pr._super:return this.allowSuper||this.raise(this.start,"'super' keyword outside a method"),t=this.startNode(),this.next(),this.type!==Pr.parenL||this.allowDirectSuper||this.raise(t.start,"super() call outside constructor of a subclass"),this.type!==Pr.dot&&this.type!==Pr.bracketL&&this.type!==Pr.parenL&&this.unexpected(),this.finishNode(t,"Super");case Pr._this:return t=this.startNode(),this.next(),this.finishNode(t,"ThisExpression");case Pr.name:var i=this.start,n=this.startLoc,r=this.containsEsc,a=this.parseIdent(!1);if(this.options.ecmaVersion>=8&&!r&&"async"===a.name&&!this.canInsertSemicolon()&&this.eat(Pr._function))return this.parseFunction(this.startNodeAt(i,n),0,!1,!0);if(s&&!this.canInsertSemicolon()){if(this.eat(Pr.arrow))return this.parseArrowExpression(this.startNodeAt(i,n),[a],!1);if(this.options.ecmaVersion>=8&&"async"===a.name&&this.type===Pr.name&&!r)return a=this.parseIdent(!1),!this.canInsertSemicolon()&&this.eat(Pr.arrow)||this.unexpected(),this.parseArrowExpression(this.startNodeAt(i,n),[a],!0)}return a;case Pr.regexp:var o=this.value;return (t=this.parseLiteral(o.value)).regex={pattern:o.pattern,flags:o.flags},t;case Pr.num:case Pr.string:return this.parseLiteral(this.value);case Pr._null:case Pr._true:case Pr._false:return (t=this.startNode()).value=this.type===Pr._null?null:this.type===Pr._true,t.raw=this.type.keyword,this.next(),this.finishNode(t,"Literal");case Pr.parenL:var h=this.start,l=this.parseParenAndDistinguishExpression(s);return e&&(e.parenthesizedAssign<0&&!this.isSimpleAssignTarget(l)&&(e.parenthesizedAssign=h),e.parenthesizedBind<0&&(e.parenthesizedBind=h)),l;case Pr.bracketL:return t=this.startNode(),this.next(),t.elements=this.parseExprList(Pr.bracketR,!0,!0,e),this.finishNode(t,"ArrayExpression");case Pr.braceL:return this.parseObj(!1,e);case Pr._function:return t=this.startNode(),this.next(),this.parseFunction(t,0);case Pr._class:return this.parseClass(this.startNode(),!1);case Pr._new:return this.parseNew();case Pr.backQuote:return this.parseTemplate();case Pr._import:return this.options.ecmaVersion>=11?this.parseExprImport():this.unexpected();default:this.unexpected();}},ta.parseExprImport=function(){var e=this.startNode();this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword import");var t=this.parseIdent(!0);switch(this.type){case Pr.parenL:return this.parseDynamicImport(e);case Pr.dot:return e.meta=t,this.parseImportMeta(e);default:this.unexpected();}},ta.parseDynamicImport=function(e){if(this.next(),e.source=this.parseMaybeAssign(),!this.eat(Pr.parenR)){var t=this.start;this.eat(Pr.comma)&&this.eat(Pr.parenR)?this.raiseRecoverable(t,"Trailing comma is not allowed in import()"):this.unexpected(t);}return this.finishNode(e,"ImportExpression")},ta.parseImportMeta=function(e){this.next();var t=this.containsEsc;return e.property=this.parseIdent(!0),"meta"!==e.property.name&&this.raiseRecoverable(e.property.start,"The only valid meta property for import is 'import.meta'"),t&&this.raiseRecoverable(e.start,"'import.meta' must not contain escaped characters"),"module"!==this.options.sourceType&&this.raiseRecoverable(e.start,"Cannot use 'import.meta' outside a module"),this.finishNode(e,"MetaProperty")},ta.parseLiteral=function(e){var t=this.startNode();return t.value=e,t.raw=this.input.slice(this.start,this.end),110===t.raw.charCodeAt(t.raw.length-1)&&(t.bigint=t.raw.slice(0,-1).replace(/_/g,"")),this.next(),this.finishNode(t,"Literal")},ta.parseParenExpression=function(){this.expect(Pr.parenL);var e=this.parseExpression();return this.expect(Pr.parenR),e},ta.parseParenAndDistinguishExpression=function(e){var t,s=this.start,i=this.startLoc,n=this.options.ecmaVersion>=8;if(this.options.ecmaVersion>=6){this.next();var r,a=this.start,o=this.startLoc,h=[],l=!0,c=!1,u=new qr,d=this.yieldPos,p=this.awaitPos;for(this.yieldPos=0,this.awaitPos=0;this.type!==Pr.parenR;){if(l?l=!1:this.expect(Pr.comma),n&&this.afterTrailingComma(Pr.parenR,!0)){c=!0;break}if(this.type===Pr.ellipsis){r=this.start,h.push(this.parseParenItem(this.parseRestBinding())),this.type===Pr.comma&&this.raise(this.start,"Comma is not permitted after the rest element");break}h.push(this.parseMaybeAssign(!1,u,this.parseParenItem));}var f=this.start,m=this.startLoc;if(this.expect(Pr.parenR),e&&!this.canInsertSemicolon()&&this.eat(Pr.arrow))return this.checkPatternErrors(u,!1),this.checkYieldAwaitInDefaultParams(),this.yieldPos=d,this.awaitPos=p,this.parseParenArrowList(s,i,h);h.length&&!c||this.unexpected(this.lastTokStart),r&&this.unexpected(r),this.checkExpressionErrors(u,!0),this.yieldPos=d||this.yieldPos,this.awaitPos=p||this.awaitPos,h.length>1?((t=this.startNodeAt(a,o)).expressions=h,this.finishNodeAt(t,"SequenceExpression",f,m)):t=h[0];}else t=this.parseParenExpression();if(this.options.preserveParens){var g=this.startNodeAt(s,i);return g.expression=t,this.finishNode(g,"ParenthesizedExpression")}return t},ta.parseParenItem=function(e){return e},ta.parseParenArrowList=function(e,t,s){return this.parseArrowExpression(this.startNodeAt(e,t),s)};var sa=[];ta.parseNew=function(){this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword new");var e=this.startNode(),t=this.parseIdent(!0);if(this.options.ecmaVersion>=6&&this.eat(Pr.dot)){e.meta=t;var s=this.containsEsc;return e.property=this.parseIdent(!0),"target"!==e.property.name&&this.raiseRecoverable(e.property.start,"The only valid meta property for new is 'new.target'"),s&&this.raiseRecoverable(e.start,"'new.target' must not contain escaped characters"),this.inNonArrowFunction||this.raiseRecoverable(e.start,"'new.target' can only be used in functions"),this.finishNode(e,"MetaProperty")}var i=this.start,n=this.startLoc,r=this.type===Pr._import;return e.callee=this.parseSubscripts(this.parseExprAtom(),i,n,!0),r&&"ImportExpression"===e.callee.type&&this.raise(i,"Cannot use new with import()"),this.eat(Pr.parenL)?e.arguments=this.parseExprList(Pr.parenR,this.options.ecmaVersion>=8,!1):e.arguments=sa,this.finishNode(e,"NewExpression")},ta.parseTemplateElement=function(e){var t=e.isTagged,s=this.startNode();return this.type===Pr.invalidTemplate?(t||this.raiseRecoverable(this.start,"Bad escape sequence in untagged template literal"),s.value={raw:this.value,cooked:null}):s.value={raw:this.input.slice(this.start,this.end).replace(/\r\n?/g,"\n"),cooked:this.value},this.next(),s.tail=this.type===Pr.backQuote,this.finishNode(s,"TemplateElement")},ta.parseTemplate=function(e){void 0===e&&(e={});var t=e.isTagged;void 0===t&&(t=!1);var s=this.startNode();this.next(),s.expressions=[];var i=this.parseTemplateElement({isTagged:t});for(s.quasis=[i];!i.tail;)this.type===Pr.eof&&this.raise(this.pos,"Unterminated template literal"),this.expect(Pr.dollarBraceL),s.expressions.push(this.parseExpression()),this.expect(Pr.braceR),s.quasis.push(i=this.parseTemplateElement({isTagged:t}));return this.next(),this.finishNode(s,"TemplateLiteral")},ta.isAsyncProp=function(e){return !e.computed&&"Identifier"===e.key.type&&"async"===e.key.name&&(this.type===Pr.name||this.type===Pr.num||this.type===Pr.string||this.type===Pr.bracketL||this.type.keyword||this.options.ecmaVersion>=9&&this.type===Pr.star)&&!Cr.test(this.input.slice(this.lastTokEnd,this.start))},ta.parseObj=function(e,t){var s=this.startNode(),i=!0,n={};for(s.properties=[],this.next();!this.eat(Pr.braceR);){if(i)i=!1;else if(this.expect(Pr.comma),this.options.ecmaVersion>=5&&this.afterTrailingComma(Pr.braceR))break;var r=this.parseProperty(e,t);e||this.checkPropClash(r,n,t),s.properties.push(r);}return this.finishNode(s,e?"ObjectPattern":"ObjectExpression")},ta.parseProperty=function(e,t){var s,i,n,r,a=this.startNode();if(this.options.ecmaVersion>=9&&this.eat(Pr.ellipsis))return e?(a.argument=this.parseIdent(!1),this.type===Pr.comma&&this.raise(this.start,"Comma is not permitted after the rest element"),this.finishNode(a,"RestElement")):(this.type===Pr.parenL&&t&&(t.parenthesizedAssign<0&&(t.parenthesizedAssign=this.start),t.parenthesizedBind<0&&(t.parenthesizedBind=this.start)),a.argument=this.parseMaybeAssign(!1,t),this.type===Pr.comma&&t&&t.trailingComma<0&&(t.trailingComma=this.start),this.finishNode(a,"SpreadElement"));this.options.ecmaVersion>=6&&(a.method=!1,a.shorthand=!1,(e||t)&&(n=this.start,r=this.startLoc),e||(s=this.eat(Pr.star)));var o=this.containsEsc;return this.parsePropertyName(a),!e&&!o&&this.options.ecmaVersion>=8&&!s&&this.isAsyncProp(a)?(i=!0,s=this.options.ecmaVersion>=9&&this.eat(Pr.star),this.parsePropertyName(a,t)):i=!1,this.parsePropertyValue(a,e,s,i,n,r,t,o),this.finishNode(a,"Property")},ta.parsePropertyValue=function(e,t,s,i,n,r,a,o){if((s||i)&&this.type===Pr.colon&&this.unexpected(),this.eat(Pr.colon))e.value=t?this.parseMaybeDefault(this.start,this.startLoc):this.parseMaybeAssign(!1,a),e.kind="init";else if(this.options.ecmaVersion>=6&&this.type===Pr.parenL)t&&this.unexpected(),e.kind="init",e.method=!0,e.value=this.parseMethod(s,i);else if(t||o||!(this.options.ecmaVersion>=5)||e.computed||"Identifier"!==e.key.type||"get"!==e.key.name&&"set"!==e.key.name||this.type===Pr.comma||this.type===Pr.braceR||this.type===Pr.eq)this.options.ecmaVersion>=6&&!e.computed&&"Identifier"===e.key.type?((s||i)&&this.unexpected(),this.checkUnreserved(e.key),"await"!==e.key.name||this.awaitIdentPos||(this.awaitIdentPos=n),e.kind="init",t?e.value=this.parseMaybeDefault(n,r,this.copyNode(e.key)):this.type===Pr.eq&&a?(a.shorthandAssign<0&&(a.shorthandAssign=this.start),e.value=this.parseMaybeDefault(n,r,this.copyNode(e.key))):e.value=this.copyNode(e.key),e.shorthand=!0):this.unexpected();else {(s||i)&&this.unexpected(),e.kind=e.key.name,this.parsePropertyName(e),e.value=this.parseMethod(!1);var h="get"===e.kind?0:1;if(e.value.params.length!==h){var l=e.value.start;"get"===e.kind?this.raiseRecoverable(l,"getter should have no params"):this.raiseRecoverable(l,"setter should have exactly one param");}else "set"===e.kind&&"RestElement"===e.value.params[0].type&&this.raiseRecoverable(e.value.params[0].start,"Setter cannot use rest params");}},ta.parsePropertyName=function(e){if(this.options.ecmaVersion>=6){if(this.eat(Pr.bracketL))return e.computed=!0,e.key=this.parseMaybeAssign(),this.expect(Pr.bracketR),e.key;e.computed=!1;}return e.key=this.type===Pr.num||this.type===Pr.string?this.parseExprAtom():this.parseIdent("never"!==this.options.allowReserved)},ta.initFunction=function(e){e.id=null,this.options.ecmaVersion>=6&&(e.generator=e.expression=!1),this.options.ecmaVersion>=8&&(e.async=!1);},ta.parseMethod=function(e,t,s){var i=this.startNode(),n=this.yieldPos,r=this.awaitPos,a=this.awaitIdentPos;return this.initFunction(i),this.options.ecmaVersion>=6&&(i.generator=e),this.options.ecmaVersion>=8&&(i.async=!!t),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(64|Ur(t,i.generator)|(s?128:0)),this.expect(Pr.parenL),i.params=this.parseBindingList(Pr.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams(),this.parseFunctionBody(i,!1,!0),this.yieldPos=n,this.awaitPos=r,this.awaitIdentPos=a,this.finishNode(i,"FunctionExpression")},ta.parseArrowExpression=function(e,t,s){var i=this.yieldPos,n=this.awaitPos,r=this.awaitIdentPos;return this.enterScope(16|Ur(s,!1)),this.initFunction(e),this.options.ecmaVersion>=8&&(e.async=!!s),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,e.params=this.toAssignableList(t,!0),this.parseFunctionBody(e,!0,!1),this.yieldPos=i,this.awaitPos=n,this.awaitIdentPos=r,this.finishNode(e,"ArrowFunctionExpression")},ta.parseFunctionBody=function(e,t,s){var i=t&&this.type!==Pr.braceL,n=this.strict,r=!1;if(i)e.body=this.parseMaybeAssign(),e.expression=!0,this.checkParams(e,!1);else {var a=this.options.ecmaVersion>=7&&!this.isSimpleParamList(e.params);n&&!a||(r=this.strictDirective(this.end))&&a&&this.raiseRecoverable(e.start,"Illegal 'use strict' directive in function with non-simple parameter list");var o=this.labels;this.labels=[],r&&(this.strict=!0),this.checkParams(e,!n&&!r&&!t&&!s&&this.isSimpleParamList(e.params)),this.strict&&e.id&&this.checkLValSimple(e.id,5),e.body=this.parseBlock(!1,void 0,r&&!n),e.expression=!1,this.adaptDirectivePrologue(e.body.body),this.labels=o;}this.exitScope();},ta.isSimpleParamList=function(e){for(var t=0,s=e;t<s.length;t+=1){if("Identifier"!==s[t].type)return !1}return !0},ta.checkParams=function(e,t){for(var s=Object.create(null),i=0,n=e.params;i<n.length;i+=1){var r=n[i];this.checkLValInnerPattern(r,1,t?null:s);}},ta.parseExprList=function(e,t,s,i){for(var n=[],r=!0;!this.eat(e);){if(r)r=!1;else if(this.expect(Pr.comma),t&&this.afterTrailingComma(e))break;var a=void 0;s&&this.type===Pr.comma?a=null:this.type===Pr.ellipsis?(a=this.parseSpread(i),i&&this.type===Pr.comma&&i.trailingComma<0&&(i.trailingComma=this.start)):a=this.parseMaybeAssign(!1,i),n.push(a);}return n},ta.checkUnreserved=function(e){var t=e.start,s=e.end,i=e.name;(this.inGenerator&&"yield"===i&&this.raiseRecoverable(t,"Cannot use 'yield' as identifier inside a generator"),this.inAsync&&"await"===i&&this.raiseRecoverable(t,"Cannot use 'await' as identifier inside an async function"),this.keywords.test(i)&&this.raise(t,"Unexpected keyword '"+i+"'"),this.options.ecmaVersion<6&&-1!==this.input.slice(t,s).indexOf("\\"))||(this.strict?this.reservedWordsStrict:this.reservedWords).test(i)&&(this.inAsync||"await"!==i||this.raiseRecoverable(t,"Cannot use keyword 'await' outside an async function"),this.raiseRecoverable(t,"The keyword '"+i+"' is reserved"));},ta.parseIdent=function(e,t){var s=this.startNode();return this.type===Pr.name?s.name=this.value:this.type.keyword?(s.name=this.type.keyword,"class"!==s.name&&"function"!==s.name||this.lastTokEnd===this.lastTokStart+1&&46===this.input.charCodeAt(this.lastTokStart)||this.context.pop()):this.unexpected(),this.next(!!e),this.finishNode(s,"Identifier"),e||(this.checkUnreserved(s),"await"!==s.name||this.awaitIdentPos||(this.awaitIdentPos=s.start)),s},ta.parseYield=function(e){this.yieldPos||(this.yieldPos=this.start);var t=this.startNode();return this.next(),this.type===Pr.semi||this.canInsertSemicolon()||this.type!==Pr.star&&!this.type.startsExpr?(t.delegate=!1,t.argument=null):(t.delegate=this.eat(Pr.star),t.argument=this.parseMaybeAssign(e)),this.finishNode(t,"YieldExpression")},ta.parseAwait=function(){this.awaitPos||(this.awaitPos=this.start);var e=this.startNode();return this.next(),e.argument=this.parseMaybeUnary(null,!0),this.finishNode(e,"AwaitExpression")};var ia=jr.prototype;ia.raise=function(e,t){var s=Vr(this.input,e);t+=" ("+s.line+":"+s.column+")";var i=new SyntaxError(t);throw i.pos=e,i.loc=s,i.raisedAt=this.pos,i},ia.raiseRecoverable=ia.raise,ia.curPosition=function(){if(this.options.locations)return new Or(this.curLine,this.pos-this.lineStart)};var na=jr.prototype,ra=function(e){this.flags=e,this.var=[],this.lexical=[],this.functions=[];};na.enterScope=function(e){this.scopeStack.push(new ra(e));},na.exitScope=function(){this.scopeStack.pop();},na.treatFunctionsAsVarInScope=function(e){return 2&e.flags||!this.inModule&&1&e.flags},na.declareName=function(e,t,s){var i=!1;if(2===t){var n=this.currentScope();i=n.lexical.indexOf(e)>-1||n.functions.indexOf(e)>-1||n.var.indexOf(e)>-1,n.lexical.push(e),this.inModule&&1&n.flags&&delete this.undefinedExports[e];}else if(4===t){this.currentScope().lexical.push(e);}else if(3===t){var r=this.currentScope();i=this.treatFunctionsAsVar?r.lexical.indexOf(e)>-1:r.lexical.indexOf(e)>-1||r.var.indexOf(e)>-1,r.functions.push(e);}else for(var a=this.scopeStack.length-1;a>=0;--a){var o=this.scopeStack[a];if(o.lexical.indexOf(e)>-1&&!(32&o.flags&&o.lexical[0]===e)||!this.treatFunctionsAsVarInScope(o)&&o.functions.indexOf(e)>-1){i=!0;break}if(o.var.push(e),this.inModule&&1&o.flags&&delete this.undefinedExports[e],3&o.flags)break}i&&this.raiseRecoverable(s,"Identifier '"+e+"' has already been declared");},na.checkLocalExport=function(e){-1===this.scopeStack[0].lexical.indexOf(e.name)&&-1===this.scopeStack[0].var.indexOf(e.name)&&(this.undefinedExports[e.name]=e);},na.currentScope=function(){return this.scopeStack[this.scopeStack.length-1]},na.currentVarScope=function(){for(var e=this.scopeStack.length-1;;e--){var t=this.scopeStack[e];if(3&t.flags)return t}},na.currentThisScope=function(){for(var e=this.scopeStack.length-1;;e--){var t=this.scopeStack[e];if(3&t.flags&&!(16&t.flags))return t}};var aa=function(e,t,s){this.type="",this.start=t,this.end=0,e.options.locations&&(this.loc=new Dr(e,s)),e.options.directSourceFile&&(this.sourceFile=e.options.directSourceFile),e.options.ranges&&(this.range=[t,0]);},oa=jr.prototype;function ha(e,t,s,i){return e.type=t,e.end=s,this.options.locations&&(e.loc.end=i),this.options.ranges&&(e.range[1]=s),e}oa.startNode=function(){return new aa(this,this.start,this.startLoc)},oa.startNodeAt=function(e,t){return new aa(this,e,t)},oa.finishNode=function(e,t){return ha.call(this,e,t,this.lastTokEnd,this.lastTokEndLoc)},oa.finishNodeAt=function(e,t,s,i){return ha.call(this,e,t,s,i)},oa.copyNode=function(e){var t=new aa(this,e.start,this.startLoc);for(var s in e)t[s]=e[s];return t};var la=function(e,t,s,i,n){this.token=e,this.isExpr=!!t,this.preserveSpace=!!s,this.override=i,this.generator=!!n;},ca={b_stat:new la("{",!1),b_expr:new la("{",!0),b_tmpl:new la("${",!1),p_stat:new la("(",!1),p_expr:new la("(",!0),q_tmpl:new la("`",!0,!0,(function(e){return e.tryReadTemplateToken()})),f_stat:new la("function",!1),f_expr:new la("function",!0),f_expr_gen:new la("function",!0,!1,null,!0),f_gen:new la("function",!1,!1,null,!0)},ua=jr.prototype;ua.initialContext=function(){return [ca.b_stat]},ua.braceIsBlock=function(e){var t=this.curContext();return t===ca.f_expr||t===ca.f_stat||(e!==Pr.colon||t!==ca.b_stat&&t!==ca.b_expr?e===Pr._return||e===Pr.name&&this.exprAllowed?Cr.test(this.input.slice(this.lastTokEnd,this.start)):e===Pr._else||e===Pr.semi||e===Pr.eof||e===Pr.parenR||e===Pr.arrow||(e===Pr.braceL?t===ca.b_stat:e!==Pr._var&&e!==Pr._const&&e!==Pr.name&&!this.exprAllowed):!t.isExpr)},ua.inGeneratorContext=function(){for(var e=this.context.length-1;e>=1;e--){var t=this.context[e];if("function"===t.token)return t.generator}return !1},ua.updateContext=function(e){var t,s=this.type;s.keyword&&e===Pr.dot?this.exprAllowed=!1:(t=s.updateContext)?t.call(this,e):this.exprAllowed=s.beforeExpr;},Pr.parenR.updateContext=Pr.braceR.updateContext=function(){if(1!==this.context.length){var e=this.context.pop();e===ca.b_stat&&"function"===this.curContext().token&&(e=this.context.pop()),this.exprAllowed=!e.isExpr;}else this.exprAllowed=!0;},Pr.braceL.updateContext=function(e){this.context.push(this.braceIsBlock(e)?ca.b_stat:ca.b_expr),this.exprAllowed=!0;},Pr.dollarBraceL.updateContext=function(){this.context.push(ca.b_tmpl),this.exprAllowed=!0;},Pr.parenL.updateContext=function(e){var t=e===Pr._if||e===Pr._for||e===Pr._with||e===Pr._while;this.context.push(t?ca.p_stat:ca.p_expr),this.exprAllowed=!0;},Pr.incDec.updateContext=function(){},Pr._function.updateContext=Pr._class.updateContext=function(e){!e.beforeExpr||e===Pr._else||e===Pr.semi&&this.curContext()!==ca.p_stat||e===Pr._return&&Cr.test(this.input.slice(this.lastTokEnd,this.start))||(e===Pr.colon||e===Pr.braceL)&&this.curContext()===ca.b_stat?this.context.push(ca.f_stat):this.context.push(ca.f_expr),this.exprAllowed=!1;},Pr.backQuote.updateContext=function(){this.curContext()===ca.q_tmpl?this.context.pop():this.context.push(ca.q_tmpl),this.exprAllowed=!1;},Pr.star.updateContext=function(e){if(e===Pr._function){var t=this.context.length-1;this.context[t]===ca.f_expr?this.context[t]=ca.f_expr_gen:this.context[t]=ca.f_gen;}this.exprAllowed=!0;},Pr.name.updateContext=function(e){var t=!1;this.options.ecmaVersion>=6&&e!==Pr.dot&&("of"===this.value&&!this.exprAllowed||"yield"===this.value&&this.inGeneratorContext())&&(t=!0),this.exprAllowed=t;};var da="ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS",pa=da+" Extended_Pictographic",fa={9:da,10:pa,11:pa,12:"ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS Extended_Pictographic EBase EComp EMod EPres ExtPict"},ma="Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu",ga="Adlam Adlm Ahom Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb",ya=ga+" Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd",xa=ya+" Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho",Ea={9:ga,10:ya,11:xa,12:"Adlam Adlm Ahom Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi"},va={};function ba(e){var t=va[e]={binary:Lr(fa[e]+" "+ma),nonBinary:{General_Category:Lr(ma),Script:Lr(Ea[e])}};t.nonBinary.Script_Extensions=t.nonBinary.Script,t.nonBinary.gc=t.nonBinary.General_Category,t.nonBinary.sc=t.nonBinary.Script,t.nonBinary.scx=t.nonBinary.Script_Extensions;}ba(9),ba(10),ba(11),ba(12);var Sa=jr.prototype,Aa=function(e){this.parser=e,this.validFlags="gim"+(e.options.ecmaVersion>=6?"uy":"")+(e.options.ecmaVersion>=9?"s":""),this.unicodeProperties=va[e.options.ecmaVersion>=12?12:e.options.ecmaVersion],this.source="",this.flags="",this.start=0,this.switchU=!1,this.switchN=!1,this.pos=0,this.lastIntValue=0,this.lastStringValue="",this.lastAssertionIsQuantifiable=!1,this.numCapturingParens=0,this.maxBackReference=0,this.groupNames=[],this.backReferenceNames=[];};function Pa(e){return e<=65535?String.fromCharCode(e):(e-=65536,String.fromCharCode(55296+(e>>10),56320+(1023&e)))}function Ca(e){return 36===e||e>=40&&e<=43||46===e||63===e||e>=91&&e<=94||e>=123&&e<=125}function wa(e){return e>=65&&e<=90||e>=97&&e<=122}function _a(e){return wa(e)||95===e}function ka(e){return _a(e)||Na(e)}function Na(e){return e>=48&&e<=57}function Ia(e){return e>=48&&e<=57||e>=65&&e<=70||e>=97&&e<=102}function $a(e){return e>=65&&e<=70?e-65+10:e>=97&&e<=102?e-97+10:e-48}function Ma(e){return e>=48&&e<=55}Aa.prototype.reset=function(e,t,s){var i=-1!==s.indexOf("u");this.start=0|e,this.source=t+"",this.flags=s,this.switchU=i&&this.parser.options.ecmaVersion>=6,this.switchN=i&&this.parser.options.ecmaVersion>=9;},Aa.prototype.raise=function(e){this.parser.raiseRecoverable(this.start,"Invalid regular expression: /"+this.source+"/: "+e);},Aa.prototype.at=function(e,t){void 0===t&&(t=!1);var s=this.source,i=s.length;if(e>=i)return -1;var n=s.charCodeAt(e);if(!t&&!this.switchU||n<=55295||n>=57344||e+1>=i)return n;var r=s.charCodeAt(e+1);return r>=56320&&r<=57343?(n<<10)+r-56613888:n},Aa.prototype.nextIndex=function(e,t){void 0===t&&(t=!1);var s=this.source,i=s.length;if(e>=i)return i;var n,r=s.charCodeAt(e);return !t&&!this.switchU||r<=55295||r>=57344||e+1>=i||(n=s.charCodeAt(e+1))<56320||n>57343?e+1:e+2},Aa.prototype.current=function(e){return void 0===e&&(e=!1),this.at(this.pos,e)},Aa.prototype.lookahead=function(e){return void 0===e&&(e=!1),this.at(this.nextIndex(this.pos,e),e)},Aa.prototype.advance=function(e){void 0===e&&(e=!1),this.pos=this.nextIndex(this.pos,e);},Aa.prototype.eat=function(e,t){return void 0===t&&(t=!1),this.current(t)===e&&(this.advance(t),!0)},Sa.validateRegExpFlags=function(e){for(var t=e.validFlags,s=e.flags,i=0;i<s.length;i++){var n=s.charAt(i);-1===t.indexOf(n)&&this.raise(e.start,"Invalid regular expression flag"),s.indexOf(n,i+1)>-1&&this.raise(e.start,"Duplicate regular expression flag");}},Sa.validateRegExpPattern=function(e){this.regexp_pattern(e),!e.switchN&&this.options.ecmaVersion>=9&&e.groupNames.length>0&&(e.switchN=!0,this.regexp_pattern(e));},Sa.regexp_pattern=function(e){e.pos=0,e.lastIntValue=0,e.lastStringValue="",e.lastAssertionIsQuantifiable=!1,e.numCapturingParens=0,e.maxBackReference=0,e.groupNames.length=0,e.backReferenceNames.length=0,this.regexp_disjunction(e),e.pos!==e.source.length&&(e.eat(41)&&e.raise("Unmatched ')'"),(e.eat(93)||e.eat(125))&&e.raise("Lone quantifier brackets")),e.maxBackReference>e.numCapturingParens&&e.raise("Invalid escape");for(var t=0,s=e.backReferenceNames;t<s.length;t+=1){var i=s[t];-1===e.groupNames.indexOf(i)&&e.raise("Invalid named capture referenced");}},Sa.regexp_disjunction=function(e){for(this.regexp_alternative(e);e.eat(124);)this.regexp_alternative(e);this.regexp_eatQuantifier(e,!0)&&e.raise("Nothing to repeat"),e.eat(123)&&e.raise("Lone quantifier brackets");},Sa.regexp_alternative=function(e){for(;e.pos<e.source.length&&this.regexp_eatTerm(e););},Sa.regexp_eatTerm=function(e){return this.regexp_eatAssertion(e)?(e.lastAssertionIsQuantifiable&&this.regexp_eatQuantifier(e)&&e.switchU&&e.raise("Invalid quantifier"),!0):!!(e.switchU?this.regexp_eatAtom(e):this.regexp_eatExtendedAtom(e))&&(this.regexp_eatQuantifier(e),!0)},Sa.regexp_eatAssertion=function(e){var t=e.pos;if(e.lastAssertionIsQuantifiable=!1,e.eat(94)||e.eat(36))return !0;if(e.eat(92)){if(e.eat(66)||e.eat(98))return !0;e.pos=t;}if(e.eat(40)&&e.eat(63)){var s=!1;if(this.options.ecmaVersion>=9&&(s=e.eat(60)),e.eat(61)||e.eat(33))return this.regexp_disjunction(e),e.eat(41)||e.raise("Unterminated group"),e.lastAssertionIsQuantifiable=!s,!0}return e.pos=t,!1},Sa.regexp_eatQuantifier=function(e,t){return void 0===t&&(t=!1),!!this.regexp_eatQuantifierPrefix(e,t)&&(e.eat(63),!0)},Sa.regexp_eatQuantifierPrefix=function(e,t){return e.eat(42)||e.eat(43)||e.eat(63)||this.regexp_eatBracedQuantifier(e,t)},Sa.regexp_eatBracedQuantifier=function(e,t){var s=e.pos;if(e.eat(123)){var i=0,n=-1;if(this.regexp_eatDecimalDigits(e)&&(i=e.lastIntValue,e.eat(44)&&this.regexp_eatDecimalDigits(e)&&(n=e.lastIntValue),e.eat(125)))return -1!==n&&n<i&&!t&&e.raise("numbers out of order in {} quantifier"),!0;e.switchU&&!t&&e.raise("Incomplete quantifier"),e.pos=s;}return !1},Sa.regexp_eatAtom=function(e){return this.regexp_eatPatternCharacters(e)||e.eat(46)||this.regexp_eatReverseSolidusAtomEscape(e)||this.regexp_eatCharacterClass(e)||this.regexp_eatUncapturingGroup(e)||this.regexp_eatCapturingGroup(e)},Sa.regexp_eatReverseSolidusAtomEscape=function(e){var t=e.pos;if(e.eat(92)){if(this.regexp_eatAtomEscape(e))return !0;e.pos=t;}return !1},Sa.regexp_eatUncapturingGroup=function(e){var t=e.pos;if(e.eat(40)){if(e.eat(63)&&e.eat(58)){if(this.regexp_disjunction(e),e.eat(41))return !0;e.raise("Unterminated group");}e.pos=t;}return !1},Sa.regexp_eatCapturingGroup=function(e){if(e.eat(40)){if(this.options.ecmaVersion>=9?this.regexp_groupSpecifier(e):63===e.current()&&e.raise("Invalid group"),this.regexp_disjunction(e),e.eat(41))return e.numCapturingParens+=1,!0;e.raise("Unterminated group");}return !1},Sa.regexp_eatExtendedAtom=function(e){return e.eat(46)||this.regexp_eatReverseSolidusAtomEscape(e)||this.regexp_eatCharacterClass(e)||this.regexp_eatUncapturingGroup(e)||this.regexp_eatCapturingGroup(e)||this.regexp_eatInvalidBracedQuantifier(e)||this.regexp_eatExtendedPatternCharacter(e)},Sa.regexp_eatInvalidBracedQuantifier=function(e){return this.regexp_eatBracedQuantifier(e,!0)&&e.raise("Nothing to repeat"),!1},Sa.regexp_eatSyntaxCharacter=function(e){var t=e.current();return !!Ca(t)&&(e.lastIntValue=t,e.advance(),!0)},Sa.regexp_eatPatternCharacters=function(e){for(var t=e.pos,s=0;-1!==(s=e.current())&&!Ca(s);)e.advance();return e.pos!==t},Sa.regexp_eatExtendedPatternCharacter=function(e){var t=e.current();return !(-1===t||36===t||t>=40&&t<=43||46===t||63===t||91===t||94===t||124===t)&&(e.advance(),!0)},Sa.regexp_groupSpecifier=function(e){if(e.eat(63)){if(this.regexp_eatGroupName(e))return -1!==e.groupNames.indexOf(e.lastStringValue)&&e.raise("Duplicate capture group name"),void e.groupNames.push(e.lastStringValue);e.raise("Invalid group");}},Sa.regexp_eatGroupName=function(e){if(e.lastStringValue="",e.eat(60)){if(this.regexp_eatRegExpIdentifierName(e)&&e.eat(62))return !0;e.raise("Invalid capture group name");}return !1},Sa.regexp_eatRegExpIdentifierName=function(e){if(e.lastStringValue="",this.regexp_eatRegExpIdentifierStart(e)){for(e.lastStringValue+=Pa(e.lastIntValue);this.regexp_eatRegExpIdentifierPart(e);)e.lastStringValue+=Pa(e.lastIntValue);return !0}return !1},Sa.regexp_eatRegExpIdentifierStart=function(e){var t=e.pos,s=this.options.ecmaVersion>=11,i=e.current(s);return e.advance(s),92===i&&this.regexp_eatRegExpUnicodeEscapeSequence(e,s)&&(i=e.lastIntValue),function(e){return gr(e,!0)||36===e||95===e}(i)?(e.lastIntValue=i,!0):(e.pos=t,!1)},Sa.regexp_eatRegExpIdentifierPart=function(e){var t=e.pos,s=this.options.ecmaVersion>=11,i=e.current(s);return e.advance(s),92===i&&this.regexp_eatRegExpUnicodeEscapeSequence(e,s)&&(i=e.lastIntValue),function(e){return yr(e,!0)||36===e||95===e||8204===e||8205===e}(i)?(e.lastIntValue=i,!0):(e.pos=t,!1)},Sa.regexp_eatAtomEscape=function(e){return !!(this.regexp_eatBackReference(e)||this.regexp_eatCharacterClassEscape(e)||this.regexp_eatCharacterEscape(e)||e.switchN&&this.regexp_eatKGroupName(e))||(e.switchU&&(99===e.current()&&e.raise("Invalid unicode escape"),e.raise("Invalid escape")),!1)},Sa.regexp_eatBackReference=function(e){var t=e.pos;if(this.regexp_eatDecimalEscape(e)){var s=e.lastIntValue;if(e.switchU)return s>e.maxBackReference&&(e.maxBackReference=s),!0;if(s<=e.numCapturingParens)return !0;e.pos=t;}return !1},Sa.regexp_eatKGroupName=function(e){if(e.eat(107)){if(this.regexp_eatGroupName(e))return e.backReferenceNames.push(e.lastStringValue),!0;e.raise("Invalid named reference");}return !1},Sa.regexp_eatCharacterEscape=function(e){return this.regexp_eatControlEscape(e)||this.regexp_eatCControlLetter(e)||this.regexp_eatZero(e)||this.regexp_eatHexEscapeSequence(e)||this.regexp_eatRegExpUnicodeEscapeSequence(e,!1)||!e.switchU&&this.regexp_eatLegacyOctalEscapeSequence(e)||this.regexp_eatIdentityEscape(e)},Sa.regexp_eatCControlLetter=function(e){var t=e.pos;if(e.eat(99)){if(this.regexp_eatControlLetter(e))return !0;e.pos=t;}return !1},Sa.regexp_eatZero=function(e){return 48===e.current()&&!Na(e.lookahead())&&(e.lastIntValue=0,e.advance(),!0)},Sa.regexp_eatControlEscape=function(e){var t=e.current();return 116===t?(e.lastIntValue=9,e.advance(),!0):110===t?(e.lastIntValue=10,e.advance(),!0):118===t?(e.lastIntValue=11,e.advance(),!0):102===t?(e.lastIntValue=12,e.advance(),!0):114===t&&(e.lastIntValue=13,e.advance(),!0)},Sa.regexp_eatControlLetter=function(e){var t=e.current();return !!wa(t)&&(e.lastIntValue=t%32,e.advance(),!0)},Sa.regexp_eatRegExpUnicodeEscapeSequence=function(e,t){void 0===t&&(t=!1);var s,i=e.pos,n=t||e.switchU;if(e.eat(117)){if(this.regexp_eatFixedHexDigits(e,4)){var r=e.lastIntValue;if(n&&r>=55296&&r<=56319){var a=e.pos;if(e.eat(92)&&e.eat(117)&&this.regexp_eatFixedHexDigits(e,4)){var o=e.lastIntValue;if(o>=56320&&o<=57343)return e.lastIntValue=1024*(r-55296)+(o-56320)+65536,!0}e.pos=a,e.lastIntValue=r;}return !0}if(n&&e.eat(123)&&this.regexp_eatHexDigits(e)&&e.eat(125)&&((s=e.lastIntValue)>=0&&s<=1114111))return !0;n&&e.raise("Invalid unicode escape"),e.pos=i;}return !1},Sa.regexp_eatIdentityEscape=function(e){if(e.switchU)return !!this.regexp_eatSyntaxCharacter(e)||!!e.eat(47)&&(e.lastIntValue=47,!0);var t=e.current();return !(99===t||e.switchN&&107===t)&&(e.lastIntValue=t,e.advance(),!0)},Sa.regexp_eatDecimalEscape=function(e){e.lastIntValue=0;var t=e.current();if(t>=49&&t<=57){do{e.lastIntValue=10*e.lastIntValue+(t-48),e.advance();}while((t=e.current())>=48&&t<=57);return !0}return !1},Sa.regexp_eatCharacterClassEscape=function(e){var t=e.current();if(function(e){return 100===e||68===e||115===e||83===e||119===e||87===e}(t))return e.lastIntValue=-1,e.advance(),!0;if(e.switchU&&this.options.ecmaVersion>=9&&(80===t||112===t)){if(e.lastIntValue=-1,e.advance(),e.eat(123)&&this.regexp_eatUnicodePropertyValueExpression(e)&&e.eat(125))return !0;e.raise("Invalid property name");}return !1},Sa.regexp_eatUnicodePropertyValueExpression=function(e){var t=e.pos;if(this.regexp_eatUnicodePropertyName(e)&&e.eat(61)){var s=e.lastStringValue;if(this.regexp_eatUnicodePropertyValue(e)){var i=e.lastStringValue;return this.regexp_validateUnicodePropertyNameAndValue(e,s,i),!0}}if(e.pos=t,this.regexp_eatLoneUnicodePropertyNameOrValue(e)){var n=e.lastStringValue;return this.regexp_validateUnicodePropertyNameOrValue(e,n),!0}return !1},Sa.regexp_validateUnicodePropertyNameAndValue=function(e,t,s){Tr(e.unicodeProperties.nonBinary,t)||e.raise("Invalid property name"),e.unicodeProperties.nonBinary[t].test(s)||e.raise("Invalid property value");},Sa.regexp_validateUnicodePropertyNameOrValue=function(e,t){e.unicodeProperties.binary.test(t)||e.raise("Invalid property name");},Sa.regexp_eatUnicodePropertyName=function(e){var t=0;for(e.lastStringValue="";_a(t=e.current());)e.lastStringValue+=Pa(t),e.advance();return ""!==e.lastStringValue},Sa.regexp_eatUnicodePropertyValue=function(e){var t=0;for(e.lastStringValue="";ka(t=e.current());)e.lastStringValue+=Pa(t),e.advance();return ""!==e.lastStringValue},Sa.regexp_eatLoneUnicodePropertyNameOrValue=function(e){return this.regexp_eatUnicodePropertyValue(e)},Sa.regexp_eatCharacterClass=function(e){if(e.eat(91)){if(e.eat(94),this.regexp_classRanges(e),e.eat(93))return !0;e.raise("Unterminated character class");}return !1},Sa.regexp_classRanges=function(e){for(;this.regexp_eatClassAtom(e);){var t=e.lastIntValue;if(e.eat(45)&&this.regexp_eatClassAtom(e)){var s=e.lastIntValue;!e.switchU||-1!==t&&-1!==s||e.raise("Invalid character class"),-1!==t&&-1!==s&&t>s&&e.raise("Range out of order in character class");}}},Sa.regexp_eatClassAtom=function(e){var t=e.pos;if(e.eat(92)){if(this.regexp_eatClassEscape(e))return !0;if(e.switchU){var s=e.current();(99===s||Ma(s))&&e.raise("Invalid class escape"),e.raise("Invalid escape");}e.pos=t;}var i=e.current();return 93!==i&&(e.lastIntValue=i,e.advance(),!0)},Sa.regexp_eatClassEscape=function(e){var t=e.pos;if(e.eat(98))return e.lastIntValue=8,!0;if(e.switchU&&e.eat(45))return e.lastIntValue=45,!0;if(!e.switchU&&e.eat(99)){if(this.regexp_eatClassControlLetter(e))return !0;e.pos=t;}return this.regexp_eatCharacterClassEscape(e)||this.regexp_eatCharacterEscape(e)},Sa.regexp_eatClassControlLetter=function(e){var t=e.current();return !(!Na(t)&&95!==t)&&(e.lastIntValue=t%32,e.advance(),!0)},Sa.regexp_eatHexEscapeSequence=function(e){var t=e.pos;if(e.eat(120)){if(this.regexp_eatFixedHexDigits(e,2))return !0;e.switchU&&e.raise("Invalid escape"),e.pos=t;}return !1},Sa.regexp_eatDecimalDigits=function(e){var t=e.pos,s=0;for(e.lastIntValue=0;Na(s=e.current());)e.lastIntValue=10*e.lastIntValue+(s-48),e.advance();return e.pos!==t},Sa.regexp_eatHexDigits=function(e){var t=e.pos,s=0;for(e.lastIntValue=0;Ia(s=e.current());)e.lastIntValue=16*e.lastIntValue+$a(s),e.advance();return e.pos!==t},Sa.regexp_eatLegacyOctalEscapeSequence=function(e){if(this.regexp_eatOctalDigit(e)){var t=e.lastIntValue;if(this.regexp_eatOctalDigit(e)){var s=e.lastIntValue;t<=3&&this.regexp_eatOctalDigit(e)?e.lastIntValue=64*t+8*s+e.lastIntValue:e.lastIntValue=8*t+s;}else e.lastIntValue=t;return !0}return !1},Sa.regexp_eatOctalDigit=function(e){var t=e.current();return Ma(t)?(e.lastIntValue=t-48,e.advance(),!0):(e.lastIntValue=0,!1)},Sa.regexp_eatFixedHexDigits=function(e,t){var s=e.pos;e.lastIntValue=0;for(var i=0;i<t;++i){var n=e.current();if(!Ia(n))return e.pos=s,!1;e.lastIntValue=16*e.lastIntValue+$a(n),e.advance();}return !0};var Ta=function(e){this.type=e.type,this.value=e.value,this.start=e.start,this.end=e.end,e.options.locations&&(this.loc=new Dr(e,e.startLoc,e.endLoc)),e.options.ranges&&(this.range=[e.start,e.end]);},Ra=jr.prototype;function La(e){return "function"!=typeof BigInt?null:BigInt(e.replace(/_/g,""))}function Oa(e){return e<=65535?String.fromCharCode(e):(e-=65536,String.fromCharCode(55296+(e>>10),56320+(1023&e)))}Ra.next=function(e){!e&&this.type.keyword&&this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword "+this.type.keyword),this.options.onToken&&this.options.onToken(new Ta(this)),this.lastTokEnd=this.end,this.lastTokStart=this.start,this.lastTokEndLoc=this.endLoc,this.lastTokStartLoc=this.startLoc,this.nextToken();},Ra.getToken=function(){return this.next(),new Ta(this)},"undefined"!=typeof Symbol&&(Ra[Symbol.iterator]=function(){var e=this;return {next:function(){var t=e.getToken();return {done:t.type===Pr.eof,value:t}}}}),Ra.curContext=function(){return this.context[this.context.length-1]},Ra.nextToken=function(){var e=this.curContext();return e&&e.preserveSpace||this.skipSpace(),this.start=this.pos,this.options.locations&&(this.startLoc=this.curPosition()),this.pos>=this.input.length?this.finishToken(Pr.eof):e.override?e.override(this):void this.readToken(this.fullCharCodeAtPos())},Ra.readToken=function(e){return gr(e,this.options.ecmaVersion>=6)||92===e?this.readWord():this.getTokenFromCode(e)},Ra.fullCharCodeAtPos=function(){var e=this.input.charCodeAt(this.pos);return e<=55295||e>=57344?e:(e<<10)+this.input.charCodeAt(this.pos+1)-56613888},Ra.skipBlockComment=function(){var e,t=this.options.onComment&&this.curPosition(),s=this.pos,i=this.input.indexOf("*/",this.pos+=2);if(-1===i&&this.raise(this.pos-2,"Unterminated comment"),this.pos=i+2,this.options.locations)for(wr.lastIndex=s;(e=wr.exec(this.input))&&e.index<this.pos;)++this.curLine,this.lineStart=e.index+e[0].length;this.options.onComment&&this.options.onComment(!0,this.input.slice(s+2,i),s,this.pos,t,this.curPosition());},Ra.skipLineComment=function(e){for(var t=this.pos,s=this.options.onComment&&this.curPosition(),i=this.input.charCodeAt(this.pos+=e);this.pos<this.input.length&&!_r(i);)i=this.input.charCodeAt(++this.pos);this.options.onComment&&this.options.onComment(!1,this.input.slice(t+e,this.pos),t,this.pos,s,this.curPosition());},Ra.skipSpace=function(){e:for(;this.pos<this.input.length;){var e=this.input.charCodeAt(this.pos);switch(e){case 32:case 160:++this.pos;break;case 13:10===this.input.charCodeAt(this.pos+1)&&++this.pos;case 10:case 8232:case 8233:++this.pos,this.options.locations&&(++this.curLine,this.lineStart=this.pos);break;case 47:switch(this.input.charCodeAt(this.pos+1)){case 42:this.skipBlockComment();break;case 47:this.skipLineComment(2);break;default:break e}break;default:if(!(e>8&&e<14||e>=5760&&kr.test(String.fromCharCode(e))))break e;++this.pos;}}},Ra.finishToken=function(e,t){this.end=this.pos,this.options.locations&&(this.endLoc=this.curPosition());var s=this.type;this.type=e,this.value=t,this.updateContext(s);},Ra.readToken_dot=function(){var e=this.input.charCodeAt(this.pos+1);if(e>=48&&e<=57)return this.readNumber(!0);var t=this.input.charCodeAt(this.pos+2);return this.options.ecmaVersion>=6&&46===e&&46===t?(this.pos+=3,this.finishToken(Pr.ellipsis)):(++this.pos,this.finishToken(Pr.dot))},Ra.readToken_slash=function(){var e=this.input.charCodeAt(this.pos+1);return this.exprAllowed?(++this.pos,this.readRegexp()):61===e?this.finishOp(Pr.assign,2):this.finishOp(Pr.slash,1)},Ra.readToken_mult_modulo_exp=function(e){var t=this.input.charCodeAt(this.pos+1),s=1,i=42===e?Pr.star:Pr.modulo;return this.options.ecmaVersion>=7&&42===e&&42===t&&(++s,i=Pr.starstar,t=this.input.charCodeAt(this.pos+2)),61===t?this.finishOp(Pr.assign,s+1):this.finishOp(i,s)},Ra.readToken_pipe_amp=function(e){var t=this.input.charCodeAt(this.pos+1);if(t===e){if(this.options.ecmaVersion>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(Pr.assign,3);return this.finishOp(124===e?Pr.logicalOR:Pr.logicalAND,2)}return 61===t?this.finishOp(Pr.assign,2):this.finishOp(124===e?Pr.bitwiseOR:Pr.bitwiseAND,1)},Ra.readToken_caret=function(){return 61===this.input.charCodeAt(this.pos+1)?this.finishOp(Pr.assign,2):this.finishOp(Pr.bitwiseXOR,1)},Ra.readToken_plus_min=function(e){var t=this.input.charCodeAt(this.pos+1);return t===e?45!==t||this.inModule||62!==this.input.charCodeAt(this.pos+2)||0!==this.lastTokEnd&&!Cr.test(this.input.slice(this.lastTokEnd,this.pos))?this.finishOp(Pr.incDec,2):(this.skipLineComment(3),this.skipSpace(),this.nextToken()):61===t?this.finishOp(Pr.assign,2):this.finishOp(Pr.plusMin,1)},Ra.readToken_lt_gt=function(e){var t=this.input.charCodeAt(this.pos+1),s=1;return t===e?(s=62===e&&62===this.input.charCodeAt(this.pos+2)?3:2,61===this.input.charCodeAt(this.pos+s)?this.finishOp(Pr.assign,s+1):this.finishOp(Pr.bitShift,s)):33!==t||60!==e||this.inModule||45!==this.input.charCodeAt(this.pos+2)||45!==this.input.charCodeAt(this.pos+3)?(61===t&&(s=2),this.finishOp(Pr.relational,s)):(this.skipLineComment(4),this.skipSpace(),this.nextToken())},Ra.readToken_eq_excl=function(e){var t=this.input.charCodeAt(this.pos+1);return 61===t?this.finishOp(Pr.equality,61===this.input.charCodeAt(this.pos+2)?3:2):61===e&&62===t&&this.options.ecmaVersion>=6?(this.pos+=2,this.finishToken(Pr.arrow)):this.finishOp(61===e?Pr.eq:Pr.prefix,1)},Ra.readToken_question=function(){var e=this.options.ecmaVersion;if(e>=11){var t=this.input.charCodeAt(this.pos+1);if(46===t){var s=this.input.charCodeAt(this.pos+2);if(s<48||s>57)return this.finishOp(Pr.questionDot,2)}if(63===t){if(e>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(Pr.assign,3);return this.finishOp(Pr.coalesce,2)}}return this.finishOp(Pr.question,1)},Ra.getTokenFromCode=function(e){switch(e){case 46:return this.readToken_dot();case 40:return ++this.pos,this.finishToken(Pr.parenL);case 41:return ++this.pos,this.finishToken(Pr.parenR);case 59:return ++this.pos,this.finishToken(Pr.semi);case 44:return ++this.pos,this.finishToken(Pr.comma);case 91:return ++this.pos,this.finishToken(Pr.bracketL);case 93:return ++this.pos,this.finishToken(Pr.bracketR);case 123:return ++this.pos,this.finishToken(Pr.braceL);case 125:return ++this.pos,this.finishToken(Pr.braceR);case 58:return ++this.pos,this.finishToken(Pr.colon);case 96:if(this.options.ecmaVersion<6)break;return ++this.pos,this.finishToken(Pr.backQuote);case 48:var t=this.input.charCodeAt(this.pos+1);if(120===t||88===t)return this.readRadixNumber(16);if(this.options.ecmaVersion>=6){if(111===t||79===t)return this.readRadixNumber(8);if(98===t||66===t)return this.readRadixNumber(2)}case 49:case 50:case 51:case 52:case 53:case 54:case 55:case 56:case 57:return this.readNumber(!1);case 34:case 39:return this.readString(e);case 47:return this.readToken_slash();case 37:case 42:return this.readToken_mult_modulo_exp(e);case 124:case 38:return this.readToken_pipe_amp(e);case 94:return this.readToken_caret();case 43:case 45:return this.readToken_plus_min(e);case 60:case 62:return this.readToken_lt_gt(e);case 61:case 33:return this.readToken_eq_excl(e);case 63:return this.readToken_question();case 126:return this.finishOp(Pr.prefix,1)}this.raise(this.pos,"Unexpected character '"+Oa(e)+"'");},Ra.finishOp=function(e,t){var s=this.input.slice(this.pos,this.pos+t);return this.pos+=t,this.finishToken(e,s)},Ra.readRegexp=function(){for(var e,t,s=this.pos;;){this.pos>=this.input.length&&this.raise(s,"Unterminated regular expression");var i=this.input.charAt(this.pos);if(Cr.test(i)&&this.raise(s,"Unterminated regular expression"),e)e=!1;else {if("["===i)t=!0;else if("]"===i&&t)t=!1;else if("/"===i&&!t)break;e="\\"===i;}++this.pos;}var n=this.input.slice(s,this.pos);++this.pos;var r=this.pos,a=this.readWord1();this.containsEsc&&this.unexpected(r);var o=this.regexpState||(this.regexpState=new Aa(this));o.reset(s,n,a),this.validateRegExpFlags(o),this.validateRegExpPattern(o);var h=null;try{h=new RegExp(n,a);}catch(e){}return this.finishToken(Pr.regexp,{pattern:n,flags:a,value:h})},Ra.readInt=function(e,t,s){for(var i=this.options.ecmaVersion>=12&&void 0===t,n=s&&48===this.input.charCodeAt(this.pos),r=this.pos,a=0,o=0,h=0,l=null==t?1/0:t;h<l;++h,++this.pos){var c=this.input.charCodeAt(this.pos),u=void 0;if(i&&95===c)n&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed in legacy octal numeric literals"),95===o&&this.raiseRecoverable(this.pos,"Numeric separator must be exactly one underscore"),0===h&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed at the first of digits"),o=c;else {if((u=c>=97?c-97+10:c>=65?c-65+10:c>=48&&c<=57?c-48:1/0)>=e)break;o=c,a=a*e+u;}}return i&&95===o&&this.raiseRecoverable(this.pos-1,"Numeric separator is not allowed at the last of digits"),this.pos===r||null!=t&&this.pos-r!==t?null:a},Ra.readRadixNumber=function(e){var t=this.pos;this.pos+=2;var s=this.readInt(e);return null==s&&this.raise(this.start+2,"Expected number in radix "+e),this.options.ecmaVersion>=11&&110===this.input.charCodeAt(this.pos)?(s=La(this.input.slice(t,this.pos)),++this.pos):gr(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(Pr.num,s)},Ra.readNumber=function(e){var t=this.pos;e||null!==this.readInt(10,void 0,!0)||this.raise(t,"Invalid number");var s=this.pos-t>=2&&48===this.input.charCodeAt(t);s&&this.strict&&this.raise(t,"Invalid number");var i=this.input.charCodeAt(this.pos);if(!s&&!e&&this.options.ecmaVersion>=11&&110===i){var n=La(this.input.slice(t,this.pos));return ++this.pos,gr(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(Pr.num,n)}s&&/[89]/.test(this.input.slice(t,this.pos))&&(s=!1),46!==i||s||(++this.pos,this.readInt(10),i=this.input.charCodeAt(this.pos)),69!==i&&101!==i||s||(43!==(i=this.input.charCodeAt(++this.pos))&&45!==i||++this.pos,null===this.readInt(10)&&this.raise(t,"Invalid number")),gr(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number");var r,a=(r=this.input.slice(t,this.pos),s?parseInt(r,8):parseFloat(r.replace(/_/g,"")));return this.finishToken(Pr.num,a)},Ra.readCodePoint=function(){var e;if(123===this.input.charCodeAt(this.pos)){this.options.ecmaVersion<6&&this.unexpected();var t=++this.pos;e=this.readHexChar(this.input.indexOf("}",this.pos)-this.pos),++this.pos,e>1114111&&this.invalidStringToken(t,"Code point out of bounds");}else e=this.readHexChar(4);return e},Ra.readString=function(e){for(var t="",s=++this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated string constant");var i=this.input.charCodeAt(this.pos);if(i===e)break;92===i?(t+=this.input.slice(s,this.pos),t+=this.readEscapedChar(!1),s=this.pos):(_r(i,this.options.ecmaVersion>=10)&&this.raise(this.start,"Unterminated string constant"),++this.pos);}return t+=this.input.slice(s,this.pos++),this.finishToken(Pr.string,t)};var Da={};Ra.tryReadTemplateToken=function(){this.inTemplateElement=!0;try{this.readTmplToken();}catch(e){if(e!==Da)throw e;this.readInvalidTemplateToken();}this.inTemplateElement=!1;},Ra.invalidStringToken=function(e,t){if(this.inTemplateElement&&this.options.ecmaVersion>=9)throw Da;this.raise(e,t);},Ra.readTmplToken=function(){for(var e="",t=this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated template");var s=this.input.charCodeAt(this.pos);if(96===s||36===s&&123===this.input.charCodeAt(this.pos+1))return this.pos!==this.start||this.type!==Pr.template&&this.type!==Pr.invalidTemplate?(e+=this.input.slice(t,this.pos),this.finishToken(Pr.template,e)):36===s?(this.pos+=2,this.finishToken(Pr.dollarBraceL)):(++this.pos,this.finishToken(Pr.backQuote));if(92===s)e+=this.input.slice(t,this.pos),e+=this.readEscapedChar(!0),t=this.pos;else if(_r(s)){switch(e+=this.input.slice(t,this.pos),++this.pos,s){case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:e+="\n";break;default:e+=String.fromCharCode(s);}this.options.locations&&(++this.curLine,this.lineStart=this.pos),t=this.pos;}else ++this.pos;}},Ra.readInvalidTemplateToken=function(){for(;this.pos<this.input.length;this.pos++)switch(this.input[this.pos]){case"\\":++this.pos;break;case"$":if("{"!==this.input[this.pos+1])break;case"`":return this.finishToken(Pr.invalidTemplate,this.input.slice(this.start,this.pos))}this.raise(this.start,"Unterminated template");},Ra.readEscapedChar=function(e){var t=this.input.charCodeAt(++this.pos);switch(++this.pos,t){case 110:return "\n";case 114:return "\r";case 120:return String.fromCharCode(this.readHexChar(2));case 117:return Oa(this.readCodePoint());case 116:return "\t";case 98:return "\b";case 118:return "\v";case 102:return "\f";case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:return this.options.locations&&(this.lineStart=this.pos,++this.curLine),"";case 56:case 57:if(this.strict&&this.invalidStringToken(this.pos-1,"Invalid escape sequence"),e){var s=this.pos-1;return this.invalidStringToken(s,"Invalid escape sequence in template string"),null}default:if(t>=48&&t<=55){var i=this.input.substr(this.pos-1,3).match(/^[0-7]+/)[0],n=parseInt(i,8);return n>255&&(i=i.slice(0,-1),n=parseInt(i,8)),this.pos+=i.length-1,t=this.input.charCodeAt(this.pos),"0"===i&&56!==t&&57!==t||!this.strict&&!e||this.invalidStringToken(this.pos-1-i.length,e?"Octal literal in template string":"Octal literal in strict mode"),String.fromCharCode(n)}return _r(t)?"":String.fromCharCode(t)}},Ra.readHexChar=function(e){var t=this.pos,s=this.readInt(16,e);return null===s&&this.invalidStringToken(t,"Bad character escape sequence"),s},Ra.readWord1=function(){this.containsEsc=!1;for(var e="",t=!0,s=this.pos,i=this.options.ecmaVersion>=6;this.pos<this.input.length;){var n=this.fullCharCodeAtPos();if(yr(n,i))this.pos+=n<=65535?1:2;else {if(92!==n)break;this.containsEsc=!0,e+=this.input.slice(s,this.pos);var r=this.pos;117!==this.input.charCodeAt(++this.pos)&&this.invalidStringToken(this.pos,"Expecting Unicode escape sequence \\uXXXX"),++this.pos;var a=this.readCodePoint();(t?gr:yr)(a,i)||this.invalidStringToken(r,"Invalid Unicode escape"),e+=Oa(a),s=this.pos;}t=!1;}return e+this.input.slice(s,this.pos)},Ra.readWord=function(){var e=this.readWord1(),t=Pr.name;return this.keywords.test(e)&&(t=Sr[e]),this.finishToken(t,e)};jr.acorn={Parser:jr,version:"8.0.5",defaultOptions:Br,Position:Or,SourceLocation:Dr,getLineInfo:Vr,Node:aa,TokenType:xr,tokTypes:Pr,keywordTypes:Sr,TokContext:la,tokContexts:ca,isIdentifierChar:yr,isIdentifierStart:gr,Token:Ta,isNewLine:_r,lineBreak:Cr,lineBreakG:wr,nonASCIIwhitespace:kr};var Va=Object.freeze({__proto__:null,Node:aa,Parser:jr,Position:Or,SourceLocation:Dr,TokContext:la,Token:Ta,TokenType:xr,defaultOptions:Br,getLineInfo:Vr,isIdentifierChar:yr,isIdentifierStart:gr,isNewLine:_r,keywordTypes:Sr,lineBreak:Cr,lineBreakG:wr,nonASCIIwhitespace:kr,parse:function(e,t){return jr.parse(e,t)},parseExpressionAt:function(e,t,s){return jr.parseExpressionAt(e,t,s)},tokContexts:ca,tokTypes:Pr,tokenizer:function(e,t){return jr.tokenizer(e,t)},version:"8.0.5"});class Ba extends Oe{constructor(){super(),this.variables.set("undefined",new gt);}findVariable(e){let t=this.variables.get(e);return t||(t=new ct(e),this.variables.set(e,t)),t}}const Fa=e=>(...t)=>{ss({code:"NO_FS_IN_BROWSER",message:`Cannot access the file system (via "${e}") when using the browser build of Rollup. Make sure you supply a plugin with custom resolveId and load hooks to Rollup.`,url:"https://rollupjs.org/guide/en/#a-simple-example"});},Wa=Fa("fs.readFile"),Ua=Fa("fs.writeFile");async function ja(e,t,s,i,n,r,a){return await function(e,t,s,i,n,r){let a=null,o=null;if(n){a=new Set;for(const s of n)e===s.source&&t===s.importer&&a.add(s.plugin);o=(e,t)=>({...e,resolve:(e,s,{custom:r,skipSelf:a}=Ye)=>i(e,s,r,a?[...n,{importer:s,plugin:t,source:e}]:n)});}return s.hookFirst("resolveId",[e,t,{custom:r}],o,a)}(e,t,i,n,r,a)}function za(e,t,{hook:s,id:i}={}){return "string"==typeof e&&(e={message:e}),e.code&&e.code!==ns.PLUGIN_ERROR&&(e.pluginCode=e.code),e.code=ns.PLUGIN_ERROR,e.plugin=t,s&&(e.hook=s),i&&(e.id=i),ss(e)}const Ga=[{active:!0,deprecated:"resolveAssetUrl",replacement:"resolveFileUrl"}];const Ha={has:()=>!1,get(){},set(){},delete:()=>!1};function qa(e){return e.startsWith("at position ")||e.startsWith("at output position ")?ss({code:"ANONYMOUS_PLUGIN_CACHE",message:"A plugin is trying to use the Rollup cache but is not declaring a plugin name or cacheKey."}):ss({code:"DUPLICATE_PLUGIN_NAME",message:`The plugin name ${e} is being used twice in the same build. Plugin names must be distinct or provide a cacheKey (please post an issue to the plugin if you are a plugin user).`})}function Ka(e,t,s,i){const n=t.id,r=[];let a=null===e.map?null:On(e.map);const o=e.code;let h=e.ast;const c=[],u=[];let d=!1;const p=()=>d=!0;let f;const m=e.code;return s.hookReduceArg0("transform",[m,n],(function(e,s,n){let a,o;if("string"==typeof s)a=s;else {if(!s||"object"!=typeof s)return e;if(t.updateOptions(s),null==s.code)return (s.map||s.ast)&&i((l=n.name,{code:ns.NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE,message:`The plugin "${l}" returned a "map" or "ast" without returning a "code". This will be ignored.`})),e;({code:a,map:o,ast:h}=s);}var l;return null!==o&&r.push(On("string"==typeof o?JSON.parse(o):o)||{missing:!0,plugin:n.name}),a}),((e,t)=>{return f=t,{...e,cache:d?e.cache:(h=e.cache,g=p,{has:e=>(g(),h.has(e)),get:e=>(g(),h.get(e)),set:(e,t)=>(g(),h.set(e,t)),delete:e=>(g(),h.delete(e))}),warn(t,s){"string"==typeof t&&(t={message:t}),s&&is(t,s,m,n),t.id=n,t.hook="transform",e.warn(t);},error:(t,s)=>("string"==typeof t&&(t={message:t}),s&&is(t,s,m,n),t.id=n,t.hook="transform",e.error(t)),emitAsset:(t,s)=>(u.push({type:"asset",name:t,source:s}),e.emitAsset(t,s)),emitChunk:(t,s)=>(u.push({type:"chunk",id:t,name:s&&s.name}),e.emitChunk(t,s)),emitFile:e=>(u.push(e),s.emitFile(e)),addWatchFile(t){c.push(t),e.addWatchFile(t);},setAssetSource(){return this.error({code:"INVALID_SETASSETSOURCE",message:"setAssetSource cannot be called in transform for caching reasons. Use emitFile with a source, or call setAssetSource in another hook."})},getCombinedSourcemap(){const e=function(e,t,s,i,n){return i.length?{version:3,...Bi(e,t,s,i,Vi(n)).traceMappings()}:s}(n,o,a,r,i);if(!e){return new x(o).generateMap({includeContent:!0,hires:!0,source:n})}return a!==e&&(a=e,r.length=0),new l({...e,file:null,sourcesContent:e.sourcesContent})}};var h,g;})).catch((e=>za(e,f.name,{hook:"transform",id:n}))).then((e=>(d||u.length&&(t.transformFiles=u),{ast:h,code:e,customTransformCache:d,meta:t.info.meta,originalCode:o,originalSourcemap:a,sourcemapChain:r,transformDependencies:c})))}class Xa{constructor(e,t,s,i){this.graph=e,this.modulesById=t,this.options=s,this.pluginDriver=i,this.implicitEntryModules=new Set,this.indexedEntryModules=[],this.latestLoadModulesPromise=Promise.resolve(),this.nextEntryModuleIndex=0,this.resolveId=async(e,t,s,i=null)=>this.addDefaultsToResolvedId(this.getNormalizedResolvedIdWithoutDefaults(!this.options.external(e,t,!1)&&await ja(e,t,this.options.preserveSymlinks,this.pluginDriver,this.resolveId,i,s),t,e)),this.hasModuleSideEffects=s.treeshake?s.treeshake.moduleSideEffects:()=>!0;}async addAdditionalModules(e){const t=this.extendLoadModulesPromise(Promise.all(e.map((e=>this.loadEntryModule(e,!1,void 0,null)))));return await this.awaitLoadModulesPromise(),t}async addEntryModules(e,t){const s=this.nextEntryModuleIndex;this.nextEntryModuleIndex+=e.length;const i=await this.extendLoadModulesPromise(Promise.all(e.map((({id:e,importer:t})=>this.loadEntryModule(e,!0,t,null)))).then((i=>{let n=s;for(let s=0;s<i.length;s++){const r=i[s];r.isUserDefinedEntryPoint=r.isUserDefinedEntryPoint||t,Qa(r,e[s],t);const a=this.indexedEntryModules.find((e=>e.module===r));a?a.index=Math.min(a.index,n):this.indexedEntryModules.push({module:r,index:n}),n++;}return this.indexedEntryModules.sort((({index:e},{index:t})=>e>t?1:-1)),i})));return await this.awaitLoadModulesPromise(),{entryModules:this.indexedEntryModules.map((({module:e})=>e)),implicitEntryModules:[...this.implicitEntryModules],newEntryModules:i}}async emitChunk({fileName:e,id:t,importer:s,name:i,implicitlyLoadedAfterOneOf:n,preserveSignature:r}){const a={fileName:e||null,id:t,importer:s,name:i||null},o=n?await this.addEntryWithImplicitDependants(a,n):(await this.addEntryModules([a],!1)).newEntryModules[0];return null!=r&&(o.preserveSignature=r),o}addDefaultsToResolvedId(e){var t,s;if(!e)return null;const i=e.external||!1;return {external:i,id:e.id,meta:e.meta||Qe,moduleSideEffects:null!==(t=e.moduleSideEffects)&&void 0!==t?t:this.hasModuleSideEffects(e.id,!!i),syntheticNamedExports:null!==(s=e.syntheticNamedExports)&&void 0!==s&&s}}addEntryWithImplicitDependants(e,t){return this.extendLoadModulesPromise(this.loadEntryModule(e.id,!1,e.importer,null).then((async s=>{if(Qa(s,e,!1),!s.info.isEntry){this.implicitEntryModules.add(s);const i=await Promise.all(t.map((t=>this.loadEntryModule(t,!1,e.importer,s.id))));for(const e of i)s.implicitlyLoadedAfter.add(e);for(const e of s.implicitlyLoadedAfter)e.implicitlyLoadedBefore.add(s);}return s})))}async addModuleSource(e,t,s){var i;let n;wi("load modules",3);try{n=null!==(i=await this.pluginDriver.hookFirst("load",[e]))&&void 0!==i?i:await Wa(e);}catch(s){_i("load modules",3);let i=`Could not load ${e}`;throw t&&(i+=` (imported by ${es(t)})`),i+=`: ${s.message}`,s.message=i,s}_i("load modules",3);const r="string"==typeof n?{code:n}:"object"==typeof n&&"string"==typeof n.code?n:ss(function(e){return {code:ns.BAD_LOADER,message:`Error loading ${es(e)}: plugin load hook should return a string, a { code, map } object, or nothing/null`}}(e)),a=this.graph.cachedModules.get(e);if(a&&!a.customTransformCache&&a.originalCode===r.code){if(a.transformFiles)for(const e of a.transformFiles)this.pluginDriver.emitFile(e);s.setSource(a);}else s.updateOptions(r),s.setSource(await Ka(r,s,this.pluginDriver,this.options.onwarn));}async awaitLoadModulesPromise(){let e;do{e=this.latestLoadModulesPromise,await e;}while(e!==this.latestLoadModulesPromise)}extendLoadModulesPromise(e){return this.latestLoadModulesPromise=Promise.all([e,this.latestLoadModulesPromise]),this.latestLoadModulesPromise.catch((()=>{})),e}async fetchDynamicDependencies(e){const t=await Promise.all(e.dynamicImports.map((async t=>{const s=await this.resolveDynamicImport(e,"string"==typeof t.argument?t.argument:t.argument.esTreeNode,e.id);return null===s?null:"string"==typeof s?(t.resolution=s,null):t.resolution=await this.fetchResolvedDependency(es(s.id),e.id,s)})));for(const s of t)s&&(e.dynamicDependencies.add(s),s.dynamicImporters.push(e.id));}async fetchModule({id:e,meta:t,moduleSideEffects:s,syntheticNamedExports:i},n,r){const a=this.modulesById.get(e);if(a instanceof Ri){if(r){a.info.isEntry=!0,this.implicitEntryModules.delete(a);for(const e of a.implicitlyLoadedAfter)e.implicitlyLoadedBefore.delete(a);a.implicitlyLoadedAfter.clear();}return a}const o=new Ri(this.graph,e,this.options,r,s,i,t);return this.modulesById.set(e,o),this.graph.watchFiles[e]=!0,await this.addModuleSource(e,n,o),await this.pluginDriver.hookParallel("moduleParsed",[o.info]),await Promise.all([this.fetchStaticDependencies(o),this.fetchDynamicDependencies(o)]),o.linkImports(),o}fetchResolvedDependency(e,t,s){if(s.external){const{external:i,id:n,moduleSideEffects:r,meta:a}=s;this.modulesById.has(n)||this.modulesById.set(n,new Nt(this.options,n,r,a,"absolute"!==i&&A(n)));const o=this.modulesById.get(n);return o instanceof Nt?Promise.resolve(o):ss(function(e,t){return {code:ns.INVALID_EXTERNAL_ID,message:`'${e}' is imported as an external by ${es(t)}, but is already an existing non-external module id.`}}(e,t))}return this.fetchModule(s,t,!1)}async fetchStaticDependencies(e){for(const t of await Promise.all(Array.from(e.sources,(async t=>this.fetchResolvedDependency(t,e.id,e.resolvedIds[t]=e.resolvedIds[t]||this.handleResolveId(await this.resolveId(t,e.id,Qe),t,e.id))))))e.dependencies.add(t),t.importers.push(e.id);}getNormalizedResolvedIdWithoutDefaults(e,t,s){const{makeAbsoluteExternalsRelative:i}=this.options;if(e){if("object"==typeof e){const n=e.external||this.options.external(e.id,t,!0);return {...e,external:n&&("relative"===n||!A(e.id)||!0===n&&Ja(e.id,s,i)||"absolute")}}const n=this.options.external(e,t,!0);return {external:n&&(Ja(e,s,i)||"absolute"),id:n&&i?Ya(e,t):e}}const n=i?Ya(s,t):s;return !1===e||this.options.external(n,t,!0)?{external:Ja(n,s,i)||"absolute",id:n}:null}handleResolveId(e,t,s){return null===e?P(t)?ss(function(e,t){return {code:ns.UNRESOLVED_IMPORT,message:`Could not resolve '${e}' from ${es(t)}`}}(t,s)):(this.options.onwarn(function(e,t){return {code:ns.UNRESOLVED_IMPORT,importer:es(t),message:`'${e}' is imported by ${es(t)}, but could not be resolved – treating it as an external dependency`,source:e,url:"https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency"}}(t,s)),{external:!0,id:t,meta:Qe,moduleSideEffects:this.hasModuleSideEffects(t,!0),syntheticNamedExports:!1}):(e.external&&e.syntheticNamedExports&&this.options.onwarn(function(e,t){return {code:ns.EXTERNAL_SYNTHETIC_EXPORTS,importer:es(t),message:`External '${e}' can not have 'syntheticNamedExports' enabled.`,source:e}}(t,s)),e)}async loadEntryModule(e,t,s,i){const n=await ja(e,s,this.options.preserveSymlinks,this.pluginDriver,this.resolveId,null,Qe);return null==n?ss(null===i?function(e){return {code:ns.UNRESOLVED_ENTRY,message:`Could not resolve entry module (${es(e)}).`}}(e):function(e,t){return {code:ns.MISSING_IMPLICIT_DEPENDANT,message:`Module "${es(e)}" that should be implicitly loaded before "${es(t)}" could not be resolved.`}}(e,i)):!1===n||"object"==typeof n&&n.external?ss(null===i?function(e){return {code:ns.UNRESOLVED_ENTRY,message:`Entry module cannot be external (${es(e)}).`}}(e):function(e,t){return {code:ns.MISSING_IMPLICIT_DEPENDANT,message:`Module "${es(e)}" that should be implicitly loaded before "${es(t)}" cannot be external.`}}(e,i)):this.fetchModule(this.addDefaultsToResolvedId("object"==typeof n?n:{id:n}),void 0,t)}async resolveDynamicImport(e,t,s){const i=await this.pluginDriver.hookFirst("resolveDynamicImport",[t,s]);return "string"!=typeof t?"string"==typeof i?i:i?{external:!1,moduleSideEffects:!0,...i}:null:null==i?e.resolvedIds[t]=e.resolvedIds[t]||this.handleResolveId(await this.resolveId(t,e.id,Qe),t,e.id):this.handleResolveId(this.addDefaultsToResolvedId(this.getNormalizedResolvedIdWithoutDefaults(i,s,t)),t,s)}}function Ya(e,t){return P(e)?t?I(t,"..",e):I(e):e}function Qa(e,{fileName:t,name:s},i){null!==t?e.chunkFileNames.add(t):null!==s&&(null===e.chunkName&&(e.chunkName=s),i&&e.userChunkNames.add(s));}function Ja(e,t,s){return !0===s||"ifRelativeSource"===s&&P(t)||!A(e)}function Za(e,t,s,i,n,r){let a=!1;return (...o)=>(a||(a=!0,fs({message:`The "this.${t}" plugin context function used by plugin ${i} is deprecated. The "this.${s}" plugin context function should be used instead.`,plugin:i},n,r)),e(...o))}function eo(e,t,s,i,n,r){let a,o=!0;if("string"!=typeof e.cacheKey&&(e.name.startsWith("at position ")||e.name.startsWith("at output position ")||r.has(e.name)?o=!1:r.add(e.name)),t)if(o){const s=e.cacheKey||e.name;l=t[s]||(t[s]=Object.create(null)),a={has(e){const t=l[e];return !!t&&(t[0]=0,!0)},get(e){const t=l[e];if(t)return t[0]=0,t[1]},set(e,t){l[e]=[0,t];},delete:e=>delete l[e]};}else h=e.name,a={has:()=>qa(h),get:()=>qa(h),set:()=>qa(h),delete:()=>qa(h)};else a=Ha;var h,l;return {addWatchFile(e){if(s.phase>=Kn.GENERATE)return this.error({code:ns.INVALID_ROLLUP_PHASE,message:"Cannot call addWatchFile after the build has finished."});s.watchFiles[e]=!0;},cache:a,emitAsset:Za(((e,t)=>n.emitFile({type:"asset",name:e,source:t})),"emitAsset","emitFile",e.name,!0,i),emitChunk:Za(((e,t)=>n.emitFile({type:"chunk",id:e,name:t&&t.name})),"emitChunk","emitFile",e.name,!0,i),emitFile:n.emitFile,error:t=>za(t,e.name),getAssetFileName:Za(n.getFileName,"getAssetFileName","getFileName",e.name,!0,i),getChunkFileName:Za(n.getFileName,"getChunkFileName","getFileName",e.name,!0,i),getFileName:n.getFileName,getModuleIds:()=>s.modulesById.keys(),getModuleInfo:s.getModuleInfo,getWatchFiles:()=>Object.keys(s.watchFiles),isExternal:Za(((e,t,s=!1)=>i.external(e,t,s)),"isExternal","resolve",e.name,!0,i),meta:{rollupVersion:"2.45.0",watchMode:s.watchMode},get moduleIds(){const t=s.modulesById.keys();return function*(){fs({message:`Accessing "this.moduleIds" on the plugin context by plugin ${e.name} is deprecated. The "this.getModuleIds" plugin context function should be used instead.`,plugin:e.name},!1,i),yield*t;}()},parse:s.contextParse.bind(s),resolve:(t,i,{custom:n,skipSelf:r}=Ye)=>s.moduleLoader.resolveId(t,i,n,r?[{importer:i,plugin:e,source:t}]:null),resolveId:Za(((e,t)=>s.moduleLoader.resolveId(e,t,Ye).then((e=>e&&e.id))),"resolveId","resolve",e.name,!0,i),setAssetSource:n.setAssetSource,warn(t){"string"==typeof t&&(t={message:t}),t.code&&(t.pluginCode=t.code),t.code="PLUGIN_WARNING",t.plugin=e.name,i.onwarn(t);}}}const to=Object.keys({buildEnd:1,buildStart:1,closeBundle:1,closeWatcher:1,load:1,moduleParsed:1,options:1,resolveDynamicImport:1,resolveId:1,transform:1,watchChange:1});function so(e,t){return ss({code:"INVALID_PLUGIN_HOOK",message:`Error running plugin hook ${e} for ${t}, expected a function hook.`})}class io{constructor(e,t,s,i,n){this.graph=e,this.options=t,this.pluginContexts=new Map,function(e,t){for(const{active:s,deprecated:i,replacement:n}of Ga)for(const r of e)i in r&&fs({message:`The "${i}" hook used by plugin ${r.name} is deprecated. The "${n}" hook should be used instead.`,plugin:r.name},s,t);}(s,t),this.pluginCache=i,this.fileEmitter=new er(e,t,n&&n.fileEmitter),this.emitFile=this.fileEmitter.emitFile,this.getFileName=this.fileEmitter.getFileName,this.finaliseAssets=this.fileEmitter.assertAssetsFinalized,this.setOutputBundle=this.fileEmitter.setOutputBundle,this.plugins=s.concat(n?n.plugins:[]);const r=new Set;for(const s of this.plugins)this.pluginContexts.set(s,eo(s,i,e,t,this.fileEmitter,r));if(n)for(const e of s)for(const s of to)s in e&&t.onwarn((a=e.name,o=s,{code:ns.INPUT_HOOK_IN_OUTPUT_PLUGIN,message:`The "${o}" hook used by the output plugin ${a} is a build time hook and will not be run for that plugin. Either this plugin cannot be used as an output plugin, or it should have an option to configure it as an output plugin.`}));var a,o;}createOutputPluginDriver(e){return new io(this.graph,this.options,e,this.pluginCache,this)}hookFirst(e,t,s,i){let n=Promise.resolve(void 0);for(const r of this.plugins)i&&i.has(r)||(n=n.then((i=>null!=i?i:this.runHook(e,t,r,!1,s))));return n}hookFirstSync(e,t,s){for(const i of this.plugins){const n=this.runHookSync(e,t,i,s);if(null!=n)return n}return null}hookParallel(e,t,s){const i=[];for(const n of this.plugins){const r=this.runHook(e,t,n,!1,s);r&&i.push(r);}return Promise.all(i).then((()=>{}))}hookReduceArg0(e,[t,...s],i,n){let r=Promise.resolve(t);for(const t of this.plugins)r=r.then((r=>{const a=[r,...s],o=this.runHook(e,a,t,!1,n);return o?o.then((e=>i.call(this.pluginContexts.get(t),r,e,t))):r}));return r}hookReduceArg0Sync(e,[t,...s],i,n){for(const r of this.plugins){const a=[t,...s],o=this.runHookSync(e,a,r,n);t=i.call(this.pluginContexts.get(r),t,o,r);}return t}hookReduceValue(e,t,s,i,n){let r=Promise.resolve(t);for(const t of this.plugins)r=r.then((r=>{const a=this.runHook(e,s,t,!0,n);return a?a.then((e=>i.call(this.pluginContexts.get(t),r,e,t))):r}));return r}hookReduceValueSync(e,t,s,i,n){let r=t;for(const t of this.plugins){const a=this.runHookSync(e,s,t,n);r=i.call(this.pluginContexts.get(t),r,a,t);}return r}hookSeq(e,t,s){let i=Promise.resolve();for(const n of this.plugins)i=i.then((()=>this.runHook(e,t,n,!1,s)));return i}hookSeqSync(e,t,s){for(const i of this.plugins)this.runHookSync(e,t,i,s);}runHook(e,t,s,i,n){const r=s[e];if(!r)return;let a=this.pluginContexts.get(s);return n&&(a=n(a,s)),Promise.resolve().then((()=>"function"!=typeof r?i?r:so(e,s.name):r.apply(a,t))).catch((t=>za(t,s.name,{hook:e})))}runHookSync(e,t,s,i){const n=s[e];if(!n)return;let r=this.pluginContexts.get(s);i&&(r=i(r,s));try{return "function"!=typeof n?so(e,s.name):n.apply(r,t)}catch(t){return za(t,s.name,{hook:e})}}}function no(e,t,s){s(e,t);}function ro(e,t,s){}var ao={};function oo(e,t,s=e.type){let i=t.commentNodes[t.commentIndex];for(;i&&e.start>=i.end;)ho(e,i),i=t.commentNodes[++t.commentIndex];i&&i.end<=e.end&&ao[s](e,t,oo);}function ho(e,t){for(e._rollupAnnotations?e._rollupAnnotations.push({comment:t}):e._rollupAnnotations=[{comment:t}];"ExpressionStatement"===e.type||"ChainExpression"===e.type;)e=e.expression;"CallExpression"!==e.type&&"NewExpression"!==e.type||(e._rollupAnnotations?e._rollupAnnotations.push({pure:!0}):e._rollupAnnotations=[{pure:!0}]);}ao.Program=ao.BlockStatement=function(e,t,s){for(var i=0,n=e.body;i<n.length;i+=1){s(n[i],t,"Statement");}},ao.Statement=no,ao.EmptyStatement=ro,ao.ExpressionStatement=ao.ParenthesizedExpression=ao.ChainExpression=function(e,t,s){return s(e.expression,t,"Expression")},ao.IfStatement=function(e,t,s){s(e.test,t,"Expression"),s(e.consequent,t,"Statement"),e.alternate&&s(e.alternate,t,"Statement");},ao.LabeledStatement=function(e,t,s){return s(e.body,t,"Statement")},ao.BreakStatement=ao.ContinueStatement=ro,ao.WithStatement=function(e,t,s){s(e.object,t,"Expression"),s(e.body,t,"Statement");},ao.SwitchStatement=function(e,t,s){s(e.discriminant,t,"Expression");for(var i=0,n=e.cases;i<n.length;i+=1){var r=n[i];r.test&&s(r.test,t,"Expression");for(var a=0,o=r.consequent;a<o.length;a+=1){s(o[a],t,"Statement");}}},ao.SwitchCase=function(e,t,s){e.test&&s(e.test,t,"Expression");for(var i=0,n=e.consequent;i<n.length;i+=1){s(n[i],t,"Statement");}},ao.ReturnStatement=ao.YieldExpression=ao.AwaitExpression=function(e,t,s){e.argument&&s(e.argument,t,"Expression");},ao.ThrowStatement=ao.SpreadElement=function(e,t,s){return s(e.argument,t,"Expression")},ao.TryStatement=function(e,t,s){s(e.block,t,"Statement"),e.handler&&s(e.handler,t),e.finalizer&&s(e.finalizer,t,"Statement");},ao.CatchClause=function(e,t,s){e.param&&s(e.param,t,"Pattern"),s(e.body,t,"Statement");},ao.WhileStatement=ao.DoWhileStatement=function(e,t,s){s(e.test,t,"Expression"),s(e.body,t,"Statement");},ao.ForStatement=function(e,t,s){e.init&&s(e.init,t,"ForInit"),e.test&&s(e.test,t,"Expression"),e.update&&s(e.update,t,"Expression"),s(e.body,t,"Statement");},ao.ForInStatement=ao.ForOfStatement=function(e,t,s){s(e.left,t,"ForInit"),s(e.right,t,"Expression"),s(e.body,t,"Statement");},ao.ForInit=function(e,t,s){"VariableDeclaration"===e.type?s(e,t):s(e,t,"Expression");},ao.DebuggerStatement=ro,ao.FunctionDeclaration=function(e,t,s){return s(e,t,"Function")},ao.VariableDeclaration=function(e,t,s){for(var i=0,n=e.declarations;i<n.length;i+=1){s(n[i],t);}},ao.VariableDeclarator=function(e,t,s){s(e.id,t,"Pattern"),e.init&&s(e.init,t,"Expression");},ao.Function=function(e,t,s){e.id&&s(e.id,t,"Pattern");for(var i=0,n=e.params;i<n.length;i+=1){s(n[i],t,"Pattern");}s(e.body,t,e.expression?"Expression":"Statement");},ao.Pattern=function(e,t,s){"Identifier"===e.type?s(e,t,"VariablePattern"):"MemberExpression"===e.type?s(e,t,"MemberPattern"):s(e,t);},ao.VariablePattern=ro,ao.MemberPattern=no,ao.RestElement=function(e,t,s){return s(e.argument,t,"Pattern")},ao.ArrayPattern=function(e,t,s){for(var i=0,n=e.elements;i<n.length;i+=1){var r=n[i];r&&s(r,t,"Pattern");}},ao.ObjectPattern=function(e,t,s){for(var i=0,n=e.properties;i<n.length;i+=1){var r=n[i];"Property"===r.type?(r.computed&&s(r.key,t,"Expression"),s(r.value,t,"Pattern")):"RestElement"===r.type&&s(r.argument,t,"Pattern");}},ao.Expression=no,ao.ThisExpression=ao.Super=ao.MetaProperty=ro,ao.ArrayExpression=function(e,t,s){for(var i=0,n=e.elements;i<n.length;i+=1){var r=n[i];r&&s(r,t,"Expression");}},ao.ObjectExpression=function(e,t,s){for(var i=0,n=e.properties;i<n.length;i+=1){s(n[i],t);}},ao.FunctionExpression=ao.ArrowFunctionExpression=ao.FunctionDeclaration,ao.SequenceExpression=function(e,t,s){for(var i=0,n=e.expressions;i<n.length;i+=1){s(n[i],t,"Expression");}},ao.TemplateLiteral=function(e,t,s){for(var i=0,n=e.quasis;i<n.length;i+=1){s(n[i],t);}for(var r=0,a=e.expressions;r<a.length;r+=1){s(a[r],t,"Expression");}},ao.TemplateElement=ro,ao.UnaryExpression=ao.UpdateExpression=function(e,t,s){s(e.argument,t,"Expression");},ao.BinaryExpression=ao.LogicalExpression=function(e,t,s){s(e.left,t,"Expression"),s(e.right,t,"Expression");},ao.AssignmentExpression=ao.AssignmentPattern=function(e,t,s){s(e.left,t,"Pattern"),s(e.right,t,"Expression");},ao.ConditionalExpression=function(e,t,s){s(e.test,t,"Expression"),s(e.consequent,t,"Expression"),s(e.alternate,t,"Expression");},ao.NewExpression=ao.CallExpression=function(e,t,s){if(s(e.callee,t,"Expression"),e.arguments)for(var i=0,n=e.arguments;i<n.length;i+=1){s(n[i],t,"Expression");}},ao.MemberExpression=function(e,t,s){s(e.object,t,"Expression"),e.computed&&s(e.property,t,"Expression");},ao.ExportNamedDeclaration=ao.ExportDefaultDeclaration=function(e,t,s){e.declaration&&s(e.declaration,t,"ExportNamedDeclaration"===e.type||e.declaration.id?"Statement":"Expression"),e.source&&s(e.source,t,"Expression");},ao.ExportAllDeclaration=function(e,t,s){e.exported&&s(e.exported,t),s(e.source,t,"Expression");},ao.ImportDeclaration=function(e,t,s){for(var i=0,n=e.specifiers;i<n.length;i+=1){s(n[i],t);}s(e.source,t,"Expression");},ao.ImportExpression=function(e,t,s){s(e.source,t,"Expression");},ao.ImportSpecifier=ao.ImportDefaultSpecifier=ao.ImportNamespaceSpecifier=ao.Identifier=ao.Literal=ro,ao.TaggedTemplateExpression=function(e,t,s){s(e.tag,t,"Expression"),s(e.quasi,t,"Expression");},ao.ClassDeclaration=ao.ClassExpression=function(e,t,s){return s(e,t,"Class")},ao.Class=function(e,t,s){e.id&&s(e.id,t,"Pattern"),e.superClass&&s(e.superClass,t,"Expression"),s(e.body,t);},ao.ClassBody=function(e,t,s){for(var i=0,n=e.body;i<n.length;i+=1){s(n[i],t);}},ao.MethodDefinition=ao.Property=function(e,t,s){e.computed&&s(e.key,t,"Expression"),s(e.value,t,"Expression");},ao.PropertyDefinition=function(e,t,s){e.computed&&s(e.key,t,"Expression"),e.value&&s(e.value,t,"Expression");};const lo=/[@#]__PURE__/,co=e=>lo.test(e.value);class uo{constructor(e,t){var s,i;if(this.options=e,this.entryModules=[],this.modulesById=new Map,this.needsTreeshakingPass=!1,this.phase=Kn.LOAD_AND_PARSE,this.watchFiles=Object.create(null),this.watchMode=!1,this.externalModules=[],this.implicitEntryModules=[],this.modules=[],this.getModuleInfo=e=>{const t=this.modulesById.get(e);return t?t.info:null},this.deoptimizationTracker=new J,this.cachedModules=new Map,!1!==e.cache){if(null===(s=e.cache)||void 0===s?void 0:s.modules)for(const t of e.cache.modules)this.cachedModules.set(t.id,t);this.pluginCache=(null===(i=e.cache)||void 0===i?void 0:i.plugins)||Object.create(null);for(const e in this.pluginCache){const t=this.pluginCache[e];for(const e of Object.keys(t))t[e][0]++;}}if(t){this.watchMode=!0;const e=(...e)=>this.pluginDriver.hookSeqSync("watchChange",e),s=()=>this.pluginDriver.hookSeqSync("closeWatcher",[]);t.on("change",e),t.on("close",s),t.once("restart",(()=>{t.removeListener("change",e),t.removeListener("close",s);}));}this.pluginDriver=new io(this,e,e.plugins,this.pluginCache),this.scope=new Ba,this.acornParser=jr.extend(...e.acornInjectPlugins),this.moduleLoader=new Xa(this,this.modulesById,this.options,this.pluginDriver);}async build(){wi("generate module graph",2),await this.generateModuleGraph(),_i("generate module graph",2),wi("sort modules",2),this.phase=Kn.ANALYSE,this.sortModules(),_i("sort modules",2),wi("mark included statements",2),this.includeStatements(),_i("mark included statements",2),this.phase=Kn.GENERATE;}contextParse(e,t={}){const s=t.onComment,i=[];t.onComment=s&&"function"==typeof s?(e,n,r,a,...o)=>(i.push({type:e?"Block":"Line",value:n,start:r,end:a}),s.call(t,e,n,r,a,...o)):i;const n=this.acornParser.parse(e,{...this.options.acorn,...t});return "object"==typeof s&&s.push(...i),t.onComment=s,function(e,t){oo(t,{commentIndex:0,commentNodes:e.filter(co)});}(i,n),n}getCache(){for(const e in this.pluginCache){const t=this.pluginCache[e];let s=!0;for(const e of Object.keys(t))t[e][0]>=this.options.experimentalCacheExpiry?delete t[e]:s=!1;s&&delete this.pluginCache[e];}return {modules:this.modules.map((e=>e.toJSON())),plugins:this.pluginCache}}async generateModuleGraph(){var e;if(({entryModules:this.entryModules,implicitEntryModules:this.implicitEntryModules}=await this.moduleLoader.addEntryModules((e=this.options.input,Array.isArray(e)?e.map((e=>({fileName:null,id:e,implicitlyLoadedAfter:[],importer:void 0,name:null}))):Object.keys(e).map((t=>({fileName:null,id:e[t],implicitlyLoadedAfter:[],importer:void 0,name:t})))),!0)),0===this.entryModules.length)throw new Error("You must supply options.input to rollup");for(const e of this.modulesById.values())e instanceof Ri?this.modules.push(e):this.externalModules.push(e);}includeStatements(){for(const e of [...this.entryModules,...this.implicitEntryModules])!1!==e.preserveSignature?e.includeAllExports(!1):$i(e);if(this.options.treeshake){let e=1;do{wi(`treeshaking pass ${e}`,3),this.needsTreeshakingPass=!1;for(const e of this.modules)e.isExecuted&&("no-treeshake"===e.info.hasModuleSideEffects?e.includeAllInBundle():e.include());_i("treeshaking pass "+e++,3);}while(this.needsTreeshakingPass)}else for(const e of this.modules)e.includeAllInBundle();for(const e of this.externalModules)e.warnUnusedImports();for(const e of this.implicitEntryModules)for(const t of e.implicitlyLoadedAfter)t.info.isEntry||t.isIncluded()||ss(hs(t));}sortModules(){const{orderedModules:e,cyclePaths:t}=function(e){let t=0;const s=[],i=new Set,n=new Set,r=new Map,a=[],o=e=>{if(e instanceof Ri){for(const t of e.dependencies)r.has(t)?i.has(t)||s.push(qn(t,e,r)):(r.set(t,e),o(t));for(const t of e.implicitlyLoadedBefore)n.add(t);for(const{resolution:t}of e.dynamicImports)t instanceof Ri&&n.add(t);a.push(e);}e.execIndex=t++,i.add(e);};for(const t of e)r.has(t)||(r.set(t,null),o(t));for(const e of n)r.has(e)||(r.set(e,null),o(e));return {orderedModules:a,cyclePaths:s}}(this.entryModules);for(const e of t)this.options.onwarn({code:"CIRCULAR_DEPENDENCY",cycle:e,importer:e[0],message:`Circular dependency: ${e.join(" -> ")}`});this.modules=e;for(const e of this.modules)e.bindReferences();this.warnForMissingExports();}warnForMissingExports(){for(const e of this.modules)for(const t of Object.keys(e.importDescriptions)){const s=e.importDescriptions[t];"*"===s.name||s.module.getVariableForExportName(s.name)||e.warn({code:"NON_EXISTENT_EXPORT",message:`Non-existent export '${s.name}' is imported from ${es(s.module.id)}`,name:s.name,source:s.module.id},s.start);}}}function po(e){return Array.isArray(e)?e.filter(Boolean):e?[e]:[]}var fo=Fi(Va);const mo=Object.getPrototypeOf||(e=>e.__proto__);var go=function(e){if(e.prototype.parsePrivateName)return e;const t=(e=>{if(e.acorn)return e.acorn;const t=fo;if(0!=t.version.indexOf("6.")&&0==t.version.indexOf("6.0.")&&0!=t.version.indexOf("7."))throw new Error(`acorn-private-class-elements requires acorn@^6.1.0 or acorn@7.0.0, not ${t.version}`);for(let s=e;s&&s!==t.Parser;s=mo(s))if(s!==t.Parser)throw new Error("acorn-private-class-elements does not support mixing different acorn copies");return t})(e);return (e=class extends e{_branch(){return this.__branch=this.__branch||new e({ecmaVersion:this.options.ecmaVersion},this.input),this.__branch.end=this.end,this.__branch.pos=this.pos,this.__branch.type=this.type,this.__branch.value=this.value,this.__branch.containsEsc=this.containsEsc,this.__branch}parsePrivateClassElementName(e){e.computed=!1,e.key=this.parsePrivateName(),"constructor"==e.key.name&&this.raise(e.key.start,"Classes may not have a private element named constructor");const t={get:"set",set:"get"}[e.kind],s=this._privateBoundNames;return Object.prototype.hasOwnProperty.call(s,e.key.name)&&s[e.key.name]!==t&&this.raise(e.start,"Duplicate private element"),s[e.key.name]=e.kind||!0,delete this._unresolvedPrivateNames[e.key.name],e.key}parsePrivateName(){const e=this.startNode();return e.name=this.value,this.next(),this.finishNode(e,"PrivateIdentifier"),"never"==this.options.allowReserved&&this.checkUnreserved(e),e}getTokenFromCode(e){if(35===e){++this.pos;const e=this.readWord1();return this.finishToken(this.privateIdentifierToken,e)}return super.getTokenFromCode(e)}parseClass(e,t){const s=this._outerPrivateBoundNames;this._outerPrivateBoundNames=this._privateBoundNames,this._privateBoundNames=Object.create(this._privateBoundNames||null);const i=this._outerUnresolvedPrivateNames;this._outerUnresolvedPrivateNames=this._unresolvedPrivateNames,this._unresolvedPrivateNames=Object.create(null);const n=super.parseClass(e,t),r=this._unresolvedPrivateNames;if(this._privateBoundNames=this._outerPrivateBoundNames,this._outerPrivateBoundNames=s,this._unresolvedPrivateNames=this._outerUnresolvedPrivateNames,this._outerUnresolvedPrivateNames=i,this._unresolvedPrivateNames)Object.assign(this._unresolvedPrivateNames,r);else {const e=Object.keys(r);e.length&&(e.sort(((e,t)=>r[e]-r[t])),this.raise(r[e[0]],"Usage of undeclared private name"));}return n}parseClassSuper(e){const t=this._privateBoundNames;this._privateBoundNames=this._outerPrivateBoundNames;const s=this._unresolvedPrivateNames;this._unresolvedPrivateNames=this._outerUnresolvedPrivateNames;const i=super.parseClassSuper(e);return this._privateBoundNames=t,this._unresolvedPrivateNames=s,i}parseSubscript(e,s,i,n,r,a){const o=this.options.ecmaVersion>=11&&t.tokTypes.questionDot,h=this._branch();if(!(h.eat(t.tokTypes.dot)||o&&h.eat(t.tokTypes.questionDot))||h.type!=this.privateIdentifierToken)return super.parseSubscript.apply(this,arguments);let l=!1;this.eat(t.tokTypes.dot)||(this.expect(t.tokTypes.questionDot),l=!0);let c=this.startNodeAt(s,i);return c.object=e,c.computed=!1,o&&(c.optional=l),this.type==this.privateIdentifierToken?("Super"==e.type&&this.raise(this.start,"Cannot access private element on super"),c.property=this.parsePrivateName(),this._privateBoundNames&&this._privateBoundNames[c.property.name]||(this._unresolvedPrivateNames||this.raise(c.property.start,"Usage of undeclared private name"),this._unresolvedPrivateNames[c.property.name]=c.property.start)):c.property=this.parseIdent(!0),this.finishNode(c,"MemberExpression")}parseMaybeUnary(e,t){const s=super.parseMaybeUnary(e,t);return "delete"==s.operator&&"MemberExpression"==s.argument.type&&"PrivateIdentifier"==s.argument.property.type&&this.raise(s.start,"Private elements may not be deleted"),s}}).prototype.privateIdentifierToken=new t.TokenType("privateIdentifier"),e};const yo=go;var xo=function(e){const t=(e.acorn||fo).tokTypes;return e=yo(e),class extends e{_maybeParseFieldValue(e){if(this.eat(t.eq)){const s=this._inFieldValue;this._inFieldValue=!0,this.type===t.name&&"await"===this.value&&(this.inAsync||this.options.allowAwaitOutsideFunction)?e.value=this.parseAwait():e.value=this.parseExpression(),this._inFieldValue=s;}else e.value=null;}parseClassElement(e){if(this.options.ecmaVersion>=8&&(this.type==t.name||this.type.keyword||this.type==this.privateIdentifierToken||this.type==t.bracketL||this.type==t.string||this.type==t.num)){const e=this._branch();if(e.type==t.bracketL){let s=0;do{e.eat(t.bracketL)?++s:e.eat(t.bracketR)?--s:e.next();}while(s>0)}else e.next(!0);let s=e.type==t.eq||e.type==t.semi;if(!s&&e.canInsertSemicolon()&&(s=e.type!=t.parenL),s){const e=this.startNode();return this.type==this.privateIdentifierToken?this.parsePrivateClassElementName(e):this.parsePropertyName(e),("Identifier"===e.key.type&&"constructor"===e.key.name||"Literal"===e.key.type&&"constructor"===e.key.value)&&this.raise(e.key.start,"Classes may not have a field called constructor"),this.enterScope(67),this._maybeParseFieldValue(e),this.exitScope(),this.finishNode(e,"PropertyDefinition"),this.semicolon(),e}}return super.parseClassElement.apply(this,arguments)}parseIdent(e,t){const s=super.parseIdent(e,t);return this._inFieldValue&&"arguments"==s.name&&this.raise(s.start,"A class field initializer may not contain arguments"),s}}};function Eo(e){const t=go(e);return class extends t{parseClassElement(e){const t=this._inClassMemberName;this._inClassMemberName=!0;const s=super.parseClassElement.apply(this,arguments);return this._inClassMemberName=t,s}parsePropertyName(e){const t=this.options.ecmaVersion>=8&&this._inClassMemberName&&this.type==this.privateIdentifierToken&&!e.static;return this._inClassMemberName=!1,t?this.parsePrivateClassElementName(e):super.parsePropertyName(e)}}}const vo=go;var bo=function(e){const t=vo(e),s=(e.acorn||fo).tokTypes;return class extends t{_maybeParseFieldValue(e){if(this.eat(s.eq)){const t=this._inStaticFieldScope;this._inStaticFieldScope=this.currentThisScope(),e.value=this.parseExpression(),this._inStaticFieldScope=t;}else e.value=null;}parseClassElement(e){if(this.options.ecmaVersion<8||!this.isContextual("static"))return super.parseClassElement.apply(this,arguments);const t=this._branch();if(t.next(),-1==[s.name,s.bracketL,s.string,s.num,this.privateIdentifierToken].indexOf(t.type)&&!t.type.keyword)return super.parseClassElement.apply(this,arguments);if(t.type==s.bracketL){let e=0;do{t.eat(s.bracketL)?++e:t.eat(s.bracketR)?--e:t.next();}while(e>0)}else t.next();if(t.type!=s.eq&&!t.canInsertSemicolon()&&t.type!=s.semi)return super.parseClassElement.apply(this,arguments);const i=this.startNode();return i.static=this.eatContextual("static"),this.type==this.privateIdentifierToken?this.parsePrivateClassElementName(i):this.parsePropertyName(i),("Identifier"===i.key.type&&"constructor"===i.key.name||"Literal"===i.key.type&&!i.computed&&"constructor"===i.key.value)&&this.raise(i.key.start,"Classes may not have a field called constructor"),"prototype"!==(i.key.name||i.key.value)||i.computed||this.raise(i.key.start,"Classes may not have a static property named prototype"),this.enterScope(67),this._maybeParseFieldValue(i),this.exitScope(),this.finishNode(i,"PropertyDefinition"),this.semicolon(),i}parsePropertyName(e){e.static&&this.type==this.privateIdentifierToken?this.parsePrivateClassElementName(e):super.parsePropertyName(e);}parseIdent(e,t){const s=super.parseIdent(e,t);return this._inStaticFieldScope&&this.currentThisScope()===this._inStaticFieldScope&&"arguments"==s.name&&this.raise(s.start,"A static class field initializer may not contain arguments"),s}}};const So=e=>console.warn(e.message||e);function Ao(e,t,s,i,n=/$./){const r=new Set(t),a=Object.keys(e).filter((e=>!(r.has(e)||n.test(e))));a.length>0&&i({code:"UNKNOWN_OPTION",message:`Unknown ${s}: ${a.join(", ")}. Allowed options: ${[...r].sort().join(", ")}`});}const Po=e=>e.onwarn?t=>{t.toString=()=>{let e="";return t.plugin&&(e+=`(${t.plugin} plugin) `),t.loc&&(e+=`${es(t.loc.file)} (${t.loc.line}:${t.loc.column}) `),e+=t.message,e},e.onwarn(t,So);}:So,Co=e=>({allowAwaitOutsideFunction:!0,ecmaVersion:"latest",preserveParens:!1,sourceType:"module",...e.acorn}),wo=e=>[xo,Eo,bo,...po(e.acornInjectPlugins)],_o=e=>{var t;return (null===(t=e.cache)||void 0===t?void 0:t.cache)||e.cache},ko=e=>{if(!0===e)return ()=>!0;if("function"==typeof e)return (t,...s)=>!t.startsWith("\0")&&e(t,...s)||!1;if(e){const t=new Set,s=[];for(const i of po(e))i instanceof RegExp?s.push(i):t.add(i);return (e,...i)=>t.has(e)||s.some((t=>t.test(e)))}return ()=>!1},No=(e,t,s)=>{const i=e.inlineDynamicImports;return i&&ms('The "inlineDynamicImports" option is deprecated. Use the "output.inlineDynamicImports" option instead.',!1,t,s),i},Io=e=>{const t=e.input;return null==t?[]:"string"==typeof t?[t]:t},$o=(e,t,s)=>{const i=e.manualChunks;return i&&ms('The "manualChunks" option is deprecated. Use the "output.manualChunks" option instead.',!1,t,s),i},Mo=(e,t)=>{const s=e.moduleContext;if("function"==typeof s)return e=>{var i;return null!==(i=s(e))&&void 0!==i?i:t};if(s){const e=Object.create(null);for(const t of Object.keys(s))e[I(t)]=s[t];return s=>e[s]||t}return ()=>t},To=(e,t)=>{const s=e.preserveEntrySignatures;return null==s&&t.add("preserveEntrySignatures"),null!=s?s:"strict"},Ro=(e,t,s)=>{const i=e.preserveModules;return i&&ms('The "preserveModules" option is deprecated. Use the "output.preserveModules" option instead.',!1,t,s),i},Lo=(e,t,s)=>{const i=e.treeshake;return !1!==i&&(i&&!0!==i?(void 0!==i.pureExternalModules&&ms('The "treeshake.pureExternalModules" option is deprecated. The "treeshake.moduleSideEffects" option should be used instead. "treeshake.pureExternalModules: true" is equivalent to "treeshake.moduleSideEffects: \'no-external\'"',!0,t,s),{annotations:!1!==i.annotations,moduleSideEffects:Oo(i.moduleSideEffects,i.pureExternalModules,t),propertyReadSideEffects:"always"===i.propertyReadSideEffects?"always":!1!==i.propertyReadSideEffects,tryCatchDeoptimization:!1!==i.tryCatchDeoptimization,unknownGlobalSideEffects:!1!==i.unknownGlobalSideEffects}):{annotations:!0,moduleSideEffects:()=>!0,propertyReadSideEffects:!0,tryCatchDeoptimization:!0,unknownGlobalSideEffects:!0})},Oo=(e,t,s)=>{if("boolean"==typeof e)return ()=>e;if("no-external"===e)return (e,t)=>!t;if("function"==typeof e)return (t,s)=>!!t.startsWith("\0")||!1!==e(t,s);if(Array.isArray(e)){const t=new Set(e);return e=>t.has(e)}var i,n;e&&s((i="treeshake.moduleSideEffects",n='please use one of false, "no-external", a function or an array',{code:ns.INVALID_OPTION,message:`Invalid value for option "${i}" - ${n}.`}));const r=ko(t);return (e,t)=>!(t&&r(e))};const Do=(e,t,s)=>{const i=e.file;if("string"==typeof i){if(t)return ss({code:"INVALID_OPTION",message:'You must set "output.dir" instead of "output.file" when using the "output.preserveModules" option.'});if(!Array.isArray(s.input))return ss({code:"INVALID_OPTION",message:'You must set "output.dir" instead of "output.file" when providing named inputs.'})}return i},Vo=e=>{const t=e.format;switch(t){case void 0:case"es":case"esm":case"module":return "es";case"cjs":case"commonjs":return "cjs";case"system":case"systemjs":return "system";case"amd":case"iife":case"umd":return t;default:return ss({message:'You must specify "output.format", which can be one of "amd", "cjs", "system", "es", "iife" or "umd".',url:"https://rollupjs.org/guide/en/#outputformat"})}},Bo=(e,t)=>{var s;const i=(null!==(s=e.inlineDynamicImports)&&void 0!==s?s:t.inlineDynamicImports)||!1,{input:n}=t;return i&&(Array.isArray(n)?n:Object.keys(n)).length>1?ss({code:"INVALID_OPTION",message:'Multiple inputs are not supported for "output.inlineDynamicImports".'}):i},Fo=(e,t,s)=>{var i;const n=(null!==(i=e.preserveModules)&&void 0!==i?i:s.preserveModules)||!1;if(n){if(t)return ss({code:"INVALID_OPTION",message:'The "output.inlineDynamicImports" option is not supported for "output.preserveModules".'});if(!1===s.preserveEntrySignatures)return ss({code:"INVALID_OPTION",message:'Setting "preserveEntrySignatures" to "false" is not supported for "output.preserveModules".'})}return n},Wo=e=>{const t=e.preserveModulesRoot;if(null!=t)return I(t)},Uo=e=>{const t={autoId:!1,basePath:"",define:"define",...e.amd};if((t.autoId||t.basePath)&&t.id)return ss({code:"INVALID_OPTION",message:'"output.amd.autoId"/"output.amd.basePath" and "output.amd.id" cannot be used together.'});if(t.basePath&&!t.autoId)return ss({code:"INVALID_OPTION",message:'"output.amd.basePath" only works with "output.amd.autoId".'});let s;return s=t.autoId?{autoId:!0,basePath:t.basePath,define:t.define}:{autoId:!1,define:t.define,id:t.id},s},jo=(e,t)=>{const s=e[t];return "function"==typeof s?s:()=>s||""},zo=(e,t)=>{const s=e.dir;return "string"==typeof s&&"string"==typeof t?ss({code:"INVALID_OPTION",message:'You must set either "output.file" for a single-file build or "output.dir" when generating multiple chunks.'}):s},Go=(e,t)=>{const s=e.dynamicImportFunction;return s&&fs('The "output.dynamicImportFunction" option is deprecated. Use the "renderDynamicImport" plugin hook instead.',!1,t),s},Ho=(e,t)=>{const s=e.entryFileNames;return null==s&&t.add("entryFileNames"),null!=s?s:"[name].js"};function qo(e,t){const s=e.exports;if(null==s)t.add("exports");else if(!["default","named","none","auto"].includes(s))return ss((i=s,{code:ns.INVALID_EXPORT_OPTION,message:`"output.exports" must be "default", "named", "none", "auto", or left unspecified (defaults to "auto"), received "${i}"`,url:"https://rollupjs.org/guide/en/#outputexports"}));var i;return s||"auto"}const Ko=(e,t)=>{if(t)return "";const s=e.indent;return !1===s?"":null==s||s},Xo=new Set(["auto","esModule","default","defaultOnly",!0,!1]),Yo=(e,t)=>{const s=e.interop,i=new Set,n=e=>{if(!i.has(e)){if(i.add(e),!Xo.has(e))return ss({code:"INVALID_OPTION",message:`The value ${JSON.stringify(e)} is not supported for "output.interop". Use one of ${Array.from(Xo.values(),(e=>JSON.stringify(e))).join(", ")} instead.`,url:"https://rollupjs.org/guide/en/#outputinterop"});"boolean"==typeof e&&fs({message:`The boolean value "${e}" for the "output.interop" option is deprecated. Use ${e?'"auto"':'"esModule", "default" or "defaultOnly"'} instead.`,url:"https://rollupjs.org/guide/en/#outputinterop"},!1,t);}return e};if("function"==typeof s){const e=Object.create(null);let t=null;return i=>null===i?t||n(t=s(i)):i in e?e[i]:n(e[i]=s(i))}return void 0===s?()=>!0:()=>n(s)},Qo=(e,t,s,i)=>{const n=e.manualChunks||i.manualChunks;if(n){if(t)return ss({code:"INVALID_OPTION",message:'The "output.manualChunks" option is not supported for "output.inlineDynamicImports".'});if(s)return ss({code:"INVALID_OPTION",message:'The "output.manualChunks" option is not supported for "output.preserveModules".'})}return n||{}},Jo=(e,t,s)=>{var i;return null!==(i=e.minifyInternalExports)&&void 0!==i?i:s||"es"===t||"system"===t};function Zo(e){return async function(e,t){const{options:s,unsetOptions:i}=await async function(e,t){if(!e)throw new Error("You must supply an options object to rollup");const s=po(e.plugins),{options:i,unsetOptions:n}=function(e){var t,s,i;const n=new Set,r=null!==(t=e.context)&&void 0!==t?t:"undefined",a=Po(e),o=e.strictDeprecations||!1,h={acorn:Co(e),acornInjectPlugins:wo(e),cache:_o(e),context:r,experimentalCacheExpiry:null!==(s=e.experimentalCacheExpiry)&&void 0!==s?s:10,external:ko(e.external),inlineDynamicImports:No(e,a,o),input:Io(e),makeAbsoluteExternalsRelative:null===(i=e.makeAbsoluteExternalsRelative)||void 0===i||i,manualChunks:$o(e,a,o),moduleContext:Mo(e,r),onwarn:a,perf:e.perf||!1,plugins:po(e.plugins),preserveEntrySignatures:To(e,n),preserveModules:Ro(e,a,o),preserveSymlinks:e.preserveSymlinks||!1,shimMissingExports:e.shimMissingExports||!1,strictDeprecations:o,treeshake:Lo(e,a,o)};return Ao(e,[...Object.keys(h),"watch"],"input options",h.onwarn,/^(output)$/),{options:h,unsetOptions:n}}(await s.reduce(function(e){return async(t,s)=>s.options&&s.options.call({meta:{rollupVersion:"2.45.0",watchMode:e}},await t)||t}(t),Promise.resolve(e)));return eh(i.plugins,"at position "),{options:i,unsetOptions:n}}(e,null!==t);Ii(s);const n=new uo(s,t),r=!1!==e.cache;delete s.cache,delete e.cache,wi("BUILD",1);try{await n.pluginDriver.hookParallel("buildStart",[s]),await n.build();}catch(e){const t=Object.keys(n.watchFiles);throw t.length>0&&(e.watchFiles=t),await n.pluginDriver.hookParallel("buildEnd",[e]),await n.pluginDriver.hookParallel("closeBundle",[]),e}await n.pluginDriver.hookParallel("buildEnd",[]),_i("BUILD",1);const a={cache:r?n.getCache():void 0,closed:!1,async close(){a.closed||(a.closed=!0,await n.pluginDriver.hookParallel("closeBundle",[]));},generate:async e=>a.closed?ss(ps()):th(!1,s,i,e,n),watchFiles:Object.keys(n.watchFiles),write:async e=>a.closed?ss(ps()):th(!0,s,i,e,n)};s.perf&&(a.getTimings=Ci);return a}(e,null)}function eh(e,t){for(let s=0;s<e.length;s++){const i=e[s];i.name||(i.name=`${t}${s+1}`);}}async function th(e,t,s,i,n){const{options:r,outputPluginDriver:a,unsetOptions:o}=function(e,t,s,i){if(!e)throw new Error("You must supply an options object");const n=po(e.plugins);eh(n,"at output position ");const r=t.createOutputPluginDriver(n);return {...sh(s,i,e,r),outputPluginDriver:r}}(i,n.pluginDriver,t,s),h=new sr(r,o,t,a,n),l=await h.generate(e);if(e){if(!r.dir&&!r.file)return ss({code:"MISSING_OPTION",message:'You must specify "output.file" or "output.dir" for the build.'});await Promise.all(Object.keys(l).map((e=>function(e,t){const s=I(t.dir||_(t.file),e.fileName);let i,n;if("asset"===e.type)n=e.source;else if(n=e.code,t.sourcemap&&e.map){let r;"inline"===t.sourcemap?r=e.map.toUrl():(r=`${w(e.fileName)}.map`,i=Ua(`${s}.map`,e.map.toString())),"hidden"!==t.sourcemap&&(n+=`//# sourceMappingURL=${r}\n`);}return Promise.all([Ua(s,n),i])}(l[e],r)))),await a.hookParallel("writeBundle",[r,l]);}return c=l,{output:Object.keys(c).map((e=>c[e])).filter((e=>Object.keys(e).length>0)).sort(((e,t)=>{const s=nh(e),i=nh(t);return s===i?0:s<i?-1:1}))};var c;}function sh(e,t,s,i){return function(e,t,s){var i,n,r,a,o,h,l;const c=new Set(s),u=e.compact||!1,d=Vo(e),p=Bo(e,t),f=Fo(e,p,t),m=Do(e,f,t),g={amd:Uo(e),assetFileNames:null!==(i=e.assetFileNames)&&void 0!==i?i:"assets/[name]-[hash][extname]",banner:jo(e,"banner"),chunkFileNames:null!==(n=e.chunkFileNames)&&void 0!==n?n:"[name]-[hash].js",compact:u,dir:zo(e,m),dynamicImportFunction:Go(e,t),entryFileNames:Ho(e,c),esModule:null===(r=e.esModule)||void 0===r||r,exports:qo(e,c),extend:e.extend||!1,externalLiveBindings:null===(a=e.externalLiveBindings)||void 0===a||a,file:m,footer:jo(e,"footer"),format:d,freeze:null===(o=e.freeze)||void 0===o||o,globals:e.globals||{},hoistTransitiveImports:null===(h=e.hoistTransitiveImports)||void 0===h||h,indent:Ko(e,u),inlineDynamicImports:p,interop:Yo(e,t),intro:jo(e,"intro"),manualChunks:Qo(e,p,f,t),minifyInternalExports:Jo(e,d,u),name:e.name,namespaceToStringTag:e.namespaceToStringTag||!1,noConflict:e.noConflict||!1,outro:jo(e,"outro"),paths:e.paths||{},plugins:po(e.plugins),preferConst:e.preferConst||!1,preserveModules:f,preserveModulesRoot:Wo(e),sourcemap:e.sourcemap||!1,sourcemapExcludeSources:e.sourcemapExcludeSources||!1,sourcemapFile:e.sourcemapFile,sourcemapPathTransform:e.sourcemapPathTransform,strict:null===(l=e.strict)||void 0===l||l,systemNullSetters:e.systemNullSetters||!1,validate:e.validate||!1};return Ao(e,Object.keys(g),"output options",t.onwarn),{options:g,unsetOptions:c}}(i.hookReduceArg0Sync("outputOptions",[s.output||s],((e,t)=>t||e),(e=>{const t=()=>e.error({code:ns.CANNOT_EMIT_FROM_OPTIONS_HOOK,message:'Cannot emit files or set asset sources in the "outputOptions" hook, use the "renderStart" hook instead.'});return {...e,emitFile:t,setAssetSource:t}})),e,t)}var ih;function nh(e){return "asset"===e.type?ih.ASSET:e.isEntry?ih.ENTRY_CHUNK:ih.SECONDARY_CHUNK}!function(e){e[e.ENTRY_CHUNK=0]="ENTRY_CHUNK",e[e.SECONDARY_CHUNK=1]="SECONDARY_CHUNK",e[e.ASSET=2]="ASSET";}(ih||(ih={}));

// you could use unpkg like the official repl, i thought i'd try out jsdelivr
const CDN_URL = "https://cdn.jsdelivr.net/npm";
importScripts(`${CDN_URL}/svelte/compiler.js`); // importScripts method of the WorkerGlobalScope interface synchronously imports one or more scripts into the worker's scope
// import the mdsvex worker
importScripts(`${CDN_URL}/mdsvex/dist/mdsvex.js`);
const mode = 'dom';
const component_lookup = new Map();
async function fetch_package(url) {
    return (await fetch(url)).text();
}
function generate_lookup(components) {
    components.forEach((component) => {
        component_lookup.set(`./${component.name}.${component.type}`, component);
    });
}
function compare_to_version(major, minor, patch) {
    const v = svelte.VERSION.match(/^(\d+)\.(\d+)\.(\d+)/);
    return v[1] - major || v[2] - minor || v[3] - patch;
}
function has_loopGuardTimeout_feature() {
    return compare_to_version(3, 14, 0) >= 0;
}
self.addEventListener("message", async (event) => {
    generate_lookup(event.data);
    // 1. First we bundle, then we 
    // 2. generate actual source code
    const bundle = await Zo({
        input: "./App.svx",
        plugins: [
            {
                name: "repl-plugin",
                async resolveId(importee, importer) {
                    // handle imports from 'svelte'
                    console.log({ importee });
                    // import x from 'svelte'
                    if (importee === "svelte")
                        return `${CDN_URL}/svelte/index.mjs`;
                    // import x from 'svelte/somewhere'
                    if (importee.startsWith("svelte/")) {
                        // .svelte i 7 characters long
                        return `${CDN_URL}/svelte/${importee.slice(7)}/index.mjs`;
                    }
                    // import x from './file.js' (via a 'svelte' or 'svelte/x' package)
                    if (importer && importer.startsWith(`${CDN_URL}/svelte`)) {
                        const resolved = new URL(importee, importer).href;
                        if (resolved.endsWith(".mjs"))
                            return resolved;
                        return `${resolved}/index.mjs`;
                    }
                    // local repl components
                    // check that this file is in that component look up
                    if (component_lookup.has(importee))
                        return importee;
                    // importing from a URL
                    if (importee.startsWith('http:') || importee.startsWith('https:')) {
                        return importee;
                    }
                    // importing from a URL
                    if (importee.startsWith('C:') || importee.startsWith('file:')) {
                        return importee;
                    }
                    // relative imports from a remote package
                    if (importee.startsWith("."))
                        return new URL(importee, importer).href;
                    // bare named module imports (importing an npm package)
                    // get the package.json and load it into memory
                    const pkg_url = `${CDN_URL}/${importee}/package.json`;
                    const pkg = JSON.parse(await fetch_package(pkg_url));
                    // get an entry point from the pkg.json - first try svelte, then modules, then main
                    if (pkg.svelte || pkg.module || pkg.main) {
                        // use the aobove url minus `/package.json` to resolve the URL
                        const url = pkg_url.replace(/\/package\.json$/, "");
                        return new URL(pkg.svelte || pkg.module || pkg.main, `${url}/`)
                            .href;
                    }
                    // we probably missed stuff, pass it along as is
                    return importee;
                },
                // id is the filepath
                async load(id) {
                    // local repl components are stored in memory
                    // this is our virtual filesystem
                    if (component_lookup.has(id))
                        return component_lookup.get(id).source;
                    // everything else comes from a cdn
                    return await fetch_package(id);
                },
                // transform allows us to compile our non-js code
                // id is the filepath
                transform(code, id) {
                    // our only transforms are to compile svelte components and svx files
                    // svelte is avilable to us because we did importScripts at the top
                    if (!/\.svelte$|\.svx$/.test(id))
                        return null;
                    const name = id
                        .split('/')
                        .pop()
                        .split('.')[0];
                    let preprocessPromise;
                    if (/\.svx$/.test(id)) {
                        preprocessPromise = self.mdsvex
                            .mdsvex()
                            .markup({ content: code, filename: id });
                    }
                    else {
                        preprocessPromise = Promise.resolve({ code });
                    }
                    //@ts-ignore
                    return preprocessPromise.then(({ code: v }) => {
                        const result = svelte.compile(v, Object.assign({
                            generate: mode,
                            format: 'esm',
                            dev: true,
                            name,
                            filename: name + '.svelte'
                        }, has_loopGuardTimeout_feature() && {
                            loopGuardTimeout: 100
                        }));
                        (result.warnings || result.stats.warnings).forEach(warning => {
                            // TODO remove stats post-launch
                            warnings.push({
                                message: warning.message,
                                filename: warning.filename,
                                start: warning.start,
                                end: warning.end
                            });
                        });
                        return result.js;
                    });
                },
            },
        ],
    });
    // a touch longwinded but output contains an array of chunks
    // we are not code-splitting, so we only have a single chunk
    const output = (await bundle.generate({ format: "esm" })).output[0]
        .code;
    self.postMessage(output);
});
//# sourceMappingURL=worker.js.map