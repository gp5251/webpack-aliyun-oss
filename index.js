const fs        = require('fs');
const path      = require('path');
const oss       = require('ali-oss');
const co        = require('co');
const colors    = require('colors');
const _         = require('lodash');
const glob      = require("glob");

class WebpackAliyunOss {
    constructor(options) {
        this.config = Object.assign({
            debug: false,
            dist: '',
            deleteOrigin: false,
            deleteEmptyDir: true,
            splitToken: '/build/',
            timeout: 30 * 1000,
            ossPathRules: [],
            setHeaders() {
                return {}
            }
        }, options);

        this.configErrStr = this.checkOptions(options);
        this.buildPath = '';
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tap('WebpackAliyunOss', (compilation) => {
            if (this.configErrStr) {
                compilation.errors.push(new Error(this.configErrStr));
                return;
            }

            this.buildPath = compiler.options.output.path;
            const outputPath = this.buildPath;
            const splitToken = this.config.splitToken || path.sep + outputPath.split(path.sep).pop() + path.sep;

            const {
                dist,
                from = outputPath + (outputPath.endsWith(path.sep)? '' : path.sep) + '**',
                setHeaders,
                deleteOrigin,
                deleteEmptyDir,
                timeout,

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

            if (this.config.debug) {
                console.log('files to be uploaded', files);
                return;
            }

            const o = this;
            if (files.length)
                co(function*() {
                    let filePath, i = 0, len = files.length;
                    while(i++ < len){
                        filePath = files.shift();
                        let filePathInBuildPath = filePath.split(splitToken)[1];
                        let ossFilePath = dist + filePathInBuildPath;
                        let result = yield client.put(ossFilePath, filePath, {
                            timeout,
                            headers: setHeaders(filePathInBuildPath)
                        });
                        console.log(filePath, 'upload to ' + ossFilePath + ' success'.green, 'cdn url =>', result.url.green);

                        if (deleteOrigin) {
                            fs.unlink(filePath, ()=>{
                                if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1))
                                    o.deleteEmptyDir(filePath);
                            });
                        }
                    }
                })
                    .catch(err => {
                        console.info('failed to upload to ali oss'.red, `${err.name}-${err.code}: ${err.message}`)
                    })
        });
    }

    getFiles(exp) {
        const _getFiles = function(exp) {
            exp = exp[0] === '!' && exp.substr(1) || exp;
            return glob.sync(exp, { nodir: true });
        }

        return Array.isArray(exp) ?
            exp.reduce((prev, next)=>{
                return next[0] === '!' ?
                    _.without(prev, ..._getFiles(next)) :
                    _.union(prev, _getFiles(next));
            }, _getFiles(exp[0])):
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
                        console.log('delete', dirname)
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

        if (!region)            errStr += '\nregion not specified';
        if (!accessKeyId)       errStr += '\naccessKeyId not specified'
        if (!accessKeySecret)   errStr += '\naccessKeySecret not specified'
        if (!bucket)            errStr += '\nbucket not specified'

        let fromType = typeof from;
        if (['undefined', 'string'].indexOf(fromType) === -1 && !Array.isArray(from))
            errStr += '\nfrom should be string or an array'

        return errStr;
    }
}

module.exports = WebpackAliyunOss;