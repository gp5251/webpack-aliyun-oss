const fs = require('fs');
const path = require('path');
const oss = require('ali-oss');
const co = require('co');
const _ = require('lodash');
const glob = require("glob");
const slash = require("slash");
require('colors');

class WebpackAliyunOss {
	constructor(options) {
		this.config = Object.assign({
			test: false,
			verbose: true,
			dist: '',
			deleteOrigin: false,
			deleteEmptyDir: false,
			timeout: 30 * 1000,
			setOssPath: null,
			setHeaders: null
		}, options);

		this.configErrStr = this.checkOptions(options);
	}

	apply(compiler) {
		if (compiler) {
			this.doWithWebpack(compiler);
		} else {
			this.doWidthoutWebpack();
		}
	}

	doWithWebpack(compiler) {
		compiler.hooks.afterEmit.tapPromise('WebpackAliyunOss', (compilation) => {
			if (this.configErrStr) {
				compilation.errors.push(new Error(this.configErrStr));
				return Promise.resolve();
			}

			const outputPath = slash(compiler.options.output.path);

			const {
				from = outputPath + (outputPath.endsWith('/') ? '' : '/') + '**',
				verbose
			} = this.config;

			const files = this.getFiles(from);

			if (files.length) return this.upload(files, true, outputPath);
			else {
				verbose && console.log('no files to be uploaded');
				return Promise.resolve();
			}
		});
	}

	doWidthoutWebpack() {
		if (this.configErrStr) return Promise.reject(new Error(this.configErrStr));

		const { from, verbose } = this.config;
		const files = this.getFiles(from);

		if (files.length) return this.upload(files);
		else {
			verbose && console.log('no files to be uploaded');
			return Promise.resolve();
		}
	}

	upload(files, inWebpack, outputPath = '') {
		const {
			dist,
			setHeaders,
			deleteOrigin,
			deleteEmptyDir,
			setOssPath,
			timeout,
			verbose,
			test,

			region,
			accessKeyId,
			accessKeySecret,
			bucket
		} = this.config;

		const client = oss({
			region,
			accessKeyId,
			accessKeySecret,
			bucket
		});

		return new Promise((resolve, reject) => {
			const o = this;
			const splitToken = inWebpack ? '/' + outputPath.split('/').pop() + '/' : '';

			co(function* () {
				let filePath, i = 0, len = files.length;
				while (i++ < len) {
					filePath = files.shift();

					let ossFilePath = slash(path.join(dist, (setOssPath && setOssPath(filePath) || (inWebpack && splitToken && filePath.split(splitToken)[1] || ''))));

					if (test) {
						console.log(filePath.blue, '\nis ready to upload to ' + ossFilePath.green);
						continue;
					}

					let result = yield client.put(ossFilePath, filePath, {
						timeout,
						headers: setHeaders && setHeaders(filePath) || {}
					});
					verbose && console.log(filePath.blue, '\nupload to ' + ossFilePath + ' success,'.green, 'cdn url =>', result.url.green);

					if (deleteOrigin) {
						fs.unlinkSync(filePath);
						if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1))
							o.deleteEmptyDir(filePath);
					}
				}
			})
				.then(resolve, err => {
					console.log('failed to upload to ali oss'.red, `${err.name}-${err.code}: ${err.message}`)
					reject()
				})
		})
	}

	getFiles(exp) {
		const _getFiles = function (exp) {
			if (!exp || !exp.length) return [];

			exp = exp[0] === '!' && exp.substr(1) || exp;
			return glob.sync(exp, { nodir: true }).map(file => slash(path.resolve(file)))
		}

		return Array.isArray(exp) ?
			exp.reduce((prev, next) => {
				return next[0] === '!' ?
					_.without(prev, ..._getFiles(next)) :
					_.union(prev, _getFiles(next));
			}, _getFiles(exp[0])) :
			_getFiles(exp);
	}

	deleteEmptyDir(filePath) {
		let dirname = path.dirname(filePath);
		if (fs.existsSync(dirname) && fs.statSync(dirname).isDirectory()) {
			fs.readdir(dirname, (err, files) => {
				if (err) console.error(err);
				else {
					if (!files.length) {
						fs.rmdir(dirname, (err)=>{
							if (err) {
								console.log(err.red);
							} else {
								this.config.verbose && console.log('empty directory deleted'.green, dirname)
							}
						})
					}
				}
			})
		}
	}

	checkOptions(options = {}) {
		const {
			from,
			region,
			accessKeyId,
			accessKeySecret,
			bucket
		} = options;

		let errStr = '';

		if (!region) errStr += '\nregion not specified';
		if (!accessKeyId) errStr += '\naccessKeyId not specified';
		if (!accessKeySecret) errStr += '\naccessKeySecret not specified';
		if (!bucket) errStr += '\nbucket not specified';

		if (Array.isArray(from)) {
			if (from.some(g => typeof g !== 'string')) errStr += '\neach item in from should be a glob string';
		} else {
			let fromType = typeof from;
			if (['undefined', 'string'].indexOf(fromType) === -1) errStr += '\nfrom should be string or array';
		}

		return errStr;
	}
}

module.exports = WebpackAliyunOss;