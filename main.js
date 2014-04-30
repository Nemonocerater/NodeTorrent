var system = require('sys'),
    fs = require('fs'),
    net = require('net'),
    http = require('http'),
    crypto = require('crypto'),
    Decode = require('./decode');

var prevConcat = Buffer.concat;
require('buffertools').extend();

var store = new DataReader();
//var peer = new Peer('128.61.84.205', 36999);
//var peer = new Peer('127.0.0.1', 46072);
var peer = new Peer(process.argv[3], process.argv[4]);

var self;

fs.readFile(process.argv[2], function (err, data) {
	if (err) {
		return console.log(err);
	}
	var torrent = new Decode(data);
	self = new Self(torrent);
	var handshake = getHandshake(torrent);
	Connect(handshake);
});

function getHandshake(torrent)
{
	var buffer = new Buffer(68);
	buffer.write("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x10\x00\x05");
	
	var info_hash = getSha(torrent.info.raw);
	
	for (var i = 0; i < 20; i++)
	{
		buffer[28 + i] = info_hash[i];
	}
	
	buffer.write("JoshuaScottHarris123", 48);
	
	return buffer;
}

function getSha(input)
{
	var sha = crypto.createHash('sha1');
	sha.update(input);
	return sha.digest();
}

function Connect(handshake)
{
	var handshakeCompleted = false;
	var piece = null;
	
	var socket = net.createConnection(peer.port, peer.ip);
	console.log("Socket Opened " + peer.ip + ":" + peer.port);
	
	socket.on('connect', function() {
		socket.write(handshake);
	}).on('end', function() {
		console.log("Connection Terminated");
	})
	.on('data', socketData)
	.on('timeout', socketError)
	.on('error', socketError);
	
	function socketData(data)
	{
		if (handshakeCompleted)
		{
			addData(data);
		}
		else
		{
			if (data.slice(0,20).compare("\x13BitTorrent protocol") == 0 &&
				data.slice(28,48).compare(getHash()) == 0)
			{
				handshakeCompleted = true;
				if (data.length > 68)
				{
					addData(data.slice(68, data.length));
				}
			}
			else
			{
				console.log("Peer didn't respond with a proper handshake!");
				socket.end();
			}
		}
	}
	
	function addData(data)
	{
		store.addData(data);
		var message = store.getMessage();
		while (message !== null)
		{
			handleMessage(message);
			message = store.getMessage();
		}
	}
	
	function handleMessage(message)
	{
		switch (message[4])
		{
		case 0:
			console.log("YOU NEED TO HANDLE: choke");
		break;
		case 1:
			peer.choking = false;
			requestPiece();
		break;
		case 2:
			console.log("YOU NEED TO HANDLE: interested");
		break;
		case 3:
			console.log("YOU NEED TO HANDLE: not interested");
		break;
		case 4:
			peer.hasPiece(message.readUInt32BE(5));
		break;
		case 5:
			console.log("Peer sent bitfield");
			peer.hasBitfield(toBinary(message.slice(5, message.length)));
			socket.write(createSimpleMessage('\x02'));
		break;
		case 6:
			console.log("YOU NEED TO HANDLE: request");
		break;
		case 7:
			piece.addData(message.slice(13, message.length));
			requestPiece();
		break;
		case 8:
			console.log("YOU NEED TO HANDLE: cancel");
		break;
		case 9:
			console.log("YOU NEED TO HANDLE: port");
		break;
		case 20:
			console.log('WHAT DO I EVEN DO WITH AN EXTEND MESSAGE???????');
		break;
		default:
			if (message.length == 4)
			{
				console.log("   ...Keep Alive");
			}
			else
			{
				console.log('MESSAGE TYPE NOT HANDLED: ' + message[4] + ", length: " + message.length);
				console.log(message.toString());
			}
		break;
		}
	}

	function requestPiece()
	{
		if (piece !== null && piece.complete)
		{
			if (piece.verify())
			{
				console.log('You need to send a HAVE message');
				self.addPiece(piece);
			}
			else
			{
				console.log("Piece " + piece.id + " did not match the hash");
			}
			piece = null;
		}
		if (piece === null)
		{
			var i = 0;
			while (i < self.numPieces)
			{
				if (!self.has(i) && peer.has(i))
				{
					break;
				}
				++i;
			}
			
			console.log("GETTING PIECE: " + i);
			piece = new Piece(i);
		}
		
		if (piece.id === self.numPieces)
		{
			if (self.complete)
			{
				console.log("File Downloaded");
				self.saveFile();
				socket.end();
			}
			else
			{
				console.log("Uh oh... trying to request a piece that is out of bounds, but file is not complete!");
			}
		}
		else
		{
			if (!piece.complete)
			{
				socket.write(createRequestMessage());
			}
		}
	}

	function createSimpleMessage(id)
	{
		var b = new Buffer(5);
		b.write("\x00\x00\x00\x01", 0);
		b.write(id, 4);
		return b;
	}
	
	function createRequestMessage()
	{
		var b = new Buffer(17);
		b.write("\x00\x00\x00\x0d\x06");
		b.writeUInt32BE(piece.id, 5);
		b.writeUInt32BE(piece.next, 9);
		b.writeUInt32BE(piece.nextLength, 13);
		return b;
	}
	
	function socketError(err)
	{
		console.log("ERROR: " + err.code);
	}
}

