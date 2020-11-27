const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
const globby = require("globby");
const slash = require("slash");
require('colors');

class WebpackAliyunOss {
	constructor(options) {
		const {
			region,
			accessKeyId,
			accessKeySecret,
			bucket
		} = options;

		this.config = Object.assign({
			bail: false,
			test: false,
			verbose: true,
			dist: '',
			buildRoot: '.',
			deleteOrigin: false,
			deleteEmptyDir: false,
			timeout: 30 * 1000,
			setOssPath: null,
			setHeaders: null,
			overwrite: true
		}, options);

		this.configErrStr = this.checkOptions(options);

		this.client = new OSS({
			region,
			accessKeyId,
			accessKeySecret,
			bucket
		})

		this.filesUploaded = []
		this.filesIgnored = []
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

			if (files.length) {
                const ret = await this.upload(files, true, outputPath);
                if(ret.errorMsg) {
                    compilation.errors.push(new Error(ret.errorMsg));
                }
                return Promise.resolve();
            }
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

		if (files.length) {
            const ret = await this.upload(files);
            if(ret.errorMsg) {
                return Promise.reject(new Error(ret.errorMsg));
            } else {
                return Promise.resolve();
            }
        }
		else {
			verbose && console.log('no files to be uploaded');
			return Promise.resolve('no files to be uploaded');
		}
	}

	async upload(files, inWebpack, outputPath = '') {
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
			bail,
			overwrite
		} = this.config;

		files = files.map(file => path.resolve(file))

		this.filesUploaded = []
		this.filesIgnored = []

		const splitToken = inWebpack ?
			'/' + outputPath.split('/').slice(-2).join('/') + '/' :
			'/' + path.resolve(buildRoot).split('/').slice(-2).join('/') + '/';

		try {
			for (let filePath of files) {
				let ossFilePath = slash(path.join(dist, (setOssPath && setOssPath(filePath) || (splitToken && filePath.split(splitToken)[1] || ''))));

				const fileExists = await this.fileExists(ossFilePath)

				if (fileExists && !overwrite) {
					this.filesIgnored.push(filePath)
					continue
				}

				if (test) {
					console.log(filePath.blue, 'is ready to upload to ' + ossFilePath.green);
					continue;
				}

				const headers = setHeaders && setHeaders(filePath) || {}
				let result = await this.client.put(ossFilePath, filePath, {
					timeout,
					headers: !overwrite ? Object.assign(headers, { 'x-oss-forbid-overwrite': true }) : headers
				})

				result.url = this.normalize(result.url);
				this.filesUploaded.push(filePath)

				verbose && console.log(filePath.blue, '\nupload to ' + ossFilePath + ' success,'.green, 'cdn url =>', result.url.green);

				if (deleteOrigin) {
					fs.unlinkSync(filePath);
					if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1))
						this.deleteEmptyDir(filePath);
				}
			}
		} catch (err) {
            const errorMsg = `failed to upload to ali oss: ${err.name}-${err.code}: ${err.message}`;
            console.log(errorMsg.red);
            if (bail) {
                return { errorMsg };
            }
		}

		verbose && this.filesIgnored.length && console.log('files ignored'.blue, this.filesIgnored);
	}

	fileExists(filepath) {
		return this.client.get(filepath)
			.then((result) => {
				return result.res.status == 200
			}).catch((e) => {
				if (e.code == 'NoSuchKey') {
					return false
				}
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
