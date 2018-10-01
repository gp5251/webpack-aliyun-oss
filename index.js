const oss       = require('ali-oss');
const co        = require('co');
const fs        = require('fs');
const colors    = require('colors');
const _         = require('lodash');
const glob      = require("glob");

class WebpackAliyunOss {
    constructor(options) {
        this.config = Object.assign({
            dist: '',
            deleteOrigin: false,
            setHeaders() {
                return {}
            }
        }, options);

        this.configErrStr = this.checkOptions(options);
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tap('WebpackAliossPlugin', (compilation) => {
            if (this.configErrStr) {
                compilation.errors.push(new Error(this.configErrStr));
                return;
            }

            const outputPath = compiler.options.output.path;
            const splitToken = this.config.splitToken || '/' + outputPath.split('/').pop() + '/';
            const files = this.getFiles(from);

            const {
                dist,
                from = outputPath + (outputPath.endsWith('/')? '' : '/') + '**',
                setHeaders,
                deleteOrigin,

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

            if (files.length)
                co(function*() {
                    let filePath, i = 0;
                    while(filePath = files[i++]){
                        let filePathInBuildPath = filePath.split(splitToken)[1];
                        let ossFilePath = dist + filePathInBuildPath;
                        let result = yield client.put(ossFilePath, filePath, {
                            timeout: 30 * 1000,
                            headers: setHeaders(filePathInBuildPath)
                        });
                        console.log(filePath, 'upload to ' + ossFilePath + ' success'.green, 'cdn url =>', result.url.green);
                        if (deleteOrigin) fs.unlink(filePath)
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