function getHash()
{
	var buffer = new Buffer(20);
	var i = 0;
	buffer[i++] = 117;
	buffer[i++] = 127;
	buffer[i++] = 197;
	buffer[i++] = 101;
	buffer[i++] = 197;
	buffer[i++] = 100;
	buffer[i++] = 98;
	buffer[i++] = 178;
	buffer[i++] = 139;
	buffer[i++] = 79;
	buffer[i++] = 156;
	buffer[i++] = 134;
	buffer[i++] = 178;
	buffer[i++] = 26;
	buffer[i++] = 199;
	buffer[i++] = 83;
	buffer[i++] = 80;
	buffer[i++] = 14;
	buffer[i++] = 178;
	buffer[i++] = 167;
	return buffer;
}

function toBinary(buffer)
{
	var hex = buffer.toString('hex');
	var bin = "";
	for (var i = 0; i < hex.length; i++)
	{
		switch (hex[i])
		{
		case '0':
			bin += '0000';
		break;
		case '1':
			bin += '0001';
		break;
		case '2':
			bin += '0010';
		break;
		case '3':
			bin += '0011';
		break;
		case '4':
			bin += '0100';
		break;
		case '5':
			bin += '0101';
		break;
		case '6':
			bin += '0110';
		break;
		case '7':
			bin += '0111';
		break;
		case '8':
			bin += '1000';
		break;
		case '9':
			bin += '1001';
		break;
		case 'a':
			bin += '1010';
		break;
		case 'b':
			bin += '1011';
		break;
		case 'c':
			bin += '1100';
		break;
		case 'd':
			bin += '1101';
		break;
		case 'e':
			bin += '1110';
		break;
		case 'f':
			bin += '1111';
		break;
		}
	}
	return bin;
}


function Piece(id)
{
	var piece = this;
	
	piece.id = id;
	piece.complete = false;
	piece.next = 0;
	piece.nextLength = 0x4000;
	piece.data = null;
	
	piece.addData = function addData(data)
	{
		if (piece.complete === false)
		{
			if (piece.data === null)
			{
				piece.data = data;
			}
			else
			{
				piece.data = piece.data.concat(data);
			}
		}
		piece.next = piece.data.length;
		if (piece.next + piece.nextLength > self.torrent.info["piece length"])
		{
			piece.nextLength = self.torrent.info["piece length"] - piece.next;
		}
		
		if (piece.data.length === self.torrent.info["piece length"])
		{
			piece.complete = true;
		}
	}
	
	piece.verify = function verify()
	{
		if (piece.complete === true)
		{
			var pieceIndex = piece.id * 20;
			var verifierHash = self.torrent.info.pieces.slice(pieceIndex, pieceIndex + 20);
			if (getSha(piece.data).compare(verifierHash) == 0)
			{
				return true;
			}
		}
		return false;
	}
}

function Self(torrent)
{
	var self = this;
	
	self.torrent = torrent;
	self.numPieces = Math.ceil(torrent.info.length/torrent.info["piece length"]);
	
	var hasData = new Array(self.numPieces);
	for (var i = 0; i < self.numPieces; i++)
	{
		hasData[i] = false;
	}
	
	var pieces = new Array(self.numPieces);
	
	self.has = function has(i)
	{
		return (pieces[i] !== undefined);
	}
	self.complete = function complete()
	{
		for (var i = 0; i < self.numPieces; i++)
		{
			if (!self.has(i))
			{
				return false;
			}
		}
		return true;
	}
	self.addPiece = function addPiece(piece)
	{
		pieces[piece.id] = piece;
		/*fs.writeFile("" + piece.id, piece.data, function fileSaved()
			{
				console.log("The Piece has been saved");
			});*/
	}
	
	self.saveFile = function saveFile()
	{
		if (self.complete())
		{
			var pieceArr = [];
			for (var i = 0; i < self.numPieces; i++)
			{
				pieceArr[i] = pieces[i].data;
				//console.log(file.length + " " + pieces[i].data.length + " " + getSha(file) + " " + getSha(pieces[i].data));
			}
			var torrentName = self.torrent.info.name.toString('utf8');
			var torrentFile = prevConcat(pieceArr, self.torrent.info.length);
			fs.writeFile(torrentName, torrentFile, function fileSaved()
			{
				console.log("The File has been saved");
			});
		}
		else
		{
			console.log("This file is not complete you can't save it!");
		}
	}
}

