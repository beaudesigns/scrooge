var chalk = require('chalk'),
	ofx = require('prosperity-ofx'),
	phantom = require('phantom'),
	transit = require('../lib/transit.js'),
	prompt = require('prompt');

// Default settings object
var settings = {
	'username': undefined,
	'password': undefined,
	'days': 10,
	'transactionsFor': []
};

// Export all the things.
exports.configuration = {
	"site": 'https://securebanking.ally.com'
};
exports.run = function (options, callback) {
	settings.username = options.username || settings.username;
	settings.password = options.password || settings.password;
	settings.days = options.days || settings.days;
	settings.transactionsFor = options.transactionsFor || settings.transactionsFor;
	if (!Array.isArray(settings.transactionsFor)) {
		settings.transactionsFor = [settings.transactionsFor]
	}

	var bankObject = {
		accounts: []
	};
	screenScrapePages(function (error, results) {
		bankObject.accounts = results.accounts || null;
		callback(error, bankObject);
	});
};


// PhantomJS process
function screenScrapePages(callback) {
	var results = {};

	phantom.create({parameters: {'ssl-protocol': 'any', 'cookies-file': 'cookies.txt'}}, function (ph) {
		ph.createPage(function (page) {
			page.onResourceError = function (resourceError) {
				page.resource_error = resourceError;
			};

			page.open(exports.configuration.site, function (status) {
				if (status !== 'success') {
					ph.exit(1);
					callback(new Error(page.resource_error), results);
				} else {

					log('Opened ' + exports.configuration.site + ': ' + status);

					pages.login(page, function (error) {
						if (error) {
							return callback(error, results);
						}
						pages.accounts(page, function (accounts) {
							results.accounts = accounts;

							var tempAccountList = accounts.slice(0);
							pullTransactions();
							function pullTransactions() {
								if (tempAccountList.length > 0) {
									var account = tempAccountList.shift();
									var needToPull = false;

									settings.transactionsFor.forEach(function (settingsAccount) {
										if (account.number.indexOf(settingsAccount) !== -1) {
											needToPull = true;
										}
									});

									if (needToPull) {
										pages.transactions(page, account, function (ofxObject) {
											// Place it on the right account
											for (var i = 0; i < results.accounts.length; ++i) {
												if (results.accounts[i].id === account.id) {
													results.accounts[i].transactions = transit.findObjectKey('STMTTRN', ofxObject);
													break;
												}
											}
											pullTransactions();
										});
									} else {
										pullTransactions();
									}
								} else {
									ph.exit();
									callback(null, results);
								}
							}
						});
					});
				}
			});
		});
	});
}

