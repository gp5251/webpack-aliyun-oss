const fs = require('fs');
const path = require('path');
const oss = require('ali-oss');
const co = require('co');
const globby = require("globby");
const slash = require("slash");
require('colors');

class WebpackAliyunOss {
	constructor(options) {
		this.config = Object.assign({
			test: false,
			verbose: true,
			dist: '',
			buildRoot: '.',
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
			return this.doWidthoutWebpack();
		}
	}

	doWithWebpack(compiler) {
		compiler.hooks.afterEmit.tapPromise('WebpackAliyunOss', async (compilation) => {
			if (this.configErrStr) {
				compilation.errors.push(new Error(this.configErrStr));
				return Promise.resolve();
			}

			const outputPath = path.resolve(slash(compiler.options.output.path));

			const {
				from = outputPath + '/' + '**',
				verbose
			} = this.config;

			const files = await globby(from);

			if (files.length) return this.upload(files, true, outputPath);
			else {
				verbose && console.log('no files to be uploaded');
				return Promise.resolve();
			}
		});
	}

	async doWidthoutWebpack() {
		if (this.configErrStr) return Promise.reject(new Error(this.configErrStr));

		const { from, verbose } = this.config;
		const files = await globby(from);

		if (files.length) return await this.upload(files);
		else {
			verbose && console.log('no files to be uploaded');
			return Promise.resolve('no files to be uploaded');
		}
	}

	upload(files, inWebpack, outputPath = '') {
		const {
			dist,
			buildRoot,
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

		files = files.map(file => path.resolve(file))

		return new Promise((resolve, reject) => {
			const o = this;
			const splitToken = inWebpack
													? '/' + outputPath.split('/').slice(-2).join('/') + '/'
													: '/' + path.resolve(buildRoot).split('/').slice(-2).join('/') + '/';

			let cloneFiles = files.slice.call(files);
			co(function* () {
				let filePath, i = 0, len = files.length;
				while (i++ < len) {
					filePath = files.shift();

					let ossFilePath = slash(path.join(dist, (setOssPath && setOssPath(filePath) || (splitToken && filePath.split(splitToken)[1] || ''))));

					if (test) {
						console.log(filePath.blue, 'is ready to upload to ' + ossFilePath.green);
						continue;
					}

					let result = yield client.put(ossFilePath, filePath, {
						timeout,
						headers: setHeaders && setHeaders(filePath) || {}
					});

					result.url = o.normalize(result.url);

					verbose && console.log(filePath.blue, '\nupload to ' + ossFilePath + ' success,'.green, 'cdn url =>', result.url.green);

					if (deleteOrigin) {
						fs.unlinkSync(filePath);
						if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1))
							o.deleteEmptyDir(filePath);
					}
				}
			})
				.then(() => { resolve(cloneFiles) }, err => {
					console.log(`failed to upload to ali oss: ${err.name}-${err.code}: ${err.message}`.red)
					reject()
				})
		})
	}

	normalize(url) {
		const tmpArr = url.split(/\/{2,}/);
		if (tmpArr.length > 2) {
			const [protocol, ...rest] = tmpArr;
			url = protocol + '//' + rest.join('/');
		}
		return url;
	}

	deleteEmptyDir(filePath) {
		let dirname = path.dirname(filePath);
		if (fs.existsSync(dirname) && fs.statSync(dirname).isDirectory()) {
			fs.readdir(dirname, (err, files) => {
				if (err) console.error(err);
				else {
					if (!files.length) {
						fs.rmdir(dirname, (err) => {
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
