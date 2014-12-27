var crypto = require('crypto'),
	chalk = require('chalk');

if (process.argv.length < 6) {
	throw new Error('Missing parameters.');
}

/**
 * @param {String} encryptionPassword Password used to encrypt data.
 */
var encryptionKey = process.argv[2];

/**
 * @param {String} encryptionPassword Password used to encrypt data.
 */
var encryptionIV = process.argv[3];

/**
 * @param {Object} bankObject Bank information object
 * @param {String} bankObject.bank banks/bank_name. Does not include .js
 * @param {String} bankObject.username Bank credential username
 * @param {String} bankObject.password Bank credential password
 * @param {Number[]} bankObject.transactionsFor Partial bank account numbers to pull
 * @param {Number} bankObject.days Days to pull transactions for.
 */
var bankObject = JSON.parse(decrypt(process.argv[4], encryptionKey, encryptionIV));

/**
 * @param {Object} exportObject Bank information object
 * @param {String} exportObject.name exports/export_name. Does not include .js
 * @param {String} exportObject.key API Key to push transactions
 */
var exportObject = JSON.parse(decrypt(process.argv[5], encryptionKey, encryptionIV));

console.log(chalk.red('Scrooge is beginning his efforts.'));
var bank = require('./banks/' + bankObject.bank + '.js');
bank.run({
	username: bankObject.username,
	password: bankObject.password,
	transactionsFor: bankObject.transactionsFor,
	days: bankObject.days
}, function (error, bankDetail) {
	if (error) {
		console.error(error);
	} else {
		var exporter = require('./exports/' + exportObject.name + '.js');
		exporter.run({apiKey: exportObject.key, accounts: bankDetail.accounts}, function () {
			console.log(chalk.red('Scrooge has completed his work.'));
		});
	}
});

// Encrypt/Decrypt
function encrypt(text, key, iv) {
	var cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
	var crypted = cipher.update(text, 'utf8', 'hex');
	crypted += cipher.final('hex');
	return crypted;
}
function decrypt(text, key, iv) {
	var decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
	var dec = decipher.update(text, 'hex', 'utf8');
	dec += decipher.final('utf8');
	return dec;
}