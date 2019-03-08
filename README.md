# Mosaico Gallery

Mosaico Gallery is a JavaScript library to deal with image gallery and public images search/download/upload .

### Build/Run with the development backend

You need NodeJS v6.0 or higher

Download/install the dependencies (run again if you get an error, as it probably is a race issues in npm)
```
  npm install
```
if you don't have it, install grunt-cli globally
```
  npm install -g grunt-cli
```
compile and run a local webserver (http://127.0.0.1:9008) with livereload
```
  grunt
```

### API keys 

Sites providing CC0 image search needs API Keys to do that.
This library is able to query most of them directly from the browser, but you would have to add your API keys in the browser and users using your application would be able to grab them.
So you'll have to configure it to use a backend that will provide the authentication.

We bundle a development backend written in Node: you can configure your API keys in the ".env" file. Given this backend doesn't require any authentication, don't expose it to the internet or people will be able to abuse your API keys.
