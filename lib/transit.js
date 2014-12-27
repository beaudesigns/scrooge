var request = require('request');

exports.normalize = function (original) {
	var formatted = {
		id: 0,
		type: undefined,
		posted: undefined,
		amount: 0,
		payee: undefined,
		memo: undefined,
		hash: undefined,
		location: undefined,
		original: undefined
	};

	// ID
	formatted.id = original.FITID || 0;
	formatted.id = formatted.id.replace(/[^0-9]/g, '');

	// Type
	formatted.type = original.TRNTYPE || '';
	formatted.type = formatted.type.toUpperCase();

	// Date
	formatted.posted = original.DTPOSTED || null;
	if (formatted.posted && formatted.posted.length === 14) {
		formatted.posted = new Date(formatted.posted.substr(0, 4) + '-' + formatted.posted.substr(4, 2) + '-' + formatted.posted.substr(6, 2) + ' ' + formatted.posted.substr(8, 2) + ':' + formatted.posted.substr(10, 2) + ':' + formatted.posted.substr(12, 2));
	}
	if (formatted.posted && formatted.posted.length === 8) {
		formatted.posted = new Date(formatted.posted.substr(0, 4) + '-' + formatted.posted.substr(4, 2) + '-' + formatted.posted.substr(6, 2));
	}

	// Amount
	formatted.amount = parseFloat(original.TRNAMT) || 0;
	if (formatted.type === 'DEBIT') {
		formatted.amount = -Math.abs(formatted.amount);
	}
	if (formatted.type === 'CREDIT') {
		formatted.amount = Math.abs(formatted.amount);
	}

	// Payee
	formatted.original = original.NAME || '';
	formatted.payee = original.NAME || '';
	formatted.payee = formatted.payee.replace(/([#])?([0-9]{2,})?/gm, ''); // Numbers: #XXX
	formatted.payee = formatted.payee.replace(/\s\w(\s|$)/g, ' '); // Single letter words
	formatted.payee = formatted.payee.replace(/\w\.(\s|$)/g, ' '); // Periods on end of word.
	formatted.payee = formatted.payee.replace(/\s[^a-z0-9]+[\s,]/ig, ' '); // Not A-Z "words"
	formatted.payee = formatted.payee.replace(/\b([\w.]+)\s+\1\b/ig, '$1'); // Duplicate Words
	formatted.payee = formatted.payee.replace(/~/ig, ''); // Tilde
	formatted.payee = formatted.payee.replace(/(\sWHC\s|^RS\*)/ig, ' '); // Magic patterns.
	formatted.payee = formatted.payee.replace(/\s{2,}/g, ' '); // Multiple spaces
	formatted.payee = formatted.payee.trim();
	formatted.payee = toUCWords(formatted.payee.toLowerCase());
	if (formatted.type === 'CHECK') {
		formatted.payee = 'Written Check' + (original.CHECKNUM ? ': #' + original.CHECKNUM : '');
	}

	// Memo
	formatted.memo = original.MEMO || '';
	formatted.memo = formatted.memo.replace(/\s{2,}/g, ' ');
	formatted.memo.trim();
	if (formatted.memo.length && formatted.memo.search(/[a-z]/i) === -1) {
		formatted.memo = '';
	}

	// Hash
	var hashString = formatted.posted.toUTCString() + formatted.amount + formatted.payee + formatted.memo;
	formatted.hash = require('crypto').createHash('md5').update(hashString).digest('hex');

	return formatted;
};

exports.geoLocate = function (transaction, callback) {
	var query = transaction.payee.replace(/[^a-z ]/ig, '');
	if (/\s(US|USA)$/ig.test(query)) {

		var configuration = require('../configuration.json');
		if (!configuration.googlePlacesKey) {
			callback(transaction);
		} else {
			request('https://maps.googleapis.com/maps/api/place/textsearch/json?query=' + encodeURIComponent(query) + '&key=' + configuration.googlePlacesKey, function (error, response, body) {
				body = JSON.parse(body);
				if (body.status === 'OK' && body.results.length) {
					transaction.payee = body.results[0].name;
					transaction.location = body.results[0].formatted_address;
					if (transaction.memo.length) {
						transaction.memo += ' – '
					}
					transaction.memo += 'Original: ' + transaction.original;
					callback(transaction);
				} else {
					callback(transaction);
				}
			});
		}
	} else {
		callback(transaction);
	}
};

function toUCWords(string) {
	return (string + '')
		.replace(/^([a-z\u00E0-\u00FC])|\s+([a-z\u00E0-\u00FC])/g, function ($1) {
			return $1.toUpperCase();
		});
}

var findObjectKey = exports.findObjectKey = function (keyName, currentNode) {
	for (var key in currentNode) {
		if (currentNode.hasOwnProperty(key)) {
			if (key === keyName) {
				return currentNode[key];
			}
			if (typeof currentNode[key] === 'object') {
				var found = findObjectKey(keyName, currentNode[key]);
				if (found) {
					return found;
				}
			}
		}
	}
	return false;
};