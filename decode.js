/**
 * Decodes bencoded data.
 *
 * @param  {Buffer} data
 * @param  {String} encoding
 * @return {Object|Array|Buffer|String|Number}
 */

var __colon = 0x3A;
var __d = 0x64;
var __e = 0x65;
var __i = 0x69;
var __l = 0x6C;

function decode( data, encoding ) {
  
  decode.position = 0;
  decode.encoding = encoding || null;

  decode.data = !( data instanceof Buffer )
                ? new Buffer( data )
                : data;

  return decode.next();

}

decode.position = 0
decode.data     = null
decode.encoding = null

decode.next = function() {

  switch( decode.data[decode.position] ) {
    case __d: return decode.dictionary(); break
    case __l: return decode.list(); break
    case __i: return decode.integer(); break
    default:   return decode.bytes(); break
  }

}

decode.find = function( chr ) {
  
  var i = decode.position
  var c = decode.data.length
  var d = decode.data

  while( i < c ) {
    if( d[i] === chr )
      return i
    i++
  }

  throw new Error(
    'Invalid data: Missing delimiter "' +
    String.fromCharCode( chr ) + '" [0x' +
    chr.toString( 16 ) + ']'
  )

}

decode.dictionary = function() {
  
  var startIndex = decode.position;
  decode.position++

  var dict = {}

  while( decode.data[decode.position] !== __e ) {
    var key = decode.bytes();
    var value = decode.next();
    dict[ key ] = value;
  }

  decode.position++

  var endIndex = decode.position;
  dict.raw = decode.data.slice( startIndex, endIndex );
  return dict

}

decode.list = function() {

  decode.position++

  var lst = []

  while( decode.data[decode.position] !== __e ) {
    var item = decode.next();
    lst.push( item )
  }

  decode.position++

  return lst

}

decode.integer = function() {
  
  var end    = decode.find( __e )
  var number = decode.data.toString( 'ascii', decode.position + 1, end )

  decode.position += end + 1 - decode.position

  return parseInt( number, 10 )
  
}

decode.bytes = function() {

  var sep    = decode.find( __colon )
  var length = parseInt( decode.data.toString( decode.encoding, decode.position, sep ), 10 )
  var end    = ++sep + length

  decode.position = end

  var bytes = decode.encoding
    ? decode.data.toString( decode.encoding, sep, end )
    : decode.data.slice( sep, end )

  return bytes;
}

// Exports
module.exports = decode