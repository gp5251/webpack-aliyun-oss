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
			test: false,				// 测试
			verbose: true,				// 输出log
			dist: '',					// oss目录
			buildRoot: '.',				// 构建目录名
			deleteOrigin: false,		// 是否删除源文件
			deleteEmptyDir: false,		// 是否删除源文件目录， deleteOrigin 为true时有效
			timeout: 30 * 1000,			// 超时时间
			setOssPath: null,			// 手动设置每个文件的上传路径
			setHeaders: null,			// 设置头部
			overwrite: true,			// 覆盖oss同名文件
			bail: false,				// 出错中断上传
			quitWpOnError: false,		// 出错中断打包
			logToLocal: false			// 出错信息写入本地文件
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
			return this.doWithWebpack(compiler);
		} else {
			return this.doWidthoutWebpack();
		}
	}

	doWithWebpack(compiler) {
		compiler.hooks.afterEmit.tapPromise('WebpackAliyunOss', async (compilation) => {
			if (this.configErrStr) {
				compilation.errors.push(this.configErrStr);
				return Promise.resolve();
			}

			const outputPath = path.resolve(slash(compiler.options.output.path));

			const {
				from = outputPath + '/' + '**',
				verbose
			} = this.config;

			const files = await globby(from);

			if (files.length) {
				try {
					return this.upload(files, true, outputPath);
				} catch (err) {
					compilation.errors.push(err);
					return Promise.reject(err);
				}
			} else {
				verbose && console.log('no files to be uploaded');
				return Promise.resolve('no files to be uploaded');
			}
		});
	}

	async doWidthoutWebpack() {
		if (this.configErrStr) return Promise.reject(this.configErrStr);

		const { from, verbose } = this.config;
		const files = await globby(from);

		if (files.length) {
			try {
				return this.upload(files);
			} catch (err) {
				return Promise.reject(err);
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
			overwrite,
			bail,
			quitWpOnError,
			logToLocal
		} = this.config;

		if (test) {
			console.log('');
			console.log('Currently running in test mode. your files won\'t realy be uploaded.'.green.underline);
			console.log('');
		} else {
			console.log('');
			console.log('Your files will be uploaded very soon.'.green.underline);
			console.log('');
		}

		files = files.map(file => path.resolve(file))

		this.filesUploaded = []
		this.filesIgnored = []
		this.filesErrors = []

		const splitToken = inWebpack ?
			'/' + outputPath.split('/').slice(-2).join('/') + '/' :
			'/' + path.resolve(buildRoot).split('/').slice(-2).join('/') + '/';

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

			try {
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
			} catch (err) {
				this.filesErrors.push({
					file: filePath,
					err: { code: err.code, message: err.message, name: err.name }
				});

				const errorMsg = `Failed to upload ${filePath.underline}: ` + `${err.name}-${err.code}: ${err.message}`.red;
				console.log(errorMsg);

				if (bail) {
					console.log(' UPLOADING STOPPED '.bgRed.white, '\n');
					break
				}
			}
		}

		verbose && this.filesIgnored.length && console.log('files ignored'.blue, this.filesIgnored);

		if (this.filesErrors.length) {
			if (!bail)
				console.log(' UPLOADING ENDED WITH ERRORS '.bgRed.white, '\n');

			logToLocal
				&& fs.writeFileSync(path.resolve('upload.error.log'), JSON.stringify(this.filesErrors, null, 2))

			if (quitWpOnError || !inWebpack)
				return Promise.reject(' UPLOADING ENDED WITH ERRORS ')
		}
	}

	fileExists(filepath) {
		return this.client.get(filepath)
			.then((result) => {
				return result.res.status == 200
			}).catch((e) => {
				if (e.code == 'NoSuchKey') return false
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
