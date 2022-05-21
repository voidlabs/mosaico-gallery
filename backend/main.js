"use strict";
/* global module: false, console: false, __dirname: false, process: false */

const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const url = require('url');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');
const app = express();
const got = require('got');
const KeyvFile = require('keyv-file').KeyvFile;
const querystring = require('querystring');
const dotenv = require('dotenv');
const { promisify } = require('util');
const gmagic = require('gm');
const gm = gmagic.subClass({imageMagick: true});
const util = require('util');
const os = require("os");

const fileCache = new KeyvFile({ filename: 'cache/cache.json' });

dotenv.config();

app.use(require('connect-livereload')({ ignore: [/^\/dl/, /^\/img/] }));

app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  limit: '5mb',
  extended: true
})); 

var uploadOptions = {
  tmpDir: '.tmp',
  uploadDir: './uploads',
  uploadUrl: '/uploads',
  fileTypes: ['image/png', 'image/jpg', 'image/jpeg', 'image/gif'],
};

app.get('/upload/', function(req, res) {
    var files = [];
    var uploadHost = req.protocol + '://' + req.get('host');
    fs.readdirSync(uploadOptions.uploadDir).forEach( name => {
        var stats = fs.statSync(uploadOptions.uploadDir + '/' + name);
        if (stats.isFile() && uploadOptions.fileTypes.includes(mime.lookup(name))) {
            files.push({
                name: name,
                size: stats.size,
                url: uploadHost + uploadOptions.uploadUrl + '/' + name,
                thumbnailUrl: '/img/?src=' + encodeURIComponent(uploadOptions.uploadUrl + '/' + name) + '&method=resize&params=' + encodeURIComponent('180,180')
            });
        }
    });
    res.json({ files: files });
});

const safeName = function (dir, filename, callback) {
    fs.exists(dir + '/' + filename, function (exists) {
        if (exists) {
            filename = filename.replace(/(?:(?: \(([\d]+)\))?(\.[^.]+))?$/, function (s, index, ext) {
                return ' (' + ((parseInt(index, 10) || 0) + 1) + ')' + (ext || '');
            });
            safeName(dir, filename, callback)
        } else {
            callback(filename);
        }
    });
};

const uploadHandler = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadOptions.uploadDir)
        },
        filename: (req, file, cb) => {
            safeName(uploadOptions.uploadDir, file.originalname, name => {
                cb(null, name);
            });            
        }
    }),
    filterImgFile: (req, file, cb) => {
        if(uploadOptions.fileTypes.includes(file.mimetype)) cb(null, true)
        else cb('Only .png .gif .jpg and .jpeg format allowed!', false)
    }
});

app.use('/upload/', uploadHandler.array('files[]', 20), function(req, res) {
    var files = [];
    var uploadHost = req.protocol + '://' + req.get('host');
    req.files.forEach( f => {
        files.push({
            name: f.filename,
            size: f.size,
            url: uploadHost + uploadOptions.uploadUrl + '/' + f.filename,
            thumbnailUrl: '/img/?src=' + encodeURIComponent(uploadOptions.uploadUrl + '/' + f.filename) + '&method=resize&params=' + encodeURIComponent('90,90')
        });
    });
    res.json({ files: files });
});

// imgProcessorBackend + "?src=" + encodeURIComponent(src) + "&method=" + encodeURIComponent(method) + "&params=" + encodeURIComponent(width + "," + height);
app.get('/img/', function(req, res) {

    var params = req.query.params.split(',');

    if (req.query.method == 'placeholder') {
        var out = gm(params[0], params[1], '#808080');
        res.set('Content-Type', 'image/png');
        var x = 0, y = 0;
        var size = 40;
        // stripes
        while (y < params[1]) {
            out = out
              .fill('#707070')
              .drawPolygon([x, y], [x + size, y], [x + size*2, y + size], [x + size*2, y + size*2])
              .drawPolygon([x, y + size], [x + size, y + size*2], [x, y + size*2]);
            x = x + size*2;
            if (x > params[0]) { x = 0; y = y + size*2; }
        }
        // text
        out.fill('#B0B0B0').fontSize(20).drawText(0, 0, params[0] + ' x ' + params[1], 'center').stream('png').pipe(res);

    } else if (req.query.method == 'resize' || req.query.method == 'cover' || req.query.method == 'aspect') {
        // NOTE: req.query.src is an URL but gm is ok with URLS.
        // We do parse it to localpath to avoid strict "securityPolicy" found in some ImageMagick install to prevent the manipulation
        var urlparsed = url.parse(req.query.src);
        var src = "./"+decodeURI(urlparsed.pathname);

        var ir = gm(src);

        var format = function(err,format) {
            if (!err) {
                res.set('Content-Type', 'image/'+format.toLowerCase());
                if (req.query.method == 'resize') {
                    ir.autoOrient().resize(params[0] == 'null' ? null : params[0], params[1] == 'null' ? null : params[1]).stream().pipe(res);
                } else {
                    ir.autoOrient().resize(params[0],params[1]+'^').gravity('Center').extent(params[0], params[1]+'>').stream().pipe(res);
                }
            } else {
                console.error("ImageMagick failed to detect image format for", src, ". Error:", err);
                res.status(404).send('Error: '+err);
            }
        };

        if (req.query.method == 'aspect' || req.query.method == 'DISAcover' /* TODO better use the new method, but using cover here for testing purpose */) {
            ir.size(function(err, size) {
                if (!err) {
                    var oldparams = [ params[0], params[1] ];
                    if (params[0] / params[1] > size.width / size.height) {
                        params[1] = Math.round(size.width / (params[0] / params[1]));
                        params[0] = size.width;
                    } else {
                        params[0] = Math.round(size.height * (params[0] / params[1]));
                        params[1] = size.height;
                    }
                    console.log("Image size: ", size, oldparams, params);
                    ir.format(format);
                } else {
                    console.error("ImageMagick failed to detect image size for", src, ". Error:", err);
                    res.status(404).send('Error: '+err);
                }
            });
        } else {
            ir.format(format);
        }
    }

});

