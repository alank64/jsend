debug = require('debug')('v10data-rest_errors');

var STATUSES = {
	success: { required: ['status', 'data'], allowed:['status', 'data'] },
	fail: { required: ['status', 'data'], allowed:['status', 'data'] },
	error: { required: ['status', 'message'], allowed:['status', 'message', 'data', 'code'] }
};

function requireKeys(keys, json) {
	return keys.every(function(key) {
		return key in json;
	});
}

function allowKeys(keys, json) {
	return Object.keys(json).every(function(key) {
		return ~keys.indexOf(key);
	});
}

function jsend(config, host) {
	config = config || {};
	host = host || {};
  config.hideErrors = (config.hideErrors === undefined ? false : config.hideErrors);

	function isValid(json) {
		var spec = STATUSES[json && json.status],
			valid = !!spec && requireKeys(spec.required, json);

		if(config.strict) valid = valid && allowKeys(spec.allowed, json);

		return valid;
	}

	function forward(json, done) {
		if(!isValid(json))
			json = {
				status: 'error',
				message: 'Invalid jsend object.',
				data: { originalObject: json }
			};

		if(json.status === 'success')
			done(null, json.data);
		else {
			var err = new Error(json.message || ('Jsend repsonse status: ' + json.status));
			if('code' in json) err.code = json.code;
			done(err, json.data);
		}
	}

	function fromArguments(err, json) {
		if(arguments.length === 1 && err.length === 2) {
			json = err[1];
			err = err[0];
		}

		if(err) {
			json = {
				status: 'error',
				message: (typeof err === 'string')
					? err
					: err && err.message || 'Unknown error. (jsend)'
			};
			if(err && err.stack) json.data = { stack:err.stack };
		} else if(json === undefined) {
			json = {
				status: 'error',
				message: 'No data returned.'
			};
		} else if(!isValid(json)) {
			json = {
				status: 'success',
				data: json
			};
		}

		return json;
	}

  function build(err, json) {
    var results = fromArguments(err, json);

    if (config.hideErrors && results.status === 'error'){
      // generate unique id for user, and console log the error
      var buf = []
        , chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        , charlen = chars.length
        , len = 8;

      for (var i = 0; i < len; ++i) {
        buf.push(chars[getRandomInt(0, charlen - 1)]);
      }

      var uid = buf.join('');
      
      debug("REST ERROR: code: %s IS: %s", uid, JSON.stringify(results.data, null, 2));
      delete(results.data);
      results.code = uid;
    }
    return results;
  }

  function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
  }

	function callback(done) {
		return function(json) {
			forward(json, done);
		};
	}

	function responder(done) {
		return function(err, json) {
			done(fromArguments(err, json));
		};
	}


	host.isValid = isValid;
	host.forward = forward;
	host.fromArguments = fromArguments;
	host.build = build;
	host.callback = callback;
	host.responder = responder;
	host.middleware = function(req, res, next) {
		var middleware = res.jsend = function(err, json) {
			res.json(fromArguments(err, json));
		};

		middleware.success = function(data) {
			if(data === undefined) throw new Error('"data" must be defined when calling jsend.success. (jsend)');
			res.json({
				status: 'success',
				data: (data && data.status === 'success' && isValid(data))
					? data.data
					: data
			});
		};
		middleware.fail = function(data) {
			if(data === undefined) throw new Error('"data" must be defined when calling jsend.fail. (jsend)');
			res.json({
				status: 'fail',
				data: (data && data.status === 'fail' && isValid(data))
					? data.data
					: data
			});
		};
		middleware.error = function(message) {
			var json = {
				status: 'error'
			};

			if(typeof message === 'string') {
				json.message = message;
			} else if(message && message.message) {
				json.message = message.message;
				if(message.code !== undefined) json.code = message.code;
				if(message.data !== undefined) json.data = message.data;
			} else {
				throw new Error('"message" must be defined when calling jsend.error. (jsend)');
			}

			res.json(json);
		};

		next();
	};

	return host;
}

module.exports = jsend(null, jsend);
