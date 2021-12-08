const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
const globby = require("globby");
const Listr = require('listr');
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
			dist: '',					// oss目录
			buildRoot: '.',				// 构建目录名
			deleteOrigin: false,		// 是否删除源文件
			timeout: 30 * 1000,			// 超时时间
			parallel: 5,				// 并发数
			setOssPath: null,			// 手动设置每个文件的上传路径
			setHeaders: null,			// 设置头部
			overwrite: false,			// 覆盖oss同名文件
			bail: false,				// 出错中断上传
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

			const outputPath = path.resolve(this.slash(compiler.options.output.path));

			const {
				from = outputPath + '/**'
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
				console.log('no files to be uploaded');
				return Promise.resolve('no files to be uploaded');
			}
		});
	}

	async doWidthoutWebpack() {
		if (this.configErrStr) return Promise.reject(this.configErrStr);

		const { from } = this.config;
		const files = await globby(from);

		if (files.length) {
			try {
				return this.upload(files);
			} catch (err) {
				return Promise.reject(err);
			}
		}
		else {
			console.log('no files to be uploaded');
			return Promise.resolve('no files to be uploaded');
		}
	}

	async upload(files, inWebpack, outputPath = '') {
		const {
			dist,
			setHeaders,
			deleteOrigin,
			setOssPath,
			timeout,
			test,
			overwrite,
			bail,
			parallel,
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

		files = files.map(file => ({
			path: file,
			fullPath: path.resolve(file)
		}))

		this.filesUploaded = []
		this.filesIgnored = []
		this.filesErrors = []

		const basePath = this.getBasePath(inWebpack, outputPath)

		const _upload = async file => {
			const { fullPath: filePath, path: fPath } = file

			let ossFilePath = this.slash(
				path.join(
					dist,
					(
						setOssPath && setOssPath(filePath)
						|| basePath && filePath.split(basePath)[1]
						|| ''
					)
				)
			);

			const fileExists = await this.fileExists(ossFilePath)

			if (fileExists && !overwrite) {
				this.filesIgnored.push(filePath)
				return Promise.resolve(fPath.blue.underline + ' ready exists in oss, ignored');
			}

			if (test) {
				return Promise.resolve(fPath.blue.underline + ' is ready to upload to ' + ossFilePath.green.underline);
			}

			const headers = setHeaders && setHeaders(filePath) || {}
			let result
			try {
				result = await this.client.put(ossFilePath, filePath, {
					timeout,
					headers: !overwrite ? Object.assign(headers, { 'x-oss-forbid-overwrite': true }) : headers
				})
			} catch (err) {
				this.filesErrors.push({
					file: fPath,
					err: { code: err.code, message: err.message, name: err.name }
				});

				const errorMsg = `Failed to upload ${fPath.underline}: ` + `${err.name}-${err.code}: ${err.message}`.red;
				return Promise.reject(new Error(errorMsg))
			}

			result.url = this.normalize(result.url);
			this.filesUploaded.push(fPath)

			if (deleteOrigin) {
				fs.unlinkSync(filePath);
				this.deleteEmptyDir(filePath);
			}

			return Promise.resolve(fPath.blue.underline + ' successfully uploaded, oss url => ' + result.url.green)
		}

		let len = parallel
		const addTask = () => {
			if (len < files.length) {
				tasks.add(createTask(files[len]))
				len++
			}
		}
		const createTask = file => ({
			title: `uploading ${file.path.underline}`,
			task(_, task) {
				return _upload(file)
					.then(msg => {
						task.title = msg;
						addTask()
					})
					.catch(e => {
						if (!bail) addTask()
						return Promise.reject(e)
					})
			}
		});
		const tasks = new Listr(
			files.slice(0, len).map(createTask),
			{
				exitOnError: bail,
				concurrent: parallel
			})

		await tasks.run().catch(() => { });

		// this.filesIgnored.length && console.log('files ignored due to not overwrite'.blue, this.filesIgnored);

		if (this.filesErrors.length) {
			console.log(' UPLOAD ENDED WITH ERRORS '.bgRed.white, '\n');
			logToLocal && fs.writeFileSync(path.resolve('upload.error.log'), JSON.stringify(this.filesErrors, null, 2))

			return Promise.reject(' UPLOAD ENDED WITH ERRORS ')
		}
	}

	getBasePath(inWebpack, outputPath) {
		if (this.config.setOssPath) return '';

		let basePath = ''

		if (inWebpack) {
			if (path.isAbsolute(outputPath)) basePath = outputPath
			else basePath = path.resolve(outputPath)
		} else {
			const { buildRoot } = this.config
			if (path.isAbsolute(buildRoot)) basePath = buildRoot
			else basePath = path.resolve(buildRoot)
		}

		return this.slash(basePath)
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
		if (tmpArr.length >= 2) {
			const [protocol, ...rest] = tmpArr;
			url = protocol + '//' + rest.join('/');
		}
		return url;
	}

	slash(path) {
		const isExtendedLengthPath = /^\\\\\?\\/.test(path);
		// const hasNonAscii = /[^\u0000-\u0080]+/.test(path);

		if (isExtendedLengthPath) {
			return path;
		}

		return path.replace(/\\/g, '/');
	}

	deleteEmptyDir(filePath) {
		let dirname = path.dirname(filePath);
		if (fs.existsSync(dirname) && fs.statSync(dirname).isDirectory()) {
			fs.readdir(dirname, (err, files) => {
				if (err) console.error(err);
				else {
					if (!files.length) fs.rmdir(dirname, () => { })
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