// Individual page configuration and steps.
var pages = {
	login: function (page, callback) {
		waitFor(page, function () {
			return (document.title.indexOf('Login') !== -1);
		}, function () {
			getTitle(page);

			// Enter the username
			page.evaluate(function () {
				document.querySelector('input#username').focus();
				return true;
			}, function () {
				log('Entering username');
				page.sendEvent('keypress', settings.username);

				// Enter the password
				page.evaluate(function () {
					document.querySelector('input#password').focus();
					return true;
				}, function () {
					log('Entering password');
					page.sendEvent('keypress', settings.password);

					// Log in
					page.evaluate(function () {
						document.querySelector('button#logInBtn').click();
						return true;
					}, function () {

						// Done logging in
						log('Login form submitted.');
						waitFor(page, function () {
							return (document.title.indexOf('Login') === -1);
						}, function (error) {

							page.evaluate(function () {
								return document.title;
							}, function (title) {
								if (title.indexOf('Verify Identity') !== -1) {
									log('Need to verify identity.');
									pages.verifyAccount(page, callback);
								} else {
									callback(error);
								}
							});
						})
					});
				});
			});
		});
	},

	verifyAccount: function (page, callback) {
		waitFor(page, function () {
			return (document.title.indexOf('Verify Identity') !== -1);
		}, function () {
			getTitle(page);

			// Get the methods to send the code.
			page.evaluate(function () {
				var methods = [];
				var methodElements = document.querySelector('form').querySelectorAll('li');
				for (var i = 0; i < methodElements.length; ++i) {
					methods.push(methodElements[i].innerText);
				}
				return methods;
			}, function (methods) {
				// PROMPT to choose a method.
				var description = 'Choose your method by typing the number';
				for (var i = 0; i < methods.length; ++i) {
					description += '\n  ' + (i + 1) + ') ' + methods[i];
				}
				prompt.start();
				prompt.get({
					properties: {
						choice: {
							type: 'number',
							description: description
						}
					}
				}, function (error, result) {

					// Choice was made. Click the button.
					page.evaluate(function (choice) {
						document.querySelector('form').querySelector('li:nth-of-type(' + choice + ')').querySelector('input').click();
						document.querySelector('button#sendSecurityCode').click();
						return true;
					}, function () {
						log('Sending security code to: ' + methods[result.choice - 1]);

						waitFor(page, function () {
							return (document.title.indexOf('Enter Security Code') !== -1);
						}, function () {
							prompt.start();
							prompt.get({
								properties: {
									code: {
										type: 'string',
										description: 'Enter your security code'
									}
								}
							}, function (error, result) {

								page.evaluate(function () {
									document.querySelector('input#enterSecurityCode').focus();
									return true;
								}, function () {
									page.sendEvent('keypress', result.code);

									page.evaluate(function () {
										document.querySelector('button#continueButton').click();
										return true;
									}, function () {

										waitFor(page, function () {
											return (document.title.indexOf('Register Device') !== -1);
										}, function () {
											page.evaluate(function () {
												document.querySelector('input#trusted').click();
												document.querySelector('button#continueRegDevice').click();
											}, function () {
												log('Registering device');

												waitFor(page, function () {
													return (document.title.indexOf('Register Device') === -1);
												}, function (error) {
													callback(error);
												});
											});
										});
									});
								});
							});
						});
					}, result.choice)
				});
			});
		});
	},

	accounts: function (page, callback) {
		waitFor(page, function () {
			return (document.title.indexOf('Summary') !== -1);
		}, function () {
			getTitle(page);

			page.evaluate(function () {
				var accounts = [];

				var accountElements = document.querySelector('#accounts-block').querySelectorAll('article');
				if (accountElements.length) {
					for (var i = 0; i < accountElements.length; ++i) {
						var account = {};
						account.id = parseInt(accountElements[i].getAttribute('aria-labelledby').replace('account-name-', ''), 10);
						account.name = accountElements[i].querySelector('.large-nickname').innerText;
						account.number = accountElements[i].querySelector('div').querySelector('li:last-of-type').innerText;

						var balance = accountElements[i].querySelector('.balance-amount').innerText.replace(/[^0-9]/ig, '');
						var dollars = balance.slice(0, -2);
						var cents = balance.slice(-2);
						account.balance = parseFloat(dollars + '.' + cents);

						accounts.push(account);
					}
				}
				return accounts;
			}, function (accounts) {
				callback(accounts);
			});
		});
	},

	transactions: function (page, account, callback) {
		//https://securebanking.ally.com/IDPProxy/executor/accounts/19392517/transactions.qfx?patron-id=olbWeb&fromDate=2014-11-23&toDate=2014-12-24&status=Posted
		var startDate = new Date();
		startDate.setDate(startDate.getDate() - settings.days);
		startDate = startDate.toISOString().slice(0, 10);
		var endDate = new Date().toISOString().slice(0, 10);

		page.evaluate(function (account, dates) {
			// downloads have to be in the context of the web page
			function downloadReport(address, name) {
				var result = {};
				try {
					var xhr = new XMLHttpRequest();
					xhr.open('GET', address, false);
					xhr.responseType = 'arraybuffer';
					xhr.send(null);
					var bin = xhr.response;
					var u8 = new Uint8Array(bin), ic = u8.length, bs = [];
					while (ic--) {
						bs[ic] = String.fromCharCode(u8[ic]);
					}
					result.data = bs.join('');
					result.name = name;
				} catch (e) {
					result.error = JSON.stringify(e);
				}
				return result;
			}

			var result = [];
			var downloadAddress = 'https://securebanking.ally.com/IDPProxy/executor/accounts/' + account.id + '/transactions.qfx?patron-id=olbWeb&fromDate=' + dates.start + '&toDate=' + dates.end + '&status=Posted';
			log('Downloading: ' + downloadAddress);
			result.push(downloadReport(downloadAddress, 'transactions.qfx'));
			return result;
		}, function (results) {
			var ofxData = '';
			results.forEach(function (item) {
				if (item.data != null) {
					ofxData += item.data;
				} else {
					log(item.error);
				}
			});
			log('Finished downloading: ' + account.name + ' transactions.');

			// Return the OFX parsed data.
			ofx.parse(ofxData, function (error, response) {
				if (error) {
					log(error);
				}
				callback(response);
			});

		}, account, {start: startDate, end: endDate});
	}
};

function log() {
	var mainArguments = Array.prototype.slice.call(arguments);
	mainArguments.unshift(chalk.magenta('  ally ->'));
	console.log.apply(console, mainArguments);
}

// Helper function to print out the current page title.
function getTitle(page) {
	page.evaluate(function () {
		return document.title;
	}, function (title) {
		log('Page title is: "' + title + '"');
	});
}

// Helper function to wait for an expression to be true before continuing.
function waitFor(page, evaluation, callback, expiresAt) {
	expiresAt = (expiresAt ? expiresAt : Date.now() + 10000);
	page.evaluate(evaluation, function (result) {
		if (result === true) {
			setTimeout(function () {
				callback();
			}, 100);
		} else {
			if (Date.now() > expiresAt) {
				callback(new Error('waitFor() timed out.'));
				return;
			}
			setTimeout(function () {
				waitFor(page, evaluation, callback, expiresAt);
			}, 200);
		}
	});
}