app.get('/apibridge/:service/*', async (req, res)  => {
    var options = {
        baseUrl: req.baseUrl,
        query: req.query,
        // CACHING: the following options are only needed if you want to cache responses: this seems to work only with Pixabay and StockSnap as we can't override their caching headers
		// assign a name to the cache, to survive development restarts
        cache: fileCache,
        // get results from cache even if they are stale
        headers: {
        	'Cache-Control': 'max-stale=3600'
        },
    };


    // var qs = querystring.stringify(req.query);
    // var mockFileName = 'mock'+path.sep+(req.params.service+'-'+req.params[0]+(qs.length ? '?'+qs : '')).replace(/[\\\/\?]+/g,'_')+'.json';
    var mockFileName = 'mock'+path.sep+req.params.service+'-'+(crypto.createHash('md5').update(req.params[0]+'?'+querystring.stringify(req.query)).digest("hex"))+'.json';

    var mocked = false;
    try {
    	var mockfile = await (promisify(fs.readFile))(mockFileName, 'utf8');
		var fullresponse = JSON.parse(mockfile);

	    mocked = true;
	    res.set(fullresponse.headers);
		res.set("x-mocked", true);
	    res.json(fullresponse.body);

	} catch (error) {
		// Expected when request is not there
		// console.log("Failed to read mock filesystem", error);
	}


    if (!mocked) {

	    var overrideOptions = {
	        'unsplash': {
	            baseUrl: "https://api.unsplash.com/search/photos/",
	            query: {
	                client_id: process.env.APIKEY_UNSPLASH,
	            }
	        },
	        'pixabay': {
	            baseUrl: "https://pixabay.com/api/",
	            query: {
	                key: process.env.APIKEY_PIXABAY,
	            }
	        },
	        'pexels': {
	            baseUrl: "http://api.pexels.com/v1/search",
	            headers: {
	                'Authorization': process.env.APIKEY_PEXELS,
	            }            
	        },
	        'flickr': {
	            baseUrl: "https://api.flickr.com/services/rest/",
	            query: {
	                api_key: process.env.APIKEY_FLICKR,
	            }
	        },
	        'stocksnap': {
	            baseUrl: "https://stocksnap.io/api/search-photos/"
	        },
	        'splashbase': {
	            baseUrl: "http://www.splashbase.co/api/v1/images/search"
	        }
	    }

	    _.merge(options, overrideOptions[req.params.service]);
	    // GOT 10+ renamed optionsm but we stick to GOT 9 as 10+ requires a full refactoring.
	    // options.searchParams = options.query;
	    // options.prefixUrl = options.baseUrl;

	    var url = req.params[0];

	    try {
		    const remoteRes = await got(url, options).on('response', function(remoteResponse) {
		    	// console.log("YYY", remoteResponse);
		    	// Delete data that could invalidate the cache (this doesn't seem to work, at all).
		    	delete remoteResponse.headers['cache-control'];
		    	delete remoteResponse.headers['pragma'];
		    	delete remoteResponse.headers['set-cookie'];
		    	delete remoteResponse.headers['vary'];
		    	delete remoteResponse.headers['etag'];
		    	// We can't override here the cache headers as "got" will save somehow the original headers in the cache.
		    	// We use the max-stale option in the request, to get cached data.
		    });

		    const respJson = JSON.parse(remoteRes.body);

		    var headers = {};

		    // Propagate X- headers
	    	Object.keys(remoteRes.headers).filter(item => item.match(/^x-/i)).forEach(item => headers[item] = remoteRes.headers[item]);
	    	res.set(headers);
		    res.set("x-cached", remoteRes.fromCache);

		    delete remoteRes.headers['content-encoding'];

		    // save mock data
		    var mockData = {
		    	headers: headers,
		    	body: respJson
		    };
		    try {
			    await (promisify(fs.writeFile))(mockFileName, JSON.stringify(mockData, null, ' '), 'utf8');
			} catch(error) {
				console.log("Error writing mock file", error);
			}


		    res.json(respJson);
		} catch (error) {
			console.log("FAIL", error, error.response ? error.response.body : 'X');
		}
	}
});

app.use(express.static(__dirname + '/../'));

// This is needed with grunt-express-server (while it was not needed with grunt-express)

var PORT = process.env.PORT || 9008;

var server = app.listen(PORT, () => console.log('Express server listening on port ' + PORT));