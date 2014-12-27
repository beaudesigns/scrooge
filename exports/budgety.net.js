var request = require('request'),
	chalk = require('chalk'),
	transit = require('../lib/transit.js');

// Default settings object
var settings = {
	'apiKey': undefined,
	'accounts': []
};

exports.run = function (options, callback) {
	settings.apiKey = options.apiKey || settings.apiKey;
	settings.accounts = options.accounts || settings.accounts;

	// Normalize the account transactions.
	normalizeTransactions();

	// Process each of the transactions.
	var combinedTransactions = [];
	for (var i = 0; i < settings.accounts.length; ++i) {
		var account = settings.accounts[i];
		if (account.transactions && account.transactions.length) {
			combinedTransactions.push.apply(combinedTransactions, account.transactions);
		}
	}
	importTransactions(combinedTransactions, function () {
		log('Import Complete');
		callback();
	});
};

function normalizeTransactions() {
	for (var i = 0; i < settings.accounts.length; ++i) {
		var account = settings.accounts[i];
		if (account.transactions && account.transactions.length) {
			for (var j = 0; j < account.transactions.length; ++j) {
				var transaction = account.transactions[j];
				settings.accounts[i].transactions[j] = transit.normalize(transaction);
			}
		}
	}
}

function importTransactions(transactions, callback) {
	if (transactions.length > 0) {
		var transaction = transactions.shift();

		// Check if the transaction exists in Budgety.
		request('http://budgety.dev/api/transactions/exists?key=' + encodeURIComponent(settings.apiKey) + '&id=' + encodeURIComponent(transaction.id) + '&hash=' + encodeURIComponent(transaction.hash), function (error, response, body) {
			body = JSON.parse(body);
			if (body.exists) {
				log(chalk.gray('exists'), transaction.amount, '\t', transaction.payee);
				importTransactions(transactions, callback);
			} else {

				// Lookup Google Places information.
				transit.geoLocate(transaction, function (geoTransaction) {

					// Import into Budgety.
					log(chalk.cyan('import'), geoTransaction.amount, '\t', geoTransaction.payee);
					request.post('http://budgety.dev/api/transactions/import?key=' + encodeURIComponent(settings.apiKey), {form: {transaction: geoTransaction}}, function (error, response, body) {
						importTransactions(transactions, callback);
					});
				});
			}
		});
	} else {
		callback();
	}
}

function log() {
	var mainArguments = Array.prototype.slice.call(arguments);
	mainArguments.unshift(chalk.green('  budgety ->'));
	console.log.apply(console, mainArguments);
}