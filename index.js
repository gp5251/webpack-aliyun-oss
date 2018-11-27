const fs = require('fs');
const path = require('path');
const oss = require('ali-oss');
const co = require('co');
const colors = require('colors');
const _ = require('lodash');
const glob = require("glob");

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
        compiler.hooks.afterEmit.tapPromise('WebpackAliyunOss', (compilation) => {
            if (this.configErrStr) {
                compilation.errors.push(new Error(this.configErrStr));
                return Promise.resolve();
            }

            const outputPath = compiler.options.output.path;

            const {
                dist,
                from = outputPath + (outputPath.endsWith(path.sep) ? '' : path.sep) + '**',
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

            const files = this.getFiles(from);

            if (files.length)
                return new Promise((resolve, reject) => {
                    const o = this;
                    const splitToken = path.sep + outputPath.split(path.sep).pop() + path.sep;
                    co(function* () {
                        let filePath, i = 0, len = files.length;
                        while (i++ < len) {
                            filePath = files.shift();

                            let ossFilePath = (dist + (setOssPath && setOssPath(filePath) || (filePath.split(splitToken)[1] || ''))).replace(/\/\/+/g, '/');

                            if (typeof ossFilePath !== 'string') continue;
                            if (test) {
                                console.log(filePath.gray, '\n is ready to upload to '.green + ossFilePath);
                                continue;
                            }

                            let result = yield client.put(ossFilePath, filePath, {
                                timeout,
                                headers: setHeaders && setHeaders(filePath) || {}
                            });
                            verbose && console.log(filePath.gray, '\nupload to '.green + ossFilePath + ' success,'.green, 'cdn url =>', result.url.green);

                            if (deleteOrigin) {
                                fs.unlinkSync(filePath);
                                if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1))
                                    o.deleteEmptyDir(filePath);
                            }
                        }
                    })
                        .then(resolve, err => {
                            console.info('failed to upload to ali oss'.red, `${err.name}-${err.code}: ${err.message}`)
                            resolve()
                        })
                })

            verbose && console.log('no files to be uploaded');
            return Promise.resolve();
        });
    }

    getFiles(exp) {
        const _getFiles = function (exp) {
            exp = exp[0] === '!' && exp.substr(1) || exp;
            return glob.sync(exp, {nodir: true}).map(file => path.resolve(file))
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
                        fs.rmdir(dirname)
                        this.config.verbose && console.log('empty directory deleted'.green, dirname)
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
        if (!accessKeyId) errStr += '\naccessKeyId not specified'
        if (!accessKeySecret) errStr += '\naccessKeySecret not specified'
        if (!bucket) errStr += '\nbucket not specified'

        let fromType = typeof from;
        if (['undefined', 'string'].indexOf(fromType) === -1 && !Array.isArray(from))
            errStr += '\nfrom should be string or an array'

        return errStr;
    }
}

module.exports = WebpackAliyunOss;