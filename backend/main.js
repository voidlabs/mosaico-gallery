"use strict";
/* global module: false, console: false, __dirname: false, process: false */

const express = require('express');
const upload = require('jquery-file-upload-middleware');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');
const app = express();
const got = require('got');
const KeyvFile = require('keyv-file')
const querystring = require('querystring');
const dotenv = require('dotenv');
const { promisify } = require('util');

dotenv.config();

app.use(require('connect-livereload')({ ignore: [/^\/dl/, /^\/img/] }));

app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  limit: '5mb',
  extended: true
})); 

const listFiles = function (req, options, callback) {

    var files = [];
    var counter = 1;
    var finish = function () {
        if (!--counter)
            callback(files);
    };

    var uploadHost = req.protocol + '://' + req.get('host');

    fs.readdir(options.uploadDir, _.bind(function (err, list) {
        _.each(list, function (name) {
            var stats = fs.statSync(options.uploadDir + '/' + name);
            if (stats.isFile()) {
                var file = {
                    name: name,
                    url: uploadHost + options.uploadUrl + '/' + name,
                    size: stats.size
                };
                _.each(options.imageVersions, function (value, version) {
                    counter++;
                    fs.exists(options.uploadDir + '/' + version + '/' + name, function (exists) {
                        if (exists)
                            file.thumbnailUrl = uploadHost + options.uploadUrl + '/' + version + '/' + name;
                        finish();
                    });
                });
                files.push(file);
            }
        }, this);
        finish();
    }, this));
}; 

var uploadOptions = {
  tmpDir: '.tmp',
  uploadDir: './uploads',
  uploadUrl: '/uploads',
  imageVersions: { thumbnail: { width: 90, height: 90 } }
};

app.get('/upload/', function(req, res) {
    listFiles(req, uploadOptions, function (files) {
      res.json({ files: files });
    }); 
});

app.use('/upload/', upload.fileHandler(uploadOptions));


app.get('/apibridge/:service/*', async (req, res)  => {
    var options = {
        baseUrl: req.baseUrl,
        query: req.query,
        // CACHING: the following options are only needed if you want to cache responses: this seems to work only with Pixabay and StockSnap as we can't override their caching headers
		// assign a name to the cache, to survive development restarts
        cache: new KeyvFile({
		    filename: 'cache/cache.json',
		}),
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

	    try {
		    const remoteRes = await got(req.params[0], options).on('response', function(remoteResponse) {
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