function Peer(ip, port)
{
	var peer = this;
	
	peer.ip = ip;
	peer.port = port;
	
	peer.choking = true;
	
	var hasData = [];
	
	peer.hasBitfield = function hasBitfield(bitfield)
	{
		for (var i = 0; i < bitfield.length; i++)
		{
			if (i < self.numPieces)
			{
				if (bitfield[i] === '1')
				{
					hasData[i] = true;
				}
				else
				{
					hasData[i] = false;
				}
			}
		}
	}
	
	peer.hasPiece = function hasPiece(id)
	{
		if (id >= 0 && id < self.torrent.info["piece length"])
		{
			hasData[id] = true;
		}
		else
		{
			console.log("Peer can't have that piece: That piece id is out of bounds");
		}
	}
	
	peer.printData = function printData()
	{
		console.log(hasData);
	}
	
	peer.has = function has(i)
	{
		return hasData[i];
	}
	
}

function DataReader()
{
	var store = this;
	var buffer = null;
	
	store.addData = function addData(data) {
		if (buffer === null)
		{
			buffer = data;
		}
		else
		{
			buffer = buffer.concat(data);
		}
	};
	
	store.getMessage = function getMessage()
	{
		if (buffer !== null)
		{
			var length = buffer[0] * 16777216 + buffer[1] * 65536 + buffer[2] * 256 + buffer[3];
			if (buffer.length === length + 4)
			{
				var message = buffer.slice(0, length + 4);
				buffer = null;
				return message;
			}
			else if (buffer.length > length + 4)
			{
				var message = buffer.slice(0, length + 4);
				buffer = buffer.slice(length + 4, buffer.length);
				return message;
			}
		}
		return null;
	}
}



/*
var HOST = '127.0.0.1';
var PORT = 6881;

// Create a server instance, and chain the listen function to it
// The function passed to net.createServer() becomes the event handler for the 'connection' event
// The sock object the callback function receives UNIQUE for each connection
net.createServer(function(sock) {
    
    // We have a connection - a socket object is assigned to the connection automatically
    console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);
    
    // Add a 'data' event handler to this instance of socket
    sock.on('data', function(data) {
        
        console.log('DATA ' + sock.remoteAddress + ': ' + data);
        // Write the data back to the socket, the client will receive it as data from the server
        sock.write('You said "' + data + '"');
        
    });
    
    // Add a 'close' event handler to this instance of socket
    sock.on('close', function(data) {
        console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });
    
}).listen(PORT, HOST);

console.log('Server listening on ' + HOST +':'+ PORT);
*/










function getBinaryString(buffer)
{
	var bin = "";
	for (var i = 0; i < buffer.length; i++)
	{
		bin += String.fromCharCode(buffer[i].charCodeAt(0));
	}
	return bin;
}





function getTrackerRequest(torrent)
{
  var request = {
    host: "tracker.archlinux.org",
    path: "/announce",
    port: "6969"
  };

  var info_hash = getShaHex(new Buffer(torrent.info.raw));
  request.path += "?info_hash=" + info_hash;
  var peer_id = "-JS2060-901234567890"                // needs to be randomized if ever released.
  request.path += "&peer_id=" + peer_id;
  var port = 6881;                                    // may want to not hard code this
  request.path += "&port=" + port;
  var uploaded = 0;
  request.path += "&uploaded=" + uploaded;
  var downloaded = 0;
  request.path += "&downloaded=" + downloaded;
  var left = torrent.info.length;
  request.path += "&left=" + left;
  var compact = 1;
  request.path += "&compact=" + compact;
  var evnt = "started";
  request.path += "&event=" + evnt;

  return request;
}

function trackerResponse(response)
{
  var str = '';

  response.on('data', function (chunk) {
    str += chunk;
  });

  response.on('end', function () {
    console.log(str);
  });
}




/*
 *
 * MISC. Library
 *
 */


function printKeys(o, tab)
{
  tab = tab || "";

  console.log(tab + "<Keys>");
  var keys = Object.keys(o);
  for (var i = 0; i < keys.length; i++)
  {
      console.log(tab + "    " + keys[i]);
      var value = o[keys[i]];
      if (value instanceof Array)
      {
        console.log(tab + "        :Array");
      }
      else if (value instanceof Object)
      {
        printKeys(value, tab + "    ");
      }
  }
  console.log(tab + "</Keys>